package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	processor *iot.RawReadingsProcessor
}

func NewIngestHandler(db *pgxpool.Pool, publisher iot.RawReadingsPublisher) *IngestHandler {
	if publisher == nil {
		publisher = iot.NewDisabledPublisher("raw readings publisher is not configured")
	}

	return &IngestHandler{
		db:        db,
		publisher: publisher,
		processor: iot.NewRawReadingsProcessor(db),
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
	if err := h.processor.ProcessEvent(r.Context(), event); err != nil {
		http.Error(w, "failed to persist sensor data", http.StatusInternalServerError)
		return
	}

	queued := false
	if err := h.publisher.PublishRawReadings(r.Context(), event); err != nil {
		if errors.Is(err, iot.ErrProducerDisabled) {
			log.Printf("raw readings publisher unavailable; upload persisted synchronously for device %s: %v", event.DeviceID, err)
		} else {
			log.Printf("raw readings publish failed after synchronous persistence for device %s: %v", event.DeviceID, err)
		}
	} else {
		queued = true
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":            true,
		"persisted":     true,
		"queued":        queued,
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
		SELECT c.id
		FROM controllers c
		LEFT JOIN system_controller_assignments sca
		  ON sca.controller_id = c.id
		 AND sca.unassigned_at IS NULL
		WHERE c.hw_id = $1
	`, deviceID).Scan(&controllerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "unknown controller", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to resolve controller", http.StatusInternalServerError)
		return
	}

	system, err := loadActiveSystemForController(r.Context(), h.db, controllerID)
	if err != nil && err != pgx.ErrNoRows {
		http.Error(w, "failed to resolve active system", http.StatusInternalServerError)
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
		    updated_at = CASE
		        WHEN UPPER(COALESCE(status, '')) = 'ONLINE' THEN updated_at
		        ELSE $2
		    END,
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

		var legacySensorID uuid.UUID
		err = tx.QueryRow(r.Context(), `
			INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
			VALUES ($1, $2, $3, $4, COALESCE($5, $6), $7, 'OK', $8)
			ON CONFLICT (controller_id, hw_id) DO UPDATE
			SET type = EXCLUDED.type,
			    name = COALESCE($5, sensors.name),
			    unit = COALESCE($7, sensors.unit),
			    status = 'OK',
			    last_seen = EXCLUDED.last_seen
			RETURNING id
		`, uuid.New(), controllerID, sensorHWID, sensorType, name, defaultName, unit, discoveredAt).Scan(&legacySensorID)
		if err != nil {
			http.Error(w, "failed to register sensor list", http.StatusInternalServerError)
			return
		}

		hardwareName := strings.TrimSpace(sensor.Name)
		if hardwareName == "" {
			hardwareName = defaultHardwareSensorName(sensorType, sensorHWID)
		}

		hardwareConfigured := false
		if system.id != uuid.Nil {
			slotKey := iot.NormalizeSystemSensorSlotKey(sensorHWID, sensorType)
			if err := tx.QueryRow(r.Context(), `
				SELECT EXISTS (
					SELECT 1
					FROM system_sensors ss
					JOIN system_sensor_configurations ssc
					  ON ssc.system_sensor_id = ss.id
					 AND ssc.active = true
					WHERE ss.system_id = $1
					  AND ss.slot_key = $2
				)
			`, system.id, slotKey).Scan(&hardwareConfigured); err != nil {
				http.Error(w, "failed to resolve system sensor configuration", http.StatusInternalServerError)
				return
			}
		}

		var controllerSensorID uuid.UUID
		err = tx.QueryRow(r.Context(), `
			INSERT INTO controller_sensors (
				id,
				sensor_uid,
				controller_id,
				name,
				type,
				status,
				configured,
				created_at,
				updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
			ON CONFLICT (sensor_uid) DO UPDATE
			SET name = EXCLUDED.name,
			    type = EXCLUDED.type,
			    status = EXCLUDED.status,
			    configured = EXCLUDED.configured,
			    updated_at = NOW()
			WHERE controller_sensors.controller_id = EXCLUDED.controller_id
			RETURNING id
		`, uuid.New(), sensorHWID, controllerID, hardwareName, normalizeHardwareSensorType(sensorType), "live", hardwareConfigured).Scan(&controllerSensorID)
		if err != nil {
			http.Error(w, "failed to sync hardware sensor list", http.StatusInternalServerError)
			return
		}

		if system.id != uuid.Nil {
			if _, err := ensureSystemSensorBinding(
				r.Context(),
				tx,
				system.id,
				controllerID,
				sensorHWID,
				sensorType,
				hardwareName,
				"live",
				hardwareConfigured,
				&controllerSensorID,
				&legacySensorID,
				&discoveredAt,
			); err != nil {
				http.Error(w, "failed to bind discovered sensor to system", http.StatusInternalServerError)
				return
			}
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
	var sessionStart time.Time
	minIntervalSec := defaultDeviceMinReportingIntervalSec
	err := h.db.QueryRow(r.Context(), `
		SELECT c.id, COALESCE(active_sca.assigned_at, c.updated_at), LEAST(COALESCE(c.min_reporting_interval_sec, $2), $2)
		FROM controllers c
		LEFT JOIN system_controller_assignments active_sca
		  ON active_sca.controller_id = c.id
		 AND active_sca.unassigned_at IS NULL
		WHERE c.hw_id = $1
	`, deviceID, defaultDeviceMinReportingIntervalSec).Scan(&controllerID, &sessionStart, &minIntervalSec)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "unknown controller", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to resolve controller", http.StatusInternalServerError)
		return
	}

	system, err := loadActiveSystemForController(r.Context(), h.db, controllerID)
	if err != nil && err != pgx.ErrNoRows {
		http.Error(w, "failed to resolve active system", http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	_, _ = h.db.Exec(r.Context(), `
		UPDATE controllers
		SET status = 'ONLINE',
		    last_seen = $2,
		    updated_at = CASE
		        WHEN UPPER(COALESCE(status, '')) = 'ONLINE' THEN updated_at
		        ELSE $2
		    END,
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

		if system.id != uuid.Nil {
			slotKey := iot.NormalizeSystemSensorSlotKey(sensorID, sensorType)
			err = h.db.QueryRow(r.Context(), `
				SELECT
					ss.type,
					ssc.id,
					ssc.updated_at,
					ssc.config_json
				FROM system_sensors ss
				LEFT JOIN LATERAL (
					SELECT id, updated_at, config_json
					FROM system_sensor_configurations
					WHERE system_sensor_id = ss.id
					  AND active = true
					ORDER BY updated_at DESC
					LIMIT 1
				) ssc ON true
				WHERE ss.system_id = $1
				  AND ss.slot_key = $2
			`, system.id, slotKey).Scan(&persistedSensorType, &configID, &configuredAt, &rawConfig)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "failed to load system sensor config", http.StatusInternalServerError)
				return
			}
		}

		if errors.Is(err, pgx.ErrNoRows) {
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
					  AND created_at >= $3
					ORDER BY created_at DESC
					LIMIT 1
				) sc ON true
				WHERE s.controller_id = $1
				  AND s.hw_id = $2
			`, controllerID, sensorID, sessionStart).Scan(&persistedSensorType, &configID, &configuredAt, &rawConfig)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "failed to load sensor config", http.StatusInternalServerError)
				return
			}
		}

		if errors.Is(err, pgx.ErrNoRows) {
			err = h.db.QueryRow(r.Context(), `
				SELECT
					cs.type,
					sc.id,
					sc.updated_at,
					sc.config_json
				FROM controller_sensors cs
				LEFT JOIN sensor_configurations sc
					ON sc.sensor_id = cs.id
				   AND sc.updated_at >= $3
				WHERE cs.controller_id = $1
				  AND cs.sensor_uid = $2
			`, controllerID, sensorID, sessionStart).Scan(&persistedSensorType, &configID, &configuredAt, &rawConfig)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "failed to load hardware sensor config", http.StatusInternalServerError)
				return
			}
		}

		if persistedSensorType != nil && strings.TrimSpace(*persistedSensorType) != "" {
			resp.SensorType = strings.TrimSpace(*persistedSensorType)
		}

		if err == nil && len(rawConfig) > 0 && string(rawConfig) != "null" {
			activeConfig, jsonErr := decodeDeviceSensorConfig(rawConfig)
			if jsonErr != nil {
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

func decodeDeviceSensorConfig(rawConfig []byte) (models.SensorConfig, error) {
	var activeConfig models.SensorConfig
	if err := json.Unmarshal(rawConfig, &activeConfig); err == nil {
		if activeConfig.ReportIntervalPerDay > 0 || len(activeConfig.MetricThresholds) > 0 || activeConfig.FriendlyName != "" {
			return activeConfig, nil
		}
	}

	var flat map[string]any
	if err := json.Unmarshal(rawConfig, &flat); err != nil {
		return models.SensorConfig{}, err
	}

	reportsPerDay := flatConfigInt(flat, "reportsPerDay", 0)
	tempThreshold := models.ThresholdConfig{
		Min:        flatConfigFloatPtr(flat, "temperatureMin"),
		Max:        flatConfigFloatPtr(flat, "temperatureMax"),
		WarningMin: flatConfigFloatPtr(flat, "temperatureWarningMin"),
		WarningMax: flatConfigFloatPtr(flat, "temperatureWarningMax"),
	}
	humidityThreshold := models.ThresholdConfig{
		Min:        flatConfigFloatPtr(flat, "humidityMin"),
		Max:        flatConfigFloatPtr(flat, "humidityMax"),
		WarningMin: flatConfigFloatPtr(flat, "humidityWarningMin"),
		WarningMax: flatConfigFloatPtr(flat, "humidityWarningMax"),
	}

	return models.SensorConfig{
		FriendlyName:         flatConfigString(flat, "friendlyName"),
		UseCase:              flatConfigString(flat, "usedFor"),
		PresentationProfile:  flatConfigString(flat, "dashboardView"),
		PrimaryMetric:        "temperature",
		Thresholds:           tempThreshold,
		MetricThresholds:     map[string]models.ThresholdConfig{"temperature": tempThreshold, "humidity": humidityThreshold},
		ReportIntervalPerDay: reportsPerDay,
		PowerManagement: models.PowerManagementConfig{
			BatteryLifeDays:   flatConfigInt(flat, "estimatedBatteryLifeDays", 0),
			SamplingFrequency: reportsPerDay,
		},
	}, nil
}

func flatConfigString(config map[string]any, key string) string {
	if value, ok := config[key].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func flatConfigInt(config map[string]any, key string, fallback int) int {
	if value, ok := config[key]; ok {
		switch v := value.(type) {
		case float64:
			return int(v)
		case float32:
			return int(v)
		case int:
			return v
		case int32:
			return int(v)
		case int64:
			return int(v)
		}
	}
	return fallback
}

func flatConfigFloatPtr(config map[string]any, key string) *float64 {
	value, ok := config[key]
	if !ok {
		return nil
	}
	switch v := value.(type) {
	case float64:
		copy := v
		return &copy
	case float32:
		copy := float64(v)
		return &copy
	case int:
		copy := float64(v)
		return &copy
	case int32:
		copy := float64(v)
		return &copy
	case int64:
		copy := float64(v)
		return &copy
	default:
		return nil
	}
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
