package httpapi

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/joho/godotenv"
	"spectron-backend/internal/models"
)

func TestGroqAISuggestionIntegration(t *testing.T) {
	// Load the .env file from the backend root folder
	envPath, _ := filepath.Abs("../../.env")
	err := godotenv.Load(envPath)
	if err != nil {
		t.Logf("Warning: Could not load .env from %s: %v", envPath, err)
	}
	if os.Getenv("OPENAI_API_KEY") == "" && os.Getenv("AI_API_KEY") == "" && os.Getenv("GEMINI_API_KEY") == "" && os.Getenv("OPENROUTER_API_KEY") == "" {
		t.Skip("set OPENAI_API_KEY, AI_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY to run hosted AI integration test")
	}

	handler := &SensorHandler{db: nil}
	ctx := context.Background()

	// 1. Test for a temperature_humidity sensor
	t.Run("temperature_humidity sensor suggestion", func(t *testing.T) {
		req := models.AISuggestRequest{
			Purpose: "Monitor greenhouse temperature and humidity for tomato crops",
			Context: &models.SensorContext{
				Domain:          "agriculture",
				EnvironmentType: "greenhouse",
				IndoorOutdoor:   "indoor",
			},
		}

		config, explanation, err := handler.generateOpenAIAISuggestion(ctx, "temperature_humidity", req, "No historical summary available")
		if err != nil {
			t.Fatalf("Failed to generate AI suggestion: %v", err)
		}

		t.Logf("Successfully received configuration from AI:")
		t.Logf("FriendlyName: %s", config.FriendlyName)
		t.Logf("UseCase: %s", config.UseCase)
		t.Logf("PrimaryMetric: %s", config.PrimaryMetric)
		t.Logf("Explanation: %s", explanation)
		t.Logf("ReportIntervalPerDay: %d", config.ReportIntervalPerDay)

		if config.FriendlyName == "" {
			t.Errorf("Expected non-empty FriendlyName")
		}
		if len(config.MetricThresholds) == 0 {
			t.Errorf("Expected metric thresholds to be generated")
		}

		for metric, thresh := range config.MetricThresholds {
			t.Logf("Metric: %s -> Min: %v, Max: %v, WarningMin: %v, WarningMax: %v",
				metric, formatFloatPtr(thresh.Min), formatFloatPtr(thresh.Max), formatFloatPtr(thresh.WarningMin), formatFloatPtr(thresh.WarningMax))
		}
	})

	// 2. Test for a distance/fill_level sensor
	t.Run("distance sensor suggestion", func(t *testing.T) {
		req := models.AISuggestRequest{
			Purpose: "Monitor water tank fill level to avoid overflow",
			Context: &models.SensorContext{
				Domain:          "industrial",
				EnvironmentType: "tank",
			},
		}

		config, explanation, err := handler.generateOpenAIAISuggestion(ctx, "distance", req, "No historical summary available")
		if err != nil {
			t.Fatalf("Failed to generate AI suggestion: %v", err)
		}

		t.Logf("Successfully received configuration from AI:")
		t.Logf("FriendlyName: %s", config.FriendlyName)
		t.Logf("UseCase: %s", config.UseCase)
		t.Logf("PrimaryMetric: %s", config.PrimaryMetric)
		t.Logf("Explanation: %s", explanation)

		if config.FriendlyName == "" {
			t.Errorf("Expected non-empty FriendlyName")
		}
	})
}

func TestOpenRouterEnvironmentSelection(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("OPENROUTER_API_KEY", "test-openrouter-key")
	t.Setenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
	t.Setenv("OPENROUTER_API_BASE_URL", "")
	t.Setenv("OPENAI_API_KEY", "test-openai-key")
	t.Setenv("AI_API_KEY", "")
	t.Setenv("AI_MODEL", "")
	t.Setenv("OPENAI_MODEL", "")
	t.Setenv("AI_API_BASE_URL", "")
	t.Setenv("OPENAI_API_BASE_URL", "")

	if provider := configuredAIProvider(); provider != "openrouter" {
		t.Fatalf("configuredAIProvider() = %q, want openrouter", provider)
	}
	if apiKey := openAICompatibleAPIKey("openrouter"); apiKey != "test-openrouter-key" {
		t.Fatalf("openAICompatibleAPIKey(openrouter) = %q", apiKey)
	}
	if model := openAICompatibleModel("openrouter"); model != "openai/gpt-4o-mini" {
		t.Fatalf("openAICompatibleModel(openrouter) = %q", model)
	}
	if baseURL := openAICompatibleBaseURL("openrouter"); baseURL != "https://openrouter.ai/api/v1" {
		t.Fatalf("openAICompatibleBaseURL(openrouter) = %q", baseURL)
	}
}

func TestGenericAIAPIKeySelectsOpenRouter(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENROUTER_MODEL", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OPENAI_MODEL", "")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("AI_API_KEY", "test-generic-ai-key")
	t.Setenv("AI_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
	t.Setenv("AI_API_BASE_URL", "")
	t.Setenv("OPENAI_API_BASE_URL", "")

	if provider := configuredAIProvider(); provider != "openrouter" {
		t.Fatalf("configuredAIProvider() = %q, want openrouter", provider)
	}
	if apiKey := openAICompatibleAPIKey("openrouter"); apiKey != "test-generic-ai-key" {
		t.Fatalf("openAICompatibleAPIKey(openrouter) = %q", apiKey)
	}
}

func formatFloatPtr(p *float64) string {
	if p == nil {
		return "nil"
	}
	return fmt.Sprintf("%.2f", *p)
}
