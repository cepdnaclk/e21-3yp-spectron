package models

import "strings"

func (cfg *SensorConfig) NormalizeThreeLayer(sensorType string, ctx *SensorContext) {
	if cfg == nil {
		return
	}

	if cfg.Interpretation == nil && (cfg.FriendlyName != "" ||
		cfg.UseCase != "" ||
		cfg.PrimaryMetric != "" ||
		!isEmptyThresholdConfig(cfg.Thresholds) ||
		len(cfg.MetricThresholds) > 0 ||
		len(cfg.RecommendationRules) > 0 ||
		ctx != nil) {
		cfg.Interpretation = &SensorInterpretationLayer{}
	}

	if cfg.Interpretation != nil {
		if strings.TrimSpace(cfg.FriendlyName) == "" {
			cfg.FriendlyName = strings.TrimSpace(cfg.Interpretation.FriendlyName)
		}
		if strings.TrimSpace(cfg.UseCase) == "" {
			cfg.UseCase = strings.TrimSpace(cfg.Interpretation.UseCase)
		}
		if strings.TrimSpace(cfg.PrimaryMetric) == "" {
			cfg.PrimaryMetric = strings.TrimSpace(cfg.Interpretation.PrimaryMetric)
		}
		if isEmptyThresholdConfig(cfg.Thresholds) {
			cfg.Thresholds = cloneThresholdConfig(cfg.Interpretation.Thresholds)
		}
		if len(cfg.MetricThresholds) == 0 && len(cfg.Interpretation.MetricThresholds) > 0 {
			cfg.MetricThresholds = CloneThresholdMap(cfg.Interpretation.MetricThresholds)
		}
		if cfg.Interpretation.FriendlyName == "" {
			cfg.Interpretation.FriendlyName = strings.TrimSpace(cfg.FriendlyName)
		}
		if cfg.Interpretation.UseCase == "" {
			cfg.Interpretation.UseCase = strings.TrimSpace(cfg.UseCase)
		}
		if cfg.Interpretation.PrimaryMetric == "" {
			cfg.Interpretation.PrimaryMetric = strings.TrimSpace(cfg.PrimaryMetric)
		}
		if isEmptyThresholdConfig(cfg.Interpretation.Thresholds) {
			cfg.Interpretation.Thresholds = cloneThresholdConfig(cfg.Thresholds)
		}
		if len(cfg.Interpretation.MetricThresholds) == 0 && len(cfg.MetricThresholds) > 0 {
			cfg.Interpretation.MetricThresholds = CloneThresholdMap(cfg.MetricThresholds)
		}
		if cfg.Interpretation.Context == nil && ctx != nil {
			cfg.Interpretation.Context = CloneSensorContext(ctx)
		}
	}

	if cfg.Presentation == nil && strings.TrimSpace(cfg.PresentationProfile) != "" {
		cfg.Presentation = &SensorPresentationLayer{}
	}
	if cfg.Presentation != nil {
		if strings.TrimSpace(cfg.PresentationProfile) == "" {
			cfg.PresentationProfile = strings.TrimSpace(cfg.Presentation.Profile)
		}
		if cfg.Presentation.Profile == "" {
			cfg.Presentation.Profile = strings.TrimSpace(cfg.PresentationProfile)
		}
	}

	if cfg.Settings == nil && (cfg.ReportIntervalPerDay > 0 || !isZeroPowerManagement(cfg.PowerManagement)) {
		cfg.Settings = &SensorSettingsLayer{}
	}
	if cfg.Settings != nil {
		if cfg.ReportIntervalPerDay == 0 {
			cfg.ReportIntervalPerDay = cfg.Settings.ReportIntervalPerDay
		}
		if isZeroPowerManagement(cfg.PowerManagement) {
			cfg.PowerManagement = cfg.Settings.PowerManagement
		}
		if cfg.Settings.ReportIntervalPerDay == 0 {
			cfg.Settings.ReportIntervalPerDay = cfg.ReportIntervalPerDay
		}
		if isZeroPowerManagement(cfg.Settings.PowerManagement) {
			cfg.Settings.PowerManagement = cfg.PowerManagement
		}
	}

	if cfg.Operational == nil && (cfg.ReportIntervalPerDay > 0 || !isZeroPowerManagement(cfg.PowerManagement)) {
		cfg.Operational = &SensorOperationalLayer{}
	}
	if cfg.Operational != nil {
		if cfg.ReportIntervalPerDay == 0 {
			cfg.ReportIntervalPerDay = cfg.Operational.ReportIntervalPerDay
		}
		if isZeroPowerManagement(cfg.PowerManagement) {
			cfg.PowerManagement = cfg.Operational.PowerManagement
		}
		if cfg.Operational.ReportIntervalPerDay == 0 {
			cfg.Operational.ReportIntervalPerDay = cfg.ReportIntervalPerDay
		}
		if isZeroPowerManagement(cfg.Operational.PowerManagement) {
			cfg.Operational.PowerManagement = cfg.PowerManagement
		}
	}

	if cfg.Hardware == nil && len(cfg.HardwareConfig) > 0 {
		cfg.Hardware = &SensorHardwareLayer{}
	}
	if cfg.Hardware != nil {
		if cfg.Hardware.SensorType == "" {
			cfg.Hardware.SensorType = strings.TrimSpace(sensorType)
		}
		if cfg.Hardware.SensorName == "" {
			cfg.Hardware.SensorName = strings.TrimSpace(cfg.FriendlyName)
		}
		if len(cfg.HardwareConfig) == 0 && len(cfg.Hardware.Config) > 0 {
			cfg.HardwareConfig = CloneHardwareConfigMap(cfg.Hardware.Config)
		}
		if len(cfg.Hardware.Config) == 0 && len(cfg.HardwareConfig) > 0 {
			cfg.Hardware.Config = CloneHardwareConfigMap(cfg.HardwareConfig)
		}
		if cfg.Operational != nil && cfg.Operational.ReadingFlowType == "" {
			if readingFlowType, ok := stringValue(cfg.Hardware.Config["readingFlowType"]); ok {
				cfg.Operational.ReadingFlowType = readingFlowType
			}
		}
	}

	if cfg.Operational != nil && cfg.Hardware != nil {
		if cfg.Operational.ReadingFlowType == "" {
			if readingFlowType, ok := stringValue(cfg.Hardware.Config["readingFlowType"]); ok {
				cfg.Operational.ReadingFlowType = readingFlowType
			}
		}
		if cfg.Operational.ReadingFlowType != "" && cfg.Hardware.Config != nil {
			if _, ok := cfg.Hardware.Config["readingFlowType"]; !ok {
				cfg.Hardware.Config["readingFlowType"] = cfg.Operational.ReadingFlowType
			}
		}
	}

	if cfg.Settings != nil && cfg.Operational != nil {
		if cfg.Settings.ReportIntervalPerDay == 0 {
			cfg.Settings.ReportIntervalPerDay = cfg.Operational.ReportIntervalPerDay
		}
		if cfg.Operational.ReportIntervalPerDay == 0 {
			cfg.Operational.ReportIntervalPerDay = cfg.Settings.ReportIntervalPerDay
		}
		if cfg.Settings.ReadingFlowType == "" {
			cfg.Settings.ReadingFlowType = strings.TrimSpace(cfg.Operational.ReadingFlowType)
		}
		if cfg.Operational.ReadingFlowType == "" {
			cfg.Operational.ReadingFlowType = strings.TrimSpace(cfg.Settings.ReadingFlowType)
		}
		if isZeroPowerManagement(cfg.Settings.PowerManagement) {
			cfg.Settings.PowerManagement = cfg.Operational.PowerManagement
		}
		if isZeroPowerManagement(cfg.Operational.PowerManagement) {
			cfg.Operational.PowerManagement = cfg.Settings.PowerManagement
		}
	}
}

