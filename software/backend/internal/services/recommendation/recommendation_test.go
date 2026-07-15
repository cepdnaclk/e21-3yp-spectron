package recommendation

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateCropRulesUsesDatasetContextWhenNoAPIKey(t *testing.T) {
	datasetPath := filepath.Join("..", "..", "..", "..", "context_sri_lanka.csv")
	if _, err := os.Stat(datasetPath); err != nil {
		t.Fatalf("dataset missing: %v", err)
	}

	rules, err := GenerateCropRules("Rice in Sri Lanka during tillering", datasetPath)
	if err != nil {
		t.Fatalf("GenerateCropRules returned error: %v", err)
	}
	if len(rules) == 0 {
		t.Fatal("expected at least one generated rule")
	}

	var foundHumidity bool
	for _, rule := range rules {
		if rule.MetricType == "humidity" || rule.MetricType == "temp" {
			foundHumidity = true
			if rule.ActionRecommendation == "" {
				t.Fatalf("expected action recommendation for rule %+v", rule)
			}
		}
	}
	if !foundHumidity {
		t.Fatal("expected at least one temperature or humidity rule")
	}
}

func TestGenerateCropRulesReturnsFallbackForEmptyInput(t *testing.T) {
	datasetPath := filepath.Join("..", "..", "..", "..", "context_sri_lanka.csv")

	rules, err := GenerateCropRules("", datasetPath)
	if err != nil {
		t.Fatalf("GenerateCropRules returned error: %v", err)
	}
	if len(rules) == 0 {
		t.Fatal("expected fallback rules for empty input")
	}
}

func TestGenerateCropRulesReturnsDatasetError(t *testing.T) {
	_, err := GenerateCropRules("Rice in Sri Lanka during tillering", t.TempDir())
	if err == nil {
		t.Fatal("expected error for missing dataset")
	}
}

func TestParseRuleResponse(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantErr bool
	}{
		{
			name: "valid generated rule",
			raw:  `{"rules":[{"metric_type":"humidity","operator":"GREATER_THAN","threshold_min":85,"sustained_minutes":60,"risk_level":"CRITICAL","action_recommendation":"Spray Mancozeb 2.0g/lit"}]}`,
		},
		{
			name: "extra surrounding text and code fence",
			raw:  "Here are the rules:\n```json\n{\"rules\":[{\"metric_type\":\"temp\",\"operator\":\"OUTSIDE_RANGE\",\"threshold_min\":24,\"threshold_max\":32,\"sustained_minutes\":60,\"risk_level\":\"moderate\",\"action_recommendation\":\"Monitor field conditions\"}]}\n```",
		},
		{
			name:    "malformed json response",
			raw:     `{"rules":[{"metric_type":"humidity"`,
			wantErr: true,
		},
		{
			name:    "missing expected fields",
			raw:     `{"rules":[{"metric_type":"humidity","operator":"GREATER_THAN","threshold_min":85}]}`,
			wantErr: true,
		},
		{
			name:    "empty response",
			raw:     ``,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rules, err := parseRuleResponse(tt.raw)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected parseRuleResponse error")
				}
				return
			}
			if err != nil {
				t.Fatalf("parseRuleResponse failed: %v", err)
			}
			if len(rules) != 1 {
				t.Fatalf("expected one rule, got %d", len(rules))
			}
			if rules[0].MetricType == "" || rules[0].ActionRecommendation == "" {
				t.Fatalf("expected populated rule, got %+v", rules[0])
			}
		})
	}
}
