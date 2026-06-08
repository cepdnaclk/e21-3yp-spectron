package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"spectron-backend/internal/models"
)

type rowScanner interface {
	Scan(dest ...any) error
}

type sensorMetadata struct {
	SensorID             uuid.UUID
	ControllerID         uuid.UUID
	SensorType           string
	StoredPurpose        string
	StoredContext        *models.SensorContext
	CalibrationStatus    string
	ControllerCapability controllerCapability
}

func scanSensorRecord(scanner rowScanner) (models.Sensor, error) {
	var sensor models.Sensor
	var rawContext []byte
	var rawActiveConfig []byte
	var activeConfigCreatedAt *time.Time
	var activeConfigReportsPerDay *int
	var observationReadings int
	var observationLastReadingAt *time.Time
	if err := scanner.Scan(
		&sensor.ID,
		&sensor.ControllerID,
		&sensor.HWID,
		&sensor.Type,
		&sensor.Name,
		&sensor.Purpose,
		&sensor.Unit,
		&sensor.Status,
		&sensor.ConfigActive,
		&rawActiveConfig,
		&sensor.LastSeen,
		&rawContext,
		&activeConfigCreatedAt,
		&activeConfigReportsPerDay,
		&observationReadings,
		&observationLastReadingAt,
		&sensor.LastCalibratedAt,
		&sensor.CalibrationDueAt,
		&sensor.CalibrationStatus,
	); err != nil {
		return models.Sensor{}, err
	}

	if len(rawActiveConfig) > 0 && string(rawActiveConfig) != "null" {
		var activeConfig models.SensorConfig
		if err := json.Unmarshal(rawActiveConfig, &activeConfig); err == nil {
			sensor.ActiveConfig = &activeConfig
		}
	}

	sensor.Context = parseSensorContext(rawContext)
	if sensor.ActiveConfig != nil {
		sensor.ActiveConfig.NormalizeThreeLayer(sensor.Type, sensor.Context)
	}
	sensor.Observation = buildSensorObservation(
		sensor.ConfigActive,
		sensor.Context,
		activeConfigCreatedAt,
		activeConfigReportsPerDay,
		observationReadings,
		observationLastReadingAt,
	)
	return sensor, nil
}

func decodeSaveSensorConfigRequest(r *http.Request) (models.SaveSensorConfigRequest, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return models.SaveSensorConfigRequest{}, err
	}

	body = []byte(strings.TrimSpace(string(body)))
	if len(body) == 0 {
		return models.SaveSensorConfigRequest{}, fmt.Errorf("empty request")
	}

	var wrapped models.SaveSensorConfigRequest
	if err := json.Unmarshal(body, &wrapped); err == nil && wrapped.Config != nil {
		if wrapped.Context == nil && wrapped.Config.Interpretation != nil {
			wrapped.Context = normalizeSensorContext(wrapped.Config.Interpretation.Context)
		}
		if wrapped.Purpose == "" && wrapped.Config.Interpretation != nil {
			wrapped.Purpose = strings.TrimSpace(wrapped.Config.Interpretation.Purpose)
		}
		wrapped.Context = normalizeSensorContext(wrapped.Context)
		wrapped.Purpose = strings.TrimSpace(wrapped.Purpose)
		wrapped.Config.NormalizeThreeLayer("", wrapped.Context)
		return wrapped, nil
	}

	var config models.SensorConfig
	if err := json.Unmarshal(body, &config); err != nil {
		return models.SaveSensorConfigRequest{}, err
	}
	if config.Interpretation != nil {
		if config.Interpretation.Context != nil {
			config.Interpretation.Context = normalizeSensorContext(config.Interpretation.Context)
		}
		if config.Interpretation.Purpose != "" {
			config.Interpretation.Purpose = strings.TrimSpace(config.Interpretation.Purpose)
		}
	}
	config.NormalizeThreeLayer("", config.Interpretation.Context)

	return models.SaveSensorConfigRequest{
		Context: normalizeSensorContext(config.Interpretation.Context),
		Purpose: strings.TrimSpace(config.Interpretation.Purpose),
		Config:  &config,
	}, nil
}

