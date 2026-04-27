package httpapi

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"spectron-backend/internal/models"
)

type controllerCapability struct {
	MinReportingIntervalSec  int
	SupportsAdaptiveSampling bool
	SupportsLocalAlerts      bool
	OfflineBufferCapacity    int
	Profile                  map[string]any
}

type metricSpec struct {
	Key        string
	Label      string
	MinAllowed float64
	MaxAllowed float64
	Default    models.ThresholdConfig
}

const (
	useCaseGeneric     = "generic_monitoring"
	useCaseClimate     = "climate_monitoring"
	useCaseFillLevel   = "fill_level_monitoring"
	useCaseOccupancy   = "occupancy_monitoring"
	useCaseAttendance  = "attendance_monitoring"
	useCaseLoad        = "load_monitoring"
	useCaseSafety      = "safety_monitoring"
	profileSingleTrend = "single_trend"
	profileDualClimate = "dual_climate"
	profileLevel       = "level_monitoring"
	profileCounter     = "counter_status"
	profileGauge       = "gauge_status"
	profileTimeline    = "event_timeline"
)

func normalizeSensorContext(ctx *models.SensorContext) *models.SensorContext {
	if ctx == nil {
		return nil
	}

	normalized := *ctx
	normalized.Domain = strings.ToLower(strings.TrimSpace(normalized.Domain))
	normalized.EnvironmentType = strings.ToLower(strings.TrimSpace(normalized.EnvironmentType))
	normalized.IndoorOutdoor = strings.ToLower(strings.TrimSpace(normalized.IndoorOutdoor))
	normalized.AssetType = strings.ToLower(strings.TrimSpace(normalized.AssetType))
	normalized.InstallationNotes = strings.TrimSpace(normalized.InstallationNotes)

	if normalized.Location != nil {
		location := *normalized.Location
		location.Mode = strings.ToLower(strings.TrimSpace(location.Mode))
		location.Label = strings.TrimSpace(location.Label)
		location.Country = strings.TrimSpace(location.Country)
		location.Region = strings.TrimSpace(location.Region)
		normalized.Location = &location
	}

	if normalized.Domain == "" &&
		normalized.EnvironmentType == "" &&
		normalized.IndoorOutdoor == "" &&
		normalized.AssetType == "" &&
		normalized.InstallationNotes == "" &&
		normalized.Location == nil &&
		normalized.HistoricalWindowDays == nil {
		return nil
	}

	return &normalized
}

func mergeSensorContext(primary *models.SensorContext, fallback *models.SensorContext) *models.SensorContext {
	if primary == nil && fallback == nil {
		return nil
	}
	if primary == nil {
		return normalizeSensorContext(fallback)
	}
	if fallback == nil {
		return normalizeSensorContext(primary)
	}

	merged := *normalizeSensorContext(fallback)
	primaryNormalized := normalizeSensorContext(primary)
	if primaryNormalized == nil {
		return &merged
	}

	if primaryNormalized.Domain != "" {
		merged.Domain = primaryNormalized.Domain
	}
	if primaryNormalized.EnvironmentType != "" {
		merged.EnvironmentType = primaryNormalized.EnvironmentType
	}
	if primaryNormalized.IndoorOutdoor != "" {
		merged.IndoorOutdoor = primaryNormalized.IndoorOutdoor
	}
	if primaryNormalized.AssetType != "" {
		merged.AssetType = primaryNormalized.AssetType
	}
	if primaryNormalized.InstallationNotes != "" {
		merged.InstallationNotes = primaryNormalized.InstallationNotes
	}
	if primaryNormalized.HistoricalWindowDays != nil {
		merged.HistoricalWindowDays = primaryNormalized.HistoricalWindowDays
	}
	if primaryNormalized.Location != nil {
		if merged.Location == nil {
			location := *primaryNormalized.Location
			merged.Location = &location
		} else {
			location := *merged.Location
			if primaryNormalized.Location.Mode != "" {
				location.Mode = primaryNormalized.Location.Mode
			}
			if primaryNormalized.Location.Label != "" {
				location.Label = primaryNormalized.Location.Label
			}
			if primaryNormalized.Location.Country != "" {
				location.Country = primaryNormalized.Location.Country
			}
			if primaryNormalized.Location.Region != "" {
				location.Region = primaryNormalized.Location.Region
			}
			if primaryNormalized.Location.Latitude != nil {
				location.Latitude = primaryNormalized.Location.Latitude
			}
			if primaryNormalized.Location.Longitude != nil {
				location.Longitude = primaryNormalized.Location.Longitude
			}
			merged.Location = &location
		}
	}

	return normalizeSensorContext(&merged)
}

