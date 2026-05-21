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
	case "temperature", "humidity", "bme280", "bmp280":
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
	case "vl53l0x", "distance", "pressure":
		if suggestedUseCase == "" {
			suggestedUseCase = useCaseGeneric
			appliedRules = append(appliedRules, "use_case_default_generic")
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
	case "bme280", "bmp280":
		if suggestedProfile == profileDualClimate || suggestedProfile == profileCounter || suggestedProfile == profileLevel {
			suggestedProfile = profileSingleTrend
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, "temperature", appliedRules
	case "vl53l0x", "distance", "pressure":
		if suggestedProfile == profileDualClimate || suggestedProfile == profileCounter {
			suggestedProfile = profileSingleTrend
			appliedRules = append(appliedRules, "presentation_profile_compatibility_adjustment")
		}
		return suggestedUseCase, suggestedProfile, defaultPrimaryMetric, appliedRules
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
	case "bme280", "bmp280":
		return "temperature", map[string]metricSpec{
			"temperature": {
				Key:        "temperature",
				Label:      "temperature",
				MinAllowed: -10,
				MaxAllowed: 60,
				Default:    defaultTemperature,
			},
			"pressure": {
				Key:        "pressure",
				Label:      "pressure",
				MinAllowed: 30,
				MaxAllowed: 120,
				Default: models.ThresholdConfig{
					Min:        floatPtr(95.0),
					Max:        floatPtr(105.0),
					WarningMin: floatPtr(90.0),
					WarningMax: floatPtr(110.0),
				},
			},
		}, appliedRules
	case "pressure":
		return "pressure", map[string]metricSpec{
			"pressure": {
				Key:        "pressure",
				Label:      "pressure",
				MinAllowed: 30,
				MaxAllowed: 120,
				Default: models.ThresholdConfig{
					Min:        floatPtr(95.0),
					Max:        floatPtr(105.0),
					WarningMin: floatPtr(90.0),
					WarningMax: floatPtr(110.0),
				},
			},
		}, appliedRules
	case "vl53l0x", "distance":
		return "distance", map[string]metricSpec{
			"distance": {
				Key:        "distance",
				Label:      "distance",
				MinAllowed: 0,
				MaxAllowed: 500,
				Default: models.ThresholdConfig{
					Max:        floatPtr(100.0),
					WarningMax: floatPtr(150.0),
				},
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
			"overload_risk": {
				Key:        "overload_risk",
				Label:      "overload risk",
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

func metricSpecsForUseCase(sensorType string, useCase string, ctx *models.SensorContext) (string, map[string]metricSpec, []string) {
	primaryMetric, specs, appliedRules := metricSpecsForSensor(sensorType, ctx)
	switch normalizeSuggestionValue(sensorType) {
	case "ultrasonic":
		switch normalizeSuggestionValue(useCase) {
		case useCaseGeneric:
			return "distance", map[string]metricSpec{
				"distance": {
					Key:        "distance",
					Label:      "distance",
					MinAllowed: 0,
					MaxAllowed: 500,
					Default: models.ThresholdConfig{
						Max:        floatPtr(100.0),
						WarningMax: floatPtr(150.0),
					},
				},
			}, appliedRules
		case useCaseOccupancy:
			return "occupancy_count", map[string]metricSpec{
				"occupancy_count": {
					Key:        "occupancy_count",
					Label:      "occupancy count",
					MinAllowed: 0,
					MaxAllowed: 500,
					Default: models.ThresholdConfig{
						Max:        floatPtr(25.0),
						WarningMax: floatPtr(35.0),
					},
				},
			}, append(appliedRules, "primary_metric_use_case_occupancy")
		case useCaseAttendance:
			return "attendance_count", map[string]metricSpec{
				"attendance_count": {
					Key:        "attendance_count",
					Label:      "attendance count",
					MinAllowed: 0,
					MaxAllowed: 500,
					Default: models.ThresholdConfig{
						Min:        floatPtr(20.0),
						WarningMin: floatPtr(15.0),
					},
				},
			}, append(appliedRules, "primary_metric_use_case_attendance")
		}
	}

	return primaryMetric, specs, appliedRules
}

func supportedRawMetricsForSensor(sensorType string) []models.SensorHardwareMetric {
	switch normalizeSuggestionValue(sensorType) {
	case "temperature":
		return []models.SensorHardwareMetric{
			{Key: "temperature", Label: "Temperature", Unit: "C", MinimumValue: floatPtr(-10), MaximumValue: floatPtr(60)},
		}
	case "humidity":
		return []models.SensorHardwareMetric{
			{Key: "humidity", Label: "Humidity", Unit: "%RH", MinimumValue: floatPtr(0), MaximumValue: floatPtr(100)},
		}
	case "temperature_humidity", "temp_humidity", "dht11", "dht22":
		return []models.SensorHardwareMetric{
			{Key: "temperature", Label: "Temperature", Unit: "C", MinimumValue: floatPtr(-10), MaximumValue: floatPtr(60)},
			{Key: "humidity", Label: "Humidity", Unit: "%RH", MinimumValue: floatPtr(0), MaximumValue: floatPtr(100)},
		}
	case "bme280", "bmp280":
		return []models.SensorHardwareMetric{
			{Key: "temperature", Label: "Temperature", Unit: "C", MinimumValue: floatPtr(-10), MaximumValue: floatPtr(60)},
			{Key: "pressure", Label: "Pressure", Unit: "kPa", MinimumValue: floatPtr(30), MaximumValue: floatPtr(120)},
		}
	case "pressure":
		return []models.SensorHardwareMetric{
			{Key: "pressure", Label: "Pressure", Unit: "kPa", MinimumValue: floatPtr(30), MaximumValue: floatPtr(120)},
		}
	case "vl53l0x", "distance", "ultrasonic":
		return []models.SensorHardwareMetric{
			{Key: "distance", Label: "Distance", Unit: "cm", MinimumValue: floatPtr(0), MaximumValue: floatPtr(500)},
		}
	case "load", "load_cell":
		return []models.SensorHardwareMetric{
			{Key: "weight", Label: "Weight", Unit: "kg", MinimumValue: floatPtr(0), MaximumValue: floatPtr(5000)},
		}
	case "gas", "gas_sensor":
		return []models.SensorHardwareMetric{
			{Key: "gas_level", Label: "Gas Level", Unit: "ppm", MinimumValue: floatPtr(0), MaximumValue: floatPtr(1000)},
		}
	case "air_quality":
		return []models.SensorHardwareMetric{
			{Key: "aqi", Label: "Air Quality Index", Unit: "AQI", MinimumValue: floatPtr(0), MaximumValue: floatPtr(500)},
		}
	default:
		return nil
	}
}

func derivedMetricsForUseCase(sensorType string, useCase string) []models.SensorDerivedMetric {
	normalizedType := normalizeSuggestionValue(sensorType)
	normalizedUseCase := normalizeSuggestionValue(useCase)

	if normalizedType == "ultrasonic" {
		switch normalizedUseCase {
		case useCaseGeneric:
			return []models.SensorDerivedMetric{
				{
					Key:           "distance_state",
					Label:         "Distance State",
					Unit:          "cm",
					SourceMetrics: []string{"distance"},
					Formula:       "Latest distance reading compared against configured thresholds",
					Description:   "Turns raw distance into a customer-facing near, normal, or far state.",
				},
			}
		case useCaseOccupancy:
			return []models.SensorDerivedMetric{
				{
					Key:           "occupancy_count",
					Label:         "Occupancy Count",
					Unit:          "people",
					SourceMetrics: []string{"distance"},
					Formula:       "Distance triggers converted into a people count window",
					Description:   "Represents how many people are detected in the monitored area.",
				},
				{
					Key:           "occupancy_state",
					Label:         "Occupancy State",
					SourceMetrics: []string{"occupancy_count"},
					Formula:       "Count banded into quiet, normal, or busy ranges",
					Description:   "Summarizes the crowd condition for dashboards and alerts.",
				},
			}
		case useCaseAttendance:
			return []models.SensorDerivedMetric{
				{
					Key:           "attendance_count",
					Label:         "Attendance Count",
					Unit:          "people",
					SourceMetrics: []string{"distance"},
					Formula:       "Entry or presence triggers converted into attendance counts",
					Description:   "Tracks how many people are present for the attendance window.",
				},
				{
					Key:           "attendance_status",
					Label:         "Attendance Status",
					SourceMetrics: []string{"attendance_count"},
					Formula:       "Attendance count checked against the expected threshold",
					Description:   "Shows whether attendance is below target, on target, or above target.",
				},
			}
		default:
			return []models.SensorDerivedMetric{
				{
					Key:           "fill_level_percent",
					Label:         "Fill Level Percentage",
					Unit:          "%",
					SourceMetrics: []string{"distance"},
					Formula:       "Distance normalized between empty and full calibration points",
					Description:   "Converts raw distance into a percentage fill level for the container.",
				},
				{
					Key:           "service_state",
					Label:         "Service State",
					SourceMetrics: []string{"fill_level_percent"},
					Formula:       "Fill level banded into normal, pickup soon, or urgent",
					Description:   "Summarizes collection urgency based on the derived fill level.",
				},
			}
		}
	}

	switch normalizedUseCase {
	case useCaseClimate:
		return []models.SensorDerivedMetric{
			{
				Key:           "climate_condition",
				Label:         "Climate Condition",
				SourceMetrics: []string{"temperature", "humidity"},
				Formula:       "Temperature and humidity compared with the configured comfort or crop bands",
				Description:   "Summarizes whether the environment is dry, comfortable, humid, hot, or cold.",
			},
		}
	case useCaseLoad:
		return []models.SensorDerivedMetric{
			{
				Key:           "utilization_percent",
				Label:         "Utilization Percentage",
				Unit:          "%",
				SourceMetrics: []string{"weight"},
				Formula:       "Current weight divided by configured maximum operating load",
				Description:   "Shows how much of the supported load capacity is currently used.",
			},
			{
				Key:           "overload_risk",
				Label:         "Overload Risk",
				SourceMetrics: []string{"utilization_percent"},
				Formula:       "Utilization banded into safe, caution, or overload zones",
				Description:   "Highlights whether the load is approaching or exceeding safe limits.",
			},
		}
	case useCaseSafety:
		sourceMetric := "gas_level"
		if normalizedType == "air_quality" {
			sourceMetric = "aqi"
		}
		return []models.SensorDerivedMetric{
			{
				Key:           "risk_level",
				Label:         "Risk Level",
				SourceMetrics: []string{sourceMetric},
				Formula:       "Latest safety reading mapped into low, medium, or high risk bands",
				Description:   "Provides an easy-to-understand risk label for the monitored environment.",
			},
			{
				Key:           "safety_state",
				Label:         "Safety State",
				SourceMetrics: []string{"risk_level"},
				Formula:       "Risk level converted into safe, warning, or critical state",
				Description:   "Supports operator decisions and alert routing.",
			},
		}
	default:
		return []models.SensorDerivedMetric{
			{
				Key:           "state_summary",
				Label:         "State Summary",
				SourceMetrics: []string{"value"},
				Formula:       "Latest reading interpreted against customer thresholds",
				Description:   "A human-readable interpretation of the latest sensor state.",
			},
		}
	}
}

func displayUnitForMetric(metricKey string) string {
	switch strings.TrimSpace(metricKey) {
	case "temperature":
		return "C"
	case "humidity":
		return "%RH"
	case "pressure":
		return "hPa"
	case "distance":
		return "cm"
	case "fill_level", "fill_level_percent", "utilization_percent", "overload_risk":
		return "%"
	case "weight":
		return "kg"
	case "gas_level":
		return "ppm"
	case "aqi":
		return "AQI"
	case "occupancy_count", "attendance_count":
		return "people"
	default:
		return ""
	}
}

func presentationLayerDetails(profile string, useCase string) (string, []string, string) {
	switch normalizeSuggestionValue(profile) {
	case profileDualClimate:
		return "dual_stat", []string{"trend", "status"}, "area"
	case profileLevel:
		return "gauge", []string{"trend", "status"}, "line"
	case profileCounter:
		return "counter", []string{"status", "trend"}, "bar"
	case profileGauge:
		return "gauge", []string{"status", "trend"}, "line"
	case profileTimeline:
		return "timeline", []string{"status"}, "timeline"
	default:
		if normalizeSuggestionValue(useCase) == useCaseClimate {
			return "trend", []string{"status"}, "area"
		}
		return "trend", []string{"status"}, "line"
	}
}

func defaultPresentationSemantics(primaryMetric string, profile string) (string, string, string, string) {
	metric := strings.TrimSpace(primaryMetric)

	switch normalizeSuggestionValue(profile) {
	case profileDualClimate:
		return "balanced", "comfort_band", "paired_thresholds", "paired_trends"
	case profileLevel:
		return "fill_level", "service_urgency", "used_capacity", "service_focus"
	case profileCounter:
		if metric == "attendance_count" {
			return "attendance_count", "attendance_target", "target_gap", "arrival_pattern"
		}
		return "occupancy_count", "crowd_state", "live_count", "recent_activity"
	case profileGauge:
		switch metric {
		case "weight":
			return "weight", "capacity_load", "raw_weight", "load_trend"
		case "overload_risk":
			return "overload_risk", "overload_risk", "risk_band", "safety_focus"
		case "gas_level", "aqi":
			return metric, "safety_exposure", "ppm_band", "ventilation_watch"
		case "fill_level":
			return "fill_level", "service_urgency", "used_capacity", "service_focus"
		default:
			return metric, "threshold_band", "threshold_band", "trend_first"
		}
	case profileTimeline:
		if metric == "" {
			metric = "value"
		}
		return metric, "event_severity", "event_threshold", "incident_feed"
	default:
		switch metric {
		case "temperature":
			return "temperature", "temperature_band", "threshold_band", "trend_first"
		case "humidity":
			return "humidity", "humidity_band", "threshold_band", "trend_first"
		case "distance":
			return "distance", "distance_limit", "threshold_band", "trend_first"
		case "weight":
			return "weight", "load_band", "threshold_band", "trend_first"
		case "overload_risk":
			return "overload_risk", "overload_risk", "risk_band", "safety_focus"
		case "gas_level", "aqi":
			return metric, "safety_exposure", "threshold_band", "trend_first"
		default:
			if metric == "" {
				metric = "value"
			}
			return metric, "threshold_band", "threshold_band", "trend_first"
		}
	}
}

func presentationSemantics(
	primaryMetric string,
	profile string,
	requested *models.SensorPresentationLayer,
) (string, string, string, string) {
	headlineMetric, statusMode, comparisonMode, detailMode := defaultPresentationSemantics(primaryMetric, profile)
	if requested == nil {
		return headlineMetric, statusMode, comparisonMode, detailMode
	}
	if strings.TrimSpace(requested.HeadlineMetric) != "" {
		headlineMetric = strings.TrimSpace(requested.HeadlineMetric)
	}
	if strings.TrimSpace(requested.StatusMode) != "" {
		statusMode = strings.TrimSpace(requested.StatusMode)
	}
	if strings.TrimSpace(requested.ComparisonMode) != "" {
		comparisonMode = strings.TrimSpace(requested.ComparisonMode)
	}
	if strings.TrimSpace(requested.DetailMode) != "" {
		detailMode = strings.TrimSpace(requested.DetailMode)
	}
	return headlineMetric, statusMode, comparisonMode, detailMode
}

func isClimateSensorType(sensorType string) bool {
	switch normalizeSuggestionValue(sensorType) {
	case "temperature_humidity", "temp_humidity", "dht11", "dht22":
		return true
	default:
		return false
	}
}

func presentationMetricsForProfile(sensorType string, primaryMetric string, profile string) []string {
	if normalizeSuggestionValue(profile) == profileDualClimate && isClimateSensorType(sensorType) {
		return []string{"temperature", "humidity"}
	}
	if strings.TrimSpace(primaryMetric) == "" {
		return []string{"value"}
	}
	return []string{strings.TrimSpace(primaryMetric)}
}

func alertTemplatesForMetric(metricKey string, profile string) []models.SensorAlertSetting {
	unit := displayUnitForMetric(metricKey)

	switch strings.TrimSpace(metricKey) {
	case "temperature":
		return []models.SensorAlertSetting{
			{
				Key:         "temperature_low_band",
				Label:       "Temperature Too Low",
				MetricKey:   "temperature",
				Condition:   "below",
				Unit:        unit,
				Description: "Warn when the environment becomes colder than the acceptable operating band.",
			},
			{
				Key:         "temperature_high_band",
				Label:       "Temperature Too High",
				MetricKey:   "temperature",
				Condition:   "above",
				Unit:        unit,
				Description: "Warn when the environment becomes hotter than the acceptable operating band.",
			},
		}
	case "humidity":
		return []models.SensorAlertSetting{
			{
				Key:         "humidity_low_band",
				Label:       "Humidity Too Low",
				MetricKey:   "humidity",
				Condition:   "below",
				Unit:        unit,
				Description: "Warn when the space becomes drier than the accepted humidity range.",
			},
			{
				Key:         "humidity_high_band",
				Label:       "Humidity Too High",
				MetricKey:   "humidity",
				Condition:   "above",
				Unit:        unit,
				Description: "Warn when the space becomes more humid than the accepted range.",
			},
		}
	case "fill_level":
		label := "Pickup / Refill Alert"
		if normalizeSuggestionValue(profile) == profileGauge {
			label = "Level Capacity Alert"
		}
		return []models.SensorAlertSetting{
			{
				Key:         "fill_level_service_band",
				Label:       label,
				MetricKey:   "fill_level",
				Condition:   "above",
				Unit:        unit,
				Description: "Escalate when fill percentage approaches service or refill capacity.",
			},
		}
	case "occupancy_count":
		return []models.SensorAlertSetting{
			{
				Key:         "occupancy_count_crowd_band",
				Label:       "High Occupancy Alert",
				MetricKey:   "occupancy_count",
				Condition:   "above",
				Unit:        unit,
				Description: "Escalate when the monitored area becomes crowded or exceeds safe occupancy.",
			},
		}
	case "attendance_count":
		return []models.SensorAlertSetting{
			{
				Key:         "attendance_count_attendance_band",
				Label:       "Low Attendance Alert",
				MetricKey:   "attendance_count",
				Condition:   "below",
				Unit:        unit,
				Description: "Warn when attendance drops below the expected session target.",
			},
		}
	case "weight":
		label := "Load Capacity Alert"
		description := "Warn when the measured load approaches or exceeds the supported weight band."
		if normalizeSuggestionValue(profile) == profileSingleTrend {
			label = "Heavy Load Alert"
			description = "Warn when the live weight rises above the preferred operating band."
		}
		return []models.SensorAlertSetting{
			{
				Key:         "weight_capacity_band",
				Label:       label,
				MetricKey:   "weight",
				Condition:   "above",
				Unit:        unit,
				Description: description,
			},
		}
	case "overload_risk":
		return []models.SensorAlertSetting{
			{
				Key:         "overload_risk_capacity_band",
				Label:       "Overload Risk Alert",
				MetricKey:   "overload_risk",
				Condition:   "above",
				Unit:        "kg",
				Description: "Escalate when the live load enters the heavy-load or overload band.",
			},
		}
	case "gas_level", "aqi":
		label := "Safety Exposure Alert"
		description := "Escalate when the safety reading moves beyond acceptable exposure limits."
		switch normalizeSuggestionValue(profile) {
		case profileTimeline:
			label = "Gas Incident Alert"
			description = "Escalate when gas readings cross incident thresholds or remain unsafe."
		case profileSingleTrend:
			label = "Gas Level Alert"
			description = "Warn when the live gas reading rises above the preferred safety band."
		}
		return []models.SensorAlertSetting{
			{
				Key:         metricKey + "_safety_band",
				Label:       label,
				MetricKey:   metricKey,
				Condition:   "above",
				Unit:        unit,
				Description: description,
			},
		}
	case "distance":
		fallthrough
	default:
		label := "Distance Limit Alert"
		description := "Warn when the measured distance exceeds the configured limit."
		if normalizeSuggestionValue(profile) == profileTimeline {
			label = "Distance Crossing Event"
			description = "Escalate when the measured distance crosses the event threshold."
		}
		return []models.SensorAlertSetting{
			{
				Key:         metricKey + "_limit_band",
				Label:       label,
				MetricKey:   metricKey,
				Condition:   "above",
				Unit:        unit,
				Description: description,
			},
		}
	}
}

func applySettingsAlertsToMetricThresholds(
	metricThresholds map[string]models.ThresholdConfig,
	alerts []models.SensorAlertSetting,
	specs map[string]metricSpec,
	primaryMetric string,
) {
	for _, alert := range alerts {
		metricKey := strings.TrimSpace(alert.MetricKey)
		if metricKey == "" {
			metricKey = strings.TrimSpace(primaryMetric)
		}
		if metricKey == "" {
			continue
		}
		if _, ok := specs[metricKey]; !ok {
			continue
		}

		current := cloneThreshold(metricThresholds[metricKey])
		switch strings.ToLower(strings.TrimSpace(alert.Condition)) {
		case "below":
			if alert.WarningThreshold != nil {
				current.Min = floatPtr(*alert.WarningThreshold)
			}
			if alert.CriticalThreshold != nil {
				current.WarningMin = floatPtr(*alert.CriticalThreshold)
			}
		case "above":
			if alert.WarningThreshold != nil {
				current.Max = floatPtr(*alert.WarningThreshold)
			}
			if alert.CriticalThreshold != nil {
				current.WarningMax = floatPtr(*alert.CriticalThreshold)
			}
		}
		metricThresholds[metricKey] = current
	}
}

func buildSettingsAlerts(
	sensorType string,
	profile string,
	primaryMetric string,
	metricThresholds map[string]models.ThresholdConfig,
	requested []models.SensorAlertSetting,
) []models.SensorAlertSetting {
	metrics := presentationMetricsForProfile(sensorType, primaryMetric, profile)
	alerts := []models.SensorAlertSetting{}

	for _, metricKey := range metrics {
		metricThreshold := metricThresholds[metricKey]
		for _, template := range alertTemplatesForMetric(metricKey, profile) {
			current := template

			if existing := findMatchingAlertSetting(requested, template.Key, template.MetricKey, template.Condition); existing != nil {
				if strings.TrimSpace(existing.Label) != "" {
					current.Label = strings.TrimSpace(existing.Label)
				}
				if strings.TrimSpace(existing.Description) != "" {
					current.Description = strings.TrimSpace(existing.Description)
				}
			}

			switch strings.ToLower(strings.TrimSpace(template.Condition)) {
			case "below":
				current.WarningThreshold = cloneFloatPointer(metricThreshold.Min)
				current.CriticalThreshold = cloneFloatPointer(metricThreshold.WarningMin)
			case "above":
				current.WarningThreshold = cloneFloatPointer(metricThreshold.Max)
				current.CriticalThreshold = cloneFloatPointer(metricThreshold.WarningMax)
			}

			alerts = append(alerts, current)
		}
	}

	return alerts
}

func findMatchingAlertSetting(
	alerts []models.SensorAlertSetting,
	key string,
	metricKey string,
	condition string,
) *models.SensorAlertSetting {
	for i := range alerts {
		if strings.TrimSpace(alerts[i].Key) == strings.TrimSpace(key) {
			return &alerts[i]
		}
	}
	for i := range alerts {
		if strings.TrimSpace(alerts[i].MetricKey) == strings.TrimSpace(metricKey) &&
			strings.EqualFold(strings.TrimSpace(alerts[i].Condition), strings.TrimSpace(condition)) {
			return &alerts[i]
		}
	}
	return nil
}

func cloneFloatPointer(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func readingFlowTypeFromConfig(config models.SensorConfig) string {
	if config.Settings != nil && strings.TrimSpace(config.Settings.ReadingFlowType) != "" {
		return strings.TrimSpace(config.Settings.ReadingFlowType)
	}
	if config.Operational != nil && strings.TrimSpace(config.Operational.ReadingFlowType) != "" {
		return strings.TrimSpace(config.Operational.ReadingFlowType)
	}
	if config.Hardware != nil && config.Hardware.Config != nil {
		if value, ok := config.Hardware.Config["readingFlowType"].(string); ok {
			return strings.TrimSpace(value)
		}
	}
	if value, ok := config.HardwareConfig["readingFlowType"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
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
	config.NormalizeThreeLayer(sensorType, normalizedContext)
	primaryMetric, _, specRules := metricSpecsForSensor(sensorType, normalizedContext)
	appliedRules := map[string]bool{}
	for _, rule := range specRules {
		appliedRules[rule] = true
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

	primaryMetric, specs, useCaseMetricRules := metricSpecsForUseCase(sensorType, finalUseCase, normalizedContext)
	for _, rule := range useCaseMetricRules {
		appliedRules[rule] = true
	}

	if requestedMetric := strings.TrimSpace(config.PrimaryMetric); requestedMetric != "" {
		if _, ok := specs[requestedMetric]; ok {
			finalPrimaryMetric = requestedMetric
		}
	}
	if finalPrimaryMetric == "" {
		finalPrimaryMetric = primaryMetric
	}
	if _, ok := specs[finalPrimaryMetric]; !ok {
		finalPrimaryMetric = primaryMetric
		appliedRules["primary_metric_compatibility_adjustment"] = true
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
		if _, exists := metricThresholds[finalPrimaryMetric]; exists {
			metricThresholds[finalPrimaryMetric] = config.Thresholds
		}
	}
	if config.Settings != nil && len(config.Settings.Alerts) > 0 {
		applySettingsAlertsToMetricThresholds(metricThresholds, config.Settings.Alerts, specs, finalPrimaryMetric)
	}

	warnings := []string{}
	for key, spec := range specs {
		metricThresholds[key] = validateThreshold(key, spec, metricThresholds[key], &warnings, appliedRules)
	}

	finalThresholds := metricThresholds[finalPrimaryMetric]

	if strings.TrimSpace(config.FriendlyName) == "" {
		config.FriendlyName = "Sensor"
		warnings = append(warnings, "Friendly name was empty, so a default name was applied")
		appliedRules["required_defaults"] = true
	}

	if requestedMetric := strings.TrimSpace(config.PrimaryMetric); requestedMetric != "" {
		if requestedMetric != finalPrimaryMetric {
			warnings = append(warnings, fmt.Sprintf("Primary metric %q is not compatible with this hardware and use case, so %q was used instead", requestedMetric, finalPrimaryMetric))
		}
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

	primaryWidget, secondaryWidgets, chartStyle := presentationLayerDetails(finalPresentationProfile, finalUseCase)
	headlineMetric, statusMode, comparisonMode, detailMode := presentationSemantics(
		finalPrimaryMetric,
		finalPresentationProfile,
		config.Presentation,
	)
	supportedRawMetrics := supportedRawMetricsForSensor(sensorType)
	derivedMetrics := derivedMetricsForUseCase(sensorType, finalUseCase)
	settingsAlerts := buildSettingsAlerts(
		sensorType,
		finalPresentationProfile,
		finalPrimaryMetric,
		metricThresholds,
		func() []models.SensorAlertSetting {
			if config.Settings == nil {
				return nil
			}
			return config.Settings.Alerts
		}(),
	)
	hardwareConfig := models.CloneHardwareConfigMap(config.HardwareConfig)
	if config.Hardware != nil && len(config.Hardware.Config) > 0 {
		hardwareConfig = models.CloneHardwareConfigMap(config.Hardware.Config)
	}
	readingFlowType := readingFlowTypeFromConfig(config)

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
		"primary_metric_use_case_occupancy",
		"primary_metric_use_case_attendance",
		"primary_metric_compatibility_adjustment",
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
		FinalConfig: func() models.SensorConfig {
			finalConfig := models.SensorConfig{
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
				HardwareConfig: hardwareConfig,
				Hardware: &models.SensorHardwareLayer{
					SensorType:          strings.TrimSpace(sensorType),
					SensorName:          strings.TrimSpace(config.FriendlyName),
					Config:              models.CloneHardwareConfigMap(hardwareConfig),
					SupportedRawMetrics: supportedRawMetrics,
				},
				Interpretation: &models.SensorInterpretationLayer{
					FriendlyName:     strings.TrimSpace(config.FriendlyName),
					Purpose:          strings.TrimSpace(purpose),
					UseCase:          finalUseCase,
					PrimaryMetric:    finalPrimaryMetric,
					DisplayUnit:      displayUnitForMetric(finalPrimaryMetric),
					DerivedMetrics:   derivedMetrics,
					Thresholds:       finalThresholds,
					MetricThresholds: models.CloneThresholdMap(metricThresholds),
					Context:          models.CloneSensorContext(normalizedContext),
				},
				Presentation: &models.SensorPresentationLayer{
					Profile:          finalPresentationProfile,
					PrimaryWidget:    primaryWidget,
					SecondaryWidgets: secondaryWidgets,
					ChartStyle:       chartStyle,
					HeadlineMetric:   headlineMetric,
					StatusMode:       statusMode,
					ComparisonMode:   comparisonMode,
					DetailMode:       detailMode,
				},
				Settings: &models.SensorSettingsLayer{
					Alerts:               settingsAlerts,
					ReportIntervalPerDay: reportsPerDay,
					ReadingFlowType:      readingFlowType,
					PowerManagement: models.PowerManagementConfig{
						BatteryLifeDays:   estimatedBatteryLifeDays,
						SamplingFrequency: reportsPerDay,
					},
				},
				Operational: &models.SensorOperationalLayer{
					ReportIntervalPerDay: reportsPerDay,
					PowerManagement: models.PowerManagementConfig{
						BatteryLifeDays:   estimatedBatteryLifeDays,
						SamplingFrequency: reportsPerDay,
					},
					ReadingFlowType: readingFlowType,
				},
			}
			if config.Hardware != nil {
				finalConfig.Hardware.SystemName = strings.TrimSpace(config.Hardware.SystemName)
			}
			finalConfig.NormalizeThreeLayer(sensorType, normalizedContext)
			return finalConfig
		}(),
		ValidationStatus:         validationStatus,
		Warnings:                 warnings,
		AppliedRules:             appliedRuleList,
		ConfidenceScore:          confidenceScore,
		RequiresUserConfirmation: requiresUserConfirmation,
	}
}
