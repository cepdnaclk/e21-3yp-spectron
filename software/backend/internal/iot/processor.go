package iot

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/models"
)

type RawReadingsProcessor struct {
	db *pgxpool.Pool
}

const sensorReadingsRetentionWindow = 7 * 24 * time.Hour
const defaultAttendanceCooldown = 2 * time.Second

func NewRawReadingsProcessor(db *pgxpool.Pool) *RawReadingsProcessor {
	return &RawReadingsProcessor{db: db}
}

func (p *RawReadingsProcessor) ProcessEvent(ctx context.Context, event RawReadingsEvent) error {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var controllerID uuid.UUID
	var accountID *uuid.UUID
	var claimStatus string
	err = tx.QueryRow(ctx, `
		SELECT id, owner_account_id, claim_status
		FROM controllers
		WHERE hw_id = $1
	`, event.DeviceID).Scan(&controllerID, &accountID, &claimStatus)
	if err != nil {
		return fmt.Errorf("find controller %s: %w", event.DeviceID, err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE controllers
		SET operational_status = 'ONLINE',
		    status = 'ONLINE',
		    last_seen = $2,
		    updated_at = CASE
		        WHEN operational_status = 'ONLINE' THEN updated_at
		        ELSE $2
		    END
		WHERE id = $1
	`, controllerID, event.ReadingTime)
	if err != nil {
		return fmt.Errorf("update controller status: %w", err)
	}

	if claimStatus != "CLAIMED" || accountID == nil {
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit unclaimed controller status: %w", err)
		}
		return nil
	}

	for _, sensor := range event.Sensors {
		if err := p.upsertSensorReading(ctx, tx, *accountID, controllerID, event, sensor); err != nil {
			return err
		}
	}

	if err := pruneExpiredSensorReadings(ctx, tx, time.Now().UTC()); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}

func (p *RawReadingsProcessor) upsertSensorReading(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, controllerID uuid.UUID, event RawReadingsEvent, sensor RawReadingsMessage) error {
	sensorHWID := strings.TrimSpace(sensor.HWID)
	sensorType := strings.TrimSpace(sensor.Type)
	sensorName := fmt.Sprintf("Sensor %s", sensorHWID)
	sensorID := uuid.New()

	var persistedSensorID uuid.UUID
	var persistedSensorName string
	var persistedSensorType string
	err := tx.QueryRow(ctx, `
		INSERT INTO sensors (id, controller_id, hw_id, type, name, status, last_seen)
		VALUES ($1, $2, $3, $4, $5, 'OK', $6)
		ON CONFLICT (controller_id, hw_id) DO UPDATE
		SET type = EXCLUDED.type,
		    name = COALESCE(sensors.name, EXCLUDED.name),
		    status = 'OK',
		    last_seen = EXCLUDED.last_seen
		RETURNING id, COALESCE(name, hw_id), type
	`, sensorID, controllerID, sensorHWID, sensorType, sensorName, event.ReadingTime).Scan(&persistedSensorID, &persistedSensorName, &persistedSensorType)
	if err != nil {
		return fmt.Errorf("upsert sensor %s: %w", sensorHWID, err)
	}

	var systemSensorID *uuid.UUID
	var systemID *uuid.UUID
	var resolvedSystemID uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT system_id
		FROM system_controller_assignments
		WHERE controller_id = $1
		  AND unassigned_at IS NULL
	`, controllerID).Scan(&resolvedSystemID); err != nil && err != pgx.ErrNoRows {
		return fmt.Errorf("resolve active system for controller %s: %w", event.DeviceID, err)
	}
	if resolvedSystemID != uuid.Nil {
		systemID = &resolvedSystemID
	}
	if systemID != nil {
		resolvedSystemSensorID, bindErr := upsertSystemSensorState(ctx, tx, *systemID, controllerID, sensorHWID, sensorType, persistedSensorName, event.ReadingTime, persistedSensorID)
		if bindErr != nil {
			return fmt.Errorf("bind logical system sensor %s: %w", sensorHWID, bindErr)
		}
		systemSensorID = &resolvedSystemSensorID
	}

	config, hasConfig, err := loadActiveSensorConfig(ctx, tx, persistedSensorID, systemSensorID, controllerID, sensorHWID, persistedSensorType)
	if err != nil {
		return fmt.Errorf("load config for sensor %s: %w", sensorHWID, err)
	}

	normalizedValue, convertedDistance := normalizeReadingValue(persistedSensorType, sensor.Value)
	readingMeta := map[string]any{
		"event_id":            event.EventID,
		"device_id":           event.DeviceID,
		"sensor_hw_id":        sensorHWID,
		"sensor_type":         sensorType,
		"metric":              defaultMetricForSensorType(sensorType),
		"parent_sensor_hw_id": sidecarParentSensorHWID(sensorHWID, sensorType),
		"received_at":         event.ReceivedAt,
		"reading_time":        event.ReadingTime,
		"timestamp_raw":       event.TimestampRaw,
		"source":              event.Source,
	}
	if convertedDistance {
		readingMeta["raw_value"] = sensor.Value
		readingMeta["raw_unit"] = "mm"
		readingMeta["normalized_unit"] = "cm"
		readingMeta["distance_conversion"] = "mm_to_cm"
	}

	alertValue := normalizedValue
	if hasConfig {
		attendance, enabled, err := p.processDistanceAttendance(
			ctx,
			tx,
			persistedSensorID,
			persistedSensorType,
			normalizedValue,
			event.ReadingTime,
			config,
		)
		if err != nil {
			return fmt.Errorf("process attendance for sensor %s: %w", sensorHWID, err)
		}
		if enabled {
			readingMeta["attendance_count"] = attendance.Count
			readingMeta["attendance_event"] = attendance.Counted
			readingMeta["attendance_passage_active"] = attendance.PassageActive
			readingMeta["attendance_deviation_cm"] = attendance.DeviationCM
			readingMeta["attendance_session_started_at"] = attendance.SessionStartedAt
			if strings.EqualFold(strings.TrimSpace(config.PrimaryMetric), "attendance_count") {
				alertValue = float64(attendance.Count)
			}
		}
	}

	meta, err := json.Marshal(readingMeta)
	if err != nil {
		return fmt.Errorf("marshal reading metadata: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO sensor_readings (time, sensor_id, system_sensor_id, value, meta)
		VALUES ($1, $2, $3, $4, $5::jsonb)
		ON CONFLICT (time, sensor_id) DO UPDATE
		SET system_sensor_id = COALESCE(EXCLUDED.system_sensor_id, sensor_readings.system_sensor_id),
		    value = EXCLUDED.value,
		    meta = EXCLUDED.meta
	`, event.ReadingTime, persistedSensorID, systemSensorID, normalizedValue, meta)
	if err != nil {
		return fmt.Errorf("insert sensor reading %s: %w", sensorHWID, err)
	}

	if err := p.evaluateThresholdAlertWithConfig(ctx, tx, thresholdAlertInput{
		AccountID:      accountID,
		ControllerID:   controllerID,
		SensorID:       persistedSensorID,
		SystemID:       systemID,
		SystemSensorID: systemSensorID,
		SensorHWID:     sensorHWID,
		SensorName:     persistedSensorName,
		SensorType:     persistedSensorType,
		Value:          alertValue,
		ReadingAt:      event.ReadingTime,
	}, config, hasConfig); err != nil {
		return fmt.Errorf("evaluate alert for sensor %s: %w", sensorHWID, err)
	}

	return nil
}

func normalizeReadingValue(sensorType string, value float64) (float64, bool) {
	switch strings.ToLower(strings.TrimSpace(sensorType)) {
	case "vl53l0x", "distance":
		return value / 10.0, true
	default:
		return value, false
	}
}

func upsertSystemSensorState(
	ctx context.Context,
	tx pgx.Tx,
	systemID uuid.UUID,
	controllerID uuid.UUID,
	sensorHWID string,
	sensorType string,
	sensorName string,
	readingTime time.Time,
	legacySensorID uuid.UUID,
) (uuid.UUID, error) {
	slotKey := NormalizeSystemSensorSlotKey(sensorHWID, sensorType)
	displayName := strings.TrimSpace(sensorName)
	if displayName == "" {
		displayName = sensorHWID
	}

	var systemSensorID uuid.UUID
	err := tx.QueryRow(ctx, `
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
		VALUES ($1, $2, $3, $4, $5, 'live', false, $6, $7, NOW(), NOW(), $8)
		ON CONFLICT (system_id, slot_key) DO UPDATE
		SET name = COALESCE(NULLIF(EXCLUDED.name, ''), system_sensors.name),
		    type = EXCLUDED.type,
		    status = 'live',
		    current_controller_id = EXCLUDED.current_controller_id,
		    current_sensor_uid = EXCLUDED.current_sensor_uid,
		    updated_at = NOW(),
		    last_seen = EXCLUDED.last_seen
		RETURNING id
	`, uuid.New(), systemID, slotKey, displayName, sensorType, controllerID, sensorHWID, readingTime).Scan(&systemSensorID)
	if err != nil {
		return uuid.Nil, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE sensors
		SET system_sensor_id = $2
		WHERE id = $1
	`, legacySensorID, systemSensorID); err != nil {
		return uuid.Nil, err
	}

	var controllerSensorID *uuid.UUID
	var resolvedControllerSensorID uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT id
		FROM controller_sensors
		WHERE controller_id = $1
		  AND sensor_uid = $2
	`, controllerID, sensorHWID).Scan(&resolvedControllerSensorID); err != nil && err != pgx.ErrNoRows {
		return uuid.Nil, err
	}
	if resolvedControllerSensorID != uuid.Nil {
		controllerSensorID = &resolvedControllerSensorID
	}
	if controllerSensorID != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE controller_sensors
			SET system_sensor_id = $2,
			    updated_at = NOW()
			WHERE id = $1
		`, *controllerSensorID, systemSensorID); err != nil {
			return uuid.Nil, err
		}
	}

	var existingAssignmentID uuid.UUID
	var existingControllerSensorID *uuid.UUID
	var existingLegacySensorID *uuid.UUID
	var resolvedExistingControllerSensorID *uuid.UUID
	var resolvedExistingLegacySensorID *uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id, controller_sensor_id, legacy_sensor_id
		FROM system_sensor_assignments
		WHERE system_sensor_id = $1
		  AND unassigned_at IS NULL
	`, systemSensorID).Scan(&existingAssignmentID, &resolvedExistingControllerSensorID, &resolvedExistingLegacySensorID)
	if err != nil && err != pgx.ErrNoRows {
		return uuid.Nil, err
	}
	existingControllerSensorID = resolvedExistingControllerSensorID
	existingLegacySensorID = resolvedExistingLegacySensorID
	if err == nil {
		matchesController := (existingControllerSensorID == nil && controllerSensorID == nil) || (existingControllerSensorID != nil && controllerSensorID != nil && *existingControllerSensorID == *controllerSensorID)
		matchesLegacy := existingLegacySensorID != nil && *existingLegacySensorID == legacySensorID
		if matchesController && matchesLegacy {
			if _, err := tx.Exec(ctx, `
				UPDATE system_sensor_assignments
				SET controller_id = $2,
				    sensor_uid = $3
				WHERE id = $1
			`, existingAssignmentID, controllerID, sensorHWID); err != nil {
				return uuid.Nil, err
			}
			return systemSensorID, nil
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE system_sensor_assignments
		SET unassigned_at = NOW()
		WHERE unassigned_at IS NULL
		  AND (
		        system_sensor_id = $1
		        OR ($2::uuid IS NOT NULL AND controller_sensor_id = $2)
		        OR legacy_sensor_id = $3
		  )
	`, systemSensorID, controllerSensorID, legacySensorID); err != nil {
		return uuid.Nil, err
	}

	_, err = tx.Exec(ctx, `
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
	`, uuid.New(), systemSensorID, controllerID, controllerSensorID, legacySensorID, sensorHWID)
	if err != nil {
		return uuid.Nil, err
	}

	return systemSensorID, nil
}