func (h *SensorHandler) lookupSensorMetadata(ctx context.Context, sensorID uuid.UUID, accountID uuid.UUID) (sensorMetadata, error) {
	var metadata sensorMetadata
	var rawContext []byte
	var rawProfile []byte

	err := h.db.QueryRow(ctx, `
		SELECT
			s.id,
			s.controller_id,
			s.type,
			COALESCE(s.purpose, ''),
			COALESCE(s.context_json, '{}'::jsonb),
			COALESCE(s.calibration_status, 'UNKNOWN'),
			LEAST(COALESCE(c.min_reporting_interval_sec, 300), 300),
			COALESCE(c.supports_adaptive_sampling, false),
			COALESCE(c.supports_local_alerts, false),
			COALESCE(c.offline_buffer_capacity, 2000),
			COALESCE(c.capability_profile_json, '{}'::jsonb)
		FROM sensors s
		JOIN controllers c ON s.controller_id = c.id
		WHERE s.id = $1 AND c.account_id = $2
		  AND UPPER(COALESCE(c.status, '')) <> 'UNCLAIMED'
	`, sensorID, accountID).Scan(
		&metadata.SensorID,
		&metadata.ControllerID,
		&metadata.SensorType,
		&metadata.StoredPurpose,
		&rawContext,
		&metadata.CalibrationStatus,
		&metadata.ControllerCapability.MinReportingIntervalSec,
		&metadata.ControllerCapability.SupportsAdaptiveSampling,
		&metadata.ControllerCapability.SupportsLocalAlerts,
		&metadata.ControllerCapability.OfflineBufferCapacity,
		&rawProfile,
	)
	if err != nil {
		return sensorMetadata{}, err
	}

	metadata.StoredContext = parseSensorContext(rawContext)
	metadata.ControllerCapability.Profile = map[string]any{}
	if len(rawProfile) > 0 {
		_ = json.Unmarshal(rawProfile, &metadata.ControllerCapability.Profile)
	}

	return metadata, nil
}

func (h *SensorHandler) loadSensorHistorySummary(ctx context.Context, sensorID uuid.UUID, days int) string {
	if days <= 0 {
		days = 14
	}
	if days > 90 {
		days = 90
	}

	queryCtx, cancel := context.WithTimeout(ctx, aiHistoryQueryTimeout())
	defer cancel()

	var count int
	var minValue *float64
	var maxValue *float64
	var avgValue *float64
	var lastValue *float64

	err := h.db.QueryRow(queryCtx, `
		SELECT
			COUNT(*),
			MIN(value),
			MAX(value),
			AVG(value),
			(
				SELECT value
				FROM sensor_readings
				WHERE sensor_id = $1
				  AND time >= NOW() - ($2 * INTERVAL '1 day')
				ORDER BY time DESC
				LIMIT 1
			)
		FROM sensor_readings
		WHERE sensor_id = $1
		  AND time >= NOW() - ($2 * INTERVAL '1 day')
	`, sensorID, days).Scan(&count, &minValue, &maxValue, &avgValue, &lastValue)
	if err != nil || count == 0 {
		return "no recent historical readings available"
	}

	parts := []string{fmt.Sprintf("%d readings in the last %d days", count, days)}
	if avgValue != nil {
		parts = append(parts, fmt.Sprintf("average %.2f", *avgValue))
	}
	if minValue != nil && maxValue != nil {
		parts = append(parts, fmt.Sprintf("range %.2f to %.2f", *minValue, *maxValue))
	}
	if lastValue != nil {
		parts = append(parts, fmt.Sprintf("latest %.2f", *lastValue))
	}

	return strings.Join(parts, ", ")
}

func buildSensorObservation(
	configActive bool,
	ctx *models.SensorContext,
	configuredAt *time.Time,
	reportsPerDay *int,
	readingsCollected int,
	lastReadingAt *time.Time,
) *models.SensorObservation {
	if !configActive || configuredAt == nil {
		return nil
	}

	windowDays := configuredObservationWindowDays(ctx)
	reportCount := 24
	if reportsPerDay != nil && *reportsPerDay > 0 {
		reportCount = *reportsPerDay
	}

	minimumReadings := reportCount * min(windowDays, 3)
	if minimumReadings < 12 {
		minimumReadings = 12
	}
	if minimumReadings > 120 {
		minimumReadings = 120
	}

	status := "observing"
	message := fmt.Sprintf(
		"Configured. Observing live readings in the background before recommending refinements (%d/%d readings collected).",
		readingsCollected,
		minimumReadings,
	)

	if readingsCollected == 0 {
		status = "awaiting_data"
		message = "Configured. Waiting for live readings before recommending improvements."
	} else if readingsCollected >= minimumReadings || time.Since(*configuredAt) >= time.Duration(windowDays)*24*time.Hour {
		status = "ready_for_review"
		message = fmt.Sprintf(
			"Configured. Enough live data has been observed to review AI-assisted refinements (%d readings collected).",
			readingsCollected,
		)
	}

	return &models.SensorObservation{
		Status:            status,
		Message:           message,
		WindowDays:        windowDays,
		ReadingsCollected: readingsCollected,
		MinimumReadings:   minimumReadings,
		StartedAt:         configuredAt,
		LastReadingAt:     lastReadingAt,
	}
}

func configuredObservationWindowDays(ctx *models.SensorContext) int {
	if ctx != nil && ctx.HistoricalWindowDays != nil && *ctx.HistoricalWindowDays > 0 {
		if *ctx.HistoricalWindowDays > 90 {
			return 90
		}
		return *ctx.HistoricalWindowDays
	}

	return 14
}
