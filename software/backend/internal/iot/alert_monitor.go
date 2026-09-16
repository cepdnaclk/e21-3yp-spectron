package iot

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultAlertMonitorInterval = time.Minute
	defaultOfflineAfter         = 2 * time.Hour
)

type AlertMonitor struct {
	db       *pgxpool.Pool
	interval time.Duration
}

func NewAlertMonitor(db *pgxpool.Pool) *AlertMonitor {
	return &AlertMonitor{
		db:       db,
		interval: defaultAlertMonitorInterval,
	}
}

func (m *AlertMonitor) Run(ctx context.Context) {
	if m == nil || m.db == nil {
		return
	}

	m.checkOnce(ctx)

	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.checkOnce(ctx)
		}
	}
}

func (m *AlertMonitor) checkOnce(ctx context.Context) {
	if err := markStaleControllersOffline(ctx, m.db, defaultOfflineAfter); err != nil {
		log.Printf("alert monitor controller check failed: %v", err)
	}
	if err := markStaleSensorsOffline(ctx, m.db, defaultOfflineAfter); err != nil {
		log.Printf("alert monitor sensor check failed: %v", err)
	}
}

func markStaleControllersOffline(ctx context.Context, db *pgxpool.Pool, offlineAfter time.Duration) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	type staleController struct {
		id        string
		accountID string
		name      string
		lastSeen  time.Time
		farmID    *string
		gatewayID *string
	}

	rows, err := tx.Query(ctx, `
		UPDATE controllers
		SET operational_status = 'OFFLINE',
		    status = 'OFFLINE',
		    updated_at = NOW()
		WHERE claim_status = 'CLAIMED'
		  AND owner_account_id IS NOT NULL
		  AND operational_status <> 'OFFLINE'
		  AND last_seen IS NOT NULL
		  AND last_seen < NOW() - ($1::double precision * INTERVAL '1 second')
		RETURNING id, owner_account_id, COALESCE(name, hw_id), last_seen
	`, offlineAfter.Seconds())
	if err != nil {
		return err
	}

	var staleControllers []staleController
	for rows.Next() {
		var controller staleController
		if err := rows.Scan(&controller.id, &controller.accountID, &controller.name, &controller.lastSeen); err != nil {
			rows.Close()
			return err
		}
		farmID, gatewayID, err := loadControllerFarmContext(ctx, tx, controller.id)
		if err != nil {
			rows.Close()
			return err
		}
		controller.farmID = farmID
		controller.gatewayID = gatewayID
		staleControllers = append(staleControllers, controller)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, controller := range staleControllers {
		message := fmt.Sprintf("%s has not reported since %s.", controller.name, controller.lastSeen.UTC().Format(time.RFC3339))
		if err := insertOpenAlertIfMissing(ctx, tx, controller.accountID, &controller.id, nil, controller.farmID, nil, controller.gatewayID, nil, "CONTROLLER_OFFLINE", "WARN", message); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func markStaleSensorsOffline(ctx context.Context, db *pgxpool.Pool, offlineAfter time.Duration) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	type staleSensor struct {
		id           string
		controllerID string
		accountID    string
		name         string
		lastSeen     time.Time
		hwID         string
		farmID       *string
		fieldID      *string
		gatewayID    *string
		sensorBaseID *string
	}

	rows, err := tx.Query(ctx, `
		UPDATE sensors s
		SET status = 'OFFLINE'
		FROM controllers c
		WHERE s.controller_id = c.id
		  AND c.claim_status = 'CLAIMED'
		  AND c.owner_account_id IS NOT NULL
		  AND UPPER(COALESCE(s.status, '')) <> 'OFFLINE'
		  AND s.last_seen IS NOT NULL
		  AND s.last_seen < NOW() - ($1::double precision * INTERVAL '1 second')
		RETURNING s.id, c.id, c.owner_account_id, COALESCE(s.name, s.hw_id), s.last_seen, s.hw_id
	`, offlineAfter.Seconds())
	if err != nil {
		return err
	}

	var staleSensors []staleSensor
	for rows.Next() {
		var sensor staleSensor
		if err := rows.Scan(&sensor.id, &sensor.controllerID, &sensor.accountID, &sensor.name, &sensor.lastSeen, &sensor.hwID); err != nil {
			rows.Close()
			return err
		}
		farmID, fieldID, gatewayID, sensorBaseID, err := loadSensorFarmContext(ctx, tx, sensor.controllerID, sensor.hwID)
		if err != nil {
			rows.Close()
			return err
		}
		sensor.farmID = farmID
		sensor.fieldID = fieldID
		sensor.gatewayID = gatewayID
		sensor.sensorBaseID = sensorBaseID
		staleSensors = append(staleSensors, sensor)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, sensor := range staleSensors {
		message := fmt.Sprintf("%s has not reported since %s.", sensor.name, sensor.lastSeen.UTC().Format(time.RFC3339))
		if err := insertOpenAlertIfMissing(ctx, tx, sensor.accountID, &sensor.controllerID, &sensor.id, sensor.farmID, sensor.fieldID, sensor.gatewayID, sensor.sensorBaseID, "SENSOR_OFFLINE", "WARN", message); err != nil {
			return err
		}
	}

	if err := markStaleControllerSensorsOffline(ctx, tx, offlineAfter); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func markStaleControllerSensorsOffline(ctx context.Context, tx interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}, offlineAfter time.Duration) error {
	_, err := tx.Exec(ctx, `
		UPDATE controller_sensors cs
		SET status = 'offline',
		    updated_at = NOW()
		FROM controllers c
		WHERE cs.controller_id = c.id
		  AND c.claim_status = 'CLAIMED'
		  AND c.owner_account_id IS NOT NULL
		  AND UPPER(COALESCE(cs.status, '')) = 'live'
		  AND cs.updated_at < NOW() - ($1::double precision * INTERVAL '1 second')
	`, offlineAfter.Seconds())
	return err
}

type alertExecutor interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func loadControllerFarmContext(ctx context.Context, q interface {
	QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row
}, controllerID string) (*string, *string, error) {
	var farmID *string
	var gatewayID *string
	err := q.QueryRow(ctx, `
		SELECT g.farm_id::text, g.id::text
		FROM gateways g
		WHERE g.legacy_controller_id::text = $1
	`, controllerID).Scan(&farmID, &gatewayID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	return farmID, gatewayID, nil
}

func loadSensorFarmContext(ctx context.Context, q interface {
	QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row
}, controllerID string, sensorHWID string) (*string, *string, *string, *string, error) {
	var farmID *string
	var fieldID *string
	var gatewayID *string
	var sensorBaseID *string
	err := q.QueryRow(ctx, `
		SELECT
			g.farm_id::text,
			sba.field_id::text,
			g.id::text,
			sb.id::text
		FROM gateways g
		LEFT JOIN sensor_bases sb
		  ON sb.gateway_id = g.id
		LEFT JOIN sensor_base_assignments sba
		  ON sba.base_id = sb.id
		 AND sba.unassigned_at IS NULL
		WHERE g.legacy_controller_id::text = $1
		  AND (
		       lower(sb.serial_number) = lower($2)
		       OR lower($2) LIKE lower(sb.serial_number) || ':%'
		       OR lower($2) LIKE lower(sb.serial_number) || '/%'
		       OR lower($2) LIKE lower(sb.serial_number) || '-%'
		  )
		ORDER BY sb.updated_at DESC
		LIMIT 1
	`, controllerID, sensorHWID).Scan(&farmID, &fieldID, &gatewayID, &sensorBaseID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil, nil, nil, nil
		}
		return nil, nil, nil, nil, err
	}
	return farmID, fieldID, gatewayID, sensorBaseID, nil
}

func insertOpenAlertIfMissing(ctx context.Context, tx alertExecutor, accountID string, controllerID *string, sensorID *string, farmID *string, fieldID *string, gatewayID *string, sensorBaseID *string, alertType string, severity string, message string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO alerts (id, account_id, controller_id, sensor_id, farm_id, field_id, gateway_id, sensor_base_id, type, severity, message, created_at)
		SELECT $11, $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8, $9, $10, NOW()
		WHERE NOT EXISTS (
			SELECT 1
			FROM alerts
			WHERE account_id = $1::uuid
			  AND ($2::uuid IS NULL OR controller_id = $2::uuid)
			  AND ($3::uuid IS NULL OR sensor_id = $3::uuid)
			  AND type = $8
			  AND severity = $9
			  AND acknowledged_at IS NULL
		)
	`, accountID, controllerID, sensorID, farmID, fieldID, gatewayID, sensorBaseID, alertType, severity, message, uuid.New())
	return err
}
