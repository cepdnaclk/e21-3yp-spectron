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

type cropResponse struct {
	ID        string                `json:"id"`
	Name      string                `json:"name"`
	Varieties []cropVarietyResponse `json:"varieties"`
	Stages    []growthStageResponse `json:"stages"`
}

type cropVarietyResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type growthStageResponse struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	DaysAfterPlantMin *int    `json:"days_after_plant_min,omitempty"`
	DaysAfterPlantMax *int    `json:"days_after_plant_max,omitempty"`
	DisplayOrder      int     `json:"display_order"`
	VisualHint        *string `json:"visual_hint,omitempty"`
}

type cropInstanceResponse struct {
	ID                    string               `json:"id"`
	FieldID               string               `json:"field_id"`
	CropID                string               `json:"crop_id"`
	CropName              string               `json:"crop_name"`
	VarietyID             *string              `json:"variety_id,omitempty"`
	VarietyName           *string              `json:"variety_name,omitempty"`
	PlantingDate          *string              `json:"planting_date,omitempty"`
	PlantingDatePrecision string               `json:"planting_date_precision"`
	ExpectedHarvestDate   *string              `json:"expected_harvest_date,omitempty"`
	CurrentStage          *growthStageResponse `json:"current_stage,omitempty"`
	StageSource           string               `json:"stage_source"`
	StageConfidence       *float64             `json:"stage_confidence,omitempty"`
	StageEstimatedAt      *string              `json:"stage_estimated_at,omitempty"`
	StageConfirmedAt      *string              `json:"stage_confirmed_at,omitempty"`
	Active                bool                 `json:"active"`
	CreatedAt             string               `json:"created_at"`
	UpdatedAt             string               `json:"updated_at"`
}

type saveCropInstanceRequest struct {
	CropID                string  `json:"crop_id"`
	VarietyID             *string `json:"variety_id,omitempty"`
	PlantingDate          *string `json:"planting_date,omitempty"`
	PlantingDatePrecision string  `json:"planting_date_precision,omitempty"`
	ExpectedHarvestDate   *string `json:"expected_harvest_date,omitempty"`
}

type confirmGrowthStageRequest struct {
	StageID string `json:"stage_id"`
}

type parsedCropInstanceRequest struct {
	cropID                uuid.UUID
	varietyID             *uuid.UUID
	plantingDate          *time.Time
	plantingDatePrecision string
	expectedHarvestDate   *time.Time
}

