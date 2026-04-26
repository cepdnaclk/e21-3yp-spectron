package httpapi

import (
	"testing"

	"spectron-backend/internal/models"
)

func TestEffectiveSamplePeriodMsDefaultsToControllerMinimum(t *testing.T) {
	if got := effectiveSamplePeriodMs(0, 300); got != 300000 {
		t.Fatalf("expected 300000ms default sample period, got %d", got)
	}
}

func TestEffectiveSamplePeriodMsClampsToControllerMinimum(t *testing.T) {
	if got := effectiveSamplePeriodMs(1000, 300); got != 300000 {
		t.Fatalf("expected clamp to 300000ms minimum, got %d", got)
	}
}

func TestEffectiveSamplePeriodMsAllowsSlowerSchedules(t *testing.T) {
	if got := effectiveSamplePeriodMs(24, 300); got != 3600000 {
		t.Fatalf("expected hourly schedule to map to 3600000ms, got %d", got)
	}
}

func TestResolveMetricThresholdUsesMetricSpecificThreshold(t *testing.T) {
	config := models.SensorConfig{
		Thresholds: models.ThresholdConfig{
			WarningMax: floatPtr(45.0),
		},
		MetricThresholds: map[string]models.ThresholdConfig{
			"temperature": {
				WarningMax: floatPtr(32.5),
			},
		},
	}

	threshold := resolveMetricThreshold(config, "temperature")
	if threshold.WarningMax == nil || *threshold.WarningMax != 32.5 {
		t.Fatalf("expected metric-specific threshold to win, got %+v", threshold)
	}
}

func TestThresholdUpperX100PrefersWarningMaxThenMax(t *testing.T) {
	if got := thresholdUpperX100(models.ThresholdConfig{WarningMax: floatPtr(31.25)}, 3500); got != 3125 {
		t.Fatalf("expected warning max to map to x100 integer, got %d", got)
	}

	if got := thresholdUpperX100(models.ThresholdConfig{Max: floatPtr(28.5)}, 3500); got != 2850 {
		t.Fatalf("expected max to map to x100 integer, got %d", got)
	}

	if got := thresholdUpperX100(models.ThresholdConfig{}, 3500); got != 3500 {
		t.Fatalf("expected default fallback threshold, got %d", got)
	}
}
