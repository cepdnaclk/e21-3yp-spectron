package iot

import (
	"math"
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

func TestNormalizeVL53L0XMillimetersToCentimeters(t *testing.T) {
	value, converted := normalizeReadingValue("vl53l0x", 2131)
	if !converted {
		t.Fatal("expected VL53L0X value to be converted")
	}
	if math.Abs(value-213.1) > 0.0001 {
		t.Fatalf("expected 213.1 cm, got %f", value)
	}
}

func TestNormalizeDistanceAliasMillimetersToCentimeters(t *testing.T) {
	value, converted := normalizeReadingValue("distance", 850)
	if !converted || value != 85 {
		t.Fatalf("expected distance alias to normalize to 85 cm, got value=%f converted=%v", value, converted)
	}
}

func TestNormalizeReadingLeavesOtherSensorsUnchanged(t *testing.T) {
	value, converted := normalizeReadingValue("ultrasonic", 125)
	if converted || value != 125 {
		t.Fatalf("expected ultrasonic reading to remain unchanged, got value=%f converted=%v", value, converted)
	}
}

func TestDistanceAttendanceCountsSpikeThenRequiresClearDoor(t *testing.T) {
	config := distanceAttendanceConfig{
		BaselineCM: 300,
		TriggerCM:  100,
		ResetCM:    80,
		Cooldown:   2 * time.Second,
	}
	start := time.Date(2026, 6, 15, 10, 0, 0, 0, time.UTC)
	state := distanceAttendanceState{SessionStartedAt: start}

	first, state := evaluateDistanceAttendance(150, start, config, state)
	if !first.Counted || first.Count != 1 || !first.PassageActive {
		t.Fatalf("expected first passage to count once, got %+v", first)
	}
	if !first.SessionStartedAt.Equal(start) {
		t.Fatalf("expected attendance session start %s, got %s", start, first.SessionStartedAt)
	}

	duplicate, state := evaluateDistanceAttendance(140, start.Add(3*time.Second), config, state)
	if duplicate.Counted || duplicate.Count != 1 {
		t.Fatalf("expected blocked doorway not to count twice, got %+v", duplicate)
	}

	cleared, state := evaluateDistanceAttendance(295, start.Add(4*time.Second), config, state)
	if cleared.PassageActive {
		t.Fatalf("expected clear doorway to rearm detector, got %+v", cleared)
	}

	second, _ := evaluateDistanceAttendance(410, start.Add(5*time.Second), config, state)
	if !second.Counted || second.Count != 2 {
		t.Fatalf("expected upward spike to count after rearm, got %+v", second)
	}
}

func TestDistanceAttendanceEnforcesCooldownAfterRearm(t *testing.T) {
	config := distanceAttendanceConfig{BaselineCM: 300, TriggerCM: 100, ResetCM: 80, Cooldown: 2 * time.Second}
	start := time.Date(2026, 6, 15, 10, 0, 0, 0, time.UTC)
	countedAt := start
	state := distanceAttendanceState{Count: 1, LastCountedAt: &countedAt}

	result, _ := evaluateDistanceAttendance(150, start.Add(time.Second), config, state)
	if result.Counted || result.Count != 1 {
		t.Fatalf("expected reading inside cooldown to be ignored, got %+v", result)
	}
}

func TestDistanceAttendanceIgnoresInvalidReading(t *testing.T) {
	config := distanceAttendanceConfig{BaselineCM: 300, TriggerCM: 100, ResetCM: 80, Cooldown: 2 * time.Second}
	state := distanceAttendanceState{Count: 4}

	result, nextState := evaluateDistanceAttendance(math.Inf(1), time.Now().UTC(), config, state)
	if result.Counted || result.Count != 4 || nextState.Count != 4 {
		t.Fatalf("expected invalid reading to leave attendance unchanged, got result=%+v state=%+v", result, nextState)
	}
}

func TestAttendanceConfigReadsConfiguredDoorDistances(t *testing.T) {
	config := models.SensorConfig{
		UseCase:      "attendance_monitoring",
		PrimaryMetric: "attendance_count",
		HardwareConfig: map[string]interface{}{
			"attendanceBaselineDistanceCm": 250.0,
			"attendanceTriggerDeltaCm":     75.0,
			"attendanceCooldownSeconds":    2.0,
		},
	}

	detector, ok := attendanceConfigForSensor("vl53l0x", config)
	if !ok {
		t.Fatal("expected attendance detector to be enabled")
	}
	if detector.BaselineCM != 250 || detector.TriggerCM != 75 || detector.Cooldown != 2*time.Second {
		t.Fatalf("unexpected detector config: %+v", detector)
	}
}

func floatPtr(value float64) *float64 {
	return &value
}
