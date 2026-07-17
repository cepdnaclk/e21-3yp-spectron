//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestCreateFarmStoresLocationMetadata(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")

	rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms", owner.token, map[string]any{
		"name":                "Location Farm",
		"latitude":            7.9956,
		"longitude":           80.2674,
		"location_accuracy_m": 24.5,
		"location_label":      "Galgamuwa, Kurunegala",
		"location_source":     "device_geolocation",
	}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create farm status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var farm farmResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &farm); err != nil {
		t.Fatalf("decode farm response: %v", err)
	}
	if farm.Latitude == nil || *farm.Latitude != 7.9956 {
		t.Fatalf("expected latitude 7.9956, got %+v", farm.Latitude)
	}
	if farm.Longitude == nil || *farm.Longitude != 80.2674 {
		t.Fatalf("expected longitude 80.2674, got %+v", farm.Longitude)
	}
	if farm.LocationAccuracyM == nil || *farm.LocationAccuracyM != 24.5 {
		t.Fatalf("expected accuracy 24.5, got %+v", farm.LocationAccuracyM)
	}
	if farm.LocationLabel == nil || *farm.LocationLabel != "Galgamuwa, Kurunegala" {
		t.Fatalf("expected readable label, got %+v", farm.LocationLabel)
	}
	if farm.LocationSource == nil || *farm.LocationSource != "device_geolocation" {
		t.Fatalf("expected device_geolocation source, got %+v", farm.LocationSource)
	}
}

func TestCreateFarmLocationValidation(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")

	rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms", owner.token, map[string]any{
		"name":      "Invalid Farm",
		"latitude":  91,
		"longitude": 80.2674,
	}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid latitude status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "latitude must be between -90 and 90") {
		t.Fatalf("expected latitude error, body = %s", rec.Body.String())
	}

	missingPair := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms", owner.token, map[string]any{
		"name":     "Half Location Farm",
		"latitude": 7.9956,
	}))
	if missingPair.Code != http.StatusBadRequest {
		t.Fatalf("missing longitude status = %d, body = %s", missingPair.Code, missingPair.Body.String())
	}
}

func TestGeocodingRoutesUseProvider(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")

	search := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/geocoding/search?q=Galgamuwa", owner.token, nil))
	if search.Code != http.StatusOK {
		t.Fatalf("search status = %d, body = %s", search.Code, search.Body.String())
	}
	if !strings.Contains(search.Body.String(), "Galgamuwa, Kurunegala") {
		t.Fatalf("expected mock search result, body = %s", search.Body.String())
	}

	reverse := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/geocoding/reverse?lat=7.9956&lon=80.2674", owner.token, nil))
	if reverse.Code != http.StatusOK {
		t.Fatalf("reverse status = %d, body = %s", reverse.Code, reverse.Body.String())
	}
	if !strings.Contains(reverse.Body.String(), "Galgamuwa, Kurunegala") {
		t.Fatalf("expected mock reverse result, body = %s", reverse.Body.String())
	}
}
