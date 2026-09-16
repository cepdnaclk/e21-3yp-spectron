//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

func TestIotUploadEnrichesReadingsWithFarmContext(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	farm := app.createFarm(t, owner, "Ingest Farm")
	field := app.createField(t, farm, "Canopy")
	controller := app.createController(t, owner.accountID, &owner.id, "CTRL-FARM-INGEST", "paired")

	gatewayID := uuid.New()
	baseID := uuid.New()
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO gateways (
			id,
			farm_id,
			legacy_controller_id,
			serial_number,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, 'CTRL-FARM-INGEST', 'offline', NOW(), NOW())
	`, gatewayID, farm.id, controller.id); err != nil {
		t.Fatalf("insert gateway: %v", err)
	}
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO sensor_bases (
			id,
			gateway_id,
			serial_number,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, 'BASE-FARM-001', 'waiting_setup', NOW(), NOW())
	`, baseID, gatewayID); err != nil {
		t.Fatalf("insert sensor base: %v", err)
	}
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO sensor_base_assignments (
			id,
			base_id,
			field_id,
			assigned_at,
			assigned_by_user_id
		)
		VALUES ($1, $2, $3, NOW(), $4)
	`, uuid.New(), baseID, field.id, owner.id); err != nil {
		t.Fatalf("insert base assignment: %v", err)
	}
	moduleID := uuid.New()
	channelID := uuid.New()
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO sensor_modules (
			id,
			base_id,
			slot_number,
			model,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, 1, 'SHT30', 'live', NOW(), NOW())
	`, moduleID, baseID); err != nil {
		t.Fatalf("insert sensor module: %v", err)
	}
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO sensor_channels (
			id,
			module_id,
			channel_key,
			measurement_type,
			unit,
			created_at,
			updated_at
		)
		VALUES ($1, $2, 'temperature', 'temperature', 'C', NOW(), NOW())
	`, channelID, moduleID); err != nil {
		t.Fatalf("insert sensor channel: %v", err)
	}

	rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/iot/upload", "", map[string]any{
		"deviceId": controller.uid,
		"ts":       1_798_000_000,
		"sensors": []map[string]any{
			{"id": "BASE-FARM-001:temperature", "type": "temperature", "v": 32.4},
		},
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("upload status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var payload struct {
		OK        bool `json:"ok"`
		Persisted bool `json:"persisted"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if !payload.OK || !payload.Persisted {
		t.Fatalf("expected persisted upload response, got %+v", payload)
	}

	var metaFarmID string
	var metaFieldID string
	var metaGatewayID string
	var metaSensorBaseID string
	var sensorChannelID string
	var metaSensorChannelID string
	var metaSensorChannelKey string
	if err := app.pool.QueryRow(t.Context(), `
		SELECT
			sr.meta->>'farm_id',
			sr.meta->>'field_id',
			sr.meta->>'gateway_id',
			sr.meta->>'sensor_base_id',
			sr.sensor_channel_id::text,
			sr.meta->>'sensor_channel_id',
			sr.meta->>'sensor_channel_key'
		FROM sensor_readings sr
		JOIN sensors s ON s.id = sr.sensor_id
		WHERE s.controller_id = $1
		  AND s.hw_id = 'BASE-FARM-001:temperature'
		ORDER BY sr.time DESC
		LIMIT 1
	`, controller.id).Scan(
		&metaFarmID,
		&metaFieldID,
		&metaGatewayID,
		&metaSensorBaseID,
		&sensorChannelID,
		&metaSensorChannelID,
		&metaSensorChannelKey,
	); err != nil {
		t.Fatalf("read farm-enriched sensor reading: %v", err)
	}

	if metaFarmID != farm.id.String() {
		t.Fatalf("expected farm_id %s, got %s", farm.id, metaFarmID)
	}
	if metaFieldID != field.id.String() {
		t.Fatalf("expected field_id %s, got %s", field.id, metaFieldID)
	}
	if metaGatewayID != gatewayID.String() {
		t.Fatalf("expected gateway_id %s, got %s", gatewayID, metaGatewayID)
	}
	if metaSensorBaseID != baseID.String() {
		t.Fatalf("expected sensor_base_id %s, got %s", baseID, metaSensorBaseID)
	}
	if sensorChannelID != channelID.String() {
		t.Fatalf("expected sensor_channel_id %s, got %s", channelID, sensorChannelID)
	}
	if metaSensorChannelID != channelID.String() {
		t.Fatalf("expected meta sensor_channel_id %s, got %s", channelID, metaSensorChannelID)
	}
	if metaSensorChannelKey != "temperature" {
		t.Fatalf("expected sensor_channel_key temperature, got %s", metaSensorChannelKey)
	}
}
