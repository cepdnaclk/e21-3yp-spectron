package httpapi

import (
	"strings"
	"testing"

	"spectron-backend/internal/models"
)

func TestInferUseCaseAndProfileWorkstream(t *testing.T) {
	tests := []struct {
		name              string
		sensorType        string
		purpose           string
		ctx               *models.SensorContext
		requestedUseCase  string
		requestedProfile  string
		defaultMetric     string
		wantUseCase       string
		wantProfile       string
		wantPrimaryMetric string
		wantRules         []string
	}{
		{
			name:              "defaults climate sensors to dual climate presentation",
			sensorType:        " temperature_humidity ",
			defaultMetric:     "humidity",
			wantUseCase:       useCaseClimate,
			wantProfile:       profileDualClimate,
			wantPrimaryMetric: "temperature",
			wantRules:         []string{"use_case_default_climate", "presentation_profile_default_dual_climate"},
		},
		{
			name:       "infers attendance for distance sensors from class context",
			sensorType: "vl53l0x",
			purpose:    "Count class attendance at the lecture hall door",
			ctx: &models.SensorContext{
				Domain:          "education",
				EnvironmentType: "classroom",
				Location:        &models.LocationContext{Label: "Main lecture hall"},
			},
			defaultMetric:     "distance",
			wantUseCase:       useCaseAttendance,
			wantProfile:       profileCounter,
			wantPrimaryMetric: "distance",
			wantRules:         []string{"use_case_inferred_attendance", "presentation_profile_inferred"},
		},
		{
			name:              "adjusts incompatible fill level counter profile",
			sensorType:        "ultrasonic",
			requestedUseCase:  useCaseFillLevel,
			requestedProfile:  profileCounter,
			defaultMetric:     "distance",
			wantUseCase:       useCaseFillLevel,
			wantProfile:       profileLevel,
			wantPrimaryMetric: "distance",
			wantRules:         []string{"presentation_profile_compatibility_adjustment"},
		},
		{
			name:              "adjusts incompatible pressure level profile",
			sensorType:        "pressure",
			requestedUseCase:  useCaseGeneric,
			requestedProfile:  profileLevel,
			defaultMetric:     "pressure",
			wantUseCase:       useCaseGeneric,
			wantProfile:       profileSingleTrend,
			wantPrimaryMetric: "pressure",
			wantRules:         []string{"presentation_profile_compatibility_adjustment"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotUseCase, gotProfile, gotMetric, gotRules := inferUseCaseAndProfile(
				tt.sensorType,
				tt.purpose,
				tt.ctx,
				tt.requestedUseCase,
				tt.requestedProfile,
				tt.defaultMetric,
			)

			if gotUseCase != tt.wantUseCase {
				t.Fatalf("expected use case %q, got %q", tt.wantUseCase, gotUseCase)
			}
			if gotProfile != tt.wantProfile {
				t.Fatalf("expected profile %q, got %q", tt.wantProfile, gotProfile)
			}
			if gotMetric != tt.wantPrimaryMetric {
				t.Fatalf("expected primary metric %q, got %q", tt.wantPrimaryMetric, gotMetric)
			}
			for _, rule := range tt.wantRules {
				if !stringSliceContains(gotRules, rule) {
					t.Fatalf("expected rule %q in %+v", rule, gotRules)
				}
			}
		})
	}
}

