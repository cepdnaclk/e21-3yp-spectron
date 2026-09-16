package httpapi

import (
	"strings"
	"testing"

	"spectron-backend/internal/models"
)

func TestValidateRequestedSensorRanges(t *testing.T) {
	min, max := -20.0, 40.0
	config := models.SensorConfig{
		PrimaryMetric: "temperature",
		MetricThresholds: map[string]models.ThresholdConfig{
			"temperature": {Min: &min, Max: &max},
		},
	}
	err := validateRequestedSensorRanges("temperature", config)
	if err == nil || !strings.Contains(err.Error(), "cannot be below -10") {
		t.Fatalf("expected hardware minimum validation error, got %v", err)
	}

	min, max = 18, 32
	config.MetricThresholds["temperature"] = models.ThresholdConfig{Min: &min, Max: &max}
	if err := validateRequestedSensorRanges("temperature", config); err != nil {
		t.Fatalf("expected valid range, got %v", err)
	}
}
