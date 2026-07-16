//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestFarmCropInstances(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	viewer := app.createTestUser(t, "VIEWER")
	farm := app.createFarm(t, owner, "Crop Farm")
	field := app.createField(t, farm, "North Field")

	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO farm_access (farm_id, user_id, role, invited_by_user_id, added_at)
		VALUES ($1, $2, 'viewer', $3, NOW())
	`, farm.id, viewer.id, owner.id); err != nil {
		t.Fatalf("insert viewer farm access: %v", err)
	}

	cropID, stageID := seededRiceReferenceIDs(t, app)

	listCrops := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/crops", owner.token, nil))
	if listCrops.Code != http.StatusOK {
		t.Fatalf("list crops status = %d, body = %s", listCrops.Code, listCrops.Body.String())
	}
	if !strings.Contains(listCrops.Body.String(), "Paddy / Rice") {
		t.Fatalf("expected seeded rice crop, body = %s", listCrops.Body.String())
	}

	plantingDate := time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02")
	createBody := map[string]any{
		"crop_id":                 cropID.String(),
		"planting_date":           plantingDate,
		"planting_date_precision": "exact",
	}
	create := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/fields/"+field.id.String()+"/crop-instances", owner.token, createBody))
	if create.Code != http.StatusCreated {
		t.Fatalf("create crop instance status = %d, body = %s", create.Code, create.Body.String())
	}

	var createPayload struct {
		CropInstance cropInstanceResponse `json:"crop_instance"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createPayload); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createPayload.CropInstance.CurrentStage == nil {
		t.Fatalf("expected automatic current stage, body = %s", create.Body.String())
	}
	if createPayload.CropInstance.StageSource != "automatic" {
		t.Fatalf("stage source = %q", createPayload.CropInstance.StageSource)
	}

	viewerList := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/fields/"+field.id.String()+"/crop-instances", viewer.token, nil))
	if viewerList.Code != http.StatusOK {
		t.Fatalf("viewer list crop instances status = %d, body = %s", viewerList.Code, viewerList.Body.String())
	}

	viewerCreate := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/fields/"+field.id.String()+"/crop-instances", viewer.token, createBody))
	if viewerCreate.Code != http.StatusForbidden {
		t.Fatalf("viewer create crop instance status = %d, body = %s", viewerCreate.Code, viewerCreate.Body.String())
	}

	confirm := executeRequest(app.rr, jsonRequest(
		t,
		http.MethodPost,
		"/api/crop-instances/"+createPayload.CropInstance.ID+"/stage-confirmation",
		owner.token,
		map[string]any{"stage_id": stageID.String()},
	))
	if confirm.Code != http.StatusOK {
		t.Fatalf("confirm growth stage status = %d, body = %s", confirm.Code, confirm.Body.String())
	}
	if !strings.Contains(confirm.Body.String(), "owner_confirmed") {
		t.Fatalf("expected owner_confirmed response, body = %s", confirm.Body.String())
	}

	secondPlantingDate := time.Now().UTC().AddDate(0, 0, -5).Format("2006-01-02")
	secondCreate := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/fields/"+field.id.String()+"/crop-instances", owner.token, map[string]any{
		"crop_id":                 cropID.String(),
		"planting_date":           secondPlantingDate,
		"planting_date_precision": "exact",
	}))
	if secondCreate.Code != http.StatusCreated {
		t.Fatalf("second crop instance status = %d, body = %s", secondCreate.Code, secondCreate.Body.String())
	}

	history := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/fields/"+field.id.String()+"/crop-instances", viewer.token, nil))
	if history.Code != http.StatusOK {
		t.Fatalf("crop history status = %d, body = %s", history.Code, history.Body.String())
	}
	var historyPayload struct {
		CropInstances []cropInstanceResponse `json:"crop_instances"`
	}
	if err := json.Unmarshal(history.Body.Bytes(), &historyPayload); err != nil {
		t.Fatalf("decode crop history: %v", err)
	}
	activeCount := 0
	for _, instance := range historyPayload.CropInstances {
		if instance.Active {
			activeCount++
		}
	}
	if len(historyPayload.CropInstances) != 2 || activeCount != 1 {
		t.Fatalf("expected one active crop with historical instance preserved, got %+v", historyPayload.CropInstances)
	}
}

func TestFarmCropInstanceValidation(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	admin := app.createAdminUser(t)
	farm := app.createFarm(t, owner, "Validation Farm")
	field := app.createField(t, farm, "East Field")
	cropID, _ := seededRiceReferenceIDs(t, app)

	futureDate := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	create := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/fields/"+field.id.String()+"/crop-instances", owner.token, map[string]any{
		"crop_id":                 cropID.String(),
		"planting_date":           futureDate,
		"planting_date_precision": "exact",
	}))
	if create.Code != http.StatusBadRequest {
		t.Fatalf("future planting date status = %d, body = %s", create.Code, create.Body.String())
	}

	adminList := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/crops", admin.token, nil))
	if adminList.Code != http.StatusForbidden {
		t.Fatalf("admin list crops status = %d, body = %s", adminList.Code, adminList.Body.String())
	}
}

func seededRiceReferenceIDs(t *testing.T, app *integrationApp) (uuid.UUID, uuid.UUID) {
	t.Helper()

	var cropID uuid.UUID
	var stageID uuid.UUID
	if err := app.pool.QueryRow(t.Context(), `
		SELECT c.id, gs.id
		FROM crops c
		JOIN growth_stages gs ON gs.crop_id = c.id
		WHERE c.name = 'Paddy / Rice'
		ORDER BY gs.display_order
		LIMIT 1
	`).Scan(&cropID, &stageID); err != nil {
		t.Fatalf("load seeded rice reference ids: %v", err)
	}
	return cropID, stageID
}