func contextSummary(ctx *models.SensorContext) string {
	if ctx == nil {
		return "none provided"
	}

	parts := []string{}
	if ctx.Domain != "" {
		parts = append(parts, fmt.Sprintf("domain=%s", ctx.Domain))
	}
	if ctx.EnvironmentType != "" {
		parts = append(parts, fmt.Sprintf("environment=%s", ctx.EnvironmentType))
	}
	if ctx.IndoorOutdoor != "" {
		parts = append(parts, fmt.Sprintf("exposure=%s", ctx.IndoorOutdoor))
	}
	if ctx.AssetType != "" {
		parts = append(parts, fmt.Sprintf("asset=%s", ctx.AssetType))
	}
	if ctx.Location != nil {
		locationParts := []string{}
		if ctx.Location.Region != "" {
			locationParts = append(locationParts, ctx.Location.Region)
		}
		if ctx.Location.Country != "" {
			locationParts = append(locationParts, ctx.Location.Country)
		}
		if ctx.Location.Label != "" {
			locationParts = append(locationParts, ctx.Location.Label)
		}
		if len(locationParts) > 0 {
			parts = append(parts, fmt.Sprintf("location=%s", strings.Join(locationParts, ", ")))
		}
	}
	if len(parts) == 0 {
		return "none provided"
	}
	return strings.Join(parts, "; ")
}

func parseSensorContext(raw []byte) *models.SensorContext {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}

	var ctx models.SensorContext
	if err := json.Unmarshal(raw, &ctx); err != nil {
		return nil
	}
	return normalizeSensorContext(&ctx)
}

func contextJSON(ctx *models.SensorContext) []byte {
	if ctx == nil {
		return []byte("{}")
	}

	payload, err := json.Marshal(ctx)
	if err != nil {
		return []byte("{}")
	}
	return payload
}

func defaultControllerCapability() controllerCapability {
	return controllerCapability{
		MinReportingIntervalSec:  600,
		SupportsAdaptiveSampling: false,
		SupportsLocalAlerts:      false,
		OfflineBufferCapacity:    2000,
		Profile:                  map[string]any{},
	}
}