func pruneExpiredSensorReadings(ctx context.Context, tx pgx.Tx, now time.Time) error {
	if now.IsZero() {
		now = time.Now().UTC()
	}

	_, err := tx.Exec(ctx, `
		DELETE FROM sensor_readings
		WHERE time < $1
	`, sensorReadingsRetentionCutoff(now))
	if err != nil {
		return fmt.Errorf("prune expired sensor readings: %w", err)
	}

	return nil
}

func sensorReadingsRetentionCutoff(now time.Time) time.Time {
	return now.UTC().Add(-sensorReadingsRetentionWindow)
}

type thresholdAlertInput struct {
	AccountID      uuid.UUID
	ControllerID   uuid.UUID
	SensorID       uuid.UUID
	SystemID       *uuid.UUID
	SystemSensorID *uuid.UUID
	SensorHWID     string
	SensorName     string
	SensorType     string
	Value          float64
	ReadingAt      time.Time
}

type thresholdAlertEvaluation struct {
	Triggered  bool
	Severity   string
	Metric     string
	Condition  string
	Boundary   string
	AlertLabel string
	Threshold  float64
}

func (p *RawReadingsProcessor) evaluateThresholdAlertWithConfig(ctx context.Context, tx pgx.Tx, input thresholdAlertInput, config models.SensorConfig, ok bool) error {
	if !ok {
		return nil
	}

	evaluation := evaluateThresholdBreach(input.SensorType, input.Value, config)
	if !evaluation.Triggered {
		return nil
	}

	message := thresholdAlertMessage(input, evaluation)
	return upsertOpenAlert(ctx, tx, input.AccountID, input.ControllerID, input.SensorID, input.SystemID, input.SystemSensorID, "THRESHOLD_BREACH", evaluation.Severity, message)
}

