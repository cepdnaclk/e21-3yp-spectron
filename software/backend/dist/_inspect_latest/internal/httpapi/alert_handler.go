package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/models"
)

type AlertHandler struct {
	db *pgxpool.Pool
}

func NewAlertHandler(db *pgxpool.Pool) *AlertHandler {
	return &AlertHandler{db: db}
}

func (h *AlertHandler) List(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	// Parse query parameters
	controllerIDStr := r.URL.Query().Get("controller_id")
	sensorIDStr := r.URL.Query().Get("sensor_id")
	alertType := r.URL.Query().Get("type")
	severity := r.URL.Query().Get("severity")
	acknowledged := r.URL.Query().Get("acknowledged")

	query := `
		SELECT id, account_id, controller_id, sensor_id, type, severity, message, created_at, acknowledged_at
		FROM alerts
		WHERE account_id = $1
	`
	args := []interface{}{accountID}
	argPos := 2

	if controllerIDStr != "" {
		controllerID, err := uuid.Parse(controllerIDStr)
		if err == nil {
			query += " AND controller_id = $" + fmt.Sprintf("%d", argPos)
			args = append(args, controllerID)
			argPos++
		}
	}

	if sensorIDStr != "" {
		sensorID, err := uuid.Parse(sensorIDStr)
		if err == nil {
			query += " AND sensor_id = $" + fmt.Sprintf("%d", argPos)
			args = append(args, sensorID)
			argPos++
		}
	}

	if alertType != "" {
		query += " AND type = $" + fmt.Sprintf("%d", argPos)
		args = append(args, alertType)
		argPos++
	}

	if severity != "" {
		query += " AND severity = $" + fmt.Sprintf("%d", argPos)
		args = append(args, severity)
		argPos++
	}

	if acknowledged == "true" {
		query += " AND acknowledged_at IS NOT NULL"
	} else if acknowledged == "false" {
		query += " AND acknowledged_at IS NULL"
	}

	query += " ORDER BY created_at DESC"

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	alerts := make([]models.Alert, 0)
	for rows.Next() {
		var a models.Alert
		err := rows.Scan(&a.ID, &a.AccountID, &a.ControllerID, &a.SensorID, &a.Type, &a.Severity, &a.Message, &a.CreatedAt, &a.AcknowledgedAt)
		if err != nil {
			continue
		}
		alerts = append(alerts, a)
	}

	json.NewEncoder(w).Encode(alerts)
}

func (h *AlertHandler) Acknowledge(w http.ResponseWriter, r *http.Request) {
	alertID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid alert id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)

	// Verify alert belongs to account
	var alertAccountID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT account_id FROM alerts WHERE id = $1
	`, alertID).Scan(&alertAccountID)
	if err != nil {
		http.Error(w, "alert not found", http.StatusNotFound)
		return
	}
	if alertAccountID != accountID {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	now := time.Now()
	_, err = h.db.Exec(r.Context(), `
		UPDATE alerts
		SET acknowledged_at = $1
		WHERE id = $2
	`, now, alertID)
	if err != nil {
		http.Error(w, "failed to acknowledge alert", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