func normalizeSuggestionValue(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func compactSuggestionText(parts ...string) string {
	joined := strings.Join(parts, " ")
	joined = strings.ToLower(joined)
	replacer := strings.NewReplacer("_", " ", "-", " ", ",", " ", ";", " ", ".", " ", "/", " ")
	return strings.Join(strings.Fields(replacer.Replace(joined)), " ")
}

func containsAnyKeyword(text string, keywords ...string) bool {
	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

func inferUseCaseAndProfile(
	sensorType string,
	purpose string,
	ctx *models.SensorContext,
	requestedUseCase string,
	requestedProfile string,
	defaultPrimaryMetric string,
) (string, string, string, []string) {
	sensorType = normalizeSuggestionValue(sensorType)
	requestedUseCase = normalizeSuggestionValue(requestedUseCase)
	requestedProfile = normalizeSuggestionValue(requestedProfile)

	locationLabel := ""
	if ctx != nil && ctx.Location != nil {
		locationLabel = ctx.Location.Label
	}

	text := compactSuggestionText(
		purpose,
		locationLabel,
		func() string {
			if ctx == nil {
				return ""
			}
			return strings.Join([]string{
				ctx.Domain,
				ctx.EnvironmentType,
				ctx.IndoorOutdoor,
				ctx.AssetType,
				ctx.InstallationNotes,
			}, " ")
		}(),
	)

	suggestedUseCase := requestedUseCase
	suggestedProfile := requestedProfile
	appliedRules := []string{}

	switch sensorType {
	case "temperature_humidity", "temp_humidity", "dht11", "dht22":
		if suggestedUseCase == "" {
			suggestedUseCase = useCaseClimate
			appliedRules = append(appliedRules, "use_case_default_climate")
		}
		if suggestedProfile == "" {
			suggestedProfile = profileDualClimate
			appliedRules = append(appliedRules, "presentation_profile_default_dual_climate")
		}
		return suggestedUseCase, suggestedProfile, "temperature", appliedRules
	case "temperature", "humidity":
		if suggestedUseCase == "" {
			suggestedUseCase = useCaseClimate
			appliedRules = append(appliedRules, "use_case_default_climate")
		}
		if suggestedProfile == "" {
			suggestedProfile = profileSingleTrend
			appliedRules = append(appliedRules, "presentation_profile_default_single_trend")
		}
		return suggestedUseCase, suggestedProfile, defaultPrimaryMetric, appliedRules
	case "ultrasonic":
		if suggestedUseCase == "" {
			if containsAnyKeyword(text, "attendance", "class attendance", "classroom", "class", "student", "students", "lesson", "lecture") {
				suggestedUseCase = useCaseAttendance
				appliedRules = append(appliedRules, "use_case_inferred_attendance")
			} else if containsAnyKeyword(text, "occupancy", "people", "person", "crowd", "queue", "visitor", "entry", "footfall") {
				suggestedUseCase = useCaseOccupancy
				appliedRules = append(appliedRules, "use_case_inferred_occupancy")
			} else if containsAnyKeyword(text, "fill", "level", "bin", "tank", "silo", "container", "bay", "storage") {
				suggestedUseCase = useCaseFillLevel
				appliedRules = append(appliedRules, "use_case_inferred_fill_level")
			} else {
				suggestedUseCase = useCaseFillLevel
				appliedRules = append(appliedRules, "use_case_default_fill_level")
			}
		}
	case "load", "load_cell":
		if suggestedUseCase == "" {
			suggestedUseCase = useCaseLoad
			appliedRules = append(appliedRules, "use_case_default_load")
		}
	case "gas_sensor", "air_quality":
		if suggestedUseCase == "" {
			suggestedUseCase = useCaseSafety
			appliedRules = append(appliedRules, "use_case_default_safety")
		}
	default:
		if suggestedUseCase == "" {
			suggestedUseCase = useCaseGeneric
			appliedRules = append(appliedRules, "use_case_default_generic")
		}
	}

	if suggestedProfile == "" {
		switch suggestedUseCase {
		case useCaseClimate:
			suggestedProfile = profileSingleTrend
		case useCaseFillLevel:
			suggestedProfile = profileLevel
		case useCaseOccupancy, useCaseAttendance:
			suggestedProfile = profileCounter
		case useCaseLoad, useCaseSafety:
			suggestedProfile = profileGauge
		default:
			suggestedProfile = profileSingleTrend
		}
		appliedRules = append(appliedRules, "presentation_profile_inferred")
	}

	switch sensorType {
	case "temperature_humidity", "temp_humidity", "dht11", "dht22":
		if suggestedProfile != profileDualClimate && suggestedProfile != profileSingleTrend {
			suggestedProfile = profileDualClimate
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, "temperature", appliedRules
	case "ultrasonic":
		if (suggestedUseCase == useCaseOccupancy || suggestedUseCase == useCaseAttendance) && suggestedProfile == profileLevel {
			suggestedProfile = profileCounter
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, defaultPrimaryMetric, appliedRules
	case "load", "load_cell":
		if suggestedProfile == profileDualClimate || suggestedProfile == profileCounter {
			suggestedProfile = profileGauge
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, defaultPrimaryMetric, appliedRules
	case "gas_sensor", "air_quality":
		if suggestedProfile == profileDualClimate || suggestedProfile == profileLevel {
			suggestedProfile = profileGauge
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, defaultPrimaryMetric, appliedRules
	default:
		if suggestedProfile == profileDualClimate {
			suggestedProfile = profileSingleTrend
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, defaultPrimaryMetric, appliedRules
	}
}

func metricSpecsForSensor(sensorType string, ctx *models.SensorContext) (string, map[string]metricSpec, []string) {
	sensorType = strings.ToLower(strings.TrimSpace(sensorType))
	appliedRules := []string{}

	defaultTemperature := models.ThresholdConfig{
		Min:        floatPtr(18.0),
		Max:        floatPtr(25.0),
		WarningMin: floatPtr(15.0),
		WarningMax: floatPtr(28.0),
	}
	defaultHumidity := models.ThresholdConfig{
		Min:        floatPtr(30.0),
		Max:        floatPtr(70.0),
		WarningMin: floatPtr(20.0),
		WarningMax: floatPtr(80.0),
	}

	if ctx != nil && (ctx.EnvironmentType == "farm" || ctx.Domain == "agriculture") {
		appliedRules = append(appliedRules, "context_defaults_agriculture")
		defaultTemperature = models.ThresholdConfig{
			Min:        floatPtr(18.0),
			Max:        floatPtr(30.0),
			WarningMin: floatPtr(15.0),
			WarningMax: floatPtr(35.0),
		}
		defaultHumidity = models.ThresholdConfig{
			Min:        floatPtr(45.0),
			Max:        floatPtr(85.0),
			WarningMin: floatPtr(35.0),
			WarningMax: floatPtr(90.0),
		}

		if strings.Contains(ctx.AssetType, "tomato") {
			appliedRules = append(appliedRules, "asset_defaults_tomato")
			defaultTemperature = models.ThresholdConfig{
				Min:        floatPtr(20.0),
				Max:        floatPtr(30.0),
				WarningMin: floatPtr(18.0),
				WarningMax: floatPtr(32.0),
			}
			defaultHumidity = models.ThresholdConfig{
				Min:        floatPtr(60.0),
				Max:        floatPtr(85.0),
				WarningMin: floatPtr(50.0),
				WarningMax: floatPtr(90.0),
			}
		}
	} else if ctx != nil && ctx.EnvironmentType == "warehouse" {
		appliedRules = append(appliedRules, "context_defaults_warehouse")
		defaultTemperature = models.ThresholdConfig{
			Min:        floatPtr(10.0),
			Max:        floatPtr(30.0),
			WarningMin: floatPtr(5.0),
			WarningMax: floatPtr(35.0),
		}
		defaultHumidity = models.ThresholdConfig{
			Min:        floatPtr(30.0),
			Max:        floatPtr(70.0),
			WarningMin: floatPtr(20.0),
			WarningMax: floatPtr(80.0),
		}
	} else if ctx != nil && (ctx.EnvironmentType == "home" || strings.Contains(ctx.AssetType, "room")) {
		appliedRules = append(appliedRules, "context_defaults_home")
		defaultTemperature = models.ThresholdConfig{
			Min:        floatPtr(18.0),
			Max:        floatPtr(28.0),
			WarningMin: floatPtr(15.0),
			WarningMax: floatPtr(32.0),
		}
		defaultHumidity = models.ThresholdConfig{
			Min:        floatPtr(30.0),
			Max:        floatPtr(70.0),
			WarningMin: floatPtr(20.0),
			WarningMax: floatPtr(80.0),
		}
	}

	switch sensorType {
	case "temperature":
		return "temperature", map[string]metricSpec{
			"temperature": {
				Key:        "temperature",
				Label:      "temperature",
				MinAllowed: -10,
				MaxAllowed: 60,
				Default:    defaultTemperature,
			},
		}, appliedRules
	case "humidity":
		return "humidity", map[string]metricSpec{
			"humidity": {
				Key:        "humidity",
				Label:      "humidity",
				MinAllowed: 0,
				MaxAllowed: 100,
				Default:    defaultHumidity,
			},
		}, appliedRules
	case "temperature_humidity", "temp_humidity", "dht11", "dht22":
		return "temperature", map[string]metricSpec{
			"temperature": {
				Key:        "temperature",
				Label:      "temperature",
				MinAllowed: -10,
				MaxAllowed: 60,
				Default:    defaultTemperature,
			},
			"humidity": {
				Key:        "humidity",
				Label:      "humidity",
				MinAllowed: 0,
				MaxAllowed: 100,
				Default:    defaultHumidity,
			},
		}, appliedRules
	case "ultrasonic":
		return "fill_level", map[string]metricSpec{
			"fill_level": {
				Key:        "fill_level",
				Label:      "fill level",
				MinAllowed: 0,
				MaxAllowed: 100,
				Default: models.ThresholdConfig{
					Max:        floatPtr(80.0),
					WarningMax: floatPtr(90.0),
				},
			},
		}, appliedRules
	case "load", "load_cell":
		return "weight", map[string]metricSpec{
			"weight": {
				Key:        "weight",
				Label:      "weight",
				MinAllowed: 0,
				MaxAllowed: 5000,
				Default: models.ThresholdConfig{
					Max:        floatPtr(250.0),
					WarningMax: floatPtr(300.0),
				},
			},
		}, appliedRules
	case "gas_sensor":
		return "gas_level", map[string]metricSpec{
			"gas_level": {
				Key:        "gas_level",
				Label:      "gas level",
				MinAllowed: 0,
				MaxAllowed: 1000,
				Default: models.ThresholdConfig{
					Max:        floatPtr(350.0),
					WarningMax: floatPtr(450.0),
				},
			},
		}, appliedRules
	case "air_quality":
		return "aqi", map[string]metricSpec{
			"aqi": {
				Key:        "aqi",
				Label:      "air quality index",
				MinAllowed: 0,
				MaxAllowed: 500,
				Default: models.ThresholdConfig{
					Max:        floatPtr(100.0),
					WarningMax: floatPtr(150.0),
				},
			},
		}, appliedRules
	default:
		return "value", map[string]metricSpec{
			"value": {
				Key:        "value",
				Label:      "value",
				MinAllowed: -100000,
				MaxAllowed: 100000,
				Default:    models.ThresholdConfig{},
			},
		}, appliedRules
	}
}

func isEmptyThreshold(cfg models.ThresholdConfig) bool {
	return cfg.Min == nil && cfg.Max == nil && cfg.WarningMin == nil && cfg.WarningMax == nil
}

func cloneThreshold(cfg models.ThresholdConfig) models.ThresholdConfig {
	cloned := models.ThresholdConfig{}
	if cfg.Min != nil {
		value := *cfg.Min
		cloned.Min = &value
	}
	if cfg.Max != nil {
		value := *cfg.Max
		cloned.Max = &value
	}
	if cfg.WarningMin != nil {
		value := *cfg.WarningMin
		cloned.WarningMin = &value
	}
	if cfg.WarningMax != nil {
		value := *cfg.WarningMax
		cloned.WarningMax = &value
	}
	return cloned
}

func validateThreshold(metricKey string, spec metricSpec, cfg models.ThresholdConfig, warnings *[]string, appliedRules map[string]bool) models.ThresholdConfig {
	finalCfg := cloneThreshold(cfg)

	clamp := func(label string, value **float64) {
		if *value == nil {
			return
		}
		original := **value
		clamped := math.Max(spec.MinAllowed, math.Min(spec.MaxAllowed, original))
		if clamped != original {
			*value = floatPtr(clamped)
			*warnings = append(*warnings, fmt.Sprintf("%s %s adjusted to stay within %.2f and %.2f", metricKey, label, spec.MinAllowed, spec.MaxAllowed))
			appliedRules["metric_range_clamp"] = true
		}
	}

	clamp("minimum", &finalCfg.Min)
	clamp("maximum", &finalCfg.Max)
	clamp("warning minimum", &finalCfg.WarningMin)
	clamp("warning maximum", &finalCfg.WarningMax)

	if finalCfg.Min != nil && finalCfg.Max != nil && *finalCfg.Min > *finalCfg.Max {
		minValue := *finalCfg.Max
		maxValue := *finalCfg.Min
		finalCfg.Min = floatPtr(minValue)
		finalCfg.Max = floatPtr(maxValue)
		*warnings = append(*warnings, fmt.Sprintf("%s minimum exceeded maximum, so the values were swapped", metricKey))
		appliedRules["threshold_consistency"] = true
	}

	if finalCfg.WarningMin != nil && finalCfg.Min != nil && *finalCfg.WarningMin > *finalCfg.Min {
		finalCfg.WarningMin = floatPtr(*finalCfg.Min)
		*warnings = append(*warnings, fmt.Sprintf("%s warning minimum was reduced so it does not exceed the minimum threshold", metricKey))
		appliedRules["threshold_consistency"] = true
	}

	if finalCfg.WarningMax != nil && finalCfg.Max != nil && *finalCfg.WarningMax < *finalCfg.Max {
		finalCfg.WarningMax = floatPtr(*finalCfg.Max)
		*warnings = append(*warnings, fmt.Sprintf("%s warning maximum was raised so it does not sit below the maximum threshold", metricKey))
		appliedRules["threshold_consistency"] = true
	}

	if finalCfg.WarningMin != nil && finalCfg.WarningMax != nil && *finalCfg.WarningMin > *finalCfg.WarningMax {
		finalCfg.WarningMin = nil
		*warnings = append(*warnings, fmt.Sprintf("%s warning minimum was removed because it exceeded warning maximum", metricKey))
		appliedRules["threshold_consistency"] = true
	}

	return finalCfg
}

func validateAndFinalizeConfig(sensorType string, purpose string, ctx *models.SensorContext, config models.SensorConfig, capability controllerCapability, calibrationStatus string) models.ConfigValidationResult {
	normalizedContext := normalizeSensorContext(ctx)
	primaryMetric, specs, specRules := metricSpecsForSensor(sensorType, normalizedContext)
	appliedRules := map[string]bool{}
	for _, rule := range specRules {
		appliedRules[rule] = true
	}

	metricThresholds := map[string]models.ThresholdConfig{}
	for key, spec := range specs {
		metricThresholds[key] = cloneThreshold(spec.Default)
	}

	if len(config.MetricThresholds) > 0 {
		for key, value := range config.MetricThresholds {
			if _, exists := metricThresholds[key]; exists {
				metricThresholds[key] = value
			}
		}
	}

	if !isEmptyThreshold(config.Thresholds) {
		if _, exists := metricThresholds[primaryMetric]; exists {
			metricThresholds[primaryMetric] = config.Thresholds
		}
	}

	finalUseCase, finalPresentationProfile, finalPrimaryMetric, suggestionRules := inferUseCaseAndProfile(
		sensorType,
		purpose,
		normalizedContext,
		config.UseCase,
		config.PresentationProfile,
		primaryMetric,
	)
	for _, rule := range suggestionRules {
		appliedRules[rule] = true
	}

	warnings := []string{}
	for key, spec := range specs {
		metricThresholds[key] = validateThreshold(key, spec, metricThresholds[key], &warnings, appliedRules)
	}

	finalThresholds := metricThresholds[primaryMetric]

	if strings.TrimSpace(config.FriendlyName) == "" {
		config.FriendlyName = "Sensor"
		warnings = append(warnings, "Friendly name was empty, so a default name was applied")
		appliedRules["required_defaults"] = true
	}

	reportsPerDay := config.ReportIntervalPerDay
	if reportsPerDay < 1 {
		reportsPerDay = 1
		warnings = append(warnings, "Reporting frequency was below 1 report per day, so it was raised to 1")
		appliedRules["reporting_frequency_bounds"] = true
	}

	minIntervalSeconds := capability.MinReportingIntervalSec
	if minIntervalSeconds <= 0 {
		minIntervalSeconds = 300
	}

	maxReportsPerDay := 86400 / minIntervalSeconds
	if maxReportsPerDay < 1 {
		maxReportsPerDay = 1
	}

	if reportsPerDay > maxReportsPerDay {
		reportsPerDay = maxReportsPerDay
		warnings = append(warnings, fmt.Sprintf("Reporting frequency was reduced to %d reports per day because the controller minimum interval is %d seconds", maxReportsPerDay, minIntervalSeconds))
		appliedRules["controller_capability_check"] = true
	}

	metricCount := len(metricThresholds)
	if metricCount < 1 {
		metricCount = 1
	}

	estimatedBatteryLifeDays := estimateBatteryLifeDays(reportsPerDay, metricCount)
	if config.PowerManagement.SamplingFrequency != reportsPerDay {
		warnings = append(warnings, "Sampling frequency was aligned with the validated reporting frequency")
		appliedRules["power_management_alignment"] = true
	}
	if config.PowerManagement.BatteryLifeDays != 0 && config.PowerManagement.BatteryLifeDays != estimatedBatteryLifeDays {
		warnings = append(warnings, "Battery life estimate was recalculated from the validated reporting settings")
		appliedRules["power_management_alignment"] = true
	}

	requiresUserConfirmation := len(warnings) > 0
	if normalizedContext == nil || normalizedContext.Domain == "" || normalizedContext.EnvironmentType == "" {
		requiresUserConfirmation = true
		warnings = append(warnings, "Configuration confidence is lower because domain or environment context is incomplete")
		appliedRules["context_quality_check"] = true
	}
	if strings.EqualFold(strings.TrimSpace(calibrationStatus), "OVERDUE") {
		requiresUserConfirmation = true
		warnings = append(warnings, "Sensor calibration is overdue, so threshold recommendations should be reviewed before automation")
		appliedRules["calibration_check"] = true
	}

	validationStatus := "valid"
	if len(warnings) > 0 {
		validationStatus = "adjusted"
	}

	confidenceScore := 0.92
	if normalizedContext == nil {
		confidenceScore -= 0.18
	}
	confidenceScore -= math.Min(0.35, float64(len(warnings))*0.04)
	if confidenceScore < 0.35 {
		confidenceScore = 0.35
	}

	appliedRuleList := make([]string, 0, len(appliedRules))
	for _, rule := range []string{
		"context_defaults_agriculture",
		"asset_defaults_tomato",
		"context_defaults_warehouse",
		"context_defaults_home",
		"use_case_default_climate",
		"use_case_inferred_attendance",
		"use_case_inferred_fill_level",
		"use_case_default_fill_level",
		"use_case_inferred_occupancy",
		"use_case_default_load",
		"use_case_default_safety",
		"use_case_default_generic",
		"presentation_profile_default_dual_climate",
		"presentation_profile_default_single_trend",
		"presentation_profile_inferred",
		"presentation_profile_compatibility_adjustment",
		"metric_range_clamp",
		"threshold_consistency",
		"required_defaults",
		"reporting_frequency_bounds",
		"controller_capability_check",
		"power_management_alignment",
		"context_quality_check",
		"calibration_check",
	} {
		if appliedRules[rule] {
			appliedRuleList = append(appliedRuleList, rule)
		}
	}

	return models.ConfigValidationResult{
		FinalConfig: models.SensorConfig{
			FriendlyName:         strings.TrimSpace(config.FriendlyName),
			UseCase:              finalUseCase,
			PresentationProfile:  finalPresentationProfile,
			PrimaryMetric:        finalPrimaryMetric,
			Thresholds:           finalThresholds,
			MetricThresholds:     metricThresholds,
			ReportIntervalPerDay: reportsPerDay,
			PowerManagement: models.PowerManagementConfig{
				BatteryLifeDays:   estimatedBatteryLifeDays,
				SamplingFrequency: reportsPerDay,
			},
		},
		ValidationStatus:         validationStatus,
		Warnings:                 warnings,
		AppliedRules:             appliedRuleList,
		ConfidenceScore:          confidenceScore,
		RequiresUserConfirmation: requiresUserConfirmation,
	}
}