type distanceAttendanceConfig struct {
	BaselineCM float64
	TriggerCM  float64
	ResetCM    float64
	Cooldown   time.Duration
}

type distanceAttendanceState struct {
	Count            int64
	PassageActive    bool
	LastCountedAt    *time.Time
	SessionStartedAt time.Time
}

type distanceAttendanceResult struct {
	Count            int64
	Counted          bool
	PassageActive    bool
	DeviationCM      float64
	SessionStartedAt time.Time
}

func (p *RawReadingsProcessor) processDistanceAttendance(
	ctx context.Context,
	tx pgx.Tx,
	sensorID uuid.UUID,
	sensorType string,
	value float64,
	readingAt time.Time,
	config models.SensorConfig,
) (distanceAttendanceResult, bool, error) {
	detectorConfig, enabled := attendanceConfigForSensor(sensorType, config)
	if !enabled {
		return distanceAttendanceResult{}, false, nil
	}

	var state distanceAttendanceState
	err := tx.QueryRow(ctx, `
		SELECT attendance_count, passage_active, last_counted_at, session_started_at
		FROM distance_attendance_state
		WHERE sensor_id = $1
		FOR UPDATE
	`, sensorID).Scan(&state.Count, &state.PassageActive, &state.LastCountedAt, &state.SessionStartedAt)
	if err != nil && err != pgx.ErrNoRows {
		return distanceAttendanceResult{}, true, err
	}
	if err == pgx.ErrNoRows {
		state.SessionStartedAt = readingAt
	}

	result, nextState := evaluateDistanceAttendance(value, readingAt, detectorConfig, state)
	_, err = tx.Exec(ctx, `
		INSERT INTO distance_attendance_state (
			sensor_id, attendance_count, passage_active, last_counted_at, session_started_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (sensor_id) DO UPDATE
		SET attendance_count = EXCLUDED.attendance_count,
		    passage_active = EXCLUDED.passage_active,
		    last_counted_at = EXCLUDED.last_counted_at,
		    session_started_at = EXCLUDED.session_started_at,
		    updated_at = EXCLUDED.updated_at
	`, sensorID, nextState.Count, nextState.PassageActive, nextState.LastCountedAt, nextState.SessionStartedAt, readingAt)
	if err != nil {
		return distanceAttendanceResult{}, true, err
	}

	return result, true, nil
}