func TestMetricSpecsForUseCaseWorkstream(t *testing.T) {
	tests := []struct {
		name              string
		sensorType        string
		useCase           string
		ctx               *models.SensorContext
		wantPrimaryMetric string
		wantMetricKey     string
		wantMinAllowed    float64
		wantMaxAllowed    float64
		wantDefaultMin    *float64
		wantDefaultMax    *float64
		wantRule          string
	}{
		{
			name:              "distance generic monitoring keeps raw distance boundaries",
			sensorType:        "vl53l0x",
			useCase:           useCaseGeneric,
			wantPrimaryMetric: "distance",
			wantMetricKey:     "distance",
			wantMinAllowed:    0,
			wantMaxAllowed:    500,
			wantDefaultMax:    floatPtr(100),
		},
		{
			name:              "distance fill level monitoring maps to percentage limits",
			sensorType:        "ultrasonic",
			useCase:           useCaseFillLevel,
			wantPrimaryMetric: "fill_level",
			wantMetricKey:     "fill_level",
			wantMinAllowed:    0,
			wantMaxAllowed:    100,
			wantDefaultMax:    floatPtr(80),
			wantRule:          "primary_metric_use_case_fill_level",
		},
		{
			name:              "distance attendance monitoring maps to attendance count lower threshold",
			sensorType:        "distance",
			useCase:           useCaseAttendance,
			wantPrimaryMetric: "attendance_count",
			wantMetricKey:     "attendance_count",
			wantMinAllowed:    0,
			wantMaxAllowed:    500,
			wantDefaultMin:    floatPtr(20),
			wantRule:          "primary_metric_use_case_attendance",
		},
		{
			name:       "warehouse temperature context keeps temperature spec with warehouse defaults",
			sensorType: "temperature",
			useCase:    useCaseClimate,
			ctx: &models.SensorContext{
				EnvironmentType: "warehouse",
			},
			wantPrimaryMetric: "temperature",
			wantMetricKey:     "temperature",
			wantMinAllowed:    -10,
			wantMaxAllowed:    60,
			wantDefaultMin:    floatPtr(10),
			wantDefaultMax:    floatPtr(30),
			wantRule:          "context_defaults_warehouse",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotPrimary, gotSpecs, gotRules := metricSpecsForUseCase(tt.sensorType, tt.useCase, tt.ctx)
			if gotPrimary != tt.wantPrimaryMetric {
				t.Fatalf("expected primary metric %q, got %q", tt.wantPrimaryMetric, gotPrimary)
			}
			spec, ok := gotSpecs[tt.wantMetricKey]
			if !ok {
				t.Fatalf("expected metric spec %q in %+v", tt.wantMetricKey, gotSpecs)
			}
			if spec.MinAllowed != tt.wantMinAllowed || spec.MaxAllowed != tt.wantMaxAllowed {
				t.Fatalf("expected allowed range %.2f..%.2f, got %.2f..%.2f", tt.wantMinAllowed, tt.wantMaxAllowed, spec.MinAllowed, spec.MaxAllowed)
			}
			assertFloatPtrValue(t, spec.Default.Min, tt.wantDefaultMin)
			assertFloatPtrValue(t, spec.Default.Max, tt.wantDefaultMax)
			if tt.wantRule != "" && !stringSliceContains(gotRules, tt.wantRule) {
				t.Fatalf("expected rule %q in %+v", tt.wantRule, gotRules)
			}
		})
	}
}

