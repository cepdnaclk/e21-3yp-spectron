package httpapi

import (
	"strings"
	"testing"

	"spectron-backend/internal/models"
)

func validHardwareSensorConfigRequest(sensorType string) models.SaveHardwareSensorConfigRequest {
	config := map[string]interface{}{
		"reportsPerDay":            24,
		"estimatedBatteryLifeDays": 77,
	}

	switch sensorType {
	case "temperature_humidity":
		config["temperatureMin"] = 18
		config["temperatureMax"] = 32
		config["humidityMin"] = 40
		config["humidityMax"] = 85
	case "ultrasonic":
		config["tankHeight"] = 120
		config["emptyDistance"] = 115
		config["fullDistance"] = 10
		config["lowLevelAlert"] = 20
	case "load":
		config["maxWeight"] = 100
		config["minWeight"] = 0
		config["unit"] = "kg"
	}

	return models.SaveHardwareSensorConfigRequest{
		SystemName:    "Greenhouse System",
		SensorType:    sensorType,
		SensorName:    "Configured Sensor",
		UsedFor:       "General Monitoring",
		DashboardView: "Single Trend",
		Config:        config,
	}
}

func TestValidateHardwareSensorConfigRequestAcceptsValidConfigs(t *testing.T) {
	tests := []struct {
		name       string
		sensorType string
	}{
		{name: "temperature humidity", sensorType: "temperature_humidity"},
		{name: "bme280", sensorType: "bme280"},
		{name: "ultrasonic", sensorType: "ultrasonic"},
		{name: "load", sensorType: "load"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validHardwareSensorConfigRequest(tt.sensorType)
			if err := validateHardwareSensorConfigRequest(req, tt.sensorType); err != nil {
				t.Fatalf("expected valid config, got error: %v", err)
			}
		})
	}
}

func TestNormalizeHardwareSensorConfigRequestDerivesFlatConfigFromAppConfig(t *testing.T) {
	tempMax := 32.0
	humidityMax := 85.0
	req := models.SaveHardwareSensorConfigRequest{
		SystemName:    "Paddy Field",
		SensorType:    "temperature_humidity",
		SensorName:    "AgriAssist Climate",
		UsedFor:       "Paddy/Rice Nursery monitoring",
		DashboardView: "agriassist",
		Config: map[string]interface{}{
			"friendly_name":           "AgriAssist Climate",
			"metric_thresholds":       map[string]interface{}{},
			"recommendation_rules":    []interface{}{},
			"report_interval_per_day": 24,
		},
		AppConfig: &models.SensorConfig{
			FriendlyName:         "AgriAssist Climate",
			PrimaryMetric:        "temperature",
			ReportIntervalPerDay: 24,
			PowerManagement: models.PowerManagementConfig{
				BatteryLifeDays: 77,
			},
			MetricThresholds: map[string]models.ThresholdConfig{
				"temperature": {Max: &tempMax},
				"humidity":    {Max: &humidityMax},
			},
		},
	}

	normalizeHardwareSensorConfigRequest(&req)

	if err := validateHardwareSensorConfigRequest(req, "temperature_humidity"); err != nil {
		t.Fatalf("expected normalized config to validate, got %v with config %+v", err, req.Config)
	}
	if _, exists := req.Config["metric_thresholds"]; exists {
		t.Fatalf("expected app-level metric_thresholds to be removed from hardware config: %+v", req.Config)
	}
	if req.Config["temperatureMax"] != tempMax {
		t.Fatalf("expected temperatureMax %.1f, got %#v", tempMax, req.Config["temperatureMax"])
	}
	if req.Config["humidityMax"] != humidityMax {
		t.Fatalf("expected humidityMax %.1f, got %#v", humidityMax, req.Config["humidityMax"])
	}
}

func TestValidateHardwareSensorConfigRequestRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name       string
		mutate     func(*models.SaveHardwareSensorConfigRequest)
		wantErrSub string
	}{
		{
			name: "invalid sensor type",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.SensorType = "unknown"
			},
			wantErrSub: "invalid sensorType",
		},
		{
			name: "sensor type mismatch",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.SensorType = "load"
			},
			wantErrSub: "sensorType does not match sensor",
		},
		{
			name: "missing sensor name",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.SensorName = ""
			},
			wantErrSub: "sensorName required",
		},
		{
			name: "missing config",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.Config = nil
			},
			wantErrSub: "config object required",
		},
		{
			name: "non-positive reports per day",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.Config["reportsPerDay"] = 0
			},
			wantErrSub: "reportsPerDay should be positive",
		},
		{
			name: "non-numeric threshold",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.Config["temperatureMax"] = "warm"
			},
			wantErrSub: "temperatureMax should be numeric",
		},
		{
			name: "non-numeric tank height",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.Config["tankHeight"] = "tall"
			},
			wantErrSub: "tankHeight should be numeric",
		},
		{
			name: "non-numeric max weight",
			mutate: func(req *models.SaveHardwareSensorConfigRequest) {
				req.SensorType = "load"
				req.Config["maxWeight"] = "heavy"
			},
			wantErrSub: "maxWeight should be numeric",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validHardwareSensorConfigRequest("temperature_humidity")
			tt.mutate(&req)

			actualType := "temperature_humidity"
			if tt.name == "non-numeric max weight" {
				actualType = "load"
			}

			err := validateHardwareSensorConfigRequest(req, actualType)
			if err == nil {
				t.Fatal("expected validation error")
			}
			if !strings.Contains(err.Error(), tt.wantErrSub) {
				t.Fatalf("expected error containing %q, got %q", tt.wantErrSub, err.Error())
			}
		})
	}
}
