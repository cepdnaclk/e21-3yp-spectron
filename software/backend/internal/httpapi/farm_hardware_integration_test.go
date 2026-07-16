//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

func TestFarmHardwareAssignments(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	viewer := app.createTestUser(t, "VIEWER")
	farm := app.createFarm(t, owner, "Hardware Farm")
	firstField := app.createField(t, farm, "West")
	secondField := app.createField(t, farm, "East")
	controller := app.createController(t, owner.accountID, &owner.id, "CTRL-FARM-HW", "paired")

	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO farm_access (farm_id, user_id, role, invited_by_user_id, added_at)
		VALUES ($1, $2, 'viewer', $3, NOW())
	`, farm.id, viewer.id, owner.id); err != nil {
		t.Fatalf("insert viewer farm access: %v", err)
	}

	attach := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/controllers", owner.token, map[string]any{
		"controller_id": controller.uid,
		"model":         "SPECTRON WiFi Controller",
	}))
	if attach.Code != http.StatusCreated {
		t.Fatalf("attach controller status = %d, body = %s", attach.Code, attach.Body.String())
	}

	var attachPayload struct {
		Controllers []farmControllerResponse `json:"controllers"`
	}
	if err := json.Unmarshal(attach.Body.Bytes(), &attachPayload); err != nil {
		t.Fatalf("decode attach response: %v", err)
	}
	if len(attachPayload.Controllers) != 1 {
		t.Fatalf("expected one farm controller, got %d", len(attachPayload.Controllers))
	}
	gatewayID := attachPayload.Controllers[0].ID

	viewerAttach := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/controllers", viewer.token, map[string]any{
		"controller_id": controller.uid,
	}))
	if viewerAttach.Code != http.StatusForbidden {
		t.Fatalf("viewer attach status = %d, body = %s", viewerAttach.Code, viewerAttach.Body.String())
	}

	createBase := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/sensor-bases", owner.token, map[string]any{
		"gateway_id":     gatewayID,
		"serial_number":  "BASE-001",
		"label":          "Canopy row",
		"monitoringZone": "ignored",
	}))
	if createBase.Code != http.StatusCreated {
		t.Fatalf("create base status = %d, body = %s", createBase.Code, createBase.Body.String())
	}

	var base sensorBaseResponse
	if err := json.Unmarshal(createBase.Body.Bytes(), &base); err != nil {
		t.Fatalf("decode base response: %v", err)
	}

	assignFirst := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/sensor-bases/"+base.ID+"/assignment", owner.token, map[string]any{
		"field_id": firstField.id.String(),
	}))
	if assignFirst.Code != http.StatusOK {
		t.Fatalf("assign first status = %d, body = %s", assignFirst.Code, assignFirst.Body.String())
	}

	assignSecond := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/sensor-bases/"+base.ID+"/assignment", owner.token, map[string]any{
		"field_id": secondField.id.String(),
	}))
	if assignSecond.Code != http.StatusOK {
		t.Fatalf("assign second status = %d, body = %s", assignSecond.Code, assignSecond.Body.String())
	}

	history := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/sensor-bases/"+base.ID+"/assignments", viewer.token, nil))
	if history.Code != http.StatusOK {
		t.Fatalf("history status = %d, body = %s", history.Code, history.Body.String())
	}

	var historyPayload struct {
		Assignments []sensorBaseAssignmentResponse `json:"assignments"`
	}
	if err := json.Unmarshal(history.Body.Bytes(), &historyPayload); err != nil {
		t.Fatalf("decode history response: %v", err)
	}
	if len(historyPayload.Assignments) != 2 {
		t.Fatalf("expected two historical assignments, got %d", len(historyPayload.Assignments))
	}
	if historyPayload.Assignments[0].FieldID == nil || *historyPayload.Assignments[0].FieldID != secondField.id.String() {
		t.Fatalf("expected newest assignment on second field, got %+v", historyPayload.Assignments[0])
	}
	if historyPayload.Assignments[1].UnassignedAt == nil {
		t.Fatalf("expected previous assignment to be closed, got %+v", historyPayload.Assignments[1])
	}

	listControllers := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String()+"/controllers", viewer.token, nil))
	if listControllers.Code != http.StatusOK {
		t.Fatalf("list controllers status = %d, body = %s", listControllers.Code, listControllers.Body.String())
	}
	if err := json.Unmarshal(listControllers.Body.Bytes(), &attachPayload); err != nil {
		t.Fatalf("decode list controllers response: %v", err)
	}
	if len(attachPayload.Controllers) != 1 || len(attachPayload.Controllers[0].FieldIDs) != 1 || attachPayload.Controllers[0].FieldIDs[0] != secondField.id.String() {
		t.Fatalf("expected derived controller field relationship, got %+v", attachPayload.Controllers)
	}
}

func TestSensorModuleChannels(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	viewer := app.createTestUser(t, "VIEWER")
	farm := app.createFarm(t, owner, "Module Farm")
	controller := app.createController(t, owner.accountID, &owner.id, "CTRL-MODULE-HW", "paired")

	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO farm_access (farm_id, user_id, role, invited_by_user_id, added_at)
		VALUES ($1, $2, 'viewer', $3, NOW())
	`, farm.id, viewer.id, owner.id); err != nil {
		t.Fatalf("insert viewer farm access: %v", err)
	}

	attach := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/controllers", owner.token, map[string]any{
		"controller_id": controller.uid,
	}))
	if attach.Code != http.StatusCreated {
		t.Fatalf("attach controller status = %d, body = %s", attach.Code, attach.Body.String())
	}
	var attachPayload struct {
		Controllers []farmControllerResponse `json:"controllers"`
	}
	if err := json.Unmarshal(attach.Body.Bytes(), &attachPayload); err != nil {
		t.Fatalf("decode attach response: %v", err)
	}

	createBase := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/sensor-bases", owner.token, map[string]any{
		"gateway_id":    attachPayload.Controllers[0].ID,
		"serial_number": "BASE-MODULE-001",
	}))
	if createBase.Code != http.StatusCreated {
		t.Fatalf("create base status = %d, body = %s", createBase.Code, createBase.Body.String())
	}
	var base sensorBaseResponse
	if err := json.Unmarshal(createBase.Body.Bytes(), &base); err != nil {
		t.Fatalf("decode base response: %v", err)
	}

	createModule := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/sensor-bases/"+base.ID+"/modules", owner.token, map[string]any{
		"slot_number": 1,
		"model":       "DHT22",
		"channels": []map[string]any{
			{"channel_key": "temperature", "measurement_type": "temperature", "unit": "C"},
			{"channel_key": "humidity", "measurement_type": "humidity", "unit": "%RH"},
		},
	}))
	if createModule.Code != http.StatusCreated {
		t.Fatalf("create module status = %d, body = %s", createModule.Code, createModule.Body.String())
	}
	var module sensorModuleResponse
	if err := json.Unmarshal(createModule.Body.Bytes(), &module); err != nil {
		t.Fatalf("decode module response: %v", err)
	}
	if module.SlotNumber != 1 || len(module.Channels) != 2 {
		t.Fatalf("expected one physical module with two channels, got %+v", module)
	}

	viewerCreate := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/sensor-bases/"+base.ID+"/modules", viewer.token, map[string]any{
		"slot_number": 2,
		"channels": []map[string]any{
			{"channel_key": "temperature", "measurement_type": "temperature"},
		},
	}))
	if viewerCreate.Code != http.StatusForbidden {
		t.Fatalf("viewer create module status = %d, body = %s", viewerCreate.Code, viewerCreate.Body.String())
	}

	viewerList := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/sensor-bases/"+base.ID+"/modules", viewer.token, nil))
	if viewerList.Code != http.StatusOK {
		t.Fatalf("viewer list modules status = %d, body = %s", viewerList.Code, viewerList.Body.String())
	}
	var listPayload struct {
		Modules []sensorModuleResponse `json:"modules"`
	}
	if err := json.Unmarshal(viewerList.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode module list: %v", err)
	}
	if len(listPayload.Modules) != 1 || len(listPayload.Modules[0].Channels) != 2 {
		t.Fatalf("expected listed module with channels, got %+v", listPayload.Modules)
	}

	invalidModule := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/sensor-bases/"+base.ID+"/modules", owner.token, map[string]any{
		"slot_number": 2,
		"channels": []map[string]any{
			{"channel_key": "temperature", "measurement_type": "temperature"},
			{"channel_key": "temperature", "measurement_type": "humidity"},
		},
	}))
	if invalidModule.Code != http.StatusBadRequest {
		t.Fatalf("duplicate channel status = %d, body = %s", invalidModule.Code, invalidModule.Body.String())
	}
}

func TestFarmHardwareAccessValidation(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	other := app.createTestUser(t, "OWNER")
	admin := app.createAdminUser(t)
	farm := app.createFarm(t, owner, "Access Farm")
	controller := app.createController(t, other.accountID, &other.id, "CTRL-OTHER-HW", "paired")

	missingOwnedController := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/controllers", owner.token, map[string]any{
		"controller_id": controller.uid,
	}))
	if missingOwnedController.Code != http.StatusNotFound {
		t.Fatalf("other owner controller attach status = %d, body = %s", missingOwnedController.Code, missingOwnedController.Body.String())
	}

	adminList := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String()+"/controllers", admin.token, nil))
	if adminList.Code != http.StatusForbidden {
		t.Fatalf("admin list status = %d, body = %s", adminList.Code, adminList.Body.String())
	}

	unknownBase := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/sensor-bases/"+uuid.NewString()+"/assignment", owner.token, map[string]any{
		"monitoring_zone": "Nursery",
	}))
	if unknownBase.Code != http.StatusNotFound {
		t.Fatalf("unknown base assignment status = %d, body = %s", unknownBase.Code, unknownBase.Body.String())
	}
}
