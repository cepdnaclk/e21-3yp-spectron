package models

import (
	"time"

	"github.com/google/uuid"
)

type Sensor struct {
	ID                uuid.UUID          `json:"id"`
	ControllerID      uuid.UUID          `json:"controller_id"`
	HWID              string             `json:"hw_id"`
	Type              string             `json:"type"`
	Name              *string            `json:"name,omitempty"`
	Purpose           *string            `json:"purpose,omitempty"`
	Unit              *string            `json:"unit,omitempty"`
	Status            string             `json:"status"` // OK, OFFLINE, ERROR
	ConfigActive      bool               `json:"config_active"`
	ActiveConfig      *SensorConfig      `json:"active_config,omitempty"`
	LastSeen          *time.Time         `json:"last_seen,omitempty"`
	Context           *SensorContext     `json:"context,omitempty"`
	Observation       *SensorObservation `json:"observation,omitempty"`
	LastCalibratedAt  *time.Time         `json:"last_calibrated_at,omitempty"`
	CalibrationDueAt  *time.Time         `json:"calibration_due_at,omitempty"`
	CalibrationStatus string             `json:"calibration_status,omitempty"`
}

type SensorObservation struct {
	Status            string     `json:"status"`
	Message           string     `json:"message"`
	WindowDays        int        `json:"window_days"`
	ReadingsCollected int        `json:"readings_collected"`
	MinimumReadings   int        `json:"minimum_readings"`
	StartedAt         *time.Time `json:"started_at,omitempty"`
	LastReadingAt     *time.Time `json:"last_reading_at,omitempty"`
}

type SensorConfig struct {
	FriendlyName         string                     `json:"friendly_name"`
	UseCase              string                     `json:"use_case,omitempty"`
	PresentationProfile  string                     `json:"presentation_profile,omitempty"`
	PrimaryMetric        string                     `json:"primary_metric,omitempty"`
	Thresholds           ThresholdConfig            `json:"thresholds"`
	MetricThresholds     map[string]ThresholdConfig `json:"metric_thresholds,omitempty"`
	RecommendationRules  []RecommendationRule       `json:"recommendation_rules,omitempty"`
	ReportIntervalPerDay int                        `json:"report_interval_per_day"`
	PowerManagement      PowerManagementConfig      `json:"power_management"`
	HardwareConfig       map[string]interface{}     `json:"hardware_config,omitempty"`
	Hardware             *SensorHardwareLayer       `json:"hardware,omitempty"`
	Interpretation       *SensorInterpretationLayer `json:"interpretation,omitempty"`
	Presentation         *SensorPresentationLayer   `json:"presentation,omitempty"`
	Settings             *SensorSettingsLayer       `json:"settings,omitempty"`
	Operational          *SensorOperationalLayer    `json:"operational,omitempty"`
}

type SensorHardwareLayer struct {
	SystemName          string                 `json:"system_name,omitempty"`
	SensorType          string                 `json:"sensor_type,omitempty"`
	SensorName          string                 `json:"sensor_name,omitempty"`
	Config              map[string]interface{} `json:"config,omitempty"`
	SupportedRawMetrics []SensorHardwareMetric `json:"supported_raw_metrics,omitempty"`
}

type SensorInterpretationLayer struct {
	FriendlyName      string                     `json:"friendly_name,omitempty"`
	Purpose           string                     `json:"purpose,omitempty"`
	UseCase           string                     `json:"use_case,omitempty"`
	PrimaryMetric     string                     `json:"primary_metric,omitempty"`
	DisplayUnit       string                     `json:"display_unit,omitempty"`
	ObservableMetrics []string                   `json:"observable_metrics,omitempty"`
	DerivedMetrics    []SensorDerivedMetric      `json:"derived_metrics,omitempty"`
	Thresholds        ThresholdConfig            `json:"thresholds"`
	MetricThresholds  map[string]ThresholdConfig `json:"metric_thresholds,omitempty"`
	Context           *SensorContext             `json:"context,omitempty"`
}

type SensorPresentationLayer struct {
	Profile          string   `json:"profile,omitempty"`
	PrimaryWidget    string   `json:"primary_widget,omitempty"`
	SecondaryWidgets []string `json:"secondary_widgets,omitempty"`
	ChartStyle       string   `json:"chart_style,omitempty"`
	HeadlineMetric   string   `json:"headline_metric,omitempty"`
	StatusMode       string   `json:"status_mode,omitempty"`
	ComparisonMode   string   `json:"comparison_mode,omitempty"`
	DetailMode       string   `json:"detail_mode,omitempty"`
}

