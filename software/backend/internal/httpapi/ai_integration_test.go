package httpapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/joho/godotenv"
	"spectron-backend/internal/models"
)

func TestGroqAISuggestionIntegration(t *testing.T) {
	if os.Getenv("SENSOR_AI_LIVE_TEST") != "1" {
		t.Skip("set SENSOR_AI_LIVE_TEST=1 to run the hosted sensor AI test")
	}
	// Load the .env file from the backend root folder
	envPath, _ := filepath.Abs("../../.env")
	err := godotenv.Load(envPath)
	if err != nil {
		t.Logf("Warning: Could not load .env from %s: %v", envPath, err)
	}
	if os.Getenv("GROQ_API_KEY") == "" && os.Getenv("GEMINI_API_KEY") == "" {
		t.Skip("set GROQ_API_KEY or GEMINI_API_KEY to run hosted AI integration test")
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

func TestGroqEnvironmentSelection(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("GROQ_API_KEY", "test-groq-key")
	t.Setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
	t.Setenv("GROQ_BASE_URL", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("AI_API_KEY", "")

	if provider := configuredAIProvider(); provider != "groq" {
		t.Fatalf("configuredAIProvider() = %q, want groq", provider)
	}
	if apiKey := openAICompatibleAPIKey("groq"); apiKey != "test-groq-key" {
		t.Fatalf("openAICompatibleAPIKey(groq) = %q", apiKey)
	}
	if model := openAICompatibleModel("groq"); model != "llama-3.3-70b-versatile" {
		t.Fatalf("openAICompatibleModel(groq) = %q", model)
	}
	if baseURL := openAICompatibleBaseURL("groq"); baseURL != "https://api.groq.com/openai/v1" {
		t.Fatalf("openAICompatibleBaseURL(groq) = %q", baseURL)
	}
}

func TestConfiguredAIProviderDefaultsToGroq(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("GROQ_API_KEY", "")
	t.Setenv("GROQ_MODEL", "")
	t.Setenv("GROQ_BASE_URL", "")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("AI_API_KEY", "")

	if provider := configuredAIProvider(); provider != "groq" {
		t.Fatalf("configuredAIProvider() = %q, want groq", provider)
	}
}

func TestGenerateHostedAISuggestionRejectsUnsupportedProvider(t *testing.T) {
	t.Setenv("AI_PROVIDER", "invalid-provider")
	t.Setenv("GEMINI_API_KEY", "")

	handler := &SensorHandler{}
	_, _, err := handler.generateHostedAISuggestion(context.Background(), "temperature", models.AISuggestRequest{}, "")
	if err == nil {
		t.Fatal("expected unsupported provider error")
	}
	if !strings.Contains(err.Error(), "unsupported AI provider") {
		t.Fatalf("expected unsupported provider error, got %v", err)
	}
}

func TestGenerateHostedAISuggestionGeminiProviderDoesNotFallbackToOpenAI(t *testing.T) {
	t.Setenv("AI_PROVIDER", "gemini")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("OPENAI_API_KEY", "test-openai-key")
	t.Setenv("AI_API_KEY", "")

	handler := &SensorHandler{}
	_, _, err := handler.generateHostedAISuggestion(context.Background(), "temperature", models.AISuggestRequest{}, "")
	if err == nil {
		t.Fatal("expected hosted AI not configured error")
	}
	if !strings.Contains(err.Error(), "hosted AI not configured") {
		t.Fatalf("expected hosted AI not configured error, got %v", err)
	}
}

func formatFloatPtr(p *float64) string {
	if p == nil {
		return "nil"
	}
	return fmt.Sprintf("%.2f", *p)
}

func TestOpenAIAISuggestionRetriesWithoutResponseFormat(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		body, _ := io.ReadAll(r.Body)
		if calls == 1 {
			if !strings.Contains(string(body), "response_format") {
				t.Fatalf("expected first request to include response_format")
			}
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"response_format json_object is unsupported for this model"}}`))
			return
		}
		if strings.Contains(string(body), "response_format") {
			t.Fatalf("expected retry request without response_format")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"friendly_name\":\"Climate Watch\",\"use_case\":\"climate_monitoring\",\"presentation_profile\":\"dual_climate\",\"primary_metric\":\"temperature\",\"metric_thresholds\":{\"temperature\":{\"min\":18,\"max\":30}},\"report_interval_per_day\":24}"}}]}`))
	}))
	defer server.Close()

	t.Setenv("AI_PROVIDER", "groq")
	t.Setenv("GROQ_API_KEY", "test-groq-key")
	t.Setenv("GROQ_MODEL", "test-model")
	t.Setenv("GROQ_BASE_URL", server.URL)

	handler := &SensorHandler{}
	config, _, err := handler.generateOpenAIAISuggestion(context.Background(), "temperature", models.AISuggestRequest{Purpose: "Monitor crop temperature"}, "No history")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 calls, got %d", calls)
	}
	if config.FriendlyName == "" || config.ReportIntervalPerDay != 24 {
		t.Fatalf("unexpected config: %+v", config)
	}
}

func TestOpenAIAISuggestionRepairsMalformedJSON(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		if calls == 1 {
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Suggested config: temperature warning near 30C, check every hour."}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"friendly_name\":\"Climate Watch\",\"use_case\":\"climate_monitoring\",\"presentation_profile\":\"dual_climate\",\"primary_metric\":\"temperature\",\"metric_thresholds\":{\"temperature\":{\"min\":18,\"max\":30}},\"report_interval_per_day\":24}"}}]}`))
	}))
	defer server.Close()

	t.Setenv("AI_PROVIDER", "groq")
	t.Setenv("GROQ_API_KEY", "test-groq-key")
	t.Setenv("GROQ_MODEL", "test-model")
	t.Setenv("GROQ_BASE_URL", server.URL)

	handler := &SensorHandler{}
	config, _, err := handler.generateOpenAIAISuggestion(context.Background(), "temperature", models.AISuggestRequest{Purpose: "Monitor crop temperature"}, "No history")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected repair call, got %d calls", calls)
	}
	if config.FriendlyName == "" || config.PrimaryMetric != "temperature" {
		t.Fatalf("unexpected repaired config: %+v", config)
	}
}
