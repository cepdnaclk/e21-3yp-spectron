package iot

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"spectron-backend/internal/models"
)

func TestEvaluateThresholdBreachCriticalWarningMax(t *testing.T) {
	config := models.SensorConfig{
		PrimaryMetric: "temperature",
		MetricThresholds: map[string]models.ThresholdConfig{
			"temperature": {
				Max:        floatPtr(30),
				WarningMax: floatPtr(35),
			},
		},
	}

	evaluation := evaluateThresholdBreach("temperature", 36.2, config)
	if !evaluation.Triggered {
		t.Fatal("expected threshold breach")
	}
	if evaluation.Severity != "CRITICAL" {
		t.Fatalf("expected CRITICAL severity, got %s", evaluation.Severity)
	}
	if evaluation.Boundary != "above critical maximum" {
		t.Fatalf("unexpected boundary: %s", evaluation.Boundary)
	}
}

func TestEvaluateThresholdBreachWarnMax(t *testing.T) {
	config := models.SensorConfig{
		PrimaryMetric: "temperature",
		MetricThresholds: map[string]models.ThresholdConfig{
			"temperature": {
				Max:        floatPtr(30),
				WarningMax: floatPtr(35),
			},
		},
	}

	evaluation := evaluateThresholdBreach("temperature", 31, config)
	if !evaluation.Triggered {
		t.Fatal("expected threshold breach")
	}
	if evaluation.Severity != "WARN" {
		t.Fatalf("expected WARN severity, got %s", evaluation.Severity)
	}
	if evaluation.Boundary != "above maximum" {
		t.Fatalf("unexpected boundary: %s", evaluation.Boundary)
	}
}

func TestEvaluateThresholdBreachNormal(t *testing.T) {
	config := models.SensorConfig{
		PrimaryMetric: "temperature",
		Thresholds: models.ThresholdConfig{
			Min:        floatPtr(20),
			Max:        floatPtr(30),
			WarningMin: floatPtr(15),
			WarningMax: floatPtr(35),
		},
	}

	evaluation := evaluateThresholdBreach("temperature", 25, config)
	if evaluation.Triggered {
		t.Fatalf("did not expect threshold breach: %+v", evaluation)
	}
}

func TestDecodeAlertSensorConfigSupportsHardwareFlatShape(t *testing.T) {
	config, err := decodeAlertSensorConfig([]byte(`{
		"temperatureMax": 30,
		"temperatureWarningMax": 35
	}`), "temperature_humidity")
	if err != nil {
		t.Fatalf("decode flat config: %v", err)
	}

	evaluation := evaluateThresholdBreach("temperature_humidity", 36, config)
	if !evaluation.Triggered {
		t.Fatal("expected threshold breach")
	}
	if evaluation.Severity != "CRITICAL" {
		t.Fatalf("expected CRITICAL severity, got %s", evaluation.Severity)
	}
}

func TestDecodeAlertSensorConfigUsesHumidityMetricForHumiditySidecar(t *testing.T) {
	config, err := decodeAlertSensorConfig([]byte(`{
		"temperatureWarningMax": 38,
		"humidityWarningMax": 85
	}`), "humidity")
	if err != nil {
		t.Fatalf("decode flat config: %v", err)
	}

	evaluation := evaluateThresholdBreach("humidity", 86, config)
	if !evaluation.Triggered {
		t.Fatal("expected humidity threshold breach")
	}
	if evaluation.Metric != "humidity" {
		t.Fatalf("expected humidity metric, got %s", evaluation.Metric)
	}
}

func TestEvaluateThresholdBreachUsesThreeLayerPrimaryMetric(t *testing.T) {
	config := models.SensorConfig{
		Interpretation: &models.SensorInterpretationLayer{
			UseCase:       "occupancy_monitoring",
			PrimaryMetric: "occupancy_count",
			MetricThresholds: map[string]models.ThresholdConfig{
				"occupancy_count": {
					Max:        floatPtr(25),
					WarningMax: floatPtr(35),
				},
			},
		},
		Presentation: &models.SensorPresentationLayer{
			Profile: "counter_status",
		},
		Operational: &models.SensorOperationalLayer{
			ReportIntervalPerDay: 12,
		},
	}

	evaluation := evaluateThresholdBreach("ultrasonic", 28, config)
	if !evaluation.Triggered {
		t.Fatal("expected occupancy threshold breach")
	}
	if evaluation.Metric != "occupancy_count" {
		t.Fatalf("expected occupancy_count metric, got %s", evaluation.Metric)
	}
	if evaluation.Severity != "WARN" {
		t.Fatalf("expected WARN severity, got %s", evaluation.Severity)
	}
}

func TestConfigLookupSensorHWIDsIncludesParentForHumiditySidecar(t *testing.T) {
	got := configLookupSensorHWIDs("ctrl-real-001-sensor-temp-01-humidity", "humidity")
	want := []string{"ctrl-real-001-sensor-temp-01-humidity", "ctrl-real-001-sensor-temp-01"}

	if len(got) != len(want) {
		t.Fatalf("expected %d lookup IDs, got %d: %#v", len(want), len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("lookup ID %d: expected %q, got %q", i, want[i], got[i])
		}
	}
}

func TestSensorReadingsRetentionCutoffKeepsSevenDays(t *testing.T) {
	now := time.Date(2026, 4, 28, 9, 30, 0, 0, time.FixedZone("LKT", 5*60*60+30*60))
	cutoff := sensorReadingsRetentionCutoff(now)

	expected := now.UTC().Add(-7 * 24 * time.Hour)
	if !cutoff.Equal(expected) {
		t.Fatalf("expected cutoff %s, got %s", expected, cutoff)
	}
	if cutoff.Location() != time.UTC {
		t.Fatalf("expected UTC cutoff, got %s", cutoff.Location())
	}
}

func TestThresholdAlertMessageIncludesSensorValueAndTime(t *testing.T) {
	readingAt := time.Date(2026, 4, 27, 12, 30, 0, 0, time.UTC)
	message := thresholdAlertMessage(
		thresholdAlertInput{
			SensorID:   uuid.New(),
			SensorName: "Greenhouse Temperature",
			Value:      36.234,
			ReadingAt:  readingAt,
		},
		thresholdAlertEvaluation{
			Boundary:  "above critical maximum",
			Threshold: 35,
		},
	)

	for _, expected := range []string{"Greenhouse Temperature", "36.23", "35.00", readingAt.Format(time.RFC3339)} {
		if !strings.Contains(message, expected) {
			t.Fatalf("expected message %q to contain %q", message, expected)
		}
	}
}

func floatPtr(value float64) *float64 {
	return &value
}
