package httpapi

import (
	"encoding/json"
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

func TestDecodeDeviceSensorConfigSupportsLegacyShape(t *testing.T) {
	rawConfig, err := json.Marshal(models.SensorConfig{
		FriendlyName:         "Temperature & Humidity Sensor",
		ReportIntervalPerDay: 288,
		MetricThresholds: map[string]models.ThresholdConfig{
			"temperature": {WarningMax: floatPtr(38)},
			"humidity":    {WarningMax: floatPtr(85)},
		},
	})
	if err != nil {
		t.Fatalf("marshal legacy config: %v", err)
	}

	config, err := decodeDeviceSensorConfig(rawConfig)
	if err != nil {
		t.Fatalf("decode legacy config: %v", err)
	}

	if config.ReportIntervalPerDay != 288 {
		t.Fatalf("expected 288 reports/day, got %d", config.ReportIntervalPerDay)
	}
	if config.MetricThresholds["temperature"].WarningMax == nil || *config.MetricThresholds["temperature"].WarningMax != 38 {
		t.Fatalf("expected temperature warning max 38, got %+v", config.MetricThresholds["temperature"])
	}
}

func TestDecodeDeviceSensorConfigSupportsHardwareFlatShape(t *testing.T) {
	rawConfig := []byte(`{
		"temperatureWarningMax":38,
		"humidityWarningMax":85,
		"reportsPerDay":288,
		"estimatedBatteryLifeDays":77
	}`)

	config, err := decodeDeviceSensorConfig(rawConfig)
	if err != nil {
		t.Fatalf("decode flat config: %v", err)
	}

	if config.ReportIntervalPerDay != 288 {
		t.Fatalf("expected 288 reports/day, got %d", config.ReportIntervalPerDay)
	}
	if config.PowerManagement.SamplingFrequency != 288 {
		t.Fatalf("expected sampling frequency 288, got %d", config.PowerManagement.SamplingFrequency)
	}
	if config.MetricThresholds["temperature"].WarningMax == nil || *config.MetricThresholds["temperature"].WarningMax != 38 {
		t.Fatalf("expected temperature warning max 38, got %+v", config.MetricThresholds["temperature"])
	}
	if config.MetricThresholds["humidity"].WarningMax == nil || *config.MetricThresholds["humidity"].WarningMax != 85 {
		t.Fatalf("expected humidity warning max 85, got %+v", config.MetricThresholds["humidity"])
	}
}
