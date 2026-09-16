package advisor

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestGroqProviderParsesStructuredAdvice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("missing authorization")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"status\":\"NEEDS_ATTENTION\",\"summary\":\"Inspect leaves\",\"actions_now\":[\"Check lower leaves\"],\"monitor_next\":[],\"confidence\":\"MEDIUM\"}"}}]}`))
	}))
	defer server.Close()
	p := &GroqProvider{Key: "test-key", Model: "test-model", BaseURL: server.URL, Client: server.Client()}
	result, err := p.Generate(context.Background(), Request{Crop: "Tomato", Observation: "Leaf spots"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Summary != "Inspect leaves" || result.Status != "NEEDS_ATTENTION" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestGroqProviderRequiresKey(t *testing.T) {
	p := &GroqProvider{}
	if _, err := p.Generate(context.Background(), Request{}); err == nil {
		t.Fatal("expected missing key error")
	}
}

func TestLocalProviderSendsCompleteFieldContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/recommendations" {
			t.Fatalf("unexpected local advisor path %s", r.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		for _, key := range []string{"crop", "growth_stage", "farmer_observation", "sensor_summary", "weather_summary", "conversation_history", "turn_number", "must_finalize"} {
			if _, ok := payload[key]; !ok {
				t.Fatalf("local advisor payload missing %s", key)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"NEEDS_ATTENTION","headline":"Check the affected leaves","do_now":["Mark three plants"],"confidence":"MEDIUM"}`))
	}))
	defer server.Close()

	provider := &LocalProvider{BaseURL: server.URL, Client: server.Client()}
	result, err := provider.Generate(context.Background(), Request{
		Crop: "Tomato", Stage: "Fruiting", Observation: "Dark leaf spots",
		SensorSummary: "Humidity 88 percent", WeatherSummary: "Recent rain",
		ConversationHistory: []map[string]any{{"role": "farmer", "content": "Spreading since yesterday"}},
		TurnNumber:          2, MustFinalize: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Headline != "Check the affected leaves" || result.Confidence != "MEDIUM" {
		t.Fatalf("unexpected local advisor result: %+v", result)
	}
}

func TestNewProviderKeepsGroqPrimaryWhenLocalAdvisorIsConfigured(t *testing.T) {
	t.Setenv("LOCAL_ADVISOR_URL", "http://127.0.0.1:8091")
	t.Setenv("GROQ_API_KEY", "test-key")
	t.Setenv("GEMINI_API_KEY", "")
	if _, ok := NewProvider().(*GroqProvider); !ok {
		t.Fatalf("expected Groq provider, got %T", NewProvider())
	}
}

func TestGroqProviderAcceptsFencedJSONAndNormalizesFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"choices\":[{\"message\":{\"content\":\"```json\\n{\\\"status\\\":\\\"needs_attention\\\",\\\"summary\\\":\\\"Inspect leaves\\\",\\\"confidence\\\":\\\"unexpected\\\"}\\n```\"}}]}"))
	}))
	defer server.Close()
	p := &GroqProvider{Key: "test-key", Model: "test-model", BaseURL: server.URL, Client: server.Client()}
	result, err := p.Generate(context.Background(), Request{Crop: "Tomato", Observation: "Leaf spots"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "NEEDS_ATTENTION" || result.Confidence != "LOW" || result.ActionsNow == nil || result.MonitorNext == nil {
		t.Fatalf("unexpected normalized result: %+v", result)
	}
}

func TestGroqProviderAcceptsTextLists(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"status\":\"WAIT_AND_WATCH\",\"summary\":\"Inspect leaves\",\"recheck\":[\"Check tomorrow.\",\"Compare new leaves.\"],\"confidence\":\"LOW\"}"}}]}`))
	}))
	defer server.Close()
	p := &GroqProvider{Key: "test-key", Model: "test-model", BaseURL: server.URL, Client: server.Client()}
	result, err := p.Generate(context.Background(), Request{Crop: "Tomato", Observation: "Yellow leaves"})
	if err != nil {
		t.Fatal(err)
	}
	if string(result.Recheck) != "Check tomorrow. Compare new leaves." {
		t.Fatalf("unexpected recheck: %q", result.Recheck)
	}
}

func TestGeminiProviderParsesStructuredAdvice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != "gemini-test-key" {
			t.Fatalf("missing Gemini API key")
		}
		if r.URL.Path != "/v1beta/models/test-gemini:generateContent" {
			t.Fatalf("unexpected Gemini path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"status\":\"GOOD\",\"headline\":\"Field looks stable\",\"do_now\":[],\"check_next\":[],\"confidence\":\"HIGH\"}"}]}}]}`))
	}))
	defer server.Close()
	p := &GeminiProvider{Key: "gemini-test-key", Model: "test-gemini", BaseURL: server.URL + "/v1beta", Client: server.Client()}
	result, err := p.Generate(context.Background(), Request{Crop: "Paddy", Observation: "No visible change"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "GOOD" || result.Headline != "Field looks stable" {
		t.Fatalf("unexpected Gemini result: %+v", result)
	}
}

func TestGroqProviderLive(t *testing.T) {
	if os.Getenv("ADVISOR_LIVE_TEST") != "1" {
		t.Skip("set ADVISOR_LIVE_TEST=1 to run the hosted advisor test")
	}
	p := NewGroqProvider()
	result, err := p.Generate(context.Background(), Request{
		Crop:          "Tomato",
		Stage:         "Vegetative growth",
		Observation:   "Older lower leaves are yellow between the veins. No insects or dark spots are visible.",
		SensorSummary: "No recent field sensor readings are available. Do not infer sensor conditions.",
		WeatherSummary: "Current weather data is temporarily unavailable. " +
			"Do not infer weather conditions.",
		CropContext: []map[string]any{
			{"category": "disease", "topic": "Early blight", "content": "Early blight can produce dark lesions with concentric rings."},
			{"category": "irrigation", "topic": "Water confirmation", "content": "Check root-zone moisture before recommending irrigation."},
			{"category": "observation", "topic": "Yellow leaves", "content": "Interveinal yellowing can have several causes; confirm moisture and fertilizer history."},
		},
	})
	if err != nil {
		t.Fatalf("live advisor request failed: %v", err)
	}
	if result.Summary == "" || result.Status == "" {
		t.Fatalf("live advisor returned incomplete result: %+v", result)
	}
	t.Logf("live advisor status=%s confidence=%s summary=%s", result.Status, result.Confidence, result.Summary)
}

func TestGroqProviderRetriesWithoutResponseFormat(t *testing.T) {
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
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"status\":\"GOOD\",\"headline\":\"Field looks stable\",\"do_now\":[],\"check_next\":[],\"confidence\":\"HIGH\"}"}}]}`))
	}))
	defer server.Close()

	p := &GroqProvider{Key: "test-key", Model: "test-model", BaseURL: server.URL, Client: server.Client()}
	result, err := p.Generate(context.Background(), Request{Crop: "Tomato", Observation: "Leaf spots"})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 calls, got %d", calls)
	}
	if result.Status != "GOOD" || result.Headline != "Field looks stable" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestGroqProviderRepairsMalformedJSON(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		if calls == 1 {
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Status: NEEDS_ATTENTION. Check the lower leaves first."}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"status\":\"NEEDS_ATTENTION\",\"headline\":\"Check lower leaves\",\"do_now\":[\"Inspect the lower leaves this morning\"],\"check_next\":[],\"confidence\":\"MEDIUM\"}"}}]}`))
	}))
	defer server.Close()

	p := &GroqProvider{Key: "test-key", Model: "test-model", BaseURL: server.URL, Client: server.Client()}
	result, err := p.Generate(context.Background(), Request{Crop: "Tomato", Observation: "Leaf spots"})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("expected repair call, got %d total calls", calls)
	}
	if result.Status != "NEEDS_ATTENTION" || result.Headline != "Check lower leaves" {
		t.Fatalf("unexpected repaired result: %+v", result)
	}
}
