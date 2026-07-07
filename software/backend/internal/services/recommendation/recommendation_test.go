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

	rules, err := GenerateCropRules("Rice in Sri Lanka during tillering", datasetPath, "")
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

func TestParseRuleResponse(t *testing.T) {
	raw := `{"rules":[{"metric_type":"humidity","operator":"GREATER_THAN","threshold_min":85,"sustained_minutes":60,"risk_level":"CRITICAL","action_recommendation":"Spray Mancozeb 2.0g/lit"}]}`

	rules, err := parseRuleResponse(raw)
	if err != nil {
		t.Fatalf("parseRuleResponse failed: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("expected one rule, got %d", len(rules))
	}
	if rules[0].MetricType != "humidity" {
		t.Fatalf("unexpected metric type: %s", rules[0].MetricType)
	}
}
