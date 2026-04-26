package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/iot"
	"spectron-backend/internal/models"
)

const (
	defaultDeviceMinReportingIntervalSec = 300
	defaultTempThresholdHiX100           = 3500
	defaultHumidityThresholdHiX100       = 8500
)

type IngestHandler struct {
	db        *pgxpool.Pool
	publisher iot.RawReadingsPublisher
}

func NewIngestHandler(db *pgxpool.Pool, publisher iot.RawReadingsPublisher) *IngestHandler {
	if publisher == nil {
		publisher = iot.NewDisabledPublisher("raw readings publisher is not configured")
	}

	return &IngestHandler{
		db:        db,
		publisher: publisher,
	}
}

func (h *IngestHandler) Upload(w http.ResponseWriter, r *http.Request) {
	var req iot.UploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := iot.ValidateUploadRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	deviceID := strings.TrimSpace(req.DeviceID)
	var controllerID uuid.UUID
	err := h.db.QueryRow(r.Context(), `
		SELECT id
		FROM controllers
		WHERE hw_id = $1
	`, deviceID).Scan(&controllerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "unknown controller", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to resolve controller", http.StatusInternalServerError)
		return
	}

	receivedAt := time.Now().UTC()
	event := iot.BuildRawReadingsEvent(req, receivedAt)
	if err := h.publisher.PublishRawReadings(r.Context(), event); err != nil {
		if errors.Is(err, iot.ErrProducerDisabled) {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}
		http.Error(w, "failed to queue sensor data", http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":            true,
		"queued":        true,
		"controller_id": controllerID,
		"device_id":     event.DeviceID,
		"event_id":      event.EventID,
		"reading_time":  event.ReadingTime,
		"received_at":   event.ReceivedAt,
		"sensor_count":  len(event.Sensors),
	})
}

func (h *IngestHandler) Discover(w http.ResponseWriter, r *http.Request) {
	var req iot.SensorDiscoveryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := iot.ValidateSensorDiscoveryRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	deviceID := strings.TrimSpace(req.DeviceID)
	var controllerID uuid.UUID
	err := h.db.QueryRow(r.Context(), `
		SELECT id
		FROM controllers
		WHERE hw_id = $1
	`, deviceID).Scan(&controllerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "unknown controller", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to resolve controller", http.StatusInternalServerError)
		return
	}

	discoveredAt := iot.ResolveReadingTime(req.TS, time.Now().UTC())
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "failed to begin discovery", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `
		UPDATE controllers
		SET status = 'ONLINE',
		    last_seen = $2,
		    min_reporting_interval_sec = LEAST(min_reporting_interval_sec, $3)
		WHERE id = $1
	`, controllerID, discoveredAt, defaultDeviceMinReportingIntervalSec)
	if err != nil {
		http.Error(w, "failed to update controller discovery status", http.StatusInternalServerError)
		return
	}

	for _, sensor := range req.Sensors {
		sensorHWID := strings.TrimSpace(sensor.ID)
		sensorType := strings.TrimSpace(sensor.Type)
		defaultName := "Sensor " + sensorHWID
		name := nullableTrimmed(sensor.Name)
		unit := nullableTrimmed(sensor.Unit)

		_, err = tx.Exec(r.Context(), `
			INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
			VALUES ($1, $2, $3, $4, COALESCE($5, $6), $7, 'OK', $8)
			ON CONFLICT (controller_id, hw_id) DO UPDATE
			SET type = EXCLUDED.type,
			    name = COALESCE($5, sensors.name),
			    unit = COALESCE($7, sensors.unit),
			    status = 'OK',
			    last_seen = EXCLUDED.last_seen
		`, uuid.New(), controllerID, sensorHWID, sensorType, name, defaultName, unit, discoveredAt)
		if err != nil {
			http.Error(w, "failed to register sensor list", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to save sensor discovery", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":            true,
		"discovered":    true,
		"controller_id": controllerID,
		"device_id":     deviceID,
		"sensor_count":  len(req.Sensors),
		"discovered_at": discoveredAt,
	})
}