func attendanceConfigForSensor(sensorType string, config models.SensorConfig) (distanceAttendanceConfig, bool) {
	switch strings.ToLower(strings.TrimSpace(sensorType)) {
	case "vl53l0x", "distance", "ultrasonic":
	default:
		return distanceAttendanceConfig{}, false
	}

	config.NormalizeThreeLayer(sensorType, nil)
	enabled := strings.EqualFold(config.UseCase, "attendance_monitoring") ||
		strings.EqualFold(config.PrimaryMetric, "attendance_count")
	if config.Interpretation != nil {
		for _, metric := range config.Interpretation.ObservableMetrics {
			if strings.EqualFold(metric, "attendance_count") {
				enabled = true
			}
		}
		for _, metric := range config.Interpretation.DerivedMetrics {
			if strings.EqualFold(metric.Key, "attendance_count") {
				enabled = true
			}
		}
	}
	if !enabled {
		return distanceAttendanceConfig{}, false
	}

	hardware := config.HardwareConfig
	if len(hardware) == 0 && config.Hardware != nil {
		hardware = config.Hardware.Config
	}
	baseline, baselineOK := numericValueFromMap(hardware, "attendanceBaselineDistanceCm")
	trigger, triggerOK := numericValueFromMap(hardware, "attendanceTriggerDeltaCm")
	if !baselineOK || baseline <= 0 || !triggerOK || trigger <= 0 {
		return distanceAttendanceConfig{}, false
	}

	resetHysteresis, ok := numericValueFromMap(hardware, "attendanceResetHysteresisCm")
	if !ok || resetHysteresis < 0 {
		resetHysteresis = math.Min(10, trigger*0.2)
	}
	if resetHysteresis >= trigger {
		resetHysteresis = trigger * 0.5
	}

	cooldownSeconds, ok := numericValueFromMap(hardware, "attendanceCooldownSeconds")
	if !ok || cooldownSeconds <= 0 {
		cooldownSeconds = defaultAttendanceCooldown.Seconds()
	}

	return distanceAttendanceConfig{
		BaselineCM: baseline,
		TriggerCM:  trigger,
		ResetCM:    trigger - resetHysteresis,
		Cooldown:   time.Duration(cooldownSeconds * float64(time.Second)),
	}, true
}

