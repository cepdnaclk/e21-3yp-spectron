package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"spectron-backend/internal/iot"
)

type dbExecutor interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type systemRecord struct {
	id               uuid.UUID
	name             string
	purpose          string
	location         string
	status           string
	assignedAt       time.Time
	activeController *uuid.UUID
	activeHWID       string
}

type systemSensorRecord struct {
	id               uuid.UUID
	systemID         uuid.UUID
	slotKey          string
	sensorUID        string
	name             string
	sensorType       string
	status           string
	configured       bool
	controllerSensor *uuid.UUID
}

func scanSystemRecord(row pgx.Row) (systemRecord, error) {
	var record systemRecord
	var purpose string
	var location string
	var activeControllerID *uuid.UUID
	var activeHWID string
	err := row.Scan(
		&record.id,
		&record.name,
		&purpose,
		&location,
		&record.status,
		&record.assignedAt,
		&activeControllerID,
		&activeHWID,
	)
	if err != nil {
		return systemRecord{}, err
	}
	record.purpose = purpose
	record.location = location
	record.activeController = activeControllerID
	record.activeHWID = activeHWID
	return record, nil
}

func loadActiveSystemForController(ctx context.Context, q queryRower, controllerID uuid.UUID) (systemRecord, error) {
	return scanSystemRecord(q.QueryRow(ctx, `
		SELECT
			s.id,
			s.name,
			COALESCE(s.purpose, ''),
			COALESCE(s.location, ''),
			s.status,
			sca.assigned_at,
			active_sca.controller_id,
			COALESCE(active_controller.hw_id, '')
		FROM system_controller_assignments sca
		JOIN systems s ON s.id = sca.system_id
		LEFT JOIN system_controller_assignments active_sca
		  ON active_sca.system_id = s.id
		 AND active_sca.unassigned_at IS NULL
		LEFT JOIN controllers active_controller ON active_controller.id = active_sca.controller_id
		WHERE sca.controller_id = $1
		  AND sca.unassigned_at IS NULL
	`, controllerID))
}

func loadAccountSystem(ctx context.Context, q queryRower, accountID uuid.UUID, identifier string) (systemRecord, error) {
	trimmed := strings.TrimSpace(identifier)
	if trimmed == "" {
		return systemRecord{}, apiError{status: http.StatusBadRequest, message: "system ID required"}
	}

	record, err := scanSystemRecord(q.QueryRow(ctx, `
		SELECT
			s.id,
			s.name,
			COALESCE(s.purpose, ''),
			COALESCE(s.location, ''),
			s.status,
			COALESCE(active_sca.assigned_at, s.updated_at),
			active_sca.controller_id,
			COALESCE(active_controller.hw_id, '')
		FROM systems s
		LEFT JOIN system_controller_assignments active_sca
		  ON active_sca.system_id = s.id
		 AND active_sca.unassigned_at IS NULL
		LEFT JOIN controllers active_controller ON active_controller.id = active_sca.controller_id
		WHERE s.account_id = $1
		  AND s.id::text = $2
	`, accountID, trimmed))
	if err != nil {
		if err == pgx.ErrNoRows {
			return systemRecord{}, apiError{status: http.StatusNotFound, message: "system not found"}
		}
		return systemRecord{}, err
	}

	return record, nil
}

