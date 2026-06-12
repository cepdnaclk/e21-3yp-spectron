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
	"github.com/jackc/pgx/v5/pgxpool"

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
		SELECT id, owner_account_id, hw_id, name, purpose, location,
		       operational_status, claim_status, operational_status, last_seen, created_at
		FROM controllers
		WHERE owner_account_id = $1
		  AND claim_status = 'CLAIMED'
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
		err := rows.Scan(
			&c.ID,
			&c.AccountID,
			&c.HWID,
			&c.Name,
			&c.Purpose,
			&c.Location,
			&c.Status,
			&c.ClaimStatus,
			&c.OperationalStatus,
			&c.LastSeen,
			&c.CreatedAt,
		)
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
		SELECT id, owner_account_id, hw_id, name, purpose, location,
		       operational_status, claim_status, operational_status, last_seen, created_at
		FROM controllers
		WHERE id = $1 AND owner_account_id = $2
		  AND claim_status = 'CLAIMED'
	`, controllerID, accountID).Scan(
		&c.ID,
		&c.AccountID,
		&c.HWID,
		&c.Name,
		&c.Purpose,
		&c.Location,
		&c.Status,
		&c.ClaimStatus,
		&c.OperationalStatus,
		&c.LastSeen,
		&c.CreatedAt,
	)
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
	query := "UPDATE controllers SET " + strings.Join(updates, ", ") +
		" WHERE id = $" + fmt.Sprintf("%d", argPos) +
		" AND owner_account_id = $" + fmt.Sprintf("%d", argPos+1) +
		" AND claim_status = 'CLAIMED'"

	_, err = h.db.Exec(r.Context(), query, args...)
	if err != nil {
		http.Error(w, "failed to update controller", http.StatusInternalServerError)
		return
	}

	// Return updated controller
	h.Get(w, r)
}
