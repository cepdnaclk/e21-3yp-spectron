package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type farmControllerResponse struct {
	ID                 string   `json:"id"`
	FarmID             string   `json:"farm_id"`
	LegacyControllerID *string  `json:"legacy_controller_id,omitempty"`
	SerialNumber       string   `json:"serial_number"`
	Model              *string  `json:"model,omitempty"`
	Status             string   `json:"status"`
	LastSeen           *string  `json:"last_seen,omitempty"`
	FieldIDs           []string `json:"field_ids"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

type sensorBaseAssignmentResponse struct {
	ID             string  `json:"id"`
	BaseID         string  `json:"base_id"`
	FieldID        *string `json:"field_id,omitempty"`
	FieldName      *string `json:"field_name,omitempty"`
	MonitoringZone *string `json:"monitoring_zone,omitempty"`
	AssignedAt     string  `json:"assigned_at"`
	UnassignedAt   *string `json:"unassigned_at,omitempty"`
}

type sensorBaseResponse struct {
	ID                string                        `json:"id"`
	GatewayID         string                        `json:"gateway_id"`
	SerialNumber      string                        `json:"serial_number"`
	Label             *string                       `json:"label,omitempty"`
	Status            string                        `json:"status"`
	LastSeen          *string                       `json:"last_seen,omitempty"`
	CurrentAssignment *sensorBaseAssignmentResponse `json:"current_assignment,omitempty"`
	CreatedAt         string                        `json:"created_at"`
	UpdatedAt         string                        `json:"updated_at"`
}

type attachFarmControllerRequest struct {
	ControllerID string  `json:"controller_id"`
	Model        *string `json:"model,omitempty"`
}

type createSensorBaseRequest struct {
	GatewayID    string  `json:"gateway_id"`
	SerialNumber string  `json:"serial_number"`
	Label        *string `json:"label,omitempty"`
}

type assignSensorBaseRequest struct {
	FieldID        *string `json:"field_id,omitempty"`
	MonitoringZone *string `json:"monitoring_zone,omitempty"`
}

func (h *FarmHandler) ListFarmControllers(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}

	controllers, err := h.loadFarmControllers(r.Context(), access.farmID)
	if err != nil {
		http.Error(w, "failed to load farm controllers", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"controllers": controllers})
}

func (h *FarmHandler) AttachFarmController(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, true)
	if !ok {
		return
	}

	var req attachFarmControllerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	controllerRef := strings.TrimSpace(req.ControllerID)
	if controllerRef == "" {
		http.Error(w, "controller is required", http.StatusBadRequest)
		return
	}

	var legacyID uuid.UUID
	var serialNumber string
	var status string
	err := h.db.QueryRow(r.Context(), `
		SELECT id, COALESCE(controller_uid, hw_id), operational_status
		FROM controllers
		WHERE (id::text = $1 OR UPPER(controller_uid) = UPPER($1) OR UPPER(hw_id) = UPPER($1))
		  AND owner_user_id = $2
		  AND claim_status = 'CLAIMED'
	`, controllerRef, access.userID).Scan(&legacyID, &serialNumber, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "owned paired controller not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to verify controller", http.StatusInternalServerError)
		return
	}

	model := cleanOptionalString(req.Model)
	gatewayID := uuid.New()
	_, err = h.db.Exec(r.Context(), `
		INSERT INTO gateways (
			id,
			farm_id,
			legacy_controller_id,
			serial_number,
			model,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		ON CONFLICT (legacy_controller_id) DO UPDATE
		SET farm_id = EXCLUDED.farm_id,
		    serial_number = EXCLUDED.serial_number,
		    model = COALESCE(EXCLUDED.model, gateways.model),
		    status = EXCLUDED.status,
		    updated_at = NOW()
	`, gatewayID, access.farmID, legacyID, serialNumber, model, normalizeGatewayStatus(status))
	if err != nil {
		http.Error(w, "failed to attach controller", http.StatusInternalServerError)
		return
	}

	controllers, err := h.loadFarmControllers(r.Context(), access.farmID)
	if err != nil {
		http.Error(w, "failed to load farm controllers", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"controllers": controllers})
}

func (h *FarmHandler) ListSensorBases(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}

	bases, err := h.loadFarmSensorBases(r.Context(), access.farmID)
	if err != nil {
		http.Error(w, "failed to load sensor bases", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"sensor_bases": bases})
}

func (h *FarmHandler) CreateSensorBase(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, true)
	if !ok {
		return
	}

	var req createSensorBaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	gatewayID, err := uuid.Parse(strings.TrimSpace(req.GatewayID))
	if err != nil {
		http.Error(w, "valid controller is required", http.StatusBadRequest)
		return
	}
	serialNumber := strings.ToUpper(strings.TrimSpace(req.SerialNumber))
	if serialNumber == "" {
		http.Error(w, "base serial is required", http.StatusBadRequest)
		return
	}
	if len(serialNumber) > 80 {
		http.Error(w, "base serial is too long", http.StatusBadRequest)
		return
	}
	label := cleanOptionalString(req.Label)

	if !h.gatewayBelongsToFarm(r.Context(), gatewayID, access.farmID) {
		http.Error(w, "controller not found", http.StatusNotFound)
		return
	}

	baseID := uuid.New()
	if _, err := h.db.Exec(r.Context(), `
		INSERT INTO sensor_bases (id, gateway_id, serial_number, label, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 'waiting_setup', NOW(), NOW())
	`, baseID, gatewayID, serialNumber, label); err != nil {
		http.Error(w, "failed to create sensor base", http.StatusInternalServerError)
		return
	}

	base, err := h.loadSensorBaseResponse(r.Context(), baseID)
	if err != nil {
		http.Error(w, "failed to load sensor base", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, base)
}

func (h *FarmHandler) AssignSensorBase(w http.ResponseWriter, r *http.Request) {
	access, baseID, ok := h.requireSensorBaseAccess(w, r, true)
	if !ok {
		return
	}

	var req assignSensorBaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	var fieldID *uuid.UUID
	if req.FieldID != nil && strings.TrimSpace(*req.FieldID) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(*req.FieldID))
		if err != nil {
			http.Error(w, "valid field is required", http.StatusBadRequest)
			return
		}
		if !h.fieldBelongsToFarm(r.Context(), parsed, access.farmID) {
			http.Error(w, "field not found", http.StatusNotFound)
			return
		}
		fieldID = &parsed
	}
	zone := cleanOptionalString(req.MonitoringZone)
	if fieldID == nil && zone == nil {
		http.Error(w, "field or zone is required", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "failed to start assignment", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `
		UPDATE sensor_base_assignments
		SET unassigned_at = NOW()
		WHERE base_id = $1
		  AND unassigned_at IS NULL
	`, baseID); err != nil {
		http.Error(w, "failed to close previous assignment", http.StatusInternalServerError)
		return
	}

	assignmentID := uuid.New()
	if _, err := tx.Exec(r.Context(), `
		INSERT INTO sensor_base_assignments (
			id,
			base_id,
			field_id,
			monitoring_zone,
			assigned_at,
			assigned_by_user_id
		)
		VALUES ($1, $2, $3, $4, NOW(), $5)
	`, assignmentID, baseID, fieldID, zone, access.userID); err != nil {
		http.Error(w, "failed to assign sensor base", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(r.Context(), `
		UPDATE sensor_bases
		SET status = 'live',
		    updated_at = NOW()
		WHERE id = $1
	`, baseID); err != nil {
		http.Error(w, "failed to update sensor base", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to finish assignment", http.StatusInternalServerError)
		return
	}

	base, err := h.loadSensorBaseResponse(r.Context(), baseID)
	if err != nil {
		http.Error(w, "failed to load sensor base", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, base)
}

func (h *FarmHandler) ListSensorBaseAssignments(w http.ResponseWriter, r *http.Request) {
	_, baseID, ok := h.requireSensorBaseAccess(w, r, false)
	if !ok {
		return
	}

	assignments, err := h.loadSensorBaseAssignments(r.Context(), baseID, false)
	if err != nil {
		http.Error(w, "failed to load assignments", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"assignments": assignments})
}

func (h *FarmHandler) requireSensorBaseAccess(w http.ResponseWriter, r *http.Request, ownerOnly bool) (farmAccess, uuid.UUID, bool) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return farmAccess{}, uuid.Nil, false
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return farmAccess{}, uuid.Nil, false
	}

	baseID, err := uuid.Parse(chi.URLParam(r, "baseId"))
	if err != nil {
		http.Error(w, "invalid sensor base id", http.StatusBadRequest)
		return farmAccess{}, uuid.Nil, false
	}

	var farmID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT g.farm_id
		FROM sensor_bases sb
		JOIN gateways g ON g.id = sb.gateway_id
		WHERE sb.id = $1
	`, baseID).Scan(&farmID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "sensor base not found", http.StatusNotFound)
			return farmAccess{}, uuid.Nil, false
		}
		http.Error(w, "failed to verify sensor base access", http.StatusInternalServerError)
		return farmAccess{}, uuid.Nil, false
	}

	access, ok := h.requireFarmAccessByID(w, r, farmID, userID, ownerOnly)
	return access, baseID, ok
}

