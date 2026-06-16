package httpapi

import (
	"testing"

	"spectron-backend/internal/models"
)

func TestValidateAndFinalizeConfigIncludesHardwareRangesAndDerivedMetrics(t *testing.T) {
	result := validateAndFinalizeConfig(
		"ultrasonic",
		"Track hall occupancy",
		&models.SensorContext{
			Domain:          "industrial",
			EnvironmentType: "warehouse",
			IndoorOutdoor:   "indoor",
		},
		models.SensorConfig{
			FriendlyName:         "Hall Occupancy Sensor",
			UseCase:              "occupancy_monitoring",
			PresentationProfile:  "counter_status",
			PrimaryMetric:        "occupancy_count",
			ReportIntervalPerDay: 24,
			HardwareConfig: map[string]any{
				"readingFlowType": "TRIGGER",
			},
		},
		defaultControllerCapability(),
		"",
	)

	if result.FinalConfig.Hardware == nil {
		t.Fatalf("expected hardware layer to be populated")
	}
	if len(result.FinalConfig.Hardware.SupportedRawMetrics) != 1 {
		t.Fatalf("expected 1 supported raw metric, got %d", len(result.FinalConfig.Hardware.SupportedRawMetrics))
	}

	rawMetric := result.FinalConfig.Hardware.SupportedRawMetrics[0]
	if rawMetric.Key != "distance" {
		t.Fatalf("expected raw metric distance, got %q", rawMetric.Key)
	}
	if rawMetric.MinimumValue == nil || *rawMetric.MinimumValue != 0 {
		t.Fatalf("expected minimum readable value 0, got %+v", rawMetric.MinimumValue)
	}
	if rawMetric.MaximumValue == nil || *rawMetric.MaximumValue != 500 {
		t.Fatalf("expected maximum readable value 500, got %+v", rawMetric.MaximumValue)
	}

	if result.FinalConfig.Interpretation == nil {
		t.Fatalf("expected interpretation layer to be populated")
	}
	if result.FinalConfig.Interpretation.DisplayUnit != "people" {
		t.Fatalf("expected people display unit, got %q", result.FinalConfig.Interpretation.DisplayUnit)
	}
	if len(result.FinalConfig.Interpretation.DerivedMetrics) < 2 {
		t.Fatalf("expected derived metrics for occupancy use case, got %+v", result.FinalConfig.Interpretation.DerivedMetrics)
	}
	if result.FinalConfig.Interpretation.DerivedMetrics[0].Key != "occupancy_count" {
		t.Fatalf("expected first derived metric occupancy_count, got %q", result.FinalConfig.Interpretation.DerivedMetrics[0].Key)
	}

	if result.FinalConfig.Presentation == nil {
		t.Fatalf("expected presentation layer to be populated")
	}
	if result.FinalConfig.Presentation.HeadlineMetric != "occupancy_count" {
		t.Fatalf("expected headline metric occupancy_count, got %q", result.FinalConfig.Presentation.HeadlineMetric)
	}
	if result.FinalConfig.Presentation.StatusMode != "crowd_state" {
		t.Fatalf("expected status mode crowd_state, got %q", result.FinalConfig.Presentation.StatusMode)
	}
	if result.FinalConfig.Presentation.ComparisonMode != "live_count" {
		t.Fatalf("expected comparison mode live_count, got %q", result.FinalConfig.Presentation.ComparisonMode)
	}
	if result.FinalConfig.Presentation.DetailMode != "recent_activity" {
		t.Fatalf("expected detail mode recent_activity, got %q", result.FinalConfig.Presentation.DetailMode)
	}

	if result.FinalConfig.Settings == nil {
		t.Fatalf("expected settings layer to be populated")
	}
	if len(result.FinalConfig.Settings.Alerts) != 1 {
		t.Fatalf("expected one semantic alert family for occupancy profile, got %+v", result.FinalConfig.Settings.Alerts)
	}
	if result.FinalConfig.Settings.Alerts[0].MetricKey != "occupancy_count" {
		t.Fatalf("expected settings alert to target occupancy_count, got %q", result.FinalConfig.Settings.Alerts[0].MetricKey)
	}
	if result.FinalConfig.Settings.Alerts[0].Condition != "above" {
		t.Fatalf("expected occupancy alert condition above, got %q", result.FinalConfig.Settings.Alerts[0].Condition)
	}
}

