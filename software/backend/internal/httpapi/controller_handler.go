package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	internaldb "spectron-backend/internal/db"
	"spectron-backend/internal/models"
)

type ControllerHandler struct {
	db *pgxpool.Pool
}

func NewControllerHandler(db *pgxpool.Pool) *ControllerHandler {
	return &ControllerHandler{db: db}
}

func (h *ControllerHandler) List(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	rows, err := h.db.Query(r.Context(), `
		SELECT id, account_id, hw_id, name, purpose, location, status, last_seen, created_at
		FROM controllers
		WHERE account_id = $1
		  AND UPPER(COALESCE(status, '')) <> 'UNCLAIMED'
		ORDER BY created_at DESC
	`, accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var controllers []models.Controller
	for rows.Next() {
		var c models.Controller
		err := rows.Scan(&c.ID, &c.AccountID, &c.HWID, &c.Name, &c.Purpose, &c.Location, &c.Status, &c.LastSeen, &c.CreatedAt)
		if err != nil {
			continue
		}
		controllers = append(controllers, c)
	}

	json.NewEncoder(w).Encode(controllers)
}

func (h *ControllerHandler) Get(w http.ResponseWriter, r *http.Request) {
	controllerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid controller id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	var c models.Controller
	err = h.db.QueryRow(r.Context(), `
		SELECT id, account_id, hw_id, name, purpose, location, status, last_seen, created_at
		FROM controllers
		WHERE id = $1 AND account_id = $2
		  AND UPPER(COALESCE(status, '')) <> 'UNCLAIMED'
	`, controllerID, accountID).Scan(&c.ID, &c.AccountID, &c.HWID, &c.Name, &c.Purpose, &c.Location, &c.Status, &c.LastSeen, &c.CreatedAt)
	if err != nil {
		http.Error(w, "controller not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(c)
}

func (h *ControllerHandler) ensureMockSensorsForController(r *http.Request, controllerID uuid.UUID) {
	var sensorCount int
	err := h.db.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM sensors
		WHERE controller_id = $1
	`, controllerID).Scan(&sensorCount)
	if err != nil || sensorCount > 0 {
		return
	}

	now := time.Now()

	temperatureHumidityName := "Temperature & Humidity Sensor"
	temperatureHumidityUnit := "°C/%RH"
	_, _ = h.db.Exec(r.Context(), `
		INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, 'OK', $7)
	`, uuid.New(), controllerID, "SEN-TH-001", "temperature_humidity", temperatureHumidityName, temperatureHumidityUnit, now)

	loadSensorName := "Load Sensor"
	loadSensorUnit := "kg"
	_, _ = h.db.Exec(r.Context(), `
		INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, 'OK', $7)
	`, uuid.New(), controllerID, "SEN-LOAD-001", "load", loadSensorName, loadSensorUnit, now)

	ultrasonicSensorName := "Ultrasonic Sensor"
	ultrasonicSensorUnit := "cm"
	_, _ = h.db.Exec(r.Context(), `
		INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, 'OK', $7)
	`, uuid.New(), controllerID, "SEN-US-001", "ultrasonic", ultrasonicSensorName, ultrasonicSensorUnit, now)
}

func (h *ControllerHandler) Pair(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	var req models.PairControllerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	hwID := strings.TrimSpace(req.QRToken)
	if hwID == "" {
		http.Error(w, "Controller ID required.", http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(strings.ToUpper(hwID), "CTRL-") {
		http.Error(w, "Scan the controller QR code or enter a controller ID.", http.StatusBadRequest)
		return
	}

	// Temporarily pair by HWID instead of token
	var controllerID uuid.UUID
	err := h.db.QueryRow(r.Context(), `
		SELECT id FROM controllers WHERE hw_id = $1
	`, hwID).Scan(&controllerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			if strings.EqualFold(hwID, internaldb.MockControllerHWID) {
				if seedErr := internaldb.EnsureMockController(r.Context(), h.db); seedErr != nil {
					http.Error(w, "failed to prepare mock controller", http.StatusInternalServerError)
					return
				}

				err = h.db.QueryRow(r.Context(), `
					SELECT id FROM controllers WHERE hw_id = $1
				`, internaldb.MockControllerHWID).Scan(&controllerID)
				if err == nil {
					goto pairController
				}
			}

			controllerID = uuid.New()
			defaultName := fmt.Sprintf("Controller %s", hwID)
			now := time.Now().UTC()
			_, err = h.db.Exec(r.Context(), `
				INSERT INTO controllers (
					id,
					account_id,
					hw_id,
					controller_uid,
					name,
					qr_code,
					status,
					last_seen,
					created_at,
					updated_at,
					min_reporting_interval_sec
				)
				VALUES ($1, $2, $3, $3, $4, $5, 'PENDING_CONFIG', NULL, $6, $6, $7)
			`, controllerID, accountID, hwID, defaultName, hwID, now, 300)
			if err != nil {
				http.Error(w, "failed to register controller", http.StatusInternalServerError)
				return
			}

			goto pairController
		}
		http.Error(w, "failed to find controller", http.StatusInternalServerError)
		return
	}

pairController:
	_, err = h.db.Exec(r.Context(), `
		UPDATE controllers
		SET account_id = $1,
		    status = 'PENDING_CONFIG',
		    updated_at = NOW(),
		    min_reporting_interval_sec = LEAST(min_reporting_interval_sec, 300)
		WHERE id = $2
	`, accountID, controllerID)
	if err != nil {
		http.Error(w, "failed to pair controller", http.StatusInternalServerError)
		return
	}

	var c models.Controller
	err = h.db.QueryRow(r.Context(), `
		SELECT id, account_id, hw_id, status, created_at
		FROM controllers
		WHERE id = $1
	`, controllerID).Scan(&c.ID, &c.AccountID, &c.HWID, &c.Status, &c.CreatedAt)
	if err != nil {
		http.Error(w, "failed to retrieve controller", http.StatusInternalServerError)
		return
	}

	h.ensureMockSensorsForController(r, c.ID)

	json.NewEncoder(w).Encode(c)
}

func (h *ControllerHandler) resolveControllerForPairing(r *http.Request, accountID uuid.UUID, providedToken string) (uuid.UUID, error) {
	tokenHash := hashPairingToken(providedToken)

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(r.Context())

	var controllerID uuid.UUID
	err = tx.QueryRow(r.Context(), `
		SELECT controller_id
		FROM pairing_tokens
		WHERE token_hash = $1
		  AND used_at IS NULL
		  AND expires_at > NOW()
	`, tokenHash).Scan(&controllerID)
	if err == nil {
		_, err = tx.Exec(r.Context(), `
			UPDATE pairing_tokens
			SET used_at = NOW(),
			    issued_for_account_id = COALESCE(issued_for_account_id, $1),
			    attempt_count = attempt_count + 1
			WHERE token_hash = $2
			  AND used_at IS NULL
			  AND expires_at > NOW()
		`, accountID, tokenHash)
		if err != nil {
			return uuid.Nil, err
		}

		_, err = tx.Exec(r.Context(), `
			UPDATE controllers
			SET account_id = $1,
			    status = 'PENDING_CONFIG',
			    updated_at = NOW(),
			    min_reporting_interval_sec = LEAST(min_reporting_interval_sec, 300)
			WHERE id = $2
		`, accountID, controllerID)
		if err != nil {
			return uuid.Nil, err
		}

		if err := tx.Commit(r.Context()); err != nil {
			return uuid.Nil, err
		}

		return controllerID, nil
	}
	if err != pgx.ErrNoRows {
		return uuid.Nil, err
	}

	err = tx.QueryRow(r.Context(), `
		SELECT id
		FROM controllers
		WHERE hw_id = $1
	`, providedToken).Scan(&controllerID)
	if err != nil {
		return uuid.Nil, err
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE controllers
		SET account_id = $1,
		    status = 'PENDING_CONFIG',
		    updated_at = NOW(),
		    min_reporting_interval_sec = LEAST(min_reporting_interval_sec, 300)
		WHERE id = $2
	`, accountID, controllerID)
	if err != nil {
		return uuid.Nil, err
	}

	if err := tx.Commit(r.Context()); err != nil {
		return uuid.Nil, err
	}

	return controllerID, nil
}

func hashPairingToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(strings.ToUpper(token))))
	return hex.EncodeToString(sum[:])
}

func (h *ControllerHandler) Update(w http.ResponseWriter, r *http.Request) {
	controllerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid controller id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	var req models.UpdateControllerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	// Build update query dynamically
	updates := []string{}
	args := []interface{}{}
	argPos := 1

	if req.Name != nil {
		updates = append(updates, "name = $"+fmt.Sprintf("%d", argPos))
		args = append(args, *req.Name)
		argPos++
	}
	if req.Purpose != nil {
		updates = append(updates, "purpose = $"+fmt.Sprintf("%d", argPos))
		args = append(args, *req.Purpose)
		argPos++
	}
	if req.Location != nil {
		updates = append(updates, "location = $"+fmt.Sprintf("%d", argPos))
		args = append(args, *req.Location)
		argPos++
	}

	if len(updates) == 0 {
		http.Error(w, "no fields to update", http.StatusBadRequest)
		return
	}

	args = append(args, controllerID, accountID)
	query := "UPDATE controllers SET " + strings.Join(updates, ", ") + " WHERE id = $" + fmt.Sprintf("%d", argPos) + " AND account_id = $" + fmt.Sprintf("%d", argPos+1)

	_, err = h.db.Exec(r.Context(), query, args...)
	if err != nil {
		http.Error(w, "failed to update controller", http.StatusInternalServerError)
		return
	}

	// Return updated controller
	h.Get(w, r)
}