type SensorSettingsLayer struct {
	Alerts               []SensorAlertSetting  `json:"alerts,omitempty"`
	ReportIntervalPerDay int                   `json:"report_interval_per_day,omitempty"`
	ReadingFlowType      string                `json:"reading_flow_type,omitempty"`
	PowerManagement      PowerManagementConfig `json:"power_management"`
}

type SensorAlertSetting struct {
	Key               string   `json:"key"`
	Label             string   `json:"label"`
	MetricKey         string   `json:"metric_key,omitempty"`
	Condition         string   `json:"condition,omitempty"`
	Unit              string   `json:"unit,omitempty"`
	WarningThreshold  *float64 `json:"warning_threshold,omitempty"`
	CriticalThreshold *float64 `json:"critical_threshold,omitempty"`
	Description       string   `json:"description,omitempty"`
}

type RecommendationRule struct {
	MetricType           string   `json:"metric_type"`
	Operator             string   `json:"operator"`
	ThresholdMin         *float64 `json:"threshold_min,omitempty"`
	ThresholdMax         *float64 `json:"threshold_max,omitempty"`
	SustainedMinutes     int      `json:"sustained_minutes"`
	RiskLevel            string   `json:"risk_level"`
	ActionRecommendation string   `json:"action_recommendation"`
}

type SensorOperationalLayer struct {
	ReportIntervalPerDay int                   `json:"report_interval_per_day,omitempty"`
	PowerManagement      PowerManagementConfig `json:"power_management"`
	ReadingFlowType      string                `json:"reading_flow_type,omitempty"`
}

type ThresholdConfig struct {
	Min        *float64 `json:"min,omitempty"`
	Max        *float64 `json:"max,omitempty"`
	WarningMin *float64 `json:"warning_min,omitempty"`
	WarningMax *float64 `json:"warning_max,omitempty"`
}

type SensorHardwareMetric struct {
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Unit         string   `json:"unit,omitempty"`
	MinimumValue *float64 `json:"minimum_value,omitempty"`
	MaximumValue *float64 `json:"maximum_value,omitempty"`
}

type SensorDerivedMetric struct {
	Key           string   `json:"key"`
	Label         string   `json:"label"`
	Unit          string   `json:"unit,omitempty"`
	SourceMetrics []string `json:"source_metrics,omitempty"`
	Formula       string   `json:"formula,omitempty"`
	Description   string   `json:"description,omitempty"`
}

type PowerManagementConfig struct {
	BatteryLifeDays   int `json:"battery_life_days"`
	SamplingFrequency int `json:"sampling_frequency"`
}

type SamplingPreferences struct {
	Frequency *string `json:"frequency,omitempty"` // low, medium, high
}

