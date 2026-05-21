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

func TestDecodeDeviceSensorConfigSupportsThreeLayerShape(t *testing.T) {
	rawConfig := []byte(`{
		"hardware": {
			"sensor_type": "ultrasonic",
			"sensor_name": "Hall Occupancy Sensor",
			"config": {
				"readingFlowType": "TRIGGER",
				"reportsPerDay": 12
			}
		},
		"interpretation": {
			"friendly_name": "Hall Occupancy Sensor",
			"use_case": "occupancy_monitoring",
			"primary_metric": "occupancy_count",
			"thresholds": {
				"max": 25,
				"warning_max": 35
			},
			"metric_thresholds": {
				"occupancy_count": {
					"max": 25,
					"warning_max": 35
				}
			}
		},
		"presentation": {
			"profile": "counter_status",
			"primary_widget": "counter",
			"chart_style": "bar"
		},
		"operational": {
			"report_interval_per_day": 12,
			"reading_flow_type": "TRIGGER",
			"power_management": {
				"battery_life_days": 120,
				"sampling_frequency": 12
			}
		}
	}`)

	config, err := decodeDeviceSensorConfig(rawConfig)
	if err != nil {
		t.Fatalf("decode layered config: %v", err)
	}

	if config.UseCase != "occupancy_monitoring" {
		t.Fatalf("expected occupancy use case, got %q", config.UseCase)
	}
	if config.PresentationProfile != "counter_status" {
		t.Fatalf("expected counter profile, got %q", config.PresentationProfile)
	}
	if config.PrimaryMetric != "occupancy_count" {
		t.Fatalf("expected occupancy_count metric, got %q", config.PrimaryMetric)
	}
	if config.Hardware == nil || config.Hardware.Config["readingFlowType"] != "TRIGGER" {
		t.Fatalf("expected hardware layer to keep reading flow type, got %+v", config.Hardware)
	}
	if config.Operational == nil || config.Operational.ReadingFlowType != "TRIGGER" {
		t.Fatalf("expected operational reading flow type TRIGGER, got %+v", config.Operational)
	}
}
