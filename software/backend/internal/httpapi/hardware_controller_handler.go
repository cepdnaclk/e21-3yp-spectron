package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	internaldb "spectron-backend/internal/db"
	"spectron-backend/internal/iot"
	"spectron-backend/internal/models"
)

type apiError struct {
	status  int
	message string
}

func (e apiError) Error() string {
	return e.message
}

type hardwareControllerRecord struct {
	id          uuid.UUID
	uid         string
	name        string
	status      string
	ownerUserID string
}

type hardwareSensorRecord struct {
	id         uuid.UUID
	uid        string
	name       string
	sensorType string
	status     string
	configured bool
}

func (h *ControllerHandler) PairAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)

	var req models.HardwarePairRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	provided := strings.TrimSpace(req.PairingTokenOrControllerID)
	if provided == "" {
		provided = strings.TrimSpace(req.QRToken)
	}
	if provided == "" {
		http.Error(w, "missing pairing token/controller ID", http.StatusBadRequest)
		return
	}

	controller, err := h.claimController(r.Context(), userID, accountID, provided)
	if err != nil {
		var apiErr apiError
		if errors.As(err, &apiErr) {
			http.Error(w, apiErr.message, apiErr.status)
			return
		}
		log.Printf("pair controller: %v", err)
		http.Error(w, "pairing failed", http.StatusInternalServerError)
		return
	}

	sensors, err := h.loadHardwareSensors(r.Context(), controller.id)
	if err != nil {
		log.Printf("load paired sensors: %v", err)
		http.Error(w, "failed to load sensors", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.HardwarePairResponse{
		ControllerID: controller.uid,
		Status:       "paired",
		Sensors:      sensors,
	})
}

func (h *ControllerHandler) MyControllersAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)

	rows, err := h.db.Query(r.Context(), `
		SELECT id, COALESCE(controller_uid, hw_id), COALESCE(name, 'Main Controller'), status
		FROM controllers
		WHERE owner_user_id = $1
		ORDER BY updated_at DESC, created_at DESC
	`, userID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var controllers []models.UserHardwareControllerResponse
	for rows.Next() {
		var controllerID uuid.UUID
		var controllerUID string
		var name string
		var status string
		if err := rows.Scan(&controllerID, &controllerUID, &name, &status); err != nil {
			continue
		}

		sensors, err := h.loadHardwareSensors(r.Context(), controllerID)
		if err != nil {
			http.Error(w, "failed to load sensors", http.StatusInternalServerError)
			return
		}

		controllers = append(controllers, models.UserHardwareControllerResponse{
			ControllerID: controllerUID,
			Name:         name,
			Status:       status,
			Sensors:      sensors,
		})
	}

	json.NewEncoder(w).Encode(models.UserHardwareControllersResponse{Controllers: controllers})
}