func (h *FarmHandler) ListCrops(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, name
		FROM crops
		ORDER BY name
	`)
	if err != nil {
		http.Error(w, "failed to load crops", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	crops := make([]cropResponse, 0)
	cropIndexes := map[uuid.UUID]int{}
	for rows.Next() {
		var id uuid.UUID
		var crop cropResponse
		if err := rows.Scan(&id, &crop.Name); err != nil {
			http.Error(w, "failed to read crop", http.StatusInternalServerError)
			return
		}
		crop.ID = id.String()
		crop.Varieties = []cropVarietyResponse{}
		crop.Stages = []growthStageResponse{}
		cropIndexes[id] = len(crops)
		crops = append(crops, crop)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "failed to read crops", http.StatusInternalServerError)
		return
	}
	if len(crops) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"crops": crops})
		return
	}

	varietyRows, err := h.db.Query(r.Context(), `
		SELECT id, crop_id, name, description
		FROM varieties
		ORDER BY name
	`)
	if err != nil {
		http.Error(w, "failed to load crop varieties", http.StatusInternalServerError)
		return
	}
	defer varietyRows.Close()

	for varietyRows.Next() {
		var id uuid.UUID
		var cropID uuid.UUID
		var item cropVarietyResponse
		if err := varietyRows.Scan(&id, &cropID, &item.Name, &item.Description); err != nil {
			http.Error(w, "failed to read crop variety", http.StatusInternalServerError)
			return
		}
		index, exists := cropIndexes[cropID]
		if !exists {
			continue
		}
		item.ID = id.String()
		crops[index].Varieties = append(crops[index].Varieties, item)
	}
	if err := varietyRows.Err(); err != nil {
		http.Error(w, "failed to read crop varieties", http.StatusInternalServerError)
		return
	}

	stageRows, err := h.db.Query(r.Context(), `
		SELECT id, crop_id, stage_name, days_after_plant_min, days_after_plant_max, display_order, visual_hint
		FROM growth_stages
		ORDER BY crop_id, display_order, stage_name
	`)
	if err != nil {
		http.Error(w, "failed to load growth stages", http.StatusInternalServerError)
		return
	}
	defer stageRows.Close()

	for stageRows.Next() {
		var id uuid.UUID
		var cropID uuid.UUID
		var stage growthStageResponse
		if err := stageRows.Scan(&id, &cropID, &stage.Name, &stage.DaysAfterPlantMin, &stage.DaysAfterPlantMax, &stage.DisplayOrder, &stage.VisualHint); err != nil {
			http.Error(w, "failed to read growth stage", http.StatusInternalServerError)
			return
		}
		index, exists := cropIndexes[cropID]
		if !exists {
			continue
		}
		stage.ID = id.String()
		crops[index].Stages = append(crops[index].Stages, stage)
	}
	if err := stageRows.Err(); err != nil {
		http.Error(w, "failed to read growth stages", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"crops": crops})
}

func (h *FarmHandler) ListCropInstances(w http.ResponseWriter, r *http.Request) {
	_, fieldID, ok := h.requireFieldAccess(w, r, false)
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT
			ci.id,
			ci.field_id,
			ci.crop_id,
			c.name,
			ci.variety_id,
			v.name,
			ci.planting_date,
			ci.planting_date_precision,
			ci.expected_harvest_date,
			gs.id,
			gs.stage_name,
			gs.days_after_plant_min,
			gs.days_after_plant_max,
			gs.display_order,
			gs.visual_hint,
			ci.stage_source,
			ci.stage_confidence,
			ci.stage_estimated_at,
			ci.stage_confirmed_at,
			ci.active,
			ci.created_at,
			ci.updated_at
		FROM crop_instances ci
		JOIN crops c ON c.id = ci.crop_id
		LEFT JOIN varieties v ON v.id = ci.variety_id
		LEFT JOIN growth_stages gs ON gs.id = ci.current_stage_id
		WHERE ci.field_id = $1
		ORDER BY ci.active DESC, ci.created_at DESC
	`, fieldID)
	if err != nil {
		http.Error(w, "failed to load crop instances", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	instances := make([]cropInstanceResponse, 0)
	for rows.Next() {
		instance, err := scanCropInstanceResponse(rows)
		if err != nil {
			http.Error(w, "failed to read crop instance", http.StatusInternalServerError)
			return
		}
		instances = append(instances, instance)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "failed to read crop instances", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"crop_instances": instances})
}

