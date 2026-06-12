//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"

	"spectron-backend/internal/models"
)

func TestControllerPairAPIIntegration(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")

	t.Run("without token returns 401", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", "", map[string]string{
			"controllerId": "CTRL-NOAUTH",
		}))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("valid controller ID pairs unclaimed controller", func(t *testing.T) {
		controller := app.createController(t, owner.accountID, nil, "CTRL-PAIR-OK", "unclaimed")
		app.createLegacySensors(t, controller.id)

		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", owner.token, map[string]string{
			"controllerId": "CTRL-PAIR-OK",
		}))
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var response models.HardwarePairResponse
		if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if response.ControllerID != controller.uid {
			t.Fatalf("expected controller %s, got %s", controller.uid, response.ControllerID)
		}
		if response.ClaimStatus != "CLAIMED" {
			t.Fatalf("expected CLAIMED status, got %s", response.ClaimStatus)
		}
		if response.OperationalStatus != "OFFLINE" {
			t.Fatalf("expected OFFLINE operational status, got %s", response.OperationalStatus)
		}
		if len(response.Sensors) == 0 {
			t.Fatal("expected paired system sensors in response")
		}

		var ownerUserID uuid.UUID
		var ownerAccountID uuid.UUID
		var accountID uuid.UUID
		var claimStatus string
		var operationalStatus string
		if err := app.pool.QueryRow(t.Context(), `
			SELECT owner_user_id, owner_account_id, account_id, claim_status, operational_status
			FROM controllers
			WHERE id = $1
		`, controller.id).Scan(&ownerUserID, &ownerAccountID, &accountID, &claimStatus, &operationalStatus); err != nil {
			t.Fatalf("read paired controller: %v", err)
		}
		if ownerUserID != owner.id {
			t.Fatalf("expected owner %s, got %s", owner.id, ownerUserID)
		}
		if ownerAccountID != owner.accountID || accountID != owner.accountID {
			t.Fatalf("expected owner account %s, got owner=%s legacy=%s", owner.accountID, ownerAccountID, accountID)
		}
		if claimStatus != "CLAIMED" || operationalStatus != "OFFLINE" {
			t.Fatalf("unexpected statuses claim=%s operational=%s", claimStatus, operationalStatus)
		}
	})

	t.Run("QR payload claims unclaimed controller", func(t *testing.T) {
		controller := app.createController(t, owner.accountID, nil, "CTRL-QR-OK", "unclaimed")

		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", owner.token, map[string]string{
			"qr_token": controller.uid,
		}))
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("invalid pairing token returns error", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", owner.token, map[string]string{
			"pairingTokenOrControllerId": "PAIR-UNKNOWN",
		}))
		if rec.Code < 400 {
			t.Fatalf("expected error response, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("already claimed controller returns 409", func(t *testing.T) {
		other := app.createTestUser(t, "OWNER")
		controller := app.createController(t, other.accountID, &other.id, "CTRL-CLAIMED", "paired")
		app.createSystemWithSensors(t, other.accountID, &controller.id)

		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", owner.token, map[string]string{
			"controllerId": "CTRL-CLAIMED",
		}))
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("unknown controller cannot be claimed", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", owner.token, map[string]string{
			"controllerId": "CTRL-DOES-NOT-EXIST",
		}))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("viewer cannot claim", func(t *testing.T) {
		viewer := app.createTestUser(t, "VIEWER")
		controller := app.createController(t, owner.accountID, nil, "CTRL-VIEWER-DENIED", "unclaimed")

		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/controllers/pair", viewer.token, map[string]string{
			"controllerId": controller.uid,
		}))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("legacy pairing endpoint cannot bypass ownership", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/controllers/pair", owner.token, map[string]string{
			"qr_token": "CTRL-LEGACY-BYPASS",
		}))
		if rec.Code != http.StatusMethodNotAllowed && rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 or 405, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestControllerConcurrentClaimIntegration(t *testing.T) {
	app := newIntegrationApp(t)
	firstOwner := app.createTestUser(t, "OWNER")
	secondOwner := app.createTestUser(t, "OWNER")
	controller := app.createController(t, firstOwner.accountID, nil, "CTRL-RACE", "unclaimed")

	requests := []*http.Request{
		jsonRequest(t, http.MethodPost, "/api/controllers/pair", firstOwner.token, map[string]string{"controllerId": controller.uid}),
		jsonRequest(t, http.MethodPost, "/api/controllers/pair", secondOwner.token, map[string]string{"controllerId": controller.uid}),
	}

	codes := make(chan int, len(requests))
	var wg sync.WaitGroup
	for _, request := range requests {
		wg.Add(1)
		go func(req *http.Request) {
			defer wg.Done()
			codes <- executeRequest(app.rr, req).Code
		}(request)
	}
	wg.Wait()
	close(codes)

	successes := 0
	conflicts := 0
	for code := range codes {
		switch code {
		case http.StatusOK:
			successes++
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("unexpected concurrent claim status %d", code)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected one success and one conflict, got success=%d conflict=%d", successes, conflicts)
	}

	var claimStatus string
	var ownerAccountID uuid.UUID
	if err := app.pool.QueryRow(t.Context(), `
		SELECT claim_status, owner_account_id
		FROM controllers
		WHERE id = $1
	`, controller.id).Scan(&claimStatus, &ownerAccountID); err != nil {
		t.Fatalf("read claimed controller: %v", err)
	}
	if claimStatus != "CLAIMED" {
		t.Fatalf("expected CLAIMED, got %s", claimStatus)
	}
	if ownerAccountID != firstOwner.accountID && ownerAccountID != secondOwner.accountID {
		t.Fatalf("unexpected winning owner account %s", ownerAccountID)
	}
}

func TestControllerAdminRegistrationIntegration(t *testing.T) {
	app := newIntegrationApp(t)
	admin := app.createTestUser(t, "OWNER")
	if _, err := app.pool.Exec(t.Context(), `
		UPDATE users SET account_type = 'ADMIN', status = 'ACTIVE' WHERE id = $1
	`, admin.id); err != nil {
		t.Fatalf("promote system admin: %v", err)
	}

	rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/admin/devices", admin.token, map[string]interface{}{
		"controllerId":         "CTRL-ADMIN-REGISTERED",
		"name":                 "Registered Controller",
		"createDefaultSensors": false,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var response models.AdminCreateDeviceResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Device.ClaimStatus != "UNCLAIMED" || response.Device.OperationalStatus != "OFFLINE" {
		t.Fatalf("unexpected admin device statuses claim=%s operational=%s", response.Device.ClaimStatus, response.Device.OperationalStatus)
	}

	var accountID *uuid.UUID
	var ownerAccountID *uuid.UUID
	var ownerUserID *uuid.UUID
	var registeredBy uuid.UUID
	var claimStatus string
	if err := app.pool.QueryRow(t.Context(), `
		SELECT account_id, owner_account_id, owner_user_id, registered_by_account_id, claim_status
		FROM controllers
		WHERE controller_uid = 'CTRL-ADMIN-REGISTERED'
	`).Scan(&accountID, &ownerAccountID, &ownerUserID, &registeredBy, &claimStatus); err != nil {
		t.Fatalf("read registered controller: %v", err)
	}
	if accountID != nil || ownerAccountID != nil || ownerUserID != nil {
		t.Fatalf("expected no owner relationships, got account=%v ownerAccount=%v ownerUser=%v", accountID, ownerAccountID, ownerUserID)
	}
	if registeredBy != admin.accountID || claimStatus != "UNCLAIMED" {
		t.Fatalf("unexpected registration state registeredBy=%s claim=%s", registeredBy, claimStatus)
	}
}

func TestControllerReleaseAndUnclaimedIoTIntegration(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	controller := app.createController(t, owner.accountID, &owner.id, "CTRL-RELEASE", "paired")
	app.createSystemWithSensors(t, owner.accountID, &controller.id)

	rec := executeRequest(app.rr, jsonRequest(t, http.MethodDelete, "/api/controllers/"+controller.uid+"/claim", owner.token, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var accountID *uuid.UUID
	var ownerAccountID *uuid.UUID
	var ownerUserID *uuid.UUID
	var claimStatus string
	var operationalStatus string
	if err := app.pool.QueryRow(t.Context(), `
		SELECT account_id, owner_account_id, owner_user_id, claim_status, operational_status
		FROM controllers
		WHERE id = $1
	`, controller.id).Scan(&accountID, &ownerAccountID, &ownerUserID, &claimStatus, &operationalStatus); err != nil {
		t.Fatalf("read released controller: %v", err)
	}
	if accountID != nil || ownerAccountID != nil || ownerUserID != nil {
		t.Fatalf("release retained ownership account=%v ownerAccount=%v ownerUser=%v", accountID, ownerAccountID, ownerUserID)
	}
	if claimStatus != "UNCLAIMED" {
		t.Fatalf("expected UNCLAIMED, got %s", claimStatus)
	}

	discover := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/iot/discover", "", map[string]interface{}{
		"deviceId": controller.uid,
		"sensors": []map[string]string{
			{"id": "SEN-RELEASED-1", "type": "temperature"},
		},
	}))
	if discover.Code != http.StatusOK {
		t.Fatalf("expected discovery 200, got %d: %s", discover.Code, discover.Body.String())
	}

	upload := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/iot/upload", "", map[string]interface{}{
		"deviceId": controller.uid,
		"ts":       0,
		"sensors": []map[string]interface{}{
			{"id": "SEN-RELEASED-1", "type": "temperature", "v": 22.5},
		},
	}))
	if upload.Code != http.StatusOK {
		t.Fatalf("expected upload 200, got %d: %s", upload.Code, upload.Body.String())
	}

	var readingCount int
	if err := app.pool.QueryRow(t.Context(), `
		SELECT COUNT(*)
		FROM sensor_readings sr
		JOIN sensors s ON s.id = sr.sensor_id
		WHERE s.controller_id = $1
	`, controller.id).Scan(&readingCount); err != nil {
		t.Fatalf("count released readings: %v", err)
	}
	if readingCount != 0 {
		t.Fatalf("expected no account-bound readings after release, got %d", readingCount)
	}

	if err := app.pool.QueryRow(t.Context(), `
		SELECT account_id, owner_account_id, owner_user_id, claim_status, operational_status
		FROM controllers
		WHERE id = $1
	`, controller.id).Scan(&accountID, &ownerAccountID, &ownerUserID, &claimStatus, &operationalStatus); err != nil {
		t.Fatalf("read controller after IoT traffic: %v", err)
	}
	if accountID != nil || ownerAccountID != nil || ownerUserID != nil || claimStatus != "UNCLAIMED" {
		t.Fatalf("IoT traffic changed ownership account=%v ownerAccount=%v ownerUser=%v claim=%s", accountID, ownerAccountID, ownerUserID, claimStatus)
	}
	if operationalStatus != "ONLINE" {
		t.Fatalf("expected ONLINE operational state, got %s", operationalStatus)
	}
}