func evaluateDistanceAttendance(
	value float64,
	readingAt time.Time,
	config distanceAttendanceConfig,
	state distanceAttendanceState,
) (distanceAttendanceResult, distanceAttendanceState) {
	result := distanceAttendanceResult{
		Count:            state.Count,
		PassageActive:    state.PassageActive,
		SessionStartedAt: state.SessionStartedAt,
	}
	if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 || readingAt.IsZero() {
		return result, state
	}

	deviation := math.Abs(value - config.BaselineCM)
	result.DeviationCM = deviation

	if state.PassageActive {
		if deviation <= config.ResetCM {
			state.PassageActive = false
		}
		result.PassageActive = state.PassageActive
		return result, state
	}

	cooldownComplete := state.LastCountedAt == nil || !readingAt.Before(state.LastCountedAt.Add(config.Cooldown))
	if deviation >= config.TriggerCM && cooldownComplete {
		state.Count++
		state.PassageActive = true
		countedAt := readingAt
		state.LastCountedAt = &countedAt
		result.Count = state.Count
		result.Counted = true
		result.PassageActive = true
	}

	return result, state
}

func numericValueFromMap(values map[string]interface{}, key string) (float64, bool) {
	ptr := numericPtrFromMap(values, key)
	if ptr == nil {
		return 0, false
	}
	return *ptr, true
}

