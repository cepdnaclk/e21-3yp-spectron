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
	"github.com/jackc/pgx/v5/pgconn"

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
	updatedAt   time.Time
}

type hardwareSensorRecord struct {
	id                 uuid.UUID
	systemID           *uuid.UUID
	slotKey            string
	uid                string
	name               string
	sensorType         string
	status             string
	configured         bool
	controllerSensorID *uuid.UUID
	legacyID           *uuid.UUID
}

type legacySensorRecord struct {
	id         uuid.UUID
	hwID       string
	name       string
	sensorType string
	status     string
}

type queryRower interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (h *ControllerHandler) requireAccountAdmin(ctx context.Context, userID uuid.UUID, accountID uuid.UUID) error {
	var accountType string
	if err := h.db.QueryRow(ctx, `
		SELECT account_type
		FROM users
		WHERE id = $1
	`, userID).Scan(&accountType); err != nil || accountType != "ADMIN" {
		return apiError{status: http.StatusForbidden, message: "admin account required"}
	}

	var role string
	err := h.db.QueryRow(ctx, `
		SELECT role
		FROM account_memberships
		WHERE user_id = $1 AND account_id = $2
	`, userID, accountID).Scan(&role)
	if err != nil {
		return apiError{status: http.StatusForbidden, message: "admin access required"}
	}
	if role != "OWNER" && role != "ADMIN" {
		return apiError{status: http.StatusForbidden, message: "admin access required"}
	}
	return nil
}

func (h *ControllerHandler) AdminOverviewAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	var response models.AdminOverviewResponse
	err := h.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*)::int,
			COUNT(*) FILTER (WHERE owner_user_id IS NULL)::int,
			COUNT(*) FILTER (WHERE owner_user_id IS NOT NULL)::int,
			COUNT(*) FILTER (WHERE UPPER(status) IN ('ONLINE', 'PAIRED'))::int,
			COUNT(*) FILTER (WHERE UPPER(status) IN ('OFFLINE', 'ERROR'))::int
		FROM controllers
	`).Scan(
		&response.TotalDevices,
		&response.UnclaimedDevices,
		&response.PairedDevices,
		&response.OnlineDevices,
		&response.OfflineDevices,
	)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	_ = h.db.QueryRow(r.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE cs.configured = true)::int,
			COUNT(*) FILTER (WHERE cs.configured = false)::int
		FROM controller_sensors cs
		JOIN controllers c ON c.id = cs.controller_id
	`).Scan(&response.ConfiguredSensors, &response.UnconfiguredSensors)

	json.NewEncoder(w).Encode(response)
}

func (h *ControllerHandler) AdminDevicesAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	devices, err := h.loadAdminDevices(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(models.AdminDevicesResponse{Devices: devices})
}

func (h *ControllerHandler) AdminCreateDeviceAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	var req models.AdminCreateDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	controllerUID := strings.ToUpper(strings.TrimSpace(req.ControllerID))
	manualControllerID := controllerUID != ""
	if manualControllerID {
		exists, err := h.controllerUIDExists(r.Context(), controllerUID)
		if err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}
		if exists {
			http.Error(w, "Controller ID already exists. Use a different controller ID.", http.StatusConflict)
			return
		}
	} else {
		for attempt := 0; attempt < 10; attempt++ {
			candidate := "CTRL-" + randomCode(6)
			exists, err := h.controllerUIDExists(r.Context(), candidate)
			if err != nil {
				http.Error(w, "database error", http.StatusInternalServerError)
				return
			}
			if !exists {
				controllerUID = candidate
				break
			}
		}
		if controllerUID == "" {
			http.Error(w, "failed to generate unique controller ID", http.StatusInternalServerError)
			return
		}
	}
	if !strings.HasPrefix(controllerUID, "CTRL-") {
		http.Error(w, "controllerId must start with CTRL-", http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Main Controller"
	}
	location := strings.TrimSpace(req.Location)

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
			location,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $3, $4, $5, 'unclaimed', NOW(), NOW())
		RETURNING id
	`, uuid.New(), accountID, controllerUID, name, nullableString(location)).Scan(&controllerID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			http.Error(w, "Controller ID already exists. Use a different controller ID.", http.StatusConflict)
			return
		}
		http.Error(w, "failed to create device", http.StatusInternalServerError)
		return
	}

	if req.CreateDefaultSensors {
		if err := h.ensureDefaultHardwareSensors(r.Context(), tx, controllerID, controllerUID); err != nil {
			http.Error(w, "failed to create default sensors", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to commit device", http.StatusInternalServerError)
		return
	}

	devices, err := h.loadAdminDevices(r.Context())
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	var created models.AdminDeviceResponse
	for _, device := range devices {
		if strings.EqualFold(device.ControllerID, controllerUID) {
			created = device
			break
		}
	}

	json.NewEncoder(w).Encode(models.AdminCreateDeviceResponse{
		Device:    created,
		QRPayload: controllerUID,
		ClaimURL:  "/controllers/pair?code=" + controllerUID,
	})
}

func (h *ControllerHandler) AdminPairingTokensAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT
			COALESCE(c.controller_uid, c.hw_id),
			CASE
				WHEN t.used_at IS NOT NULL THEN 'used'
				WHEN t.expires_at <= NOW() THEN 'expired'
				ELSE 'active'
			END,
			t.expires_at,
			t.used_at,
			t.created_at
		FROM controller_pairing_tokens t
		JOIN controllers c ON c.id = t.controller_id
		ORDER BY t.created_at DESC
		LIMIT 100
	`)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tokens := make([]models.AdminPairingTokenResponse, 0)
	for rows.Next() {
		var token models.AdminPairingTokenResponse
		var expiresAt time.Time
		var usedAt *time.Time
		var createdAt time.Time
		if err := rows.Scan(&token.ControllerID, &token.Status, &expiresAt, &usedAt, &createdAt); err != nil {
			continue
		}
		token.ExpiresAt = expiresAt.Format(time.RFC3339)
		token.CreatedAt = createdAt.Format(time.RFC3339)
		if usedAt != nil {
			token.UsedAt = usedAt.Format(time.RFC3339)
		}
		tokens = append(tokens, token)
	}

	json.NewEncoder(w).Encode(models.AdminPairingTokensResponse{Tokens: tokens})
}

