package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"spectron-backend/internal/models"
)

func TestBuildSensorObservationAwaitingData(t *testing.T) {
	configuredAt := time.Now().Add(-2 * time.Hour)
	reportsPerDay := 24

	observation := buildSensorObservation(true, nil, &configuredAt, &reportsPerDay, 0, nil)
	if observation == nil {
		t.Fatal("expected observation details")
	}
	if observation.Status != "awaiting_data" {
		t.Fatalf("expected awaiting_data, got %s", observation.Status)
	}
	if observation.MinimumReadings != 72 {
		t.Fatalf("expected minimum readings to be 72, got %d", observation.MinimumReadings)
	}
}

func TestBuildSensorObservationReadyForReviewByReadings(t *testing.T) {
	configuredAt := time.Now().Add(-6 * time.Hour)
	reportsPerDay := 18
	windowDays := 14

	observation := buildSensorObservation(
		true,
		&models.SensorContext{HistoricalWindowDays: &windowDays},
		&configuredAt,
		&reportsPerDay,
		54,
		nil,
	)
	if observation == nil {
		t.Fatal("expected observation details")
	}
	if observation.Status != "ready_for_review" {
		t.Fatalf("expected ready_for_review, got %s", observation.Status)
	}
}

func TestBuildSensorObservationReadyForReviewByElapsedWindow(t *testing.T) {
	configuredAt := time.Now().Add(-15 * 24 * time.Hour)
	reportsPerDay := 4
	windowDays := 14

	observation := buildSensorObservation(
		true,
		&models.SensorContext{HistoricalWindowDays: &windowDays},
		&configuredAt,
		&reportsPerDay,
		10,
		nil,
	)
	if observation == nil {
		t.Fatal("expected observation details")
	}
	if observation.Status != "ready_for_review" {
		t.Fatalf("expected ready_for_review, got %s", observation.Status)
	}
}

func TestDecodeSaveSensorConfigRequestUsesNestedInterpretationContextAndPurpose(t *testing.T) {
	body := `{
		"config": {
			"friendly_name": "Test Sensor",
			"interpretation": {
				"purpose": "Climate monitoring",
				"context": {
					"domain": "Greenhouse",
					"environment_type": "Indoor",
					"location": {
						"mode": "manual",
						"country": "USA",
						"region": "California",
						"label": "North Bay"
					}
				}
			}
		}
	}`

	req := httptest.NewRequest("POST", "/api/controllers/CTRL/sensors/SENSOR/config", strings.NewReader(body))

	saveReq, err := decodeSaveSensorConfigRequest(req)
	if err != nil {
		t.Fatalf("unexpected decode error: %v", err)
	}
	if saveReq.Config == nil {
		t.Fatal("expected config to be populated")
	}
	if saveReq.Purpose != "Climate monitoring" {
		t.Fatalf("expected purpose fallback, got %q", saveReq.Purpose)
	}
	if saveReq.Context == nil {
		t.Fatal("expected context fallback")
	}
	if saveReq.Context.Domain != "greenhouse" {
		t.Fatalf("expected normalized domain, got %q", saveReq.Context.Domain)
	}
	if saveReq.Context.EnvironmentType != "indoor" {
		t.Fatalf("expected normalized environment type, got %q", saveReq.Context.EnvironmentType)
	}
	if saveReq.Context.Location == nil || saveReq.Context.Location.Region != "California" {
		t.Fatalf("expected restored location region, got %#v", saveReq.Context.Location)
	}
}
