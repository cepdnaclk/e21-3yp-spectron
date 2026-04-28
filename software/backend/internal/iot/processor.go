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
	var accountID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id, account_id
		FROM controllers
		WHERE hw_id = $1
	`, event.DeviceID).Scan(&controllerID, &accountID)
	if err != nil {
		return fmt.Errorf("find controller %s: %w", event.DeviceID, err)
	}

	_, err = tx.Exec(ctx, `
		UPDATE controllers
		SET status = 'ONLINE',
		    last_seen = $2
		WHERE id = $1
	`, controllerID, event.ReadingTime)
	if err != nil {
		return fmt.Errorf("update controller status: %w", err)
	}

	for _, sensor := range event.Sensors {
		if err := p.upsertSensorReading(ctx, tx, accountID, controllerID, event, sensor); err != nil {
			return err
		}
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

	meta, err := json.Marshal(map[string]any{
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
	})
	if err != nil {
		return fmt.Errorf("marshal reading metadata: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO sensor_readings (time, sensor_id, value, meta)
		VALUES ($1, $2, $3, $4::jsonb)
		ON CONFLICT (time, sensor_id) DO UPDATE
		SET value = EXCLUDED.value,
		    meta = EXCLUDED.meta
	`, event.ReadingTime, persistedSensorID, sensor.Value, meta)
	if err != nil {
		return fmt.Errorf("insert sensor reading %s: %w", sensorHWID, err)
	}

	if err := p.evaluateThresholdAlert(ctx, tx, thresholdAlertInput{
		AccountID:    accountID,
		ControllerID: controllerID,
		SensorID:     persistedSensorID,
		SensorHWID:   sensorHWID,
		SensorName:   persistedSensorName,
		SensorType:   persistedSensorType,
		Value:        sensor.Value,
		ReadingAt:    event.ReadingTime,
	}); err != nil {
		return fmt.Errorf("evaluate alert for sensor %s: %w", sensorHWID, err)
	}

	return nil
}

type thresholdAlertInput struct {
	AccountID    uuid.UUID
	ControllerID uuid.UUID
	SensorID     uuid.UUID
	SensorHWID   string
	SensorName   string
	SensorType   string
	Value        float64
	ReadingAt    time.Time
}

type thresholdAlertEvaluation struct {
	Triggered bool
	Severity  string
	Metric    string
	Boundary  string
	Threshold float64
}

func (p *RawReadingsProcessor) evaluateThresholdAlert(ctx context.Context, tx pgx.Tx, input thresholdAlertInput) error {
	config, ok, err := loadActiveSensorConfig(ctx, tx, input.SensorID, input.ControllerID, input.SensorHWID, input.SensorType)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	evaluation := evaluateThresholdBreach(input.SensorType, input.Value, config)
	if !evaluation.Triggered {
		return nil
	}

	message := thresholdAlertMessage(input, evaluation)
	return upsertOpenAlert(ctx, tx, input.AccountID, input.ControllerID, input.SensorID, "THRESHOLD_BREACH", evaluation.Severity, message)
}

func loadActiveSensorConfig(ctx context.Context, tx pgx.Tx, sensorID uuid.UUID, controllerID uuid.UUID, sensorHWID string, sensorType string) (models.SensorConfig, bool, error) {
	var rawConfig []byte
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
	if trimmed == "" || defaultMetricForSensorType(sensorType) != "humidity" {
		return ""
	}
	if !strings.HasSuffix(trimmed, "-humidity") {
		return ""
	}

	return strings.TrimSuffix(trimmed, "-humidity")
}

func decodeAlertSensorConfig(rawConfig []byte, sensorType string) (models.SensorConfig, error) {
	var config models.SensorConfig
	if err := json.Unmarshal(rawConfig, &config); err == nil {
		if config.PrimaryMetric != "" || len(config.MetricThresholds) > 0 || !isEmptyThreshold(config.Thresholds) {
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

	return models.SensorConfig{
		PrimaryMetric:    metric,
		Thresholds:       thresholds,
		MetricThresholds: map[string]models.ThresholdConfig{metric: thresholds},
	}, nil
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
	metric := strings.TrimSpace(config.PrimaryMetric)
	if metric == "" {
		metric = defaultMetricForSensorType(sensorType)
	}

	threshold := config.Thresholds
	if config.MetricThresholds != nil {
		if metricThreshold, ok := config.MetricThresholds[metric]; ok {
			threshold = metricThreshold
		}
	}

	switch {
	case threshold.WarningMin != nil && value < *threshold.WarningMin:
		return thresholdAlertEvaluation{Triggered: true, Severity: "CRITICAL", Metric: metric, Boundary: "below critical minimum", Threshold: *threshold.WarningMin}
	case threshold.WarningMax != nil && value > *threshold.WarningMax:
		return thresholdAlertEvaluation{Triggered: true, Severity: "CRITICAL", Metric: metric, Boundary: "above critical maximum", Threshold: *threshold.WarningMax}
	case threshold.Min != nil && value < *threshold.Min:
		return thresholdAlertEvaluation{Triggered: true, Severity: "WARN", Metric: metric, Boundary: "below minimum", Threshold: *threshold.Min}
	case threshold.Max != nil && value > *threshold.Max:
		return thresholdAlertEvaluation{Triggered: true, Severity: "WARN", Metric: metric, Boundary: "above maximum", Threshold: *threshold.Max}
	default:
		return thresholdAlertEvaluation{}
	}
}

func defaultMetricForSensorType(sensorType string) string {
	switch strings.ToLower(strings.TrimSpace(sensorType)) {
	case "temperature_humidity", "temp_humidity", "dht11", "dht22", "temperature":
		return "temperature"
	case "humidity":
		return "humidity"
	case "ultrasonic":
		return "fill_level"
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

func upsertOpenAlert(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, controllerID uuid.UUID, sensorID uuid.UUID, alertType string, severity string, message string) error {
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
			    created_at = NOW()
			WHERE id = $2
		`, message, existingID)
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO alerts (id, account_id, controller_id, sensor_id, type, severity, message, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
	`, uuid.New(), accountID, controllerID, sensorID, alertType, severity, message)
	return err
}