func TestValidateThresholdWorkstream(t *testing.T) {
	spec := metricSpec{Key: "fill_level", Label: "fill level", MinAllowed: 0, MaxAllowed: 100}

	tests := []struct {
		name                 string
		cfg                  models.ThresholdConfig
		want                 models.ThresholdConfig
		wantRule             string
		wantWarningSubstring string
	}{
		{
			name: "clamps just below minimum and just above maximum",
			cfg: models.ThresholdConfig{
				Min:        floatPtr(-0.1),
				Max:        floatPtr(100.1),
				WarningMin: floatPtr(-1),
				WarningMax: floatPtr(101),
			},
			want: models.ThresholdConfig{
				Min:        floatPtr(0),
				Max:        floatPtr(100),
				WarningMin: floatPtr(0),
				WarningMax: floatPtr(100),
			},
			wantRule:             "metric_range_clamp",
			wantWarningSubstring: "adjusted to stay within",
		},
		{
			name: "keeps values exactly on boundaries",
			cfg: models.ThresholdConfig{
				Min:        floatPtr(0),
				Max:        floatPtr(100),
				WarningMin: floatPtr(0),
				WarningMax: floatPtr(100),
			},
			want: models.ThresholdConfig{
				Min:        floatPtr(0),
				Max:        floatPtr(100),
				WarningMin: floatPtr(0),
				WarningMax: floatPtr(100),
			},
		},
		{
			name: "swaps minimum and maximum when minimum is greater",
			cfg: models.ThresholdConfig{
				Min: floatPtr(80),
				Max: floatPtr(20),
			},
			want: models.ThresholdConfig{
				Min: floatPtr(20),
				Max: floatPtr(80),
			},
			wantRule:             "threshold_consistency",
			wantWarningSubstring: "minimum exceeded maximum",
		},
		{
			name: "aligns warning thresholds with hard thresholds",
			cfg: models.ThresholdConfig{
				Min:        floatPtr(40),
				Max:        floatPtr(60),
				WarningMin: floatPtr(50),
				WarningMax: floatPtr(55),
			},
			want: models.ThresholdConfig{
				Min:        floatPtr(40),
				Max:        floatPtr(60),
				WarningMin: floatPtr(40),
				WarningMax: floatPtr(60),
			},
			wantRule:             "threshold_consistency",
			wantWarningSubstring: "warning",
		},
		{
			name: "removes impossible warning minimum after warning range validation",
			cfg: models.ThresholdConfig{
				WarningMin: floatPtr(75),
				WarningMax: floatPtr(25),
			},
			want: models.ThresholdConfig{
				WarningMax: floatPtr(25),
			},
			wantRule:             "threshold_consistency",
			wantWarningSubstring: "warning minimum was removed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			warnings := []string{}
			appliedRules := map[string]bool{}

			got := validateThreshold("fill_level", spec, tt.cfg, &warnings, appliedRules)

			assertThresholdConfig(t, got, tt.want)
			if tt.wantRule != "" && !appliedRules[tt.wantRule] {
				t.Fatalf("expected applied rule %q in %+v", tt.wantRule, appliedRules)
			}
			if tt.wantRule == "" && len(warnings) != 0 {
				t.Fatalf("expected no warnings, got %+v", warnings)
			}
			if tt.wantWarningSubstring != "" && !warningsContain(warnings, tt.wantWarningSubstring) {
				t.Fatalf("expected warning containing %q in %+v", tt.wantWarningSubstring, warnings)
			}
		})
	}
}