func TestControllerOwnershipAndSensorConfigAPIIntegration(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	other := app.createTestUser(t, "OWNER")
	controller := app.createController(t, owner.accountID, &owner.id, "CTRL-SENSORS", "paired")
	_, sensors := app.createSystemWithSensors(t, owner.accountID, &controller.id)
	sensor := sensors[1]

	t.Run("my controllers requires auth", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/controllers/my", "", nil))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("my controllers returns owned controllers", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/controllers/my", owner.token, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var response models.UserHardwareControllersResponse
		if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(response.Controllers) == 0 {
			t.Fatal("expected owned controllers")
		}
	})

	t.Run("sensors only return for owner account", func(t *testing.T) {
		path := "/api/controllers/" + controller.uid + "/sensors"

		ownerRec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, path, owner.token, nil))
		if ownerRec.Code != http.StatusOK {
			t.Fatalf("expected 200 for owner, got %d: %s", ownerRec.Code, ownerRec.Body.String())
		}

		var response models.ControllerSensorsResponse
		if err := json.NewDecoder(ownerRec.Body).Decode(&response); err != nil {
			t.Fatalf("decode sensors: %v", err)
		}
		if len(response.Sensors) == 0 {
			t.Fatal("expected sensors for owner")
		}

		otherRec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, path, other.token, nil))
		if otherRec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for non-owner account, got %d: %s", otherRec.Code, otherRec.Body.String())
		}
	})

	t.Run("owner can remove hardware sensor", func(t *testing.T) {
		system, removableSensors := app.createSystemWithSensors(t, owner.accountID, &controller.id)
		sensorToRemove := removableSensors[0]
		path := "/api/controllers/" + controller.uid + "/sensors/" + sensorToRemove.id.String()

		otherRec := executeRequest(app.rr, jsonRequest(t, http.MethodDelete, path, other.token, nil))
		if otherRec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for non-owner, got %d: %s", otherRec.Code, otherRec.Body.String())
		}

		ownerRec := executeRequest(app.rr, jsonRequest(t, http.MethodDelete, path, owner.token, nil))
		if ownerRec.Code != http.StatusNoContent {
			t.Fatalf("expected 204 for owner, got %d: %s", ownerRec.Code, ownerRec.Body.String())
		}

		var sensorCount int
		if err := app.pool.QueryRow(context.Background(), `
			SELECT COUNT(*)::int
			FROM system_sensors
			WHERE system_id = $1
			  AND id = $2
		`, system.id, sensorToRemove.id).Scan(&sensorCount); err != nil {
			t.Fatalf("count removed system sensor: %v", err)
		}
		if sensorCount != 0 {
			t.Fatalf("expected removed system sensor, found %d", sensorCount)
		}
	})

	t.Run("save sensor config enforces auth ownership and validation", func(t *testing.T) {
		path := "/api/controllers/" + controller.uid + "/sensors/" + sensor.id.String() + "/config"

		noAuth := executeRequest(app.rr, jsonRequest(t, http.MethodPost, path, "", validTemperatureHumidityConfigBody()))
		if noAuth.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 without auth, got %d", noAuth.Code)
		}

		invalidBody := validTemperatureHumidityConfigBody()
		invalidBody["sensorName"] = ""
		invalid := executeRequest(app.rr, jsonRequest(t, http.MethodPost, path, owner.token, invalidBody))
		if invalid.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for invalid config, got %d: %s", invalid.Code, invalid.Body.String())
		}

		otherRec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, path, other.token, validTemperatureHumidityConfigBody()))
		if otherRec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for non-owner, got %d: %s", otherRec.Code, otherRec.Body.String())
		}

		ownerRec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, path, owner.token, validTemperatureHumidityConfigBody()))
		if ownerRec.Code != http.StatusOK {
			t.Fatalf("expected 200 for valid owner config, got %d: %s", ownerRec.Code, ownerRec.Body.String())
		}
	})

	t.Run("get sensor config returns only for owner", func(t *testing.T) {
		path := "/api/controllers/" + controller.uid + "/sensors/" + sensor.id.String() + "/config"

		ownerRec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, path, owner.token, nil))
		if ownerRec.Code != http.StatusOK {
			t.Fatalf("expected 200 for owner, got %d: %s", ownerRec.Code, ownerRec.Body.String())
		}

		var response models.HardwareSensorConfigResponse
		if err := json.NewDecoder(ownerRec.Body).Decode(&response); err != nil {
			t.Fatalf("decode config: %v", err)
		}
		if response.SensorID != sensor.id.String() {
			t.Fatalf("expected sensor %s, got %s", sensor.id, response.SensorID)
		}

		otherRec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, path, other.token, nil))
		if otherRec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for non-owner, got %d: %s", otherRec.Code, otherRec.Body.String())
		}
	})
}

func validTemperatureHumidityConfigBody() map[string]interface{} {
	return map[string]interface{}{
		"systemName":    "Greenhouse System",
		"sensorType":    "temperature_humidity",
		"sensorName":    "Climate Sensor",
		"usedFor":       "Climate Monitoring",
		"dashboardView": "Dual Climate",
		"config": map[string]interface{}{
			"temperatureMin":           18,
			"temperatureMax":           32,
			"humidityMin":              40,
			"humidityMax":              85,
			"reportsPerDay":            24,
			"estimatedBatteryLifeDays": 77,
		},
	}
}