func TestValidateAndFinalizeConfigSupportsVl53l0xFillLevelUseCase(t *testing.T) {
	result := validateAndFinalizeConfig(
		"vl53l0x",
		"Track frying oil level in a vat",
		&models.SensorContext{
			Domain:          "food_service",
			EnvironmentType: "kitchen",
			IndoorOutdoor:   "indoor",
			AssetType:       "frying oil vat",
		},
		models.SensorConfig{
			FriendlyName:         "Frying Oil Monitor",
			UseCase:              "fill_level_monitoring",
			PresentationProfile:  "level_monitoring",
			PrimaryMetric:        "fill_level",
			ReportIntervalPerDay: 24,
			HardwareConfig: map[string]any{
				"fullScaleDistanceCm": 40,
			},
		},
		defaultControllerCapability(),
		"",
	)

	if result.FinalConfig.PrimaryMetric != "fill_level" {
		t.Fatalf("expected fill_level primary metric, got %q", result.FinalConfig.PrimaryMetric)
	}
	if result.FinalConfig.UseCase != "fill_level_monitoring" {
		t.Fatalf("expected fill_level_monitoring use case, got %q", result.FinalConfig.UseCase)
	}
	if result.FinalConfig.Presentation == nil || result.FinalConfig.Presentation.Profile != "level_monitoring" {
		t.Fatalf("expected level_monitoring profile, got %+v", result.FinalConfig.Presentation)
	}
	if result.FinalConfig.Interpretation == nil {
		t.Fatalf("expected interpretation layer to be populated")
	}
	if len(result.FinalConfig.Interpretation.DerivedMetrics) == 0 || result.FinalConfig.Interpretation.DerivedMetrics[0].Key != "fill_level_percent" {
		t.Fatalf("expected fill-level derived metrics, got %+v", result.FinalConfig.Interpretation.DerivedMetrics)
	}
	if result.FinalConfig.Settings == nil || len(result.FinalConfig.Settings.Alerts) == 0 {
		t.Fatalf("expected fill-level alerts to be generated")
	}
	if result.FinalConfig.Settings.Alerts[0].MetricKey != "fill_level" {
		t.Fatalf("expected fill-level alert metric key, got %q", result.FinalConfig.Settings.Alerts[0].MetricKey)
	}
}

func TestValidateAndFinalizeConfigPreservesObservableMetricSelections(t *testing.T) {
	result := validateAndFinalizeConfig(
		"vl53l0x",
		"Track the tank fill rate",
		nil,
		models.SensorConfig{
			FriendlyName:         "Tank Monitor",
			UseCase:              "fill_level_monitoring",
			PresentationProfile:  "gauge_status",
			PrimaryMetric:        "fill_rate",
			ReportIntervalPerDay: 24,
			HardwareConfig: map[string]any{
				"fullScaleDistanceCm": 100,
				"metric_profiles": map[string]any{
					"fill_rate": "gauge_status",
				},
			},
			Interpretation: &models.SensorInterpretationLayer{
				ObservableMetrics: []string{"fill_rate", "fill_level", "fill_rate", ""},
			},
		},
		defaultControllerCapability(),
		"",
	)

	if result.FinalConfig.Interpretation == nil {
		t.Fatalf("expected interpretation layer to be populated")
	}

	got := result.FinalConfig.Interpretation.ObservableMetrics
	if len(got) != 2 || got[0] != "fill_rate" || got[1] != "fill_level" {
		t.Fatalf("expected observable metric selection to survive validation, got %+v", got)
	}
}