func (h *ControllerHandler) ensureControllerSystemAssignment(
	ctx context.Context,
	tx pgx.Tx,
	controller hardwareControllerRecord,
	userID uuid.UUID,
	accountID uuid.UUID,
	preferredSystemID string,
) (systemRecord, error) {
	if preferredSystemID != "" {
		record, err := loadAccountSystem(ctx, tx, accountID, preferredSystemID)
		if err != nil {
			return systemRecord{}, err
		}
		if record.activeController != nil && *record.activeController != controller.id {
			return systemRecord{}, apiError{status: http.StatusConflict, message: "This system already has an active controller."}
		}
		return h.attachControllerToSystem(ctx, tx, controller, userID, record)
	}

	record, err := scanSystemRecord(tx.QueryRow(ctx, `
		SELECT
			s.id,
			s.name,
			COALESCE(s.purpose, ''),
			COALESCE(s.location, ''),
			s.status,
			COALESCE(active_sca.assigned_at, s.updated_at),
			active_sca.controller_id,
			COALESCE(active_controller.hw_id, '')
		FROM system_controller_assignments history
		JOIN systems s ON s.id = history.system_id
		LEFT JOIN system_controller_assignments active_sca
		  ON active_sca.system_id = s.id
		 AND active_sca.unassigned_at IS NULL
		LEFT JOIN controllers active_controller ON active_controller.id = active_sca.controller_id
		WHERE history.controller_id = $1
		  AND s.account_id = $2
		  AND active_sca.controller_id IS NULL
		ORDER BY COALESCE(history.unassigned_at, history.assigned_at) DESC
		LIMIT 1
	`, controller.id, accountID))
	if err == nil {
		return h.attachControllerToSystem(ctx, tx, controller, userID, record)
	}
	if err != pgx.ErrNoRows {
		return systemRecord{}, err
	}

	systemName := strings.TrimSpace(controller.name)
	if isDefaultControllerSystemName(systemName) {
		systemName = fmt.Sprintf("Monitoring System %s", controller.uid)
	}

	newSystem := systemRecord{
		id:         uuid.New(),
		name:       systemName,
		purpose:    "",
		location:   "",
		status:     "active",
		assignedAt: time.Now().UTC(),
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO systems (
			id,
			account_id,
			name,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, 'active', NOW(), NOW())
	`, newSystem.id, accountID, newSystem.name); err != nil {
		return systemRecord{}, err
	}

	return h.attachControllerToSystem(ctx, tx, controller, userID, newSystem)
}

func isDefaultControllerSystemName(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	switch normalized {
	case "", "main controller", "unnamed controller", "paired controller":
		return true
	default:
		return false
	}
}

func (h *ControllerHandler) attachControllerToSystem(
	ctx context.Context,
	tx pgx.Tx,
	controller hardwareControllerRecord,
	userID uuid.UUID,
	system systemRecord,
) (systemRecord, error) {
	now := time.Now().UTC()

	if _, err := tx.Exec(ctx, `
		UPDATE system_controller_assignments
		SET unassigned_at = $2,
		    released_by_user_id = $3
		WHERE controller_id = $1
		  AND unassigned_at IS NULL
	`, controller.id, now, userID); err != nil {
		return systemRecord{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE system_controller_assignments
		SET unassigned_at = $2,
		    released_by_user_id = $3
		WHERE system_id = $1
		  AND unassigned_at IS NULL
		  AND controller_id <> $4
	`, system.id, now, userID, controller.id); err != nil {
		return systemRecord{}, err
	}

	var existingController uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT controller_id
		FROM system_controller_assignments
		WHERE system_id = $1
		  AND controller_id = $2
		  AND unassigned_at IS NULL
	`, system.id, controller.id).Scan(&existingController)
	if err != nil && err != pgx.ErrNoRows {
		return systemRecord{}, err
	}
	if err == pgx.ErrNoRows {
		if _, err := tx.Exec(ctx, `
			INSERT INTO system_controller_assignments (
				id,
				system_id,
				controller_id,
				assigned_by_user_id,
				assigned_at
			)
			VALUES ($1, $2, $3, $4, NOW())
		`, uuid.New(), system.id, controller.id, userID); err != nil {
			return systemRecord{}, err
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE systems
		SET status = 'active',
		    updated_at = NOW()
		WHERE id = $1
	`, system.id); err != nil {
		return systemRecord{}, err
	}

	return scanSystemRecord(tx.QueryRow(ctx, `
		SELECT
			s.id,
			s.name,
			COALESCE(s.purpose, ''),
			COALESCE(s.location, ''),
			s.status,
			sca.assigned_at,
			sca.controller_id,
			COALESCE(c.hw_id, '')
		FROM systems s
		JOIN system_controller_assignments sca
		  ON sca.system_id = s.id
		 AND sca.unassigned_at IS NULL
		JOIN controllers c ON c.id = sca.controller_id
		WHERE s.id = $1
	`, system.id))
}

