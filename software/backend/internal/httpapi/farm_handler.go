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
	"github.com/jackc/pgx/v5/pgxpool"
)

type FarmHandler struct {
	db *pgxpool.Pool
}

func NewFarmHandler(db *pgxpool.Pool) *FarmHandler {
	return &FarmHandler{db: db}
}

type farmResponse struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Area      *float64 `json:"area,omitempty"`
	Role      string   `json:"role"`
	CreatedAt string   `json:"created_at"`
	UpdatedAt string   `json:"updated_at"`
}

type fieldResponse struct {
	ID           string           `json:"id"`
	FarmID       string           `json:"farm_id"`
	Name         string           `json:"name"`
	Latitude     *float64         `json:"latitude,omitempty"`
	Longitude    *float64         `json:"longitude,omitempty"`
	Area         *float64         `json:"area,omitempty"`
	BoundaryJSON *json.RawMessage `json:"boundary_json,omitempty"`
	CreatedAt    string           `json:"created_at"`
	UpdatedAt    string           `json:"updated_at"`
}

type saveFarmRequest struct {
	Name      string   `json:"name"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Area      *float64 `json:"area,omitempty"`
}

type saveFieldRequest struct {
	Name         string           `json:"name"`
	Latitude     *float64         `json:"latitude,omitempty"`
	Longitude    *float64         `json:"longitude,omitempty"`
	Area         *float64         `json:"area,omitempty"`
	BoundaryJSON *json.RawMessage `json:"boundary_json,omitempty"`
}

type farmAccess struct {
	farmID uuid.UUID
	userID uuid.UUID
	role   string
}

func (h *FarmHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT
			f.id,
			f.name,
			f.latitude,
			f.longitude,
			f.area,
			fa.role,
			f.created_at,
			f.updated_at
		FROM farm_access fa
		JOIN farms f ON f.id = fa.farm_id
		WHERE fa.user_id = $1
		  AND fa.revoked_at IS NULL
		  AND f.archived_at IS NULL
		ORDER BY f.created_at DESC
	`, userID)
	if err != nil {
		http.Error(w, "failed to load farms", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	farms := make([]farmResponse, 0)
	for rows.Next() {
		farm, err := scanFarmResponse(rows)
		if err != nil {
			http.Error(w, "failed to read farm", http.StatusInternalServerError)
			return
		}
		farms = append(farms, farm)
	}

	writeJSON(w, http.StatusOK, map[string]any{"farms": farms})
}

func (h *FarmHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return
	}

	var req saveFarmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := validateFarmRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		http.Error(w, "failed to start farm creation", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	farmID := uuid.New()
	if _, err := tx.Exec(r.Context(), `
		INSERT INTO farms (id, name, latitude, longitude, area, created_by_user_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	`, farmID, strings.TrimSpace(req.Name), req.Latitude, req.Longitude, req.Area, userID); err != nil {
		http.Error(w, "failed to create farm", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(r.Context(), `
		INSERT INTO farm_access (farm_id, user_id, role, added_at)
		VALUES ($1, $2, 'owner', NOW())
	`, farmID, userID); err != nil {
		http.Error(w, "failed to create farm owner access", http.StatusInternalServerError)
		return
	}

	farm, err := h.loadFarmResponse(r.Context(), tx, farmID, userID)
	if err != nil {
		http.Error(w, "failed to load created farm", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "failed to finish farm creation", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, farm)
}

func (h *FarmHandler) Get(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}

	farm, err := h.loadFarmResponse(r.Context(), h.db, access.farmID, access.userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "farm not found", http.StatusNotFound)
			return
		}
		http.Error(w, "failed to load farm", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, farm)
}

func (h *FarmHandler) Update(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, true)
	if !ok {
		return
	}

	var req saveFarmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := validateFarmRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	result, err := h.db.Exec(r.Context(), `
		UPDATE farms
		SET name = $2,
		    latitude = $3,
		    longitude = $4,
		    area = $5,
		    updated_at = NOW()
		WHERE id = $1
		  AND archived_at IS NULL
	`, access.farmID, strings.TrimSpace(req.Name), req.Latitude, req.Longitude, req.Area)
	if err != nil {
		http.Error(w, "failed to update farm", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		http.Error(w, "farm not found", http.StatusNotFound)
		return
	}

	farm, err := h.loadFarmResponse(r.Context(), h.db, access.farmID, access.userID)
	if err != nil {
		http.Error(w, "failed to load updated farm", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, farm)
}

func (h *FarmHandler) ListFields(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, false)
	if !ok {
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, farm_id, name, latitude, longitude, area, boundary_json, created_at, updated_at
		FROM fields
		WHERE farm_id = $1
		  AND archived_at IS NULL
		ORDER BY created_at DESC
	`, access.farmID)
	if err != nil {
		http.Error(w, "failed to load fields", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	fields := make([]fieldResponse, 0)
	for rows.Next() {
		field, err := scanFieldResponse(rows)
		if err != nil {
			http.Error(w, "failed to read field", http.StatusInternalServerError)
			return
		}
		fields = append(fields, field)
	}

	writeJSON(w, http.StatusOK, map[string]any{"fields": fields})
}

func (h *FarmHandler) CreateField(w http.ResponseWriter, r *http.Request) {
	access, ok := h.requireFarmAccess(w, r, true)
	if !ok {
		return
	}

	var req saveFieldRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := validateFieldRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fieldID := uuid.New()
	var boundary any
	if req.BoundaryJSON != nil && len(*req.BoundaryJSON) > 0 {
		boundary = *req.BoundaryJSON
	}

	if _, err := h.db.Exec(r.Context(), `
		INSERT INTO fields (id, farm_id, name, latitude, longitude, area, boundary_json, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
	`, fieldID, access.farmID, strings.TrimSpace(req.Name), req.Latitude, req.Longitude, req.Area, boundary); err != nil {
		http.Error(w, "failed to create field", http.StatusInternalServerError)
		return
	}

	field, err := h.loadFieldResponse(r.Context(), h.db, fieldID)
	if err != nil {
		http.Error(w, "failed to load created field", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, field)
}

func (h *FarmHandler) ensureCustomerAccount(w http.ResponseWriter, r *http.Request, userID uuid.UUID) bool {
	var accountType string
	var status string
	if err := h.db.QueryRow(r.Context(), `
		SELECT account_type, status
		FROM users
		WHERE id = $1
	`, userID).Scan(&accountType, &status); err != nil {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return false
	}
	if accountType == "ADMIN" {
		http.Error(w, "admin accounts cannot access customer farms", http.StatusForbidden)
		return false
	}
	if status != "ACTIVE" {
		http.Error(w, "active customer account required", http.StatusForbidden)
		return false
	}
	return true
}

func (h *FarmHandler) requireFarmAccess(w http.ResponseWriter, r *http.Request, ownerOnly bool) (farmAccess, bool) {
	userID, ok := GetUserID(r).(uuid.UUID)
	if !ok {
		http.Error(w, "missing user context", http.StatusUnauthorized)
		return farmAccess{}, false
	}
	if !h.ensureCustomerAccount(w, r, userID) {
		return farmAccess{}, false
	}

	farmID, err := uuid.Parse(chi.URLParam(r, "farmId"))
	if err != nil {
		http.Error(w, "invalid farm id", http.StatusBadRequest)
		return farmAccess{}, false
	}

	var role string
	err = h.db.QueryRow(r.Context(), `
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

func (h *FarmHandler) loadFarmResponse(ctx context.Context, q queryRower, farmID uuid.UUID, userID uuid.UUID) (farmResponse, error) {
	return scanFarmResponse(q.QueryRow(ctx, `
		SELECT
			f.id,
			f.name,
			f.latitude,
			f.longitude,
			f.area,
			fa.role,
			f.created_at,
			f.updated_at
		FROM farms f
		JOIN farm_access fa ON fa.farm_id = f.id
		WHERE f.id = $1
		  AND fa.user_id = $2
		  AND fa.revoked_at IS NULL
		  AND f.archived_at IS NULL
	`, farmID, userID))
}

func (h *FarmHandler) loadFieldResponse(ctx context.Context, q queryRower, fieldID uuid.UUID) (fieldResponse, error) {
	return scanFieldResponse(q.QueryRow(ctx, `
		SELECT id, farm_id, name, latitude, longitude, area, boundary_json, created_at, updated_at
		FROM fields
		WHERE id = $1
		  AND archived_at IS NULL
	`, fieldID))
}

type farmScanner interface {
	Scan(dest ...any) error
}

func scanFarmResponse(row farmScanner) (farmResponse, error) {
	var id uuid.UUID
	var latitude *float64
	var longitude *float64
	var area *float64
	var createdAt time.Time
	var updatedAt time.Time
	var farm farmResponse
	if err := row.Scan(&id, &farm.Name, &latitude, &longitude, &area, &farm.Role, &createdAt, &updatedAt); err != nil {
		return farmResponse{}, err
	}
	farm.ID = id.String()
	farm.Latitude = latitude
	farm.Longitude = longitude
	farm.Area = area
	farm.CreatedAt = createdAt.Format(time.RFC3339)
	farm.UpdatedAt = updatedAt.Format(time.RFC3339)
	return farm, nil
}

func scanFieldResponse(row farmScanner) (fieldResponse, error) {
	var id uuid.UUID
	var farmID uuid.UUID
	var latitude *float64
	var longitude *float64
	var area *float64
	var boundary []byte
	var createdAt time.Time
	var updatedAt time.Time
	var field fieldResponse
	if err := row.Scan(&id, &farmID, &field.Name, &latitude, &longitude, &area, &boundary, &createdAt, &updatedAt); err != nil {
		return fieldResponse{}, err
	}
	field.ID = id.String()
	field.FarmID = farmID.String()
	field.Latitude = latitude
	field.Longitude = longitude
	field.Area = area
	if len(boundary) > 0 {
		raw := json.RawMessage(boundary)
		field.BoundaryJSON = &raw
	}
	field.CreatedAt = createdAt.Format(time.RFC3339)
	field.UpdatedAt = updatedAt.Format(time.RFC3339)
	return field, nil
}

func validateFarmRequest(req saveFarmRequest) error {
	return validateNamedLocation(strings.TrimSpace(req.Name), req.Latitude, req.Longitude, req.Area, "farm")
}

func validateFieldRequest(req saveFieldRequest) error {
	if req.BoundaryJSON != nil && len(*req.BoundaryJSON) > 0 && !json.Valid(*req.BoundaryJSON) {
		return errors.New("field boundary must be valid JSON")
	}
	return validateNamedLocation(strings.TrimSpace(req.Name), req.Latitude, req.Longitude, req.Area, "field")
}

func validateNamedLocation(name string, latitude *float64, longitude *float64, area *float64, label string) error {
	if name == "" {
		return errors.New(label + " name is required")
	}
	if len(name) > 120 {
		return errors.New(label + " name must be 120 characters or fewer")
	}
	if latitude != nil && (*latitude < -90 || *latitude > 90) {
		return errors.New("latitude must be between -90 and 90")
	}
	if longitude != nil && (*longitude < -180 || *longitude > 180) {
		return errors.New("longitude must be between -180 and 180")
	}
	if area != nil && *area < 0 {
		return errors.New("area cannot be negative")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