func (h *IngestHandler) Config(w http.ResponseWriter, r *http.Request) {
	var req iot.ConfigPullRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := iot.ValidateConfigPullRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	deviceID := strings.TrimSpace(req.DeviceID)
	sensorID := strings.TrimSpace(req.SensorID)
	sensorType := strings.TrimSpace(req.SensorType)
	if sensorType == "" {
		sensorType = "temperature_humidity"
	}

	var controllerID uuid.UUID
	minIntervalSec := defaultDeviceMinReportingIntervalSec
	err := h.db.QueryRow(r.Context(), `
		SELECT id, LEAST(COALESCE(min_reporting_interval_sec, $2), $2)
		FROM controllers
		WHERE hw_id = $1
	`, deviceID, defaultDeviceMinReportingIntervalSec).Scan(&controllerID, &minIntervalSec)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "unknown controller", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to resolve controller", http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	_, _ = h.db.Exec(r.Context(), `
		UPDATE controllers
		SET status = 'ONLINE',
		    last_seen = $2,
		    min_reporting_interval_sec = LEAST(min_reporting_interval_sec, $3)
		WHERE id = $1
	`, controllerID, now, defaultDeviceMinReportingIntervalSec)

	resp := iot.ConfigPullResponse{
		OK:                      true,
		DeviceID:                deviceID,
		SensorID:                sensorID,
		SensorType:              sensorType,
		HasActiveConfig:         false,
		SamplePeriodMs:          effectiveSamplePeriodMs(0, minIntervalSec),
		TempThresholdHiX100:     defaultTempThresholdHiX100,
		HumidityThresholdHiX100: defaultHumidityThresholdHiX100,
	}

	if sensorID != "" {
		var persistedSensorType *string
		var configID *uuid.UUID
		var configuredAt *time.Time
		var rawConfig []byte

		err = h.db.QueryRow(r.Context(), `
			SELECT
				s.type,
				sc.id,
				sc.created_at,
				sc.config_json
			FROM sensors s
			LEFT JOIN LATERAL (
				SELECT id, created_at, config_json
				FROM sensor_configs
				WHERE sensor_id = s.id
				  AND active = true
				ORDER BY created_at DESC
				LIMIT 1
			) sc ON true
			WHERE s.controller_id = $1
			  AND s.hw_id = $2
		`, controllerID, sensorID).Scan(&persistedSensorType, &configID, &configuredAt, &rawConfig)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "failed to load sensor config", http.StatusInternalServerError)
			return
		}

		if persistedSensorType != nil && strings.TrimSpace(*persistedSensorType) != "" {
			resp.SensorType = strings.TrimSpace(*persistedSensorType)
		}

		if err == nil && len(rawConfig) > 0 && string(rawConfig) != "null" {
			var activeConfig models.SensorConfig
			if jsonErr := json.Unmarshal(rawConfig, &activeConfig); jsonErr != nil {
				http.Error(w, "failed to decode active sensor config", http.StatusInternalServerError)
				return
			}

			resp.HasActiveConfig = true
			resp.SamplePeriodMs = effectiveSamplePeriodMs(activeConfig.ReportIntervalPerDay, minIntervalSec)
			resp.TempThresholdHiX100 = int16(thresholdUpperX100(resolveMetricThreshold(activeConfig, "temperature"), defaultTempThresholdHiX100))
			resp.HumidityThresholdHiX100 = uint16(thresholdUpperX100(resolveMetricThreshold(activeConfig, "humidity"), defaultHumidityThresholdHiX100))
			resp.ConfiguredAt = configuredAt
			if configID != nil {
				resp.ConfigID = configID.String()
			}
		}
	}

	if resp.ConfigID == "" {
		resp.ConfigID = buildDefaultDeviceConfigID(resp.SensorID, resp.SamplePeriodMs, resp.TempThresholdHiX100, resp.HumidityThresholdHiX100)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func nullableTrimmed(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func buildDefaultDeviceConfigID(sensorID string, samplePeriodMs uint32, tempHiX100 int16, humidityHiX100 uint16) string {
	trimmedSensorID := strings.TrimSpace(sensorID)
	if trimmedSensorID == "" {
		trimmedSensorID = "sensor"
	}

	return fmt.Sprintf("default:%s:%d:%d:%d", trimmedSensorID, samplePeriodMs, tempHiX100, humidityHiX100)
}

func effectiveSamplePeriodMs(reportsPerDay int, minIntervalSec int) uint32 {
	if minIntervalSec <= 0 {
		minIntervalSec = defaultDeviceMinReportingIntervalSec
	}

	minDuration := time.Duration(minIntervalSec) * time.Second
	if reportsPerDay <= 0 {
		return uint32(minDuration / time.Millisecond)
	}

	sampleDuration := (24 * time.Hour) / time.Duration(reportsPerDay)
	if sampleDuration < minDuration {
		sampleDuration = minDuration
	}

	return uint32(sampleDuration / time.Millisecond)
}

func resolveMetricThreshold(config models.SensorConfig, metric string) models.ThresholdConfig {
	if config.MetricThresholds != nil {
		if threshold, ok := config.MetricThresholds[strings.TrimSpace(metric)]; ok {
			return threshold
		}
	}

	return config.Thresholds
}

func thresholdUpperX100(threshold models.ThresholdConfig, defaultValue int) int {
	if threshold.WarningMax != nil {
		return int(math.Round(*threshold.WarningMax * 100))
	}
	if threshold.Max != nil {
		return int(math.Round(*threshold.Max * 100))
	}
	return defaultValue
}