func TestValidateAndFinalizeConfigWorkstream(t *testing.T) {
	completeContext := &models.SensorContext{
		Domain:          "agriculture",
		EnvironmentType: "farm",
		IndoorOutdoor:   "outdoor",
		AssetType:       "tomato greenhouse",
	}

	t.Run("keeps valid boundary reporting frequency without confirmation", func(t *testing.T) {
		result := validateAndFinalizeConfig(
			"temperature_humidity",
			"Monitor tomato greenhouse climate",
			completeContext,
			models.SensorConfig{
				FriendlyName:         "Tomato Climate",
				ReportIntervalPerDay: 144,
				PowerManagement: models.PowerManagementConfig{
					SamplingFrequency: 144,
				},
			},
			controllerCapability{MinReportingIntervalSec: 600},
			"ok",
		)

		if result.ValidationStatus != "valid" {
			t.Fatalf("expected valid status, got %q with warnings %+v", result.ValidationStatus, result.Warnings)
		}
		if result.RequiresUserConfirmation {
			t.Fatalf("did not expect user confirmation for complete valid config")
		}
		if result.FinalConfig.ReportIntervalPerDay != 144 {
			t.Fatalf("expected 144 reports per day, got %d", result.FinalConfig.ReportIntervalPerDay)
		}
		if result.FinalConfig.PrimaryMetric != "temperature" {
			t.Fatalf("expected temperature primary metric, got %q", result.FinalConfig.PrimaryMetric)
		}
	})

	t.Run("raises reporting frequency below lower boundary and defaults blank friendly name", func(t *testing.T) {
		result := validateAndFinalizeConfig(
			"temperature",
			"Room temperature",
			completeContext,
			models.SensorConfig{
				FriendlyName:         "   ",
				ReportIntervalPerDay: 0,
			},
			controllerCapability{MinReportingIntervalSec: 600},
			"",
		)

		if result.FinalConfig.FriendlyName != "Sensor" {
			t.Fatalf("expected default friendly name, got %q", result.FinalConfig.FriendlyName)
		}
		if result.FinalConfig.ReportIntervalPerDay != 1 {
			t.Fatalf("expected reporting frequency to be raised to 1, got %d", result.FinalConfig.ReportIntervalPerDay)
		}
		assertRulePresent(t, result.AppliedRules, "required_defaults")
		assertRulePresent(t, result.AppliedRules, "reporting_frequency_bounds")
		if result.ValidationStatus != "adjusted" || !result.RequiresUserConfirmation {
			t.Fatalf("expected adjusted status requiring confirmation, got status=%q confirm=%v", result.ValidationStatus, result.RequiresUserConfirmation)
		}
	})

	t.Run("clamps reporting frequency above controller maximum", func(t *testing.T) {
		result := validateAndFinalizeConfig(
			"pressure",
			"Warehouse pressure",
			completeContext,
			models.SensorConfig{
				FriendlyName:         "Pressure Monitor",
				ReportIntervalPerDay: 145,
			},
			controllerCapability{MinReportingIntervalSec: 600},
			"",
		)

		if result.FinalConfig.ReportIntervalPerDay != 144 {
			t.Fatalf("expected reporting frequency clamped to 144, got %d", result.FinalConfig.ReportIntervalPerDay)
		}
		assertRulePresent(t, result.AppliedRules, "controller_capability_check")
	})

	t.Run("falls back to default controller interval when capability is invalid", func(t *testing.T) {
		result := validateAndFinalizeConfig(
			"pressure",
			"Warehouse pressure",
			completeContext,
			models.SensorConfig{
				FriendlyName:         "Pressure Monitor",
				ReportIntervalPerDay: 289,
			},
			controllerCapability{MinReportingIntervalSec: 0},
			"",
		)

		if result.FinalConfig.ReportIntervalPerDay != 288 {
			t.Fatalf("expected reporting frequency clamped to fallback 288 maximum, got %d", result.FinalConfig.ReportIntervalPerDay)
		}
		assertRulePresent(t, result.AppliedRules, "controller_capability_check")
	})

	t.Run("marks overdue calibration and incomplete context for review", func(t *testing.T) {
		result := validateAndFinalizeConfig(
			"gas_sensor",
			"Detect unsafe gas levels",
			&models.SensorContext{Domain: "industrial"},
			models.SensorConfig{
				FriendlyName:         "Gas Monitor",
				ReportIntervalPerDay: 24,
				PowerManagement: models.PowerManagementConfig{
					SamplingFrequency: 24,
				},
			},
			defaultControllerCapability(),
			" overdue ",
		)

		if !result.RequiresUserConfirmation || result.ValidationStatus != "adjusted" {
			t.Fatalf("expected adjusted config requiring confirmation, got status=%q confirm=%v", result.ValidationStatus, result.RequiresUserConfirmation)
		}
		assertRulePresent(t, result.AppliedRules, "context_quality_check")
		assertRulePresent(t, result.AppliedRules, "calibration_check")
		if result.ConfidenceScore >= 0.92 {
			t.Fatalf("expected confidence to be reduced, got %.2f", result.ConfidenceScore)
		}
	})
}

func assertRulePresent(t *testing.T, rules []string, want string) {
	t.Helper()
	if !stringSliceContains(rules, want) {
		t.Fatalf("expected rule %q in %+v", want, rules)
	}
}

func stringSliceContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func warningsContain(warnings []string, want string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, want) {
			return true
		}
	}
	return false
}

func assertFloatPtrValue(t *testing.T, got *float64, want *float64) {
	t.Helper()
	if got == nil && want == nil {
		return
	}
	if got == nil || want == nil {
		t.Fatalf("expected float pointer %v, got %v", want, got)
	}
	if *got != *want {
		t.Fatalf("expected %.2f, got %.2f", *want, *got)
	}
}

func assertThresholdConfig(t *testing.T, got models.ThresholdConfig, want models.ThresholdConfig) {
	t.Helper()
	assertFloatPtrValue(t, got.Min, want.Min)
	assertFloatPtrValue(t, got.Max, want.Max)
	assertFloatPtrValue(t, got.WarningMin, want.WarningMin)
	assertFloatPtrValue(t, got.WarningMax, want.WarningMax)
}