func (h *ControllerHandler) ControllerSensorsAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))

	controller, err := h.lookupOwnedHardwareController(r.Context(), userID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	sensors, err := h.loadHardwareSensors(r.Context(), controller.id)
	if err != nil {
		http.Error(w, "failed to load sensors", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.ControllerSensorsResponse{
		ControllerID: controller.uid,
		Sensors:      sensors,
	})
}

func (h *ControllerHandler) SaveSensorConfigAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))
	sensorParam := strings.TrimSpace(chi.URLParam(r, "sensorId"))

	controller, err := h.lookupOwnedHardwareController(r.Context(), userID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	sensor, err := h.lookupHardwareSensor(r.Context(), controller.id, sensorParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	var req models.SaveHardwareSensorConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	req.SensorType = strings.TrimSpace(req.SensorType)
	req.SensorName = strings.TrimSpace(req.SensorName)
	req.UsedFor = strings.TrimSpace(req.UsedFor)
	req.DashboardView = strings.TrimSpace(req.DashboardView)
	if err := validateHardwareSensorConfigRequest(req, sensor.sensorType); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	configJSON, err := json.Marshal(req.Config)
	if err != nil {
		http.Error(w, "invalid config object", http.StatusBadRequest)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		http.Error(w, "failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `
		UPDATE controller_sensors
		SET name = $1,
		    type = $2,
		    configured = true,
		    updated_at = NOW()
		WHERE id = $3 AND controller_id = $4
	`, req.SensorName, req.SensorType, sensor.id, controller.id)
	if err != nil {
		http.Error(w, "failed to update sensor", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO sensor_configurations (
			id,
			sensor_id,
			controller_id,
			used_for,
			dashboard_view,
			config_json,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
		ON CONFLICT (sensor_id) DO UPDATE
		SET used_for = EXCLUDED.used_for,
		    dashboard_view = EXCLUDED.dashboard_view,
		    config_json = EXCLUDED.config_json,
		    updated_at = NOW()
	`, uuid.New(), sensor.id, controller.id, req.UsedFor, req.DashboardView, configJSON)
	if err != nil {
		http.Error(w, "failed to save configuration", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to commit configuration", http.StatusInternalServerError)
		return
	}

	if err := iot.PublishSensorConfiguration(r.Context(), controller.uid, sensor.uid, req.SensorType, req.Config); err != nil {
		log.Printf("publish sensor configuration placeholder failed: %v", err)
	}

	json.NewEncoder(w).Encode(models.SaveHardwareSensorConfigResponse{
		Message:      "Configuration activated successfully",
		ControllerID: controller.uid,
		SensorID:     sensor.uid,
		Configured:   true,
	})
}

func (h *ControllerHandler) GetSensorConfigAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))
	sensorParam := strings.TrimSpace(chi.URLParam(r, "sensorId"))

	controller, err := h.lookupOwnedHardwareController(r.Context(), userID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	sensor, err := h.lookupHardwareSensor(r.Context(), controller.id, sensorParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	var usedFor string
	var dashboardView string
	var configJSON []byte
	err = h.db.QueryRow(r.Context(), `
		SELECT COALESCE(used_for, ''), COALESCE(dashboard_view, ''), config_json
		FROM sensor_configurations
		WHERE controller_id = $1 AND sensor_id = $2
	`, controller.id, sensor.id).Scan(&usedFor, &dashboardView, &configJSON)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "configuration not found", http.StatusNotFound)
			return
		}
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.HardwareSensorConfigResponse{
		ControllerID:  controller.uid,
		SensorID:      sensor.uid,
		SensorType:    sensor.sensorType,
		SensorName:    sensor.name,
		UsedFor:       usedFor,
		DashboardView: dashboardView,
		Config:        json.RawMessage(configJSON),
	})
}