func (h *ControllerHandler) AdminGeneratePairingTokenAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))
	var req models.AdminGeneratePairingTokenRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	expiryHours := req.TokenExpiryHours
	if expiryHours <= 0 {
		expiryHours = 24
	}
	if expiryHours > 720 {
		expiryHours = 720
	}

	controller, err := h.lookupAdminController(r.Context(), controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	pairingToken := "PAIR-" + randomCode(6)
	expiresAt := time.Now().Add(time.Duration(expiryHours) * time.Hour)
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO controller_pairing_tokens (id, controller_id, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, $4, NOW())
	`, uuid.New(), controller.id, hashPairingToken(pairingToken), expiresAt)
	if err != nil {
		http.Error(w, "failed to create pairing token", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.AdminGeneratePairingTokenResponse{
		ControllerID: controller.uid,
		PairingToken: pairingToken,
		PairingURL:   "/controllers/pair?code=" + pairingToken,
		ExpiresAt:    expiresAt.Format(time.RFC3339),
	})
}

func (h *ControllerHandler) AdminUsersAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT
			u.id,
			u.email,
			COALESCE(u.name, ''),
			am.role,
			u.created_at,
			COUNT(c.id)::int
		FROM account_memberships am
		JOIN users u ON u.id = am.user_id
		LEFT JOIN controllers c ON c.owner_user_id = u.id AND c.account_id = am.account_id
		WHERE am.account_id = $1
		GROUP BY u.id, u.email, u.name, am.role, u.created_at
		ORDER BY u.created_at DESC
	`, accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := make([]models.AdminUserResponse, 0)
	for rows.Next() {
		var user models.AdminUserResponse
		var id uuid.UUID
		var createdAt time.Time
		if err := rows.Scan(&id, &user.Email, &user.Name, &user.Role, &createdAt, &user.ControllerCount); err != nil {
			continue
		}
		user.ID = id.String()
		user.CreatedAt = createdAt.Format(time.RFC3339)
		users = append(users, user)
	}

	json.NewEncoder(w).Encode(models.AdminUsersResponse{Users: users})
}

func (h *ControllerHandler) AdminSystemHealthAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)
	if err := h.requireAccountAdmin(r.Context(), userID, accountID); err != nil {
		writeAPIError(w, err)
		return
	}

	response := models.AdminSystemHealthResponse{
		APIStatus:      "ok",
		DatabaseStatus: "ok",
		ServerTime:     time.Now().Format(time.RFC3339),
	}
	if err := h.db.Ping(r.Context()); err != nil {
		response.DatabaseStatus = "error"
	}
	json.NewEncoder(w).Encode(response)
}

func (h *ControllerHandler) PairAPI(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r).(uuid.UUID)
	accountID := GetAccountID(r).(uuid.UUID)

	var req models.HardwarePairRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	provided := strings.TrimSpace(req.ControllerID)
	if provided == "" {
		provided = strings.TrimSpace(req.PairingTokenOrControllerID)
	}
	if provided == "" {
		provided = strings.TrimSpace(req.QRToken)
	}
	if provided == "" {
		http.Error(w, "missing controller ID", http.StatusBadRequest)
		return
	}

	controller, system, err := h.claimController(r.Context(), userID, accountID, provided, strings.TrimSpace(req.SystemID))
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

	sensors, err := h.loadLiveHardwareSensors(r.Context(), controller.id, controller.updatedAt)
	if err != nil {
		log.Printf("load paired sensors: %v", err)
		http.Error(w, "failed to load sensors", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(models.HardwarePairResponse{
		ID:           controller.id.String(),
		ControllerID: controller.uid,
		SystemID:     system.id.String(),
		SystemName:   system.name,
		Status:       "paired",
		Sensors:      sensors,
	})
}

func (h *ControllerHandler) MyControllersAPI(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	rows, err := h.db.Query(r.Context(), `
		SELECT
			c.id,
			COALESCE(c.controller_uid, c.hw_id),
			COALESCE(s.name, c.name, 'Main Controller'),
			c.status,
			sca.assigned_at,
			s.id,
			COALESCE(s.name, c.name, 'Main Controller')
		FROM controllers c
		JOIN system_controller_assignments sca
		  ON sca.controller_id = c.id
		 AND sca.unassigned_at IS NULL
		JOIN systems s ON s.id = sca.system_id
		WHERE c.account_id = $1
		  AND c.owner_user_id IS NOT NULL
		  AND UPPER(COALESCE(c.status, '')) <> 'UNCLAIMED'
		ORDER BY sca.assigned_at DESC, c.created_at DESC
	`, accountID)
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
		var sessionStart time.Time
		var systemID uuid.UUID
		var systemName string
		if err := rows.Scan(&controllerID, &controllerUID, &name, &status, &sessionStart, &systemID, &systemName); err != nil {
			continue
		}

		sensors, err := h.loadHardwareSensors(r.Context(), controllerID, sessionStart)
		if err != nil {
			http.Error(w, "failed to load sensors", http.StatusInternalServerError)
			return
		}

		controllers = append(controllers, models.UserHardwareControllerResponse{
			ControllerID: controllerUID,
			SystemID:     systemID.String(),
			SystemName:   systemName,
			Name:         name,
			Status:       status,
			Sensors:      sensors,
		})
	}

	json.NewEncoder(w).Encode(models.UserHardwareControllersResponse{Controllers: controllers})
}