func (cfg SensorConfig) HasMeaningfulContent() bool {
	return strings.TrimSpace(cfg.FriendlyName) != "" ||
		strings.TrimSpace(cfg.UseCase) != "" ||
		strings.TrimSpace(cfg.PresentationProfile) != "" ||
		strings.TrimSpace(cfg.PrimaryMetric) != "" ||
		cfg.ReportIntervalPerDay > 0 ||
		!isZeroPowerManagement(cfg.PowerManagement) ||
		!isEmptyThresholdConfig(cfg.Thresholds) ||
		len(cfg.MetricThresholds) > 0 ||
		len(cfg.RecommendationRules) > 0 ||
		len(cfg.HardwareConfig) > 0 ||
		cfg.Hardware != nil ||
		cfg.Interpretation != nil ||
		cfg.Presentation != nil ||
		cfg.Settings != nil ||
		cfg.Operational != nil
}

func CloneThresholdMap(source map[string]ThresholdConfig) map[string]ThresholdConfig {
	if len(source) == 0 {
		return nil
	}

	cloned := make(map[string]ThresholdConfig, len(source))
	for key, value := range source {
		cloned[key] = cloneThresholdConfig(value)
	}
	return cloned
}

func cloneThresholdConfig(source ThresholdConfig) ThresholdConfig {
	cloned := ThresholdConfig{}
	if source.Min != nil {
		value := *source.Min
		cloned.Min = &value
	}
	if source.Max != nil {
		value := *source.Max
		cloned.Max = &value
	}
	if source.WarningMin != nil {
		value := *source.WarningMin
		cloned.WarningMin = &value
	}
	if source.WarningMax != nil {
		value := *source.WarningMax
		cloned.WarningMax = &value
	}
	return cloned
}

func CloneHardwareConfigMap(source map[string]interface{}) map[string]interface{} {
	if len(source) == 0 {
		return nil
	}

	cloned := make(map[string]interface{}, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func CloneSensorContext(source *SensorContext) *SensorContext {
	if source == nil {
		return nil
	}

	cloned := *source
	if source.Location != nil {
		location := *source.Location
		cloned.Location = &location
	}
	return &cloned
}

func isZeroPowerManagement(cfg PowerManagementConfig) bool {
	return cfg.BatteryLifeDays == 0 && cfg.SamplingFrequency == 0
}

func isEmptyThresholdConfig(cfg ThresholdConfig) bool {
	return cfg.Min == nil && cfg.Max == nil && cfg.WarningMin == nil && cfg.WarningMax == nil
}

func stringValue(value interface{}) (string, bool) {
	asString, ok := value.(string)
	if !ok {
		return "", false
	}

	trimmed := strings.TrimSpace(asString)
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
}