func (h *FarmHandler) CreateCropInstance(w http.ResponseWriter, r *http.Request) {
	access, fieldID, ok := h.requireFieldAccess(w, r, true)
	if !ok {
		return
	}

	var req saveCropInstanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	parsed, err := h.validateCropInstanceRequest(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	currentStageID, confidence, estimatedAt, err := h.estimateGrowthStage(r.Context(), parsed.cropID, parsed.plantingDate)
	if err != nil {
		http.Error(w, "failed to estimate growth stage", http.StatusInternalServerError)
		return
	}

	cropInstanceID := uuid.New()
	if _, err := h.db.Exec(r.Context(), `
		INSERT INTO crop_instances (
			id,
			field_id,
			crop_id,
			variety_id,
			planting_date,
			planting_date_precision,
			expected_harvest_date,
			current_stage_id,
			stage_source,
			stage_confidence,
			stage_estimated_at,
			active,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'automatic', $9, $10, true, NOW(), NOW())
	`, cropInstanceID, fieldID, parsed.cropID, parsed.varietyID, parsed.plantingDate, parsed.plantingDatePrecision, parsed.expectedHarvestDate, currentStageID, confidence, estimatedAt); err != nil {
		http.Error(w, "failed to create crop instance", http.StatusInternalServerError)
		return
	}

	instance, err := h.loadCropInstanceResponse(r.Context(), h.db, cropInstanceID)
	if err != nil {
		http.Error(w, "failed to load crop instance", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"farm_id":       access.farmID.String(),
		"crop_instance": instance,
	})
}

func (h *FarmHandler) ConfirmGrowthStage(w http.ResponseWriter, r *http.Request) {
	access, cropInstanceID, ok := h.requireCropInstanceAccess(w, r, true)
	if !ok {
		return
	}

	var req confirmGrowthStageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	stageID, err := uuid.Parse(strings.TrimSpace(req.StageID))
	if err != nil {
		http.Error(w, "valid stage is required", http.StatusBadRequest)
		return
	}

	var cropID uuid.UUID
	if err := h.db.QueryRow(r.Context(), `
		SELECT crop_id
		FROM crop_instances
		WHERE id = $1
	`, cropInstanceID).Scan(&cropID); err != nil {
		http.Error(w, "failed to load crop instance", http.StatusInternalServerError)
		return
	}

	var exists bool
	if err := h.db.QueryRow(r.Context(), `
		SELECT EXISTS (
			SELECT 1
			FROM growth_stages
			WHERE id = $1
			  AND crop_id = $2
		)
	`, stageID, cropID).Scan(&exists); err != nil {
		http.Error(w, "failed to validate growth stage", http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "stage does not belong to this crop", http.StatusBadRequest)
		return
	}

	if _, err := h.db.Exec(r.Context(), `
		UPDATE crop_instances
		SET current_stage_id = $2,
		    stage_source = 'owner_confirmed',
		    stage_confidence = 1,
		    stage_confirmed_at = NOW(),
		    stage_confirmed_by_user_id = $3,
		    updated_at = NOW()
		WHERE id = $1
	`, cropInstanceID, stageID, access.userID); err != nil {
		http.Error(w, "failed to confirm growth stage", http.StatusInternalServerError)
		return
	}

	instance, err := h.loadCropInstanceResponse(r.Context(), h.db, cropInstanceID)
	if err != nil {
		http.Error(w, "failed to load crop instance", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"crop_instance": instance})
}

func (h *FarmHandler) validateCropInstanceRequest(ctx context.Context, req saveCropInstanceRequest) (parsedCropInstanceRequest, error) {
	cropID, err := uuid.Parse(strings.TrimSpace(req.CropID))
	if err != nil {
		return parsedCropInstanceRequest{}, errors.New("valid crop is required")
	}

	var cropExists bool
	if err := h.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM crops WHERE id = $1)`, cropID).Scan(&cropExists); err != nil {
		return parsedCropInstanceRequest{}, err
	}
	if !cropExists {
		return parsedCropInstanceRequest{}, errors.New("crop not found")
	}

	precision := strings.ToLower(strings.TrimSpace(req.PlantingDatePrecision))
	if precision == "" {
		precision = "exact"
	}
	if precision != "exact" && precision != "approximate" && precision != "unknown" {
		return parsedCropInstanceRequest{}, errors.New("planting date precision is invalid")
	}

	var plantingDate *time.Time
	if req.PlantingDate != nil && strings.TrimSpace(*req.PlantingDate) != "" {
		parsed, err := parseAPIDate(*req.PlantingDate)
		if err != nil {
			return parsedCropInstanceRequest{}, errors.New("planting date must use YYYY-MM-DD")
		}
		if parsed.After(todayUTC()) {
			return parsedCropInstanceRequest{}, errors.New("planting date cannot be in the future")
		}
		plantingDate = &parsed
	} else if precision != "unknown" {
		return parsedCropInstanceRequest{}, errors.New("planting date is required unless precision is unknown")
	}
	if precision == "unknown" && plantingDate != nil {
		return parsedCropInstanceRequest{}, errors.New("unknown planting date cannot include a date")
	}

	var expectedHarvestDate *time.Time
	if req.ExpectedHarvestDate != nil && strings.TrimSpace(*req.ExpectedHarvestDate) != "" {
		parsed, err := parseAPIDate(*req.ExpectedHarvestDate)
		if err != nil {
			return parsedCropInstanceRequest{}, errors.New("expected harvest date must use YYYY-MM-DD")
		}
		if plantingDate != nil && parsed.Before(*plantingDate) {
			return parsedCropInstanceRequest{}, errors.New("expected harvest date cannot be before planting date")
		}
		expectedHarvestDate = &parsed
	}

	var varietyID *uuid.UUID
	if req.VarietyID != nil && strings.TrimSpace(*req.VarietyID) != "" {
		parsed, err := uuid.Parse(strings.TrimSpace(*req.VarietyID))
		if err != nil {
			return parsedCropInstanceRequest{}, errors.New("variety is invalid")
		}
		var belongsToCrop bool
		if err := h.db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM varieties
				WHERE id = $1
				  AND crop_id = $2
			)
		`, parsed, cropID).Scan(&belongsToCrop); err != nil {
			return parsedCropInstanceRequest{}, err
		}
		if !belongsToCrop {
			return parsedCropInstanceRequest{}, errors.New("variety does not belong to this crop")
		}
		varietyID = &parsed
	}

	return parsedCropInstanceRequest{
		cropID:                cropID,
		varietyID:             varietyID,
		plantingDate:          plantingDate,
		plantingDatePrecision: precision,
		expectedHarvestDate:   expectedHarvestDate,
	}, nil
}

