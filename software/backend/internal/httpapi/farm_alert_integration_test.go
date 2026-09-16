//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

func TestFarmAlertsAccessAndAcknowledge(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	viewer := app.createTestUser(t, "VIEWER")
	admin := app.createAdminUser(t)
	farm := app.createFarm(t, owner, "Alert Farm")
	field := app.createField(t, farm, "Alert Field")

	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO farm_access (farm_id, user_id, role, invited_by_user_id, added_at)
		VALUES ($1, $2, 'viewer', $3, NOW())
	`, farm.id, viewer.id, owner.id); err != nil {
		t.Fatalf("insert viewer farm access: %v", err)
	}

	alertID := uuid.New()
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO alerts (
			id,
			account_id,
			farm_id,
			field_id,
			type,
			severity,
			message,
			source_ref,
			status,
			created_at
		)
		VALUES ($1, $2, $3, $4, 'threshold', 'warning', 'Water level low', 'rule:water', 'open', NOW())
	`, alertID, owner.accountID, farm.id, field.id); err != nil {
		t.Fatalf("insert farm alert: %v", err)
	}

	viewerList := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String()+"/alerts", viewer.token, nil))
	if viewerList.Code != http.StatusOK {
		t.Fatalf("viewer list alerts status = %d, body = %s", viewerList.Code, viewerList.Body.String())
	}
	var listPayload struct {
		Alerts []farmAlertResponse `json:"alerts"`
	}
	if err := json.Unmarshal(viewerList.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listPayload.Alerts) != 1 || listPayload.Alerts[0].FieldName == nil || *listPayload.Alerts[0].FieldName != "Alert Field" {
		t.Fatalf("expected field-scoped farm alert, got %+v", listPayload.Alerts)
	}

	viewerAck := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/alerts/"+alertID.String()+"/ack", viewer.token, nil))
	if viewerAck.Code != http.StatusForbidden {
		t.Fatalf("viewer acknowledge status = %d, body = %s", viewerAck.Code, viewerAck.Body.String())
	}

	ownerAck := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/alerts/"+alertID.String()+"/ack", owner.token, nil))
	if ownerAck.Code != http.StatusOK {
		t.Fatalf("owner acknowledge status = %d, body = %s", ownerAck.Code, ownerAck.Body.String())
	}
	var ackPayload struct {
		Alert farmAlertResponse `json:"alert"`
	}
	if err := json.Unmarshal(ownerAck.Body.Bytes(), &ackPayload); err != nil {
		t.Fatalf("decode ack response: %v", err)
	}
	if ackPayload.Alert.Status != "acknowledged" || ackPayload.Alert.AcknowledgedAt == nil {
		t.Fatalf("expected acknowledged alert, got %+v", ackPayload.Alert)
	}

	adminList := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String()+"/alerts", admin.token, nil))
	if adminList.Code != http.StatusForbidden {
		t.Fatalf("admin list alerts status = %d, body = %s", adminList.Code, adminList.Body.String())
	}
}