func (h *ControllerHandler) DemoCreateControllerAPI(w http.ResponseWriter, r *http.Request) {
	var req models.DemoCreateControllerRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	controllerUID := strings.ToUpper(strings.TrimSpace(req.ControllerID))
	if controllerUID == "" {
		controllerUID = "CTRL-" + randomCode(6)
	}
	pairingToken := strings.ToUpper(strings.TrimSpace(req.PairingToken))
	if pairingToken == "" {
		pairingToken = "PAIR-" + randomCode(6)
	}

	if !strings.HasPrefix(controllerUID, "CTRL-") {
		http.Error(w, "controllerId must start with CTRL-", http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(pairingToken, "PAIR-") {
		http.Error(w, "pairingToken must start with PAIR-", http.StatusBadRequest)
		return
	}

	if err := internaldb.EnsureMockController(r.Context(), h.db); err != nil {
		http.Error(w, "failed to prepare demo account", http.StatusInternalServerError)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		http.Error(w, "failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var controllerID uuid.UUID
	err = tx.QueryRow(r.Context(), `
		INSERT INTO controllers (
			id,
			account_id,
			hw_id,
			controller_uid,
			name,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $3, 'Main Controller', 'unclaimed', NOW(), NOW())
		ON CONFLICT (hw_id) DO UPDATE
		SET controller_uid = EXCLUDED.controller_uid,
		    name = COALESCE(controllers.name, EXCLUDED.name),
		    account_id = CASE
		        WHEN controllers.owner_user_id IS NULL THEN EXCLUDED.account_id
		        ELSE controllers.account_id
		    END,
		    status = CASE
		        WHEN controllers.owner_user_id IS NULL THEN 'unclaimed'
		        ELSE controllers.status
		    END,
		    updated_at = NOW()
		RETURNING id
	`, uuid.New(), internaldb.MockAccountID, controllerUID).Scan(&controllerID)
	if err != nil {
		http.Error(w, "failed to create controller", http.StatusInternalServerError)
		return
	}

	if err := h.ensureDefaultHardwareSensors(r.Context(), tx, controllerID, controllerUID); err != nil {
		http.Error(w, "failed to create default sensors", http.StatusInternalServerError)
		return
	}

	tokenHash := hashPairingToken(pairingToken)
	_, err = tx.Exec(r.Context(), `
		INSERT INTO controller_pairing_tokens (id, controller_id, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours', NOW())
		ON CONFLICT (token_hash) DO UPDATE
		SET controller_id = EXCLUDED.controller_id,
		    expires_at = EXCLUDED.expires_at,
		    used_at = NULL,
		    created_at = NOW()
	`, uuid.New(), controllerID, tokenHash)
	if err != nil {
		http.Error(w, "failed to create pairing token", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to commit demo controller", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.DemoCreateControllerResponse{
		ControllerID: controllerUID,
		PairingToken: pairingToken,
		PairingURL:   "/pair?code=" + pairingToken,
	})
}

func (h *ControllerHandler) claimController(ctx context.Context, userID uuid.UUID, accountID uuid.UUID, provided string) (hardwareControllerRecord, error) {
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return hardwareControllerRecord{}, err
	}
	defer tx.Rollback(ctx)

	normalized := strings.ToUpper(strings.TrimSpace(provided))
	record, tokenID, err := h.findControllerForPairing(ctx, tx, normalized)
	if err != nil {
		return hardwareControllerRecord{}, err
	}

	if record.ownerUserID != "" && !strings.EqualFold(record.ownerUserID, userID.String()) {
		return hardwareControllerRecord{}, apiError{status: http.StatusConflict, message: "controller already claimed"}
	}

	_, err = tx.Exec(ctx, `
		UPDATE controllers
		SET owner_user_id = $1,
		    account_id = $2,
		    status = 'paired',
		    controller_uid = COALESCE(NULLIF(controller_uid, ''), hw_id),
		    updated_at = NOW()
		WHERE id = $3
	`, userID, accountID, record.id)
	if err != nil {
		return hardwareControllerRecord{}, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE controller_pairing_tokens
		SET used_at = COALESCE(used_at, NOW())
		WHERE controller_id = $1
		  AND (id = $2 OR used_at IS NULL)
	`, record.id, tokenID)
	if err != nil {
		return hardwareControllerRecord{}, err
	}

	_, _ = tx.Exec(ctx, `
		UPDATE pairing_tokens
		SET used_at = COALESCE(used_at, NOW())
		WHERE controller_id = $1 AND used_at IS NULL
	`, record.id)

	if err := h.ensureDefaultHardwareSensors(ctx, tx, record.id, record.uid); err != nil {
		return hardwareControllerRecord{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return hardwareControllerRecord{}, err
	}

	record.status = "paired"
	record.ownerUserID = userID.String()
	return record, nil
}

func (h *ControllerHandler) findControllerForPairing(ctx context.Context, tx pgx.Tx, normalized string) (hardwareControllerRecord, uuid.UUID, error) {
	if strings.HasPrefix(normalized, "CTRL-") {
		record, err := scanHardwareController(tx.QueryRow(ctx, `
			SELECT id,
			       COALESCE(controller_uid, hw_id),
			       COALESCE(name, 'Main Controller'),
			       status,
			       COALESCE(owner_user_id::text, '')
			FROM controllers
			WHERE UPPER(COALESCE(controller_uid, hw_id)) = UPPER($1)
			   OR id::text = $1
		`, normalized))
		if err == nil {
			return record, uuid.Nil, nil
		}
		if err != pgx.ErrNoRows {
			return hardwareControllerRecord{}, uuid.Nil, err
		}
	}

	tokenHash := hashPairingToken(normalized)
	var tokenID uuid.UUID
	var expiresAt time.Time
	var usedAt pgtype.Timestamptz
	record, err := scanHardwareControllerWithToken(tx.QueryRow(ctx, `
		SELECT c.id,
		       COALESCE(c.controller_uid, c.hw_id),
		       COALESCE(c.name, 'Main Controller'),
		       c.status,
		       COALESCE(c.owner_user_id::text, ''),
		       t.id,
		       t.expires_at,
		       t.used_at
		FROM controller_pairing_tokens t
		JOIN controllers c ON c.id = t.controller_id
		WHERE t.token_hash = $1
		ORDER BY t.created_at DESC
		LIMIT 1
	`, tokenHash), &tokenID, &expiresAt, &usedAt)
	if err == nil {
		if usedAt.Valid {
			return hardwareControllerRecord{}, uuid.Nil, apiError{status: http.StatusGone, message: "pairing token expired"}
		}
		if time.Now().After(expiresAt) {
			return hardwareControllerRecord{}, uuid.Nil, apiError{status: http.StatusGone, message: "pairing token expired"}
		}
		return record, tokenID, nil
	}
	if err != pgx.ErrNoRows {
		return hardwareControllerRecord{}, uuid.Nil, err
	}

	return hardwareControllerRecord{}, uuid.Nil, apiError{status: http.StatusNotFound, message: "controller not found"}
}

func scanHardwareController(row pgx.Row) (hardwareControllerRecord, error) {
	var record hardwareControllerRecord
	err := row.Scan(&record.id, &record.uid, &record.name, &record.status, &record.ownerUserID)
	return record, err
}

func scanHardwareControllerWithToken(row pgx.Row, tokenID *uuid.UUID, expiresAt *time.Time, usedAt *pgtype.Timestamptz) (hardwareControllerRecord, error) {
	var record hardwareControllerRecord
	err := row.Scan(&record.id, &record.uid, &record.name, &record.status, &record.ownerUserID, tokenID, expiresAt, usedAt)
	return record, err
}

func (h *ControllerHandler) lookupOwnedHardwareController(ctx context.Context, userID uuid.UUID, identifier string) (hardwareControllerRecord, error) {
	if strings.TrimSpace(identifier) == "" {
		return hardwareControllerRecord{}, apiError{status: http.StatusBadRequest, message: "controller ID required"}
	}

	record, err := scanHardwareController(h.db.QueryRow(ctx, `
		SELECT id,
		       COALESCE(controller_uid, hw_id),
		       COALESCE(name, 'Main Controller'),
		       status,
		       COALESCE(owner_user_id::text, '')
		FROM controllers
		WHERE UPPER(COALESCE(controller_uid, hw_id)) = UPPER($1)
		   OR id::text = $1
	`, strings.TrimSpace(identifier)))
	if err != nil {
		if err == pgx.ErrNoRows {
			return hardwareControllerRecord{}, apiError{status: http.StatusNotFound, message: "controller not found"}
		}
		return hardwareControllerRecord{}, err
	}

	if record.ownerUserID == "" || !strings.EqualFold(record.ownerUserID, userID.String()) {
		return hardwareControllerRecord{}, apiError{status: http.StatusUnauthorized, message: "unauthorized user"}
	}

	return record, nil
}

func (h *ControllerHandler) lookupHardwareSensor(ctx context.Context, controllerID uuid.UUID, sensorIdentifier string) (hardwareSensorRecord, error) {
	if strings.TrimSpace(sensorIdentifier) == "" {
		return hardwareSensorRecord{}, apiError{status: http.StatusBadRequest, message: "sensor ID required"}
	}

	var sensor hardwareSensorRecord
	err := h.db.QueryRow(ctx, `
		SELECT id, sensor_uid, name, type, status, configured
		FROM controller_sensors
		WHERE controller_id = $1
		  AND (sensor_uid = $2 OR id::text = $2)
	`, controllerID, strings.TrimSpace(sensorIdentifier)).Scan(
		&sensor.id,
		&sensor.uid,
		&sensor.name,
		&sensor.sensorType,
		&sensor.status,
		&sensor.configured,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return hardwareSensorRecord{}, apiError{status: http.StatusNotFound, message: "sensor not found"}
		}
		return hardwareSensorRecord{}, err
	}

	return sensor, nil
}

func (h *ControllerHandler) loadHardwareSensors(ctx context.Context, controllerID uuid.UUID) ([]models.HardwareSensorResponse, error) {
	rows, err := h.db.Query(ctx, `
		SELECT sensor_uid, name, type, status, configured
		FROM controller_sensors
		WHERE controller_id = $1
		ORDER BY created_at ASC, sensor_uid ASC
	`, controllerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sensors := []models.HardwareSensorResponse{}
	for rows.Next() {
		var sensor models.HardwareSensorResponse
		if err := rows.Scan(&sensor.ID, &sensor.Name, &sensor.Type, &sensor.Status, &sensor.Configured); err != nil {
			return nil, err
		}
		sensors = append(sensors, sensor)
	}

	return sensors, rows.Err()
}

func (h *ControllerHandler) ensureDefaultHardwareSensors(ctx context.Context, tx pgx.Tx, controllerID uuid.UUID, controllerUID string) error {
	sensorIDs := defaultSensorUIDs(controllerUID)
	defaults := []models.HardwareSensorResponse{
		{ID: sensorIDs[0], Name: "Load Sensor", Type: "load", Status: "live", Configured: false},
		{ID: sensorIDs[1], Name: "Temperature & Humidity Sensor", Type: "temperature_humidity", Status: "live", Configured: true},
		{ID: sensorIDs[2], Name: "Ultrasonic Sensor", Type: "ultrasonic", Status: "live", Configured: false},
	}

	var temperatureSensorID uuid.UUID
	for _, sensor := range defaults {
		var persistedID uuid.UUID
		err := tx.QueryRow(ctx, `
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
			    configured = controller_sensors.configured OR EXCLUDED.configured,
			    updated_at = NOW()
			WHERE controller_sensors.controller_id = EXCLUDED.controller_id
			RETURNING id
		`, uuid.New(), sensor.ID, controllerID, sensor.Name, sensor.Type, sensor.Status, sensor.Configured).Scan(&persistedID)
		if err != nil {
			return err
		}

		if sensor.Type == "temperature_humidity" {
			temperatureSensorID = persistedID
		}
	}

	if temperatureSensorID != uuid.Nil {
		configJSON, err := json.Marshal(map[string]interface{}{
			"temperatureMin":           20,
			"temperatureMax":           35,
			"temperatureWarningMin":    18,
			"temperatureWarningMax":    38,
			"humidityMin":              40,
			"humidityMax":              80,
			"humidityWarningMin":       35,
			"humidityWarningMax":       85,
			"readingFlowType":          "Constant readings per day",
			"reportsPerDay":            24,
			"estimatedBatteryLifeDays": 77,
		})
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO sensor_configurations (
				id,
				sensor_id,
				controller_id,
				used_for,
				dashboard_view,
				config_json,
				created_at,
				updated_at
			)
			VALUES ($1, $2, $3, 'Climate Monitoring', 'Dual Climate', $4::jsonb, NOW(), NOW())
			ON CONFLICT (sensor_id) DO NOTHING
		`, uuid.New(), temperatureSensorID, controllerID, configJSON)
		if err != nil {
			return err
		}
	}

	return nil
}

func defaultSensorUIDs(controllerUID string) []string {
	if strings.EqualFold(strings.TrimSpace(controllerUID), "CTRL-8F2A19") {
		return []string{"sensor-load-01", "sensor-temp-01", "sensor-ultra-01"}
	}

	prefix := sanitizeUID(strings.ToLower(controllerUID))
	if prefix == "" {
		prefix = strings.ToLower(randomCode(6))
	}
	return []string{
		prefix + "-sensor-load-01",
		prefix + "-sensor-temp-01",
		prefix + "-sensor-ultra-01",
	}
}

func sanitizeUID(value string) string {
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "-")
}

func validateHardwareSensorConfigRequest(req models.SaveHardwareSensorConfigRequest, actualSensorType string) error {
	if req.SensorType == "" {
		return fmt.Errorf("sensorType required")
	}
	if !isAllowedHardwareSensorType(req.SensorType) {
		return fmt.Errorf("invalid sensorType")
	}
	if actualSensorType != "" && !strings.EqualFold(req.SensorType, actualSensorType) {
		return fmt.Errorf("sensorType does not match sensor")
	}
	if req.SensorName == "" {
		return fmt.Errorf("sensorName required")
	}
	if req.Config == nil {
		return fmt.Errorf("config object required")
	}

	if reports, ok := req.Config["reportsPerDay"]; ok {
		value, ok := numericValue(reports)
		if !ok || value <= 0 {
			return fmt.Errorf("reportsPerDay should be positive")
		}
	}

	for key, value := range req.Config {
		if shouldBeNumericConfigKey(key) {
			if _, ok := numericValue(value); !ok {
				return fmt.Errorf("%s should be numeric", key)
			}
		}
	}

	return nil
}

func isAllowedHardwareSensorType(sensorType string) bool {
	switch strings.ToLower(strings.TrimSpace(sensorType)) {
	case "load", "temperature_humidity", "ultrasonic", "gas", "weight", "temperature", "humidity":
		return true
	default:
		return false
	}
}

func shouldBeNumericConfigKey(key string) bool {
	normalized := strings.ToLower(key)
	return normalized == "reportsperday" ||
		normalized == "estimatedbatterylifedays" ||
		strings.Contains(normalized, "threshold") ||
		strings.Contains(normalized, "min") ||
		strings.Contains(normalized, "max") ||
		strings.Contains(normalized, "alert") ||
		strings.Contains(normalized, "height") ||
		strings.Contains(normalized, "distance") ||
		strings.Contains(normalized, "weight")
}

func numericValue(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		parsed, err := v.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func writeAPIError(w http.ResponseWriter, err error) {
	var apiErr apiError
	if errors.As(err, &apiErr) {
		http.Error(w, apiErr.message, apiErr.status)
		return
	}
	http.Error(w, "database error", http.StatusInternalServerError)
}

func randomCode(length int) string {
	if length <= 0 {
		length = 6
	}

	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return strings.ToUpper(strings.ReplaceAll(uuid.NewString()[:length], "-", ""))
	}

	encoded := strings.ToUpper(hex.EncodeToString(buf))
	if len(encoded) > length {
		return encoded[:length]
	}
	return encoded
}