func (h *FarmHandler) estimateGrowthStage(ctx context.Context, cropID uuid.UUID, plantingDate *time.Time) (*uuid.UUID, *float64, *time.Time, error) {
	if plantingDate == nil {
		return nil, nil, nil, nil
	}

	daysAfterPlanting := int(todayUTC().Sub(*plantingDate).Hours() / 24)
	var stageID uuid.UUID
	err := h.db.QueryRow(ctx, `
		SELECT id
		FROM growth_stages
		WHERE crop_id = $1
		  AND (days_after_plant_min IS NULL OR days_after_plant_min <= $2)
		  AND (days_after_plant_max IS NULL OR days_after_plant_max >= $2)
		ORDER BY display_order
		LIMIT 1
	`, cropID, daysAfterPlanting).Scan(&stageID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = h.db.QueryRow(ctx, `
			SELECT id
			FROM growth_stages
			WHERE crop_id = $1
			ORDER BY
				CASE WHEN days_after_plant_min IS NULL OR days_after_plant_min <= $2 THEN 0 ELSE 1 END,
				display_order DESC
			LIMIT 1
		`, cropID, daysAfterPlanting).Scan(&stageID)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, nil, nil
		}
		return nil, nil, nil, err
	}

	confidence := 0.85
	estimatedAt := time.Now().UTC()
	return &stageID, &confidence, &estimatedAt, nil
}

