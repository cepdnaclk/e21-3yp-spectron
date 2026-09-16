package httpapi

import (
	"strings"
	"testing"

	"spectron-backend/internal/models"
)

func TestFallbackAgricultureSuggestionIncludesRecommendationRules(t *testing.T) {
	handler := &SensorHandler{}
	req := models.AISuggestRequest{
		Purpose: "Monitor paddy rice crop for blast disease",
		Context: &models.SensorContext{
			Domain:          "agriculture",
			EnvironmentType: "farm",
			AssetType:       "Paddy/Rice crop",
		},
	}

	config := handler.generateAISuggestion("temperature_humidity", req)
	if len(config.RecommendationRules) == 0 {
		t.Fatal("expected agriculture recommendation rules")
	}

	foundSafeFieldAction := false
	for _, rule := range config.RecommendationRules {
		if strings.Contains(rule.ActionRecommendation, "confirm any treatment with a local agricultural officer") {
			foundSafeFieldAction = true
		}
	}
	if !foundSafeFieldAction {
		t.Fatalf("expected safe field action guidance in rules, got %+v", config.RecommendationRules)
	}
}