func loadActiveSensorConfig(ctx context.Context, tx pgx.Tx, sensorID uuid.UUID, systemSensorID *uuid.UUID, controllerID uuid.UUID, sensorHWID string, sensorType string) (models.SensorConfig, bool, error) {
	var rawConfig []byte
	if systemSensorID != nil {
		err := tx.QueryRow(ctx, `
			SELECT config_json
			FROM system_sensor_configurations
			WHERE system_sensor_id = $1
			  AND active = true
			ORDER BY updated_at DESC
			LIMIT 1
		`, *systemSensorID).Scan(&rawConfig)
		if err == nil {
			config, err := decodeAlertSensorConfig(rawConfig, sensorType)
			if err != nil {
				return models.SensorConfig{}, false, err
			}
			return config, true, nil
		}
		if err != pgx.ErrNoRows {
			return models.SensorConfig{}, false, err
		}
	}

	for _, candidateHWID := range configLookupSensorHWIDs(sensorHWID, sensorType) {
		err := tx.QueryRow(ctx, `
			SELECT ssc.config_json
			FROM system_sensors ss
			JOIN system_sensor_configurations ssc
			  ON ssc.system_sensor_id = ss.id
			 AND ssc.active = true
			WHERE ss.current_controller_id = $1
			  AND ss.current_sensor_uid = $2
			ORDER BY ssc.updated_at DESC
			LIMIT 1
		`, controllerID, candidateHWID).Scan(&rawConfig)
		if err == nil {
			config, err := decodeAlertSensorConfig(rawConfig, sensorType)
			if err != nil {
				return models.SensorConfig{}, false, err
			}
			return config, true, nil
		}
		if err != pgx.ErrNoRows {
			return models.SensorConfig{}, false, err
		}
	}

	err := tx.QueryRow(ctx, `
		SELECT config_json
		FROM sensor_configs
		WHERE sensor_id = $1
		  AND active = true
		ORDER BY created_at DESC
		LIMIT 1
	`, sensorID).Scan(&rawConfig)
	if err != nil {
		if err != pgx.ErrNoRows {
			return models.SensorConfig{}, false, err
		}

		err = tx.QueryRow(ctx, `
			SELECT sc.config_json
			FROM sensor_configurations sc
			JOIN controller_sensors cs ON cs.id = sc.sensor_id
			WHERE sc.controller_id = $1
			  AND cs.sensor_uid = $2
			ORDER BY sc.updated_at DESC
			LIMIT 1
		`, controllerID, strings.TrimSpace(sensorHWID)).Scan(&rawConfig)
		if err != nil {
			if err == pgx.ErrNoRows {
				for _, candidateHWID := range configLookupSensorHWIDs(sensorHWID, sensorType) {
					err = tx.QueryRow(ctx, `
						SELECT sc.config_json
						FROM sensors s
						JOIN sensor_configs sc ON sc.sensor_id = s.id
						WHERE s.controller_id = $1
						  AND s.hw_id = $2
						  AND sc.active = true
						ORDER BY sc.created_at DESC
						LIMIT 1
					`, controllerID, candidateHWID).Scan(&rawConfig)
					if err == nil {
						break
					}
					if err != pgx.ErrNoRows {
						return models.SensorConfig{}, false, err
					}

					err = tx.QueryRow(ctx, `
						SELECT sc.config_json
						FROM sensor_configurations sc
						JOIN controller_sensors cs ON cs.id = sc.sensor_id
						WHERE sc.controller_id = $1
						  AND cs.sensor_uid = $2
						ORDER BY sc.updated_at DESC
						LIMIT 1
					`, controllerID, candidateHWID).Scan(&rawConfig)
					if err == nil {
						break
					}
					if err != pgx.ErrNoRows {
						return models.SensorConfig{}, false, err
					}
				}

				if err == pgx.ErrNoRows {
					return models.SensorConfig{}, false, nil
				}
			} else {
				return models.SensorConfig{}, false, err
			}
		}
	}
	if len(rawConfig) == 0 || string(rawConfig) == "null" {
		return models.SensorConfig{}, false, nil
	}

	config, err := decodeAlertSensorConfig(rawConfig, sensorType)
	if err != nil {
		return models.SensorConfig{}, false, err
	}
	return config, true, nil
}

func configLookupSensorHWIDs(sensorHWID string, sensorType string) []string {
	trimmed := strings.TrimSpace(sensorHWID)
	if trimmed == "" {
		return nil
	}

	parent := sidecarParentSensorHWID(trimmed, sensorType)
	if parent == "" || parent == trimmed {
		return []string{trimmed}
	}

	return []string{trimmed, parent}
}