func (h *FarmHandler) requireFieldAccess(w http.ResponseWriter, r *http.Request, ownerOnly bool) (farmAccess, uuid.UUID, bool) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return farmAccess{}, uuid.Nil, false
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return farmAccess{}, uuid.Nil, false
	}

	fieldID, err := uuid.Parse(chi.URLParam(r, "fieldId"))
	if err != nil {
		http.Error(w, "invalid field id", http.StatusBadRequest)
		return farmAccess{}, uuid.Nil, false
	}

	var farmID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT farm_id
		FROM fields
		WHERE id = $1
		  AND archived_at IS NULL
	`, fieldID).Scan(&farmID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "field not found", http.StatusNotFound)
			return farmAccess{}, uuid.Nil, false
		}
		http.Error(w, "failed to verify field access", http.StatusInternalServerError)
		return farmAccess{}, uuid.Nil, false
	}

	access, ok := h.requireFarmAccessByID(w, r, farmID, userID, ownerOnly)
	return access, fieldID, ok
}

func (h *FarmHandler) requireCropInstanceAccess(w http.ResponseWriter, r *http.Request, ownerOnly bool) (farmAccess, uuid.UUID, bool) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return farmAccess{}, uuid.Nil, false
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return farmAccess{}, uuid.Nil, false
	}

	cropInstanceID, err := uuid.Parse(chi.URLParam(r, "cropInstanceId"))
	if err != nil {
		http.Error(w, "invalid crop instance id", http.StatusBadRequest)
		return farmAccess{}, uuid.Nil, false
	}

	var farmID uuid.UUID
	err = h.db.QueryRow(r.Context(), `
		SELECT f.farm_id
		FROM crop_instances ci
		JOIN fields f ON f.id = ci.field_id
		WHERE ci.id = $1
		  AND f.archived_at IS NULL
	`, cropInstanceID).Scan(&farmID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "crop instance not found", http.StatusNotFound)
			return farmAccess{}, uuid.Nil, false
		}
		http.Error(w, "failed to verify crop access", http.StatusInternalServerError)
		return farmAccess{}, uuid.Nil, false
	}

	access, ok := h.requireFarmAccessByID(w, r, farmID, userID, ownerOnly)
	return access, cropInstanceID, ok
}

func (h *FarmHandler) requireFarmAccessByID(w http.ResponseWriter, r *http.Request, farmID uuid.UUID, userID uuid.UUID, ownerOnly bool) (farmAccess, bool) {
	var role string
	err := h.db.QueryRow(r.Context(), `
		SELECT role
		FROM farm_access
		WHERE farm_id = $1
		  AND user_id = $2
		  AND revoked_at IS NULL
	`, farmID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "farm access required", http.StatusForbidden)
			return farmAccess{}, false
		}
		http.Error(w, "failed to verify farm access", http.StatusInternalServerError)
		return farmAccess{}, false
	}
	if ownerOnly && role != "owner" {
		http.Error(w, "farm owner access required", http.StatusForbidden)
		return farmAccess{}, false
	}
	return farmAccess{farmID: farmID, userID: userID, role: role}, true
}

func (h *FarmHandler) loadCropInstanceResponse(ctx context.Context, q queryRower, cropInstanceID uuid.UUID) (cropInstanceResponse, error) {
	return scanCropInstanceResponse(q.QueryRow(ctx, `
		SELECT
			ci.id,
			ci.field_id,
			ci.crop_id,
			c.name,
			ci.variety_id,
			v.name,
			ci.planting_date,
			ci.planting_date_precision,
			ci.expected_harvest_date,
			gs.id,
			gs.stage_name,
			gs.days_after_plant_min,
			gs.days_after_plant_max,
			gs.display_order,
			gs.visual_hint,
			ci.stage_source,
			ci.stage_confidence,
			ci.stage_estimated_at,
			ci.stage_confirmed_at,
			ci.active,
			ci.created_at,
			ci.updated_at
		FROM crop_instances ci
		JOIN crops c ON c.id = ci.crop_id
		LEFT JOIN varieties v ON v.id = ci.variety_id
		LEFT JOIN growth_stages gs ON gs.id = ci.current_stage_id
		WHERE ci.id = $1
	`, cropInstanceID))
}

func scanCropInstanceResponse(row farmScanner) (cropInstanceResponse, error) {
	var id uuid.UUID
	var fieldID uuid.UUID
	var cropID uuid.UUID
	var varietyID *uuid.UUID
	var plantingDate *time.Time
	var expectedHarvestDate *time.Time
	var stageID *uuid.UUID
	var stageName *string
	var daysAfterPlantMin *int
	var daysAfterPlantMax *int
	var displayOrder *int
	var visualHint *string
	var stageEstimatedAt *time.Time
	var stageConfirmedAt *time.Time
	var createdAt time.Time
	var updatedAt time.Time
	var instance cropInstanceResponse

	if err := row.Scan(
		&id,
		&fieldID,
		&cropID,
		&instance.CropName,
		&varietyID,
		&instance.VarietyName,
		&plantingDate,
		&instance.PlantingDatePrecision,
		&expectedHarvestDate,
		&stageID,
		&stageName,
		&daysAfterPlantMin,
		&daysAfterPlantMax,
		&displayOrder,
		&visualHint,
		&instance.StageSource,
		&instance.StageConfidence,
		&stageEstimatedAt,
		&stageConfirmedAt,
		&instance.Active,
		&createdAt,
		&updatedAt,
	); err != nil {
		return cropInstanceResponse{}, err
	}

	instance.ID = id.String()
	instance.FieldID = fieldID.String()
	instance.CropID = cropID.String()
	if varietyID != nil {
		value := varietyID.String()
		instance.VarietyID = &value
	}
	if plantingDate != nil {
		value := formatAPIDate(*plantingDate)
		instance.PlantingDate = &value
	}
	if expectedHarvestDate != nil {
		value := formatAPIDate(*expectedHarvestDate)
		instance.ExpectedHarvestDate = &value
	}
	if stageEstimatedAt != nil {
		value := stageEstimatedAt.Format(time.RFC3339)
		instance.StageEstimatedAt = &value
	}
	if stageConfirmedAt != nil {
		value := stageConfirmedAt.Format(time.RFC3339)
		instance.StageConfirmedAt = &value
	}
	if stageID != nil && stageName != nil {
		order := 0
		if displayOrder != nil {
			order = *displayOrder
		}
		instance.CurrentStage = &growthStageResponse{
			ID:                stageID.String(),
			Name:              *stageName,
			DaysAfterPlantMin: daysAfterPlantMin,
			DaysAfterPlantMax: daysAfterPlantMax,
			DisplayOrder:      order,
			VisualHint:        visualHint,
		}
	}
	instance.CreatedAt = createdAt.Format(time.RFC3339)
	instance.UpdatedAt = updatedAt.Format(time.RFC3339)
	return instance, nil
}

func parseAPIDate(value string) (time.Time, error) {
	parsed, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

func formatAPIDate(value time.Time) string {
	return value.UTC().Format("2006-01-02")
}

func todayUTC() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
