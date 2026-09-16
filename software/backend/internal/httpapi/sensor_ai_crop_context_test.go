package httpapi

import (
	"strings"
	"testing"

	"spectron-backend/internal/models"
)

func TestSensorAIPromptUsesAssignedCropWeatherReadingsAndFarmerPurpose(t *testing.T) {
	req := models.AISuggestRequest{
		Purpose:        "Protect flowering chilli plants from unsafe heat and humidity",
		FarmContext:    "Farm: Hill Farm; Field: North Field; Crop: Chilli; Growth stage: Flowering",
		WeatherSummary: "Observed at 10:00: temperature 29 C and humidity 82 percent.",
		Context: &models.SensorContext{
			Domain:          "agriculture",
			EnvironmentType: "field",
			IndoorOutdoor:   "outdoor",
			AssetType:       "chilli",
		},
	}
	prompt := buildHostedAIPrompt(
		"temperature_humidity",
		req,
		"96 readings in the last 4 days, temperature range 22 to 31 C",
	)

	for _, expected := range []string{
		"Protect flowering chilli plants",
		"Farm: Hill Farm",
		"Growth stage: Flowering",
		"temperature 29 C",
		"96 readings",
		"21 C to 27 C",
		"warning_min must not be above min",
	} {
		if !strings.Contains(prompt, expected) {
			t.Fatalf("prompt does not contain %q:\n%s", expected, prompt)
		}
	}
	if strings.Contains(strings.ToLower(prompt), "rice blast") {
		t.Fatalf("chilli prompt must not contain rice guidance: %s", prompt)
	}
}

func TestFallbackDoesNotApplyRiceRulesToAnotherCrop(t *testing.T) {
	req := models.AISuggestRequest{
		Purpose:     "Monitor tomato crop temperature and humidity",
		FarmContext: "Crop: Tomato; Growth stage: Fruiting",
		Context: &models.SensorContext{
			Domain:          "agriculture",
			EnvironmentType: "field",
			AssetType:       "tomato",
		},
	}
	if rules := fallbackAgricultureRecommendationRules(req); len(rules) != 0 {
		t.Fatalf("tomato fallback must not receive rice rules: %+v", rules)
	}
}
