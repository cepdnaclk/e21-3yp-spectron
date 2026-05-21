//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
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
		if response.Status != "paired" {
			t.Fatalf("expected paired status, got %s", response.Status)
		}
		if len(response.Sensors) == 0 {
			t.Fatal("expected paired system sensors in response")
		}

		var ownerUserID uuid.UUID
		var status string
		if err := app.pool.QueryRow(t.Context(), `
			SELECT owner_user_id, status
			FROM controllers
			WHERE id = $1
		`, controller.id).Scan(&ownerUserID, &status); err != nil {
			t.Fatalf("read paired controller: %v", err)
		}
		if ownerUserID != owner.id {
			t.Fatalf("expected owner %s, got %s", owner.id, ownerUserID)
		}
		if status != "paired" {
			t.Fatalf("expected db status paired, got %s", status)
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