type LocationContext struct {
	Mode      string   `json:"mode,omitempty"`
	Label     string   `json:"label,omitempty"`
	Country   string   `json:"country,omitempty"`
	Region    string   `json:"region,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
}

type SensorContext struct {
	Domain               string           `json:"domain,omitempty"`
	EnvironmentType      string           `json:"environment_type,omitempty"`
	IndoorOutdoor        string           `json:"indoor_outdoor,omitempty"`
	AssetType            string           `json:"asset_type,omitempty"`
	InstallationNotes    string           `json:"installation_notes,omitempty"`
	HistoricalWindowDays *int             `json:"historical_window_days,omitempty"`
	Location             *LocationContext `json:"location,omitempty"`
}

type AISuggestRequest struct {
	Purpose                string               `json:"purpose"`
	Context                *SensorContext       `json:"context,omitempty"`
	DesiredBatteryLifeDays *int                 `json:"desired_battery_life_days,omitempty"`
	SamplingPreferences    *SamplingPreferences `json:"sampling_preferences,omitempty"`
	FollowUpAnswers        map[string]string    `json:"follow_up_answers,omitempty"`
}

type AIFollowUpQuestion struct {
	ID          string `json:"id"`
	Question    string `json:"question"`
	Placeholder string `json:"placeholder,omitempty"`
}

type AISuggestResponse struct {
	SuggestedConfig          SensorConfig         `json:"suggested_config"`
	ValidatedConfig          SensorConfig         `json:"validated_config"`
	Explanation              string               `json:"explanation"`
	ValidationStatus         string               `json:"validation_status"`
	Warnings                 []string             `json:"warnings,omitempty"`
	AppliedRules             []string             `json:"applied_rules,omitempty"`
	ConfidenceScore          float64              `json:"confidence_score"`
	RequiresUserConfirmation bool                 `json:"requires_user_confirmation"`
	NeedsFollowUp            bool                 `json:"needs_follow_up,omitempty"`
	FollowUpQuestions        []AIFollowUpQuestion `json:"follow_up_questions,omitempty"`
}

type SaveSensorConfigRequest struct {
	Purpose string         `json:"purpose"`
	Context *SensorContext `json:"context,omitempty"`
	Config  *SensorConfig  `json:"config,omitempty"`
}

type UpdateSensorRequest struct {
	Name *string `json:"name,omitempty"`
}

type ConfigValidationResult struct {
	FinalConfig              SensorConfig `json:"final_config"`
	ValidationStatus         string       `json:"validation_status"`
	Warnings                 []string     `json:"warnings,omitempty"`
	AppliedRules             []string     `json:"applied_rules,omitempty"`
	ConfidenceScore          float64      `json:"confidence_score"`
	RequiresUserConfirmation bool         `json:"requires_user_confirmation"`
}

type SaveSensorConfigResponse struct {
	Status                   string             `json:"status"`
	ValidatedConfig          SensorConfig       `json:"validated_config"`
	ValidationStatus         string             `json:"validation_status"`
	Warnings                 []string           `json:"warnings,omitempty"`
	AppliedRules             []string           `json:"applied_rules,omitempty"`
	ConfidenceScore          float64            `json:"confidence_score"`
	RequiresUserConfirmation bool               `json:"requires_user_confirmation"`
	ConfigActive             bool               `json:"config_active"`
	Observation              *SensorObservation `json:"observation,omitempty"`
}

type LearningPhaseSummary struct {
	WindowDays           int             `json:"windowDays"`
	PrimaryMetric        string          `json:"primaryMetric"`
	ReadingsCollected    int             `json:"readingsCollected"`
	ReportIntervalPerDay int             `json:"reportIntervalPerDay,omitempty"`
	CurrentThresholds    ThresholdConfig `json:"currentThresholds"`
	AlertCount           int             `json:"alertCount"`
	WarningAlertCount    int             `json:"warningAlertCount"`
	CriticalAlertCount   int             `json:"criticalAlertCount"`
	MinimumValue         *float64        `json:"minimumValue,omitempty"`
	MaximumValue         *float64        `json:"maximumValue,omitempty"`
	AverageValue         *float64        `json:"averageValue,omitempty"`
	LatestValue          *float64        `json:"latestValue,omitempty"`
	FirstValue           *float64        `json:"firstValue,omitempty"`
	TrendDelta           *float64        `json:"trendDelta,omitempty"`
}

type LearningPhaseFeedback struct {
	Source                        string           `json:"source"`
	Model                         string           `json:"model,omitempty"`
	GeneratedAt                   *time.Time       `json:"generatedAt,omitempty"`
	Summary                       string           `json:"summary"`
	Observations                  []string         `json:"observations,omitempty"`
	Recommendations               []string         `json:"recommendations,omitempty"`
	SuggestedThresholds           *ThresholdConfig `json:"suggestedThresholds,omitempty"`
	SuggestedReportIntervalPerDay *int             `json:"suggestedReportIntervalPerDay,omitempty"`
	ConfidenceScore               float64          `json:"confidenceScore"`
}

type LearningPhaseStatusResponse struct {
	Phase             string                 `json:"phase"`
	DayNumber         int                    `json:"dayNumber"`
	RequiredDays      int                    `json:"requiredDays"`
	StartedAt         *time.Time             `json:"startedAt,omitempty"`
	CompletedAt       *time.Time             `json:"completedAt,omitempty"`
	LastReadingAt     *time.Time             `json:"lastReadingAt,omitempty"`
	ReadingsCollected int                    `json:"readingsCollected"`
	AlertCount        int                    `json:"alertCount"`
	FeedbackReady     bool                   `json:"feedbackReady"`
	Message           string                 `json:"message,omitempty"`
	Summary           *LearningPhaseSummary  `json:"summary,omitempty"`
	Feedback          *LearningPhaseFeedback `json:"feedback,omitempty"`
}