func (h *ControllerHandler) MySystemsAPI(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	rows, err := h.db.Query(r.Context(), `
		SELECT
			s.id,
			s.name,
			COALESCE(s.purpose, ''),
			COALESCE(s.location, ''),
			s.status,
			active_sca.controller_id,
			COALESCE(c.hw_id, ''),
			COUNT(ss.id)::int,
			COUNT(ss.id) FILTER (WHERE ss.configured = true)::int
		FROM systems s
		LEFT JOIN system_controller_assignments active_sca
		  ON active_sca.system_id = s.id
		 AND active_sca.unassigned_at IS NULL
		LEFT JOIN controllers c ON c.id = active_sca.controller_id
		LEFT JOIN system_sensors ss ON ss.system_id = s.id
		WHERE s.account_id = $1
		  AND s.status <> 'archived'
		GROUP BY s.id, s.name, s.purpose, s.location, s.status, active_sca.controller_id, c.hw_id, s.updated_at, s.created_at
		ORDER BY s.updated_at DESC, s.created_at DESC
	`, accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	systems := make([]models.UserSystemResponse, 0)
	for rows.Next() {
		var system models.UserSystemResponse
		var systemID uuid.UUID
		var purpose string
		var location string
		var activeControllerID *uuid.UUID
		if err := rows.Scan(
			&systemID,
			&system.Name,
			&purpose,
			&location,
			&system.Status,
			&activeControllerID,
			&system.ActiveControllerHW,
			&system.SensorCount,
			&system.ConfiguredSensors,
		); err != nil {
			http.Error(w, "database error", http.StatusInternalServerError)
			return
		}

		system.ID = systemID.String()
		system.Purpose = purpose
		system.Location = location
		if activeControllerID != nil {
			system.ActiveControllerID = activeControllerID.String()
		}
		systems = append(systems, system)
	}

	json.NewEncoder(w).Encode(models.UserSystemsResponse{Systems: systems})
}

func (h *ControllerHandler) ControllerSensorsAPI(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))
	liveOnlyParam := strings.TrimSpace(r.URL.Query().Get("live"))
	liveOnly := strings.EqualFold(liveOnlyParam, "true") || liveOnlyParam == "1"

	controller, err := h.lookupAccountHardwareController(r.Context(), accountID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	system, err := loadActiveSystemForController(r.Context(), h.db, controller.id)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	sensors := []models.HardwareSensorResponse{}
	if liveOnly {
		if strings.EqualFold(strings.TrimSpace(controller.status), "ONLINE") {
			sensors, err = h.loadLiveHardwareSensors(r.Context(), controller.id, controller.updatedAt)
			if err != nil {
				http.Error(w, "failed to load sensors", http.StatusInternalServerError)
				return
			}
		}
	} else {
		sensors, err = h.loadHardwareSensors(r.Context(), controller.id, system.assignedAt)
		if err != nil {
			http.Error(w, "failed to load sensors", http.StatusInternalServerError)
			return
		}
	}

	json.NewEncoder(w).Encode(models.ControllerSensorsResponse{
		ControllerID: controller.uid,
		SystemID:     system.id.String(),
		Sensors:      sensors,
	})
}