func sidecarParentSensorHWID(sensorHWID string, sensorType string) string {
	trimmed := strings.TrimSpace(sensorHWID)
	metric := defaultMetricForSensorType(sensorType)
	if trimmed == "" || (metric != "humidity" && metric != "pressure") {
		return ""
	}
	if strings.HasSuffix(trimmed, "-humidity") {
		return strings.TrimSuffix(trimmed, "-humidity")
	}
	if strings.HasSuffix(trimmed, "-pressure") {
		return strings.TrimSuffix(trimmed, "-pressure")
	}
	if !strings.HasSuffix(trimmed, "-humidity") {
		return ""
	}

	return strings.TrimSuffix(trimmed, "-humidity")
}

func decodeAlertSensorConfig(rawConfig []byte, sensorType string) (models.SensorConfig, error) {
	var config models.SensorConfig
	if err := json.Unmarshal(rawConfig, &config); err == nil {
		config.NormalizeThreeLayer(sensorType, nil)
		if config.HasMeaningfulContent() {
			return config, nil
		}
	}

	var flat map[string]any
	if err := json.Unmarshal(rawConfig, &flat); err != nil {
		return models.SensorConfig{}, err
	}

	metric := defaultMetricForSensorType(sensorType)
	thresholds := models.ThresholdConfig{
		Min:        numericPtrFromMap(flat, metric+"Min"),
		Max:        numericPtrFromMap(flat, metric+"Max"),
		WarningMin: numericPtrFromMap(flat, metric+"WarningMin"),
		WarningMax: numericPtrFromMap(flat, metric+"WarningMax"),
	}

	if isEmptyThreshold(thresholds) {
		thresholds = models.ThresholdConfig{
			Min:        numericPtrFromMap(flat, "min"),
			Max:        numericPtrFromMap(flat, "max"),
			WarningMin: numericPtrFromMap(flat, "warningMin"),
			WarningMax: numericPtrFromMap(flat, "warningMax"),
		}
	}

	config = models.SensorConfig{
		PrimaryMetric:    metric,
		Thresholds:       thresholds,
		MetricThresholds: map[string]models.ThresholdConfig{metric: thresholds},
		HardwareConfig:   flat,
	}
	config.NormalizeThreeLayer(sensorType, nil)
	return config, nil
}

func isEmptyThreshold(threshold models.ThresholdConfig) bool {
	return threshold.Min == nil && threshold.Max == nil && threshold.WarningMin == nil && threshold.WarningMax == nil
}

func numericPtrFromMap(values map[string]any, key string) *float64 {
	value, ok := values[key]
	if !ok {
		return nil
	}

	var number float64
	switch v := value.(type) {
	case float64:
		number = v
	case float32:
		number = float64(v)
	case int:
		number = float64(v)
	case int32:
		number = float64(v)
	case int64:
		number = float64(v)
	case json.Number:
		parsed, err := v.Float64()
		if err != nil {
			return nil
		}
		number = parsed
	default:
		return nil
	}

	return &number
}

func evaluateThresholdBreach(sensorType string, value float64, config models.SensorConfig) thresholdAlertEvaluation {
	config.NormalizeThreeLayer(sensorType, nil)
	sensorMetric := defaultMetricForSensorType(sensorType)
	metric := strings.TrimSpace(config.PrimaryMetric)
	if metric == "" {
		metric = sensorMetric
	}

	threshold := config.Thresholds
	if config.MetricThresholds != nil {
		if metricThreshold, ok := config.MetricThresholds[metric]; ok {
			threshold = metricThreshold
		} else if metricThreshold, ok := config.MetricThresholds[sensorMetric]; ok {
			metric = sensorMetric
			threshold = metricThreshold
		}
	}

	switch {
	case threshold.WarningMin != nil && value < *threshold.WarningMin:
		return thresholdAlertEvaluation{
			Triggered:  true,
			Severity:   "CRITICAL",
			Metric:     metric,
			Condition:  "below",
			Boundary:   "below critical minimum",
			AlertLabel: matchingAlertLabel(config, metric, "below"),
			Threshold:  *threshold.WarningMin,
		}
	case threshold.WarningMax != nil && value > *threshold.WarningMax:
		return thresholdAlertEvaluation{
			Triggered:  true,
			Severity:   "CRITICAL",
			Metric:     metric,
			Condition:  "above",
			Boundary:   "above critical maximum",
			AlertLabel: matchingAlertLabel(config, metric, "above"),
			Threshold:  *threshold.WarningMax,
		}
	case threshold.Min != nil && value < *threshold.Min:
		return thresholdAlertEvaluation{
			Triggered:  true,
			Severity:   "WARN",
			Metric:     metric,
			Condition:  "below",
			Boundary:   "below minimum",
			AlertLabel: matchingAlertLabel(config, metric, "below"),
			Threshold:  *threshold.Min,
		}
	case threshold.Max != nil && value > *threshold.Max:
		return thresholdAlertEvaluation{
			Triggered:  true,
			Severity:   "WARN",
			Metric:     metric,
			Condition:  "above",
			Boundary:   "above maximum",
			AlertLabel: matchingAlertLabel(config, metric, "above"),
			Threshold:  *threshold.Max,
		}
	default:
		return thresholdAlertEvaluation{}
	}
}

