package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/models"
	"spectron-backend/internal/services/recommendation"
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

type generateRecommendationsRequest struct {
	FarmerInput  string  `json:"farmer_input"`
	ControllerID *string `json:"controller_id,omitempty"`
	SensorID     *string `json:"sensor_id,omitempty"`
	DatasetPath  string  `json:"dataset_path,omitempty"`
}

func (h *AlertHandler) GenerateRecommendations(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	var req generateRecommendationsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.FarmerInput) == "" {
		http.Error(w, "farmer_input is required", http.StatusBadRequest)
		return
	}

	datasetPath := strings.TrimSpace(req.DatasetPath)
	if datasetPath == "" {
		datasetPath = filepath.Join("..", "..", "context_sri_lanka.csv")
		if _, err := os.Stat(datasetPath); err != nil {
			datasetPath = filepath.Join(".", "context_sri_lanka.csv")
		}
	}

	rules, err := recommendation.GenerateCropRules(req.FarmerInput, datasetPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to generate recommendations: %v", err), http.StatusInternalServerError)
		return
	}

	var controllerID *uuid.UUID
	if req.ControllerID != nil && strings.TrimSpace(*req.ControllerID) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(*req.ControllerID))
		if err != nil {
			http.Error(w, "invalid controller_id", http.StatusBadRequest)
			return
		}
		controllerID = &parsed
	}

	var sensorID *uuid.UUID
	if req.SensorID != nil && strings.TrimSpace(*req.SensorID) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(*req.SensorID))
		if err != nil {
			http.Error(w, "invalid sensor_id", http.StatusBadRequest)
			return
		}
		sensorID = &parsed
	}

	for _, rule := range rules {
		id := uuid.New()
		_, err = h.db.Exec(r.Context(), `
			INSERT INTO recommendation_rules (
				id, account_id, controller_id, sensor_id, metric_type, operator, threshold_min, threshold_max,
				sustained_minutes, risk_level, action_recommendation, active, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, NOW(), NOW())
		`, id, accountID, controllerID, sensorID, rule.MetricType, rule.Operator, nilIfZero(rule.ThresholdMin), nilIfZero(rule.ThresholdMax), rule.SustainedMinutes, rule.RiskLevel, rule.ActionRecommendation)
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to store recommendation rule: %v", err), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "rules_generated": len(rules)})
}

func (h *AlertHandler) ListRecommendations(w http.ResponseWriter, r *http.Request) {
	accountID := GetAccountID(r).(uuid.UUID)

	rows, err := h.db.Query(r.Context(), `
		SELECT id, account_id, controller_id, sensor_id, metric_type, operator, threshold_min, threshold_max,
		       sustained_minutes, risk_level, action_recommendation, active, created_at, updated_at
		FROM recommendation_rules
		WHERE account_id = $1
		ORDER BY created_at DESC
	`, accountID)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var recommendations []models.RecommendationRule
	for rows.Next() {
		var rec models.RecommendationRule
		err := rows.Scan(&rec.ID, &rec.AccountID, &rec.ControllerID, &rec.SensorID, &rec.MetricType, &rec.Operator,
			&rec.ThresholdMin, &rec.ThresholdMax, &rec.SustainedMinutes, &rec.RiskLevel, &rec.ActionRecommendation,
			&rec.Active, &rec.CreatedAt, &rec.UpdatedAt)
		if err != nil {
			continue
		}
		recommendations = append(recommendations, rec)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(recommendations)
}

func (h *AlertHandler) ApplyRecommendation(w http.ResponseWriter, r *http.Request) {
	alertID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid alert id", http.StatusBadRequest)
		return
	}

	accountID := GetAccountID(r).(uuid.UUID)
	var alertAccountID uuid.UUID
	err = h.db.QueryRow(r.Context(), `SELECT account_id FROM alerts WHERE id = $1`, alertID).Scan(&alertAccountID)
	if err != nil {
		http.Error(w, "alert not found", http.StatusNotFound)
		return
	}
	if alertAccountID != accountID {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var recommendationText string
	err = h.db.QueryRow(r.Context(), `
		SELECT action_recommendation
		FROM recommendation_rules
		WHERE account_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, accountID).Scan(&recommendationText)
	if err != nil {
		http.Error(w, "no recommendation available", http.StatusNotFound)
		return
	}

	_, err = h.db.Exec(r.Context(), `
		UPDATE alerts
		SET message = $1,
		    acknowledged_at = COALESCE(acknowledged_at, NOW())
		WHERE id = $2
	`, recommendationText, alertID)
	if err != nil {
		http.Error(w, "failed to apply recommendation", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": recommendationText})
}

func nilIfZero(value float64) *float64 {
	if value == 0 {
		return nil
	}
	return &value
}