func (h *FarmHandler) loadFarmControllers(ctx context.Context, farmID uuid.UUID) ([]farmControllerResponse, error) {
	rows, err := h.db.Query(ctx, `
		SELECT
			g.id,
			g.farm_id,
			g.legacy_controller_id,
			g.serial_number,
			g.model,
			g.status,
			g.last_seen,
			g.created_at,
			g.updated_at,
			COALESCE(
				ARRAY_AGG(DISTINCT sba.field_id) FILTER (WHERE sba.field_id IS NOT NULL AND sba.unassigned_at IS NULL),
				'{}'::uuid[]
			)
		FROM gateways g
		LEFT JOIN sensor_bases sb ON sb.gateway_id = g.id
		LEFT JOIN sensor_base_assignments sba ON sba.base_id = sb.id AND sba.unassigned_at IS NULL
		WHERE g.farm_id = $1
		GROUP BY g.id
		ORDER BY g.created_at DESC
	`, farmID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	controllers := make([]farmControllerResponse, 0)
	for rows.Next() {
		var item farmControllerResponse
		var id uuid.UUID
		var scannedFarmID uuid.UUID
		var legacyID *uuid.UUID
		var lastSeen *time.Time
		var createdAt time.Time
		var updatedAt time.Time
		var fieldIDs []uuid.UUID
		if err := rows.Scan(
			&id,
			&scannedFarmID,
			&legacyID,
			&item.SerialNumber,
			&item.Model,
			&item.Status,
			&lastSeen,
			&createdAt,
			&updatedAt,
			&fieldIDs,
		); err != nil {
			return nil, err
		}
		item.ID = id.String()
		item.FarmID = scannedFarmID.String()
		if legacyID != nil {
			value := legacyID.String()
			item.LegacyControllerID = &value
		}
		if lastSeen != nil {
			value := lastSeen.Format(time.RFC3339)
			item.LastSeen = &value
		}
		item.CreatedAt = createdAt.Format(time.RFC3339)
		item.UpdatedAt = updatedAt.Format(time.RFC3339)
		item.FieldIDs = make([]string, 0, len(fieldIDs))
		for _, fieldID := range fieldIDs {
			item.FieldIDs = append(item.FieldIDs, fieldID.String())
		}
		controllers = append(controllers, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return controllers, nil
}

func (h *FarmHandler) loadFarmSensorBases(ctx context.Context, farmID uuid.UUID) ([]sensorBaseResponse, error) {
	rows, err := h.db.Query(ctx, `
		SELECT sb.id
		FROM sensor_bases sb
		JOIN gateways g ON g.id = sb.gateway_id
		WHERE g.farm_id = $1
		ORDER BY sb.created_at DESC
	`, farmID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bases := make([]sensorBaseResponse, 0)
	for rows.Next() {
		var baseID uuid.UUID
		if err := rows.Scan(&baseID); err != nil {
			return nil, err
		}
		base, err := h.loadSensorBaseResponse(ctx, baseID)
		if err != nil {
			return nil, err
		}
		bases = append(bases, base)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return bases, nil
}

func (h *FarmHandler) loadSensorBaseResponse(ctx context.Context, baseID uuid.UUID) (sensorBaseResponse, error) {
	var base sensorBaseResponse
	var id uuid.UUID
	var gatewayID uuid.UUID
	var lastSeen *time.Time
	var createdAt time.Time
	var updatedAt time.Time
	if err := h.db.QueryRow(ctx, `
		SELECT id, gateway_id, serial_number, label, status, last_seen, created_at, updated_at
		FROM sensor_bases
		WHERE id = $1
	`, baseID).Scan(&id, &gatewayID, &base.SerialNumber, &base.Label, &base.Status, &lastSeen, &createdAt, &updatedAt); err != nil {
		return sensorBaseResponse{}, err
	}
	base.ID = id.String()
	base.GatewayID = gatewayID.String()
	if lastSeen != nil {
		value := lastSeen.Format(time.RFC3339)
		base.LastSeen = &value
	}
	base.CreatedAt = createdAt.Format(time.RFC3339)
	base.UpdatedAt = updatedAt.Format(time.RFC3339)

	assignments, err := h.loadSensorBaseAssignments(ctx, baseID, true)
	if err != nil {
		return sensorBaseResponse{}, err
	}
	if len(assignments) > 0 {
		base.CurrentAssignment = &assignments[0]
	}
	return base, nil
}

func (h *FarmHandler) loadSensorBaseAssignments(ctx context.Context, baseID uuid.UUID, activeOnly bool) ([]sensorBaseAssignmentResponse, error) {
	activeClause := ""
	if activeOnly {
		activeClause = "AND sba.unassigned_at IS NULL"
	}
	rows, err := h.db.Query(ctx, `
		SELECT
			sba.id,
			sba.base_id,
			sba.field_id,
			f.name,
			sba.monitoring_zone,
			sba.assigned_at,
			sba.unassigned_at
		FROM sensor_base_assignments sba
		LEFT JOIN fields f ON f.id = sba.field_id
		WHERE sba.base_id = $1
		`+activeClause+`
		ORDER BY sba.assigned_at DESC
	`, baseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assignments := make([]sensorBaseAssignmentResponse, 0)
	for rows.Next() {
		var item sensorBaseAssignmentResponse
		var id uuid.UUID
		var scannedBaseID uuid.UUID
		var fieldID *uuid.UUID
		var assignedAt time.Time
		var unassignedAt *time.Time
		if err := rows.Scan(&id, &scannedBaseID, &fieldID, &item.FieldName, &item.MonitoringZone, &assignedAt, &unassignedAt); err != nil {
			return nil, err
		}
		item.ID = id.String()
		item.BaseID = scannedBaseID.String()
		if fieldID != nil {
			value := fieldID.String()
			item.FieldID = &value
		}
		item.AssignedAt = assignedAt.Format(time.RFC3339)
		if unassignedAt != nil {
			value := unassignedAt.Format(time.RFC3339)
			item.UnassignedAt = &value
		}
		assignments = append(assignments, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return assignments, nil
}

func (h *FarmHandler) gatewayBelongsToFarm(ctx context.Context, gatewayID uuid.UUID, farmID uuid.UUID) bool {
	var exists bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM gateways WHERE id = $1 AND farm_id = $2
		)
	`, gatewayID, farmID).Scan(&exists)
	return err == nil && exists
}

func (h *FarmHandler) fieldBelongsToFarm(ctx context.Context, fieldID uuid.UUID, farmID uuid.UUID) bool {
	var exists bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM fields WHERE id = $1 AND farm_id = $2 AND archived_at IS NULL
		)
	`, fieldID, farmID).Scan(&exists)
	return err == nil && exists
}

func cleanOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeGatewayStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "ONLINE":
		return "online"
	case "ERROR":
		return "error"
	case "PENDING_CONFIG":
		return "pending_setup"
	default:
		return "offline"
	}
}
