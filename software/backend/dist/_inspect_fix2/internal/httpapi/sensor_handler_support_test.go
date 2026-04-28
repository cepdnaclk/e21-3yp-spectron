package httpapi

import (
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