func TestValidateAndFinalizeConfigKeepsOverloadRiskForLoadMonitoring(t *testing.T) {
	result := validateAndFinalizeConfig(
		"load",
		"Prevent overload conditions",
		nil,
		models.SensorConfig{
			FriendlyName:         "Load Safety Sensor",
			UseCase:              "load_monitoring",
			PresentationProfile:  "gauge_status",
			PrimaryMetric:        "overload_risk",
			ReportIntervalPerDay: 24,
			MetricThresholds: map[string]models.ThresholdConfig{
				"overload_risk": {
					Max:        floatPtr(220),
					WarningMax: floatPtr(260),
				},
			},
			Settings: &models.SensorSettingsLayer{
				Alerts: []models.SensorAlertSetting{
					{
						Key:               "overload_risk_capacity_band",
						Label:             "Overload Risk Alert",
						MetricKey:         "overload_risk",
						Condition:         "above",
						Unit:              "kg",
						WarningThreshold:  floatPtr(220),
						CriticalThreshold: floatPtr(260),
					},
				},
			},
		},
		defaultControllerCapability(),
		"",
	)

	if result.FinalConfig.PrimaryMetric != "overload_risk" {
		t.Fatalf("expected overload_risk primary metric, got %q", result.FinalConfig.PrimaryMetric)
	}
	if result.FinalConfig.Interpretation == nil {
		t.Fatalf("expected interpretation layer to be populated")
	}
	if result.FinalConfig.Interpretation.DisplayUnit != "%" {
		t.Fatalf("expected overload_risk display unit %%, got %q", result.FinalConfig.Interpretation.DisplayUnit)
	}
	if result.FinalConfig.MetricThresholds["overload_risk"].Max == nil || *result.FinalConfig.MetricThresholds["overload_risk"].Max != 220 {
		t.Fatalf("expected overload_risk warning threshold 220, got %+v", result.FinalConfig.MetricThresholds["overload_risk"])
	}
	if result.FinalConfig.Presentation == nil {
		t.Fatalf("expected presentation layer to be populated")
	}
	if result.FinalConfig.Presentation.StatusMode != "overload_risk" {
		t.Fatalf("expected overload_risk status mode, got %q", result.FinalConfig.Presentation.StatusMode)
	}
	if result.FinalConfig.Settings == nil || len(result.FinalConfig.Settings.Alerts) == 0 {
		t.Fatalf("expected overload risk settings alert to be populated")
	}
	if result.FinalConfig.Settings.Alerts[0].MetricKey != "overload_risk" {
		t.Fatalf("expected overload risk alert metric key, got %q", result.FinalConfig.Settings.Alerts[0].MetricKey)
	}
}

func TestValidateAndFinalizeConfigPreservesRequestedAlertValues(t *testing.T) {
	result := validateAndFinalizeConfig(
		"load",
		"Prevent overload conditions",
		nil,
		models.SensorConfig{
			FriendlyName:         "Load Safety Sensor",
			UseCase:              "load_monitoring",
			PresentationProfile:  "gauge_status",
			PrimaryMetric:        "overload_risk",
			ReportIntervalPerDay: 24,
			MetricThresholds: map[string]models.ThresholdConfig{
				"overload_risk": {
					Max:        floatPtr(220),
					WarningMax: floatPtr(260),
				},
			},
			Settings: &models.SensorSettingsLayer{
				Alerts: []models.SensorAlertSetting{
					{
						Key:               "overload_risk_capacity_band",
						Label:             "Overload Risk Alert",
						MetricKey:         "overload_risk",
						Condition:         "above",
						Unit:              "kg",
						WarningThreshold:  floatPtr(220),
						CriticalThreshold: floatPtr(260),
						Description:       "Escalate when the load risk exceeds safe capacity.",
					},
				},
			},
		},
		defaultControllerCapability(),
		"",
	)

	if result.FinalConfig.Settings == nil || len(result.FinalConfig.Settings.Alerts) != 1 {
		t.Fatalf("expected one alert setting to be preserved, got %+v", result.FinalConfig.Settings)
	}

	alert := result.FinalConfig.Settings.Alerts[0]
	if alert.Key != "overload_risk_capacity_band" {
		t.Fatalf("expected preserved alert key, got %q", alert.Key)
	}
	if alert.WarningThreshold == nil || *alert.WarningThreshold != 220 {
		t.Fatalf("expected preserved warning threshold 220, got %+v", alert.WarningThreshold)
	}
	if alert.CriticalThreshold == nil || *alert.CriticalThreshold != 260 {
		t.Fatalf("expected preserved critical threshold 260, got %+v", alert.CriticalThreshold)
	}
	if alert.Description != "Escalate when the load risk exceeds safe capacity." {
		t.Fatalf("expected preserved alert description, got %q", alert.Description)
	}
}