func (h *ControllerHandler) releaseControllerFromSystem(ctx context.Context, tx pgx.Tx, controllerID uuid.UUID, userID uuid.UUID) error {
	now := time.Now().UTC()
	var systemID uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT system_id
		FROM system_controller_assignments
		WHERE controller_id = $1
		  AND unassigned_at IS NULL
	`, controllerID).Scan(&systemID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil
		}
		return err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE system_controller_assignments
		SET unassigned_at = $2,
		    released_by_user_id = $3
		WHERE controller_id = $1
		  AND unassigned_at IS NULL
	`, controllerID, now, userID); err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE systems
		SET status = 'standby',
		    updated_at = NOW()
		WHERE id = $1
		  AND NOT EXISTS (
		      SELECT 1
		      FROM system_controller_assignments sca
		      WHERE sca.system_id = $1
		        AND sca.unassigned_at IS NULL
		  )
	`, systemID)
	return err
}

func ensureSystemSensorBinding(
	ctx context.Context,
	exec dbExecutor,
	systemID uuid.UUID,
	controllerID uuid.UUID,
	sensorUID string,
	sensorType string,
	sensorName string,
	sensorStatus string,
	configured bool,
	controllerSensorID *uuid.UUID,
	legacySensorID *uuid.UUID,
	lastSeen *time.Time,
) (systemSensorRecord, error) {
	slotKey := iot.NormalizeSystemSensorSlotKey(sensorUID, sensorType)
	displayName := strings.TrimSpace(sensorName)
	if displayName == "" {
		displayName = defaultHardwareSensorName(sensorType, sensorUID)
	}

	normalizedStatus := strings.ToLower(strings.TrimSpace(sensorStatus))
	if normalizedStatus == "error" {
		normalizedStatus = "damaged"
	}
	switch normalizedStatus {
	case "live", "offline", "retired", "damaged", "pending_discovery":
	default:
		normalizedStatus = "live"
	}

	var record systemSensorRecord
	err := exec.QueryRow(ctx, `
		INSERT INTO system_sensors (
			id,
			system_id,
			slot_key,
			name,
			type,
			status,
			configured,
			current_controller_id,
			current_sensor_uid,
			created_at,
			updated_at,
			last_seen
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)
		ON CONFLICT (system_id, slot_key) DO UPDATE
		SET name = EXCLUDED.name,
		    type = EXCLUDED.type,
		    status = EXCLUDED.status,
		    configured = system_sensors.configured OR EXCLUDED.configured,
		    current_controller_id = EXCLUDED.current_controller_id,
		    current_sensor_uid = EXCLUDED.current_sensor_uid,
		    updated_at = NOW(),
		    last_seen = COALESCE(EXCLUDED.last_seen, system_sensors.last_seen)
		RETURNING id, system_id, slot_key, COALESCE(current_sensor_uid, ''), name, type, status, configured
	`, uuid.New(), systemID, slotKey, displayName, normalizeHardwareSensorType(sensorType), normalizedStatus, configured, controllerID, strings.TrimSpace(sensorUID), lastSeen).Scan(
		&record.id,
		&record.systemID,
		&record.slotKey,
		&record.sensorUID,
		&record.name,
		&record.sensorType,
		&record.status,
		&record.configured,
	)
	if err != nil {
		return systemSensorRecord{}, err
	}

	if controllerSensorID != nil {
		if _, err := exec.Exec(ctx, `
			UPDATE controller_sensors
			SET system_sensor_id = $2,
			    updated_at = NOW()
			WHERE id = $1
		`, *controllerSensorID, record.id); err != nil {
			return systemSensorRecord{}, err
		}
		record.controllerSensor = controllerSensorID
	}

	if legacySensorID != nil {
		if _, err := exec.Exec(ctx, `
			UPDATE sensors
			SET system_sensor_id = $2
			WHERE id = $1
		`, *legacySensorID, record.id); err != nil {
			return systemSensorRecord{}, err
		}
	}

	var existingAssignment uuid.UUID
	var existingControllerSensor *uuid.UUID
	var existingLegacySensor *uuid.UUID
	err = exec.QueryRow(ctx, `
		SELECT id, controller_sensor_id, legacy_sensor_id
		FROM system_sensor_assignments
		WHERE system_sensor_id = $1
		  AND unassigned_at IS NULL
	`, record.id).Scan(&existingAssignment, &existingControllerSensor, &existingLegacySensor)
	if err != nil && err != pgx.ErrNoRows {
		return systemSensorRecord{}, err
	}
	if err == nil {
		matchesControllerSensor := (existingControllerSensor == nil && controllerSensorID == nil) || (existingControllerSensor != nil && controllerSensorID != nil && *existingControllerSensor == *controllerSensorID)
		matchesLegacySensor := (existingLegacySensor == nil && legacySensorID == nil) || (existingLegacySensor != nil && legacySensorID != nil && *existingLegacySensor == *legacySensorID)
		if matchesControllerSensor && matchesLegacySensor {
			if _, err := exec.Exec(ctx, `
				UPDATE system_sensor_assignments
				SET controller_id = $2,
				    sensor_uid = $3
				WHERE id = $1
			`, existingAssignment, controllerID, strings.TrimSpace(sensorUID)); err != nil {
				return systemSensorRecord{}, err
			}
			return record, nil
		}
	}

	if _, err := exec.Exec(ctx, `
		UPDATE system_sensor_assignments
		SET unassigned_at = NOW()
		WHERE unassigned_at IS NULL
		  AND (
		        system_sensor_id = $1
		        OR ($2::uuid IS NOT NULL AND controller_sensor_id = $2)
		        OR ($3::uuid IS NOT NULL AND legacy_sensor_id = $3)
		  )
	`, record.id, controllerSensorID, legacySensorID); err != nil {
		return systemSensorRecord{}, err
	}

	_, err = exec.Exec(ctx, `
		INSERT INTO system_sensor_assignments (
			id,
			system_sensor_id,
			controller_id,
			controller_sensor_id,
			legacy_sensor_id,
			sensor_uid,
			assigned_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`, uuid.New(), record.id, controllerID, controllerSensorID, legacySensorID, strings.TrimSpace(sensorUID))
	if err != nil {
		return systemSensorRecord{}, err
	}

	return record, nil
}