func (h *ControllerHandler) ReleaseControllerAPI(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)
	userID := GetUserID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))

	controller, err := h.lookupAccountHardwareController(r.Context(), accountID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	if controller.ownerUserID == "" {
		http.Error(w, "This controller is already unowned.", http.StatusConflict)
		return
	}

	tx, err := h.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		http.Error(w, "failed to start release transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	if err := h.releaseControllerFromSystem(r.Context(), tx, controller.id, userID); err != nil {
		http.Error(w, "failed to detach controller from system", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE controllers
		SET owner_user_id = NULL,
		    status = 'unclaimed',
		    updated_at = NOW()
		WHERE id = $1 AND account_id = $2
	`, controller.id, accountID)
	if err != nil {
		http.Error(w, "failed to remove controller", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to finalize controller removal", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"message":      "Controller removed from this account. The monitoring system was preserved for later reassignment.",
		"controllerId": controller.uid,
	})
}

func (h *ControllerHandler) SaveSensorConfigAPI(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))
	sensorParam := strings.TrimSpace(chi.URLParam(r, "sensorId"))

	controller, err := h.lookupAccountHardwareController(r.Context(), accountID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	sensor, err := h.lookupHardwareSensor(r.Context(), controller.id, sensorParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	system, err := loadActiveSystemForController(r.Context(), h.db, controller.id)
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
	req.SystemName = strings.TrimSpace(req.SystemName)
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
		UPDATE systems
		SET name = $1,
		    updated_at = NOW()
		WHERE id = $2
	`, req.SystemName, system.id)
	if err != nil {
		http.Error(w, "failed to update system name", http.StatusInternalServerError)
		return
	}

	if sensor.controllerSensorID != nil {
		_, err = tx.Exec(r.Context(), `
			UPDATE controller_sensors
			SET name = $1,
			    type = $2,
			    configured = true,
			    updated_at = NOW()
			WHERE id = $3 AND controller_id = $4
		`, req.SensorName, req.SensorType, *sensor.controllerSensorID, controller.id)
		if err != nil {
			http.Error(w, "failed to update controller sensor", http.StatusInternalServerError)
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
		`, uuid.New(), *sensor.controllerSensorID, controller.id, req.UsedFor, req.DashboardView, configJSON)
		if err != nil {
			http.Error(w, "failed to save controller sensor configuration", http.StatusInternalServerError)
			return
		}
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE system_sensors
		SET name = $1,
		    type = $2,
		    configured = true,
		    status = CASE
		        WHEN status = 'pending_discovery' THEN 'pending_discovery'
		        ELSE 'live'
		    END,
		    updated_at = NOW()
		WHERE id = $3
	`, req.SensorName, req.SensorType, sensor.id)
	if err != nil {
		http.Error(w, "failed to update system sensor", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE system_sensor_configurations
		SET active = false,
		    updated_at = NOW()
		WHERE system_sensor_id = $1
		  AND active = true
	`, sensor.id)
	if err != nil {
		http.Error(w, "failed to retire previous system configuration", http.StatusInternalServerError)
		return
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO system_sensor_configurations (
			id,
			system_sensor_id,
			used_for,
			dashboard_view,
			config_json,
			active,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5::jsonb, true, NOW(), NOW())
	`, uuid.New(), sensor.id, req.UsedFor, req.DashboardView, configJSON)
	if err != nil {
		http.Error(w, "failed to save system sensor configuration", http.StatusInternalServerError)
		return
	}

	legacyConfig := buildLegacySensorConfig(req)
	legacySensor := legacySensorRecord{}
	legacyErr := pgx.ErrNoRows
	if sensor.legacyID != nil {
		legacyErr = tx.QueryRow(r.Context(), `
			SELECT id, hw_id, COALESCE(name, ''), type, status
			FROM sensors
			WHERE id = $1
		`, *sensor.legacyID).Scan(&legacySensor.id, &legacySensor.hwID, &legacySensor.name, &legacySensor.sensorType, &legacySensor.status)
	} else {
		legacySensor, legacyErr = lookupLegacySensorRecord(r.Context(), tx, controller.id, sensorParam)
		if errors.Is(legacyErr, pgx.ErrNoRows) && sensor.uid != "" && sensor.uid != sensorParam {
			legacySensor, legacyErr = lookupLegacySensorRecord(r.Context(), tx, controller.id, sensor.uid)
		}
	}
	if legacyErr == nil {
		legacyConfigJSON, marshalErr := json.Marshal(legacyConfig)
		if marshalErr != nil {
			http.Error(w, "failed to encode device configuration", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec(r.Context(), `
			UPDATE sensors
			SET name = COALESCE($1, name),
			    purpose = COALESCE($2, purpose),
			    type = $3,
			    system_sensor_id = $5
			WHERE id = $4
		`, nullableString(req.SensorName), nullableString(req.UsedFor), sensor.sensorType, legacySensor.id, sensor.id)
		if err != nil {
			http.Error(w, "failed to update discovered sensor", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec(r.Context(), `
			UPDATE sensor_configs
			SET active = false
			WHERE sensor_id = $1
			  AND active = true
		`, legacySensor.id)
		if err != nil {
			http.Error(w, "failed to deactivate old sensor config", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec(r.Context(), `
			INSERT INTO sensor_configs (
				id,
				sensor_id,
				config_json,
				active,
				created_at,
				purpose
			)
			VALUES ($1, $2, $3::jsonb, true, NOW(), $4)
		`, uuid.New(), legacySensor.id, legacyConfigJSON, nullableString(req.UsedFor))
		if err != nil {
			http.Error(w, "failed to save device sensor config", http.StatusInternalServerError)
			return
		}
	} else if !errors.Is(legacyErr, pgx.ErrNoRows) {
		http.Error(w, "failed to resolve discovered sensor", http.StatusInternalServerError)
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
		SystemID:     system.id.String(),
		SensorID:     sensor.id.String(),
		Configured:   true,
	})
}

func (h *ControllerHandler) GetSensorConfigAPI(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)
	controllerParam := strings.TrimSpace(chi.URLParam(r, "controllerId"))
	sensorParam := strings.TrimSpace(chi.URLParam(r, "sensorId"))

	controller, err := h.lookupAccountHardwareController(r.Context(), accountID, controllerParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	sensor, err := h.lookupHardwareSensor(r.Context(), controller.id, sensorParam)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	system, err := loadActiveSystemForController(r.Context(), h.db, controller.id)
	if err != nil {
		writeAPIError(w, err)
		return
	}

	var usedFor string
	var dashboardView string
	var configJSON []byte
	err = h.db.QueryRow(r.Context(), `
		SELECT COALESCE(used_for, ''), COALESCE(dashboard_view, ''), config_json
		FROM system_sensor_configurations
		WHERE system_sensor_id = $1
		  AND active = true
		ORDER BY updated_at DESC
		LIMIT 1
	`, sensor.id).Scan(&usedFor, &dashboardView, &configJSON)
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
		SystemID:      system.id.String(),
		SensorID:      sensor.id.String(),
		SensorUID:     sensor.uid,
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

func (h *ControllerHandler) claimController(ctx context.Context, userID uuid.UUID, accountID uuid.UUID, provided string, preferredSystemID string) (hardwareControllerRecord, systemRecord, error) {
	tx, err := h.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return hardwareControllerRecord{}, systemRecord{}, err
	}
	defer tx.Rollback(ctx)

	normalized := strings.ToUpper(strings.TrimSpace(provided))
	record, err := h.findControllerForClaim(ctx, tx, normalized)
	if err != nil {
		return hardwareControllerRecord{}, systemRecord{}, err
	}

	if record.ownerUserID != "" {
		if strings.EqualFold(record.ownerUserID, userID.String()) {
			return hardwareControllerRecord{}, systemRecord{}, apiError{status: http.StatusConflict, message: "This device is already added to your account."}
		}
		return hardwareControllerRecord{}, systemRecord{}, apiError{status: http.StatusConflict, message: "This controller is already owned by another account."}
	}

	err = tx.QueryRow(ctx, `
		UPDATE controllers
		SET owner_user_id = $1,
		    account_id = $2,
		    status = 'paired',
		    controller_uid = COALESCE(NULLIF(controller_uid, ''), hw_id),
		    updated_at = NOW()
		WHERE id = $3
		RETURNING updated_at
	`, userID, accountID, record.id).Scan(&record.updatedAt)
	if err != nil {
		return hardwareControllerRecord{}, systemRecord{}, err
	}

	system, err := h.ensureControllerSystemAssignment(ctx, tx, record, userID, accountID, preferredSystemID)
	if err != nil {
		return hardwareControllerRecord{}, systemRecord{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return hardwareControllerRecord{}, systemRecord{}, err
	}

	record.status = "paired"
	record.ownerUserID = userID.String()
	return record, system, nil
}

func (h *ControllerHandler) findControllerForClaim(ctx context.Context, tx pgx.Tx, normalized string) (hardwareControllerRecord, error) {
	if !strings.HasPrefix(normalized, "CTRL-") {
		return hardwareControllerRecord{}, apiError{status: http.StatusBadRequest, message: "Scan the controller QR code or enter a controller ID."}
	}

	record, err := scanHardwareController(tx.QueryRow(ctx, `
		SELECT id,
		       COALESCE(controller_uid, hw_id),
		       COALESCE(name, 'Main Controller'),
		       status,
		       COALESCE(owner_user_id::text, ''),
		       updated_at
		FROM controllers
		WHERE UPPER(COALESCE(controller_uid, hw_id)) = UPPER($1)
		   OR id::text = $1
	`, normalized))
	if err == nil {
		return record, nil
	}
	if err != pgx.ErrNoRows {
		return hardwareControllerRecord{}, err
	}

	return hardwareControllerRecord{}, apiError{status: http.StatusNotFound, message: "Controller ID not found."}
}

func scanHardwareController(row pgx.Row) (hardwareControllerRecord, error) {
	var record hardwareControllerRecord
	err := row.Scan(&record.id, &record.uid, &record.name, &record.status, &record.ownerUserID, &record.updatedAt)
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
		       COALESCE(owner_user_id::text, ''),
		       updated_at
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

func (h *ControllerHandler) lookupAccountHardwareController(ctx context.Context, accountID uuid.UUID, identifier string) (hardwareControllerRecord, error) {
	if strings.TrimSpace(identifier) == "" {
		return hardwareControllerRecord{}, apiError{status: http.StatusBadRequest, message: "controller ID required"}
	}

	record, err := scanHardwareController(h.db.QueryRow(ctx, `
		SELECT id,
		       COALESCE(controller_uid, hw_id),
		       COALESCE(name, 'Main Controller'),
		       status,
		       COALESCE(owner_user_id::text, ''),
		       updated_at
		FROM controllers
		WHERE account_id = $1
		  AND owner_user_id IS NOT NULL
		  AND UPPER(COALESCE(status, '')) <> 'UNCLAIMED'
		  AND (UPPER(COALESCE(controller_uid, hw_id)) = UPPER($2) OR id::text = $2)
	`, accountID, strings.TrimSpace(identifier)))
	if err != nil {
		if err == pgx.ErrNoRows {
			return hardwareControllerRecord{}, apiError{status: http.StatusNotFound, message: "controller not found"}
		}
		return hardwareControllerRecord{}, err
	}

	return record, nil
}

func (h *ControllerHandler) lookupHardwareSensor(ctx context.Context, controllerID uuid.UUID, sensorIdentifier string) (hardwareSensorRecord, error) {
	if strings.TrimSpace(sensorIdentifier) == "" {
		return hardwareSensorRecord{}, apiError{status: http.StatusBadRequest, message: "sensor ID required"}
	}

	var sensor hardwareSensorRecord
	trimmedIdentifier := strings.TrimSpace(sensorIdentifier)
	var systemID uuid.UUID
	var controllerSensorID *uuid.UUID
	var legacySensorID *uuid.UUID
	err := h.db.QueryRow(ctx, `
		SELECT
			ss.id,
			ss.system_id,
			ss.slot_key,
			COALESCE(cs.sensor_uid, ss.current_sensor_uid, ''),
			ss.name,
			ss.type,
			ss.status,
			ss.configured,
			cs.id,
			s.id
		FROM system_controller_assignments sca
		JOIN system_sensors ss ON ss.system_id = sca.system_id
		LEFT JOIN controller_sensors cs
		  ON cs.system_sensor_id = ss.id
		 AND cs.controller_id = sca.controller_id
		LEFT JOIN sensors s ON s.system_sensor_id = ss.id AND s.controller_id = sca.controller_id
		WHERE sca.controller_id = $1
		  AND sca.unassigned_at IS NULL
		  AND (
		        ss.id::text = $2
		     OR COALESCE(cs.sensor_uid, ss.current_sensor_uid, '') = $2
		  )
		ORDER BY cs.updated_at DESC NULLS LAST, s.last_seen DESC NULLS LAST
		LIMIT 1
	`, controllerID, trimmedIdentifier).Scan(
		&sensor.id,
		&systemID,
		&sensor.slotKey,
		&sensor.uid,
		&sensor.name,
		&sensor.sensorType,
		&sensor.status,
		&sensor.configured,
		&controllerSensorID,
		&legacySensorID,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			bridgedSensor, bridgeErr := h.ensureHardwareSensorForLegacy(ctx, controllerID, trimmedIdentifier)
			if bridgeErr != nil {
				return hardwareSensorRecord{}, bridgeErr
			}
			return bridgedSensor, nil
		}
		return hardwareSensorRecord{}, err
	}

	sensor.systemID = &systemID
	sensor.controllerSensorID = controllerSensorID
	sensor.legacyID = legacySensorID
	return sensor, nil
}

func (h *ControllerHandler) loadHardwareSensors(ctx context.Context, controllerID uuid.UUID, sessionStart time.Time) ([]models.HardwareSensorResponse, error) {
	rows, err := h.db.Query(ctx, `
		SELECT
			ss.id,
			COALESCE(cs.sensor_uid, ss.current_sensor_uid, ''),
			ss.system_id,
			ss.slot_key,
			ss.name,
			ss.type,
			ss.status,
			ss.configured
		FROM system_controller_assignments sca
		JOIN system_sensors ss ON ss.system_id = sca.system_id
		LEFT JOIN controller_sensors cs
		  ON cs.system_sensor_id = ss.id
		 AND cs.controller_id = sca.controller_id
		WHERE sca.controller_id = $1
		  AND sca.unassigned_at IS NULL
		  AND (
		        cs.updated_at >= $2
		     OR (cs.id IS NULL AND ss.updated_at >= $2)
		  )
		ORDER BY ss.created_at ASC, ss.slot_key ASC
	`, controllerID, sessionStart)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sensors := []models.HardwareSensorResponse{}
	for rows.Next() {
		var sensor models.HardwareSensorResponse
		var logicalID uuid.UUID
		var systemID uuid.UUID
		if err := rows.Scan(&logicalID, &sensor.SensorUID, &systemID, &sensor.SlotKey, &sensor.Name, &sensor.Type, &sensor.Status, &sensor.Configured); err != nil {
			return nil, err
		}
		sensor.ID = logicalID.String()
		sensor.SystemID = systemID.String()
		sensors = append(sensors, sensor)
	}

	return sensors, rows.Err()
}

func (h *ControllerHandler) loadLiveHardwareSensors(ctx context.Context, controllerID uuid.UUID, sessionStart time.Time) ([]models.HardwareSensorResponse, error) {
	rows, err := h.db.Query(ctx, `
		SELECT
			ss.id,
			COALESCE(cs.sensor_uid, ss.current_sensor_uid, ''),
			ss.system_id,
			ss.slot_key,
			ss.name,
			ss.type,
			ss.status,
			ss.configured
		FROM system_controller_assignments sca
		JOIN system_sensors ss ON ss.system_id = sca.system_id
		LEFT JOIN controller_sensors cs
		  ON cs.system_sensor_id = ss.id
		 AND cs.controller_id = sca.controller_id
		WHERE sca.controller_id = $1
		  AND sca.unassigned_at IS NULL
		  AND ss.last_seen IS NOT NULL
		  AND ss.last_seen >= $2
		ORDER BY ss.created_at ASC, ss.slot_key ASC
	`, controllerID, sessionStart)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sensors := []models.HardwareSensorResponse{}
	for rows.Next() {
		var sensor models.HardwareSensorResponse
		var logicalID uuid.UUID
		var systemID uuid.UUID
		if err := rows.Scan(&logicalID, &sensor.SensorUID, &systemID, &sensor.SlotKey, &sensor.Name, &sensor.Type, &sensor.Status, &sensor.Configured); err != nil {
			return nil, err
		}
		sensor.ID = logicalID.String()
		sensor.SystemID = systemID.String()
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

func (h *ControllerHandler) ensureHardwareSensorForLegacy(ctx context.Context, controllerID uuid.UUID, sensorIdentifier string) (hardwareSensorRecord, error) {
	legacySensor, err := lookupLegacySensorRecord(ctx, h.db, controllerID, sensorIdentifier)
	if err != nil {
		if err == pgx.ErrNoRows {
			return hardwareSensorRecord{}, apiError{status: http.StatusNotFound, message: "sensor not found"}
		}
		return hardwareSensorRecord{}, err
	}

	name := strings.TrimSpace(legacySensor.name)
	if name == "" {
		name = defaultHardwareSensorName(legacySensor.sensorType, legacySensor.hwID)
	}

	status := hardwareSensorStatusFromLegacy(legacySensor.status)
	sensorType := normalizeHardwareSensorType(legacySensor.sensorType)
	system, err := loadActiveSystemForController(ctx, h.db, controllerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return hardwareSensorRecord{}, apiError{status: http.StatusNotFound, message: "sensor not found"}
		}
		return hardwareSensorRecord{}, err
	}

	var controllerSensorID uuid.UUID
	err = h.db.QueryRow(ctx, `
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
		VALUES ($1, $2, $3, $4, $5, $6, false, NOW(), NOW())
		ON CONFLICT (sensor_uid) DO UPDATE
		SET name = EXCLUDED.name,
		    type = EXCLUDED.type,
		    status = EXCLUDED.status,
		    updated_at = NOW()
		WHERE controller_sensors.controller_id = EXCLUDED.controller_id
		RETURNING id
	`, uuid.New(), legacySensor.hwID, controllerID, name, sensorType, status).Scan(
		&controllerSensorID,
	)
	if err != nil {
		return hardwareSensorRecord{}, err
	}

	systemSensor, err := ensureSystemSensorBinding(
		ctx,
		h.db,
		system.id,
		controllerID,
		legacySensor.hwID,
		sensorType,
		name,
		status,
		false,
		&controllerSensorID,
		&legacySensor.id,
		nil,
	)
	if err != nil {
		return hardwareSensorRecord{}, err
	}

	return hardwareSensorRecord{
		id:                 systemSensor.id,
		systemID:           &system.id,
		slotKey:            systemSensor.slotKey,
		uid:                legacySensor.hwID,
		name:               systemSensor.name,
		sensorType:         systemSensor.sensorType,
		status:             systemSensor.status,
		configured:         systemSensor.configured,
		controllerSensorID: &controllerSensorID,
		legacyID:           &legacySensor.id,
	}, nil
}

func lookupLegacySensorRecord(ctx context.Context, q queryRower, controllerID uuid.UUID, sensorIdentifier string) (legacySensorRecord, error) {
	var sensor legacySensorRecord
	err := q.QueryRow(ctx, `
		SELECT id, hw_id, COALESCE(name, ''), type, COALESCE(status, 'OK')
		FROM sensors
		WHERE controller_id = $1
		  AND (id::text = $2 OR hw_id = $2)
	`, controllerID, strings.TrimSpace(sensorIdentifier)).Scan(
		&sensor.id,
		&sensor.hwID,
		&sensor.name,
		&sensor.sensorType,
		&sensor.status,
	)
	return sensor, err
}

func normalizeHardwareSensorType(sensorType string) string {
	switch strings.ToLower(strings.TrimSpace(sensorType)) {
	case "temperature_humidity", "temperature", "humidity", "ultrasonic", "load", "gas", "weight":
		return strings.ToLower(strings.TrimSpace(sensorType))
	default:
		return "temperature_humidity"
	}
}

func hardwareSensorStatusFromLegacy(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "OK", "ONLINE", "LIVE":
		return "live"
	case "ERROR":
		return "error"
	default:
		return "offline"
	}
}

func defaultHardwareSensorName(sensorType string, sensorUID string) string {
	switch normalizeHardwareSensorType(sensorType) {
	case "temperature_humidity":
		return "Temperature & Humidity Sensor"
	case "ultrasonic":
		return "Ultrasonic Sensor"
	case "load":
		return "Load Sensor"
	case "gas":
		return "Gas Sensor"
	case "weight":
		return "Weight Sensor"
	case "temperature":
		return "Temperature Sensor"
	case "humidity":
		return "Humidity Sensor"
	default:
		return "Sensor " + strings.TrimSpace(sensorUID)
	}
}

func buildLegacySensorConfig(req models.SaveHardwareSensorConfigRequest) models.SensorConfig {
	if req.AppConfig != nil {
		cfg := *req.AppConfig
		if strings.TrimSpace(cfg.FriendlyName) == "" {
			cfg.FriendlyName = req.SensorName
		}
		return cfg
	}

	reportsPerDay := positiveIntOrDefault(req.Config["reportsPerDay"], 24)
	estimatedBatteryLifeDays := positiveIntOrDefault(req.Config["estimatedBatteryLifeDays"], 77)
	tempThreshold := models.ThresholdConfig{
		Min:        numericPointer(req.Config["temperatureMin"]),
		Max:        numericPointer(req.Config["temperatureMax"]),
		WarningMin: numericPointer(req.Config["temperatureWarningMin"]),
		WarningMax: numericPointer(req.Config["temperatureWarningMax"]),
	}
	humidityThreshold := models.ThresholdConfig{
		Min:        numericPointer(req.Config["humidityMin"]),
		Max:        numericPointer(req.Config["humidityMax"]),
		WarningMin: numericPointer(req.Config["humidityWarningMin"]),
		WarningMax: numericPointer(req.Config["humidityWarningMax"]),
	}

	return models.SensorConfig{
		FriendlyName:         strings.TrimSpace(req.SensorName),
		UseCase:              strings.TrimSpace(req.UsedFor),
		PresentationProfile:  strings.TrimSpace(req.DashboardView),
		PrimaryMetric:        "temperature",
		Thresholds:           tempThreshold,
		MetricThresholds:     map[string]models.ThresholdConfig{"temperature": tempThreshold, "humidity": humidityThreshold},
		ReportIntervalPerDay: reportsPerDay,
		PowerManagement: models.PowerManagementConfig{
			BatteryLifeDays:   estimatedBatteryLifeDays,
			SamplingFrequency: reportsPerDay,
		},
	}
}

func positiveIntOrDefault(value any, fallback int) int {
	if number, ok := numericValue(value); ok && number > 0 {
		return int(number)
	}
	return fallback
}

func numericPointer(value any) *float64 {
	if number, ok := numericValue(value); ok {
		v := number
		return &v
	}
	return nil
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
	if strings.TrimSpace(req.SystemName) == "" {
		return fmt.Errorf("systemName required")
	}
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

func nullableString(value string) interface{} {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func (h *ControllerHandler) controllerUIDExists(ctx context.Context, controllerUID string) (bool, error) {
	var exists bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM controllers
			WHERE UPPER(COALESCE(controller_uid, hw_id)) = UPPER($1)
			   OR UPPER(hw_id) = UPPER($1)
		)
	`, strings.TrimSpace(controllerUID)).Scan(&exists)
	return exists, err
}

func (h *ControllerHandler) lookupAdminController(ctx context.Context, identifier string) (hardwareControllerRecord, error) {
	if strings.TrimSpace(identifier) == "" {
		return hardwareControllerRecord{}, apiError{status: http.StatusBadRequest, message: "controller ID required"}
	}

	record, err := scanHardwareController(h.db.QueryRow(ctx, `
		SELECT id,
		       COALESCE(controller_uid, hw_id),
		       COALESCE(name, 'Main Controller'),
		       status,
		       COALESCE(owner_user_id::text, ''),
		       updated_at
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

	return record, nil
}

func (h *ControllerHandler) loadAdminDevices(ctx context.Context) ([]models.AdminDeviceResponse, error) {
	rows, err := h.db.Query(ctx, `
		SELECT
			c.id,
			COALESCE(c.controller_uid, c.hw_id),
			COALESCE(c.name, 'Main Controller'),
			COALESCE(c.location, ''),
			c.status,
			COALESCE(u.email, ''),
			COUNT(cs.id)::int,
			COUNT(cs.id) FILTER (WHERE cs.configured = true)::int,
			c.last_seen,
			c.updated_at
		FROM controllers c
		LEFT JOIN users u ON u.id = c.owner_user_id
		LEFT JOIN controller_sensors cs ON cs.controller_id = c.id
		GROUP BY c.id, c.controller_uid, c.hw_id, c.name, c.location, c.status, u.email, c.last_seen, c.updated_at
		ORDER BY c.updated_at DESC, c.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	devices := make([]models.AdminDeviceResponse, 0)
	for rows.Next() {
		var device models.AdminDeviceResponse
		var id uuid.UUID
		var lastSeen *time.Time
		var updatedAt *time.Time
		if err := rows.Scan(
			&id,
			&device.ControllerID,
			&device.Name,
			&device.Location,
			&device.Status,
			&device.OwnerEmail,
			&device.SensorCount,
			&device.ConfiguredSensors,
			&lastSeen,
			&updatedAt,
		); err != nil {
			return nil, err
		}
		device.ID = id.String()
		if lastSeen != nil {
			device.LastSeen = lastSeen.Format(time.RFC3339)
		}
		if updatedAt != nil {
			device.UpdatedAt = updatedAt.Format(time.RFC3339)
		}
		devices = append(devices, device)
	}

	return devices, rows.Err()
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