func matchingAlertLabel(config models.SensorConfig, metric string, condition string) string {
	if config.Settings == nil || len(config.Settings.Alerts) == 0 {
		return ""
	}

	for _, alert := range config.Settings.Alerts {
		if strings.TrimSpace(alert.MetricKey) == strings.TrimSpace(metric) &&
			strings.EqualFold(strings.TrimSpace(alert.Condition), strings.TrimSpace(condition)) &&
			strings.TrimSpace(alert.Label) != "" {
			return strings.TrimSpace(alert.Label)
		}
	}

	return ""
}

func defaultMetricForSensorType(sensorType string) string {
	switch strings.ToLower(strings.TrimSpace(sensorType)) {
	case "temperature_humidity", "temp_humidity", "dht11", "dht22", "temperature", "bme280", "bmp280":
		return "temperature"
	case "humidity":
		return "humidity"
	case "pressure":
		return "pressure"
	case "ultrasonic":
		return "fill_level"
	case "vl53l0x", "distance":
		return "distance"
	case "load", "load_cell":
		return "weight"
	case "gas", "gas_sensor":
		return "gas_level"
	case "air_quality":
		return "aqi"
	default:
		return "value"
	}
}

func thresholdAlertMessage(input thresholdAlertInput, evaluation thresholdAlertEvaluation) string {
	sensorLabel := strings.TrimSpace(input.SensorName)
	if sensorLabel == "" {
		sensorLabel = strings.TrimSpace(input.SensorHWID)
	}
	if sensorLabel == "" {
		sensorLabel = input.SensorID.String()
	}

	if evaluation.AlertLabel != "" {
		return fmt.Sprintf(
			"%s triggered %s: %.2f crossed %.2f at %s.",
			sensorLabel,
			evaluation.AlertLabel,
			roundForAlert(input.Value),
			roundForAlert(evaluation.Threshold),
			input.ReadingAt.Format(time.RFC3339),
		)
	}

	return fmt.Sprintf(
		"%s %s: %.2f crossed %.2f at %s.",
		sensorLabel,
		evaluation.Boundary,
		roundForAlert(input.Value),
		roundForAlert(evaluation.Threshold),
		input.ReadingAt.Format(time.RFC3339),
	)
}

func roundForAlert(value float64) float64 {
	return math.Round(value*100) / 100
}

func upsertOpenAlert(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, controllerID uuid.UUID, sensorID uuid.UUID, systemID *uuid.UUID, systemSensorID *uuid.UUID, alertType string, severity string, message string) error {
	var existingID uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT id
		FROM alerts
		WHERE account_id = $1
		  AND controller_id = $2
		  AND sensor_id = $3
		  AND type = $4
		  AND severity = $5
		  AND acknowledged_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`, accountID, controllerID, sensorID, alertType, severity).Scan(&existingID)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}

	if err == nil {
		_, err = tx.Exec(ctx, `
			UPDATE alerts
			SET message = $1,
			    system_id = $2,
			    system_sensor_id = $3,
			    created_at = NOW()
			WHERE id = $4
		`, message, systemID, systemSensorID, existingID)
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO alerts (id, account_id, controller_id, sensor_id, system_id, system_sensor_id, type, severity, message, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
	`, uuid.New(), accountID, controllerID, sensorID, systemID, systemSensorID, alertType, severity, message)
	return err
}
