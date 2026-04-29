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
	ReportIntervalPerDay int                        `json:"report_interval_per_day"`
	PowerManagement      PowerManagementConfig      `json:"power_management"`
}

type ThresholdConfig struct {
	Min        *float64 `json:"min,omitempty"`
	Max        *float64 `json:"max,omitempty"`
	WarningMin *float64 `json:"warning_min,omitempty"`
	WarningMax *float64 `json:"warning_max,omitempty"`
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
}

type AISuggestResponse struct {
	SuggestedConfig          SensorConfig `json:"suggested_config"`
	ValidatedConfig          SensorConfig `json:"validated_config"`
	Explanation              string       `json:"explanation"`
	ValidationStatus         string       `json:"validation_status"`
	Warnings                 []string     `json:"warnings,omitempty"`
	AppliedRules             []string     `json:"applied_rules,omitempty"`
	ConfidenceScore          float64      `json:"confidence_score"`
	RequiresUserConfirmation bool         `json:"requires_user_confirmation"`
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
