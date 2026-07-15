package recommendation

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type RecommendationRule struct {
	MetricType           string  `json:"metric_type"`
	Operator             string  `json:"operator"`
	ThresholdMin         float64 `json:"threshold_min,omitempty"`
	ThresholdMax         float64 `json:"threshold_max,omitempty"`
	SustainedMinutes     int     `json:"sustained_minutes"`
	RiskLevel            string  `json:"risk_level"`
	ActionRecommendation string  `json:"action_recommendation"`
}

type RuleResponse struct {
	Rules []RecommendationRule `json:"rules"`
}

func GenerateCropRules(farmerInput string, datasetPath string) ([]RecommendationRule, error) {
	resolvedPath := ResolveDatasetPath(datasetPath)
	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read dataset: %w", err)
	}

	contextText := buildDatasetContext(string(data))
	prompt := buildPrompt(farmerInput, contextText)

	return fallbackRulesFromContext(prompt, contextText), nil
}

func ResolveDatasetPath(datasetPath string) string {
	if strings.TrimSpace(datasetPath) != "" {
		if _, err := os.Stat(datasetPath); err == nil {
			return datasetPath
		}
	}

	candidates := []string{
		"context_sri_lanka.csv",
		filepath.Join("..", "context_sri_lanka.csv"),
		filepath.Join("..", "..", "context_sri_lanka.csv"),
		filepath.Join("..", "..", "..", "context_sri_lanka.csv"),
		filepath.Join("..", "..", "..", "..", "context_sri_lanka.csv"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return datasetPath
}

func buildDatasetContext(raw string) string {
	lines := strings.Split(raw, "\n")
	var filtered []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		filtered = append(filtered, trimmed)
	}
	return strings.Join(filtered, "\n")
}

func buildPrompt(farmerInput string, contextText string) string {
	return fmt.Sprintf("FARMER INPUT: %s\n\nRELEVANT ADVISORY CONTEXT:\n%s\n\nGenerate the JSON configuration rules for this deployment.", farmerInput, contextText)
}

func parseRuleResponse(raw string) ([]RecommendationRule, error) {
	payload := extractJSONPayload(raw)
	if payload == "" {
		return nil, errors.New("empty rule response")
	}

	type rawRule struct {
		MetricType           string   `json:"metric_type"`
		Operator             string   `json:"operator"`
		ThresholdMin         *float64 `json:"threshold_min,omitempty"`
		ThresholdMax         *float64 `json:"threshold_max,omitempty"`
		SustainedMinutes     int      `json:"sustained_minutes"`
		RiskLevel            string   `json:"risk_level"`
		ActionRecommendation string   `json:"action_recommendation"`
	}
	var response struct {
		Rules []rawRule `json:"rules"`
	}
	if err := json.Unmarshal([]byte(payload), &response); err != nil {
		return nil, fmt.Errorf("parse rule response: %w", err)
	}
	if len(response.Rules) == 0 {
		return nil, errors.New("rule response did not include rules")
	}

	rules := make([]RecommendationRule, 0, len(response.Rules))
	for i, rawRule := range response.Rules {
		rule := RecommendationRule{
			MetricType:           strings.TrimSpace(rawRule.MetricType),
			Operator:             strings.ToUpper(strings.TrimSpace(rawRule.Operator)),
			SustainedMinutes:     rawRule.SustainedMinutes,
			RiskLevel:            strings.ToUpper(strings.TrimSpace(rawRule.RiskLevel)),
			ActionRecommendation: strings.TrimSpace(rawRule.ActionRecommendation),
		}
		if rawRule.ThresholdMin != nil {
			rule.ThresholdMin = *rawRule.ThresholdMin
		}
		if rawRule.ThresholdMax != nil {
			rule.ThresholdMax = *rawRule.ThresholdMax
		}
		if rule.MetricType == "" || rule.Operator == "" || rule.RiskLevel == "" || rule.ActionRecommendation == "" || rule.SustainedMinutes <= 0 {
			return nil, fmt.Errorf("rule %d missing required fields", i)
		}
		if rawRule.ThresholdMin == nil && rawRule.ThresholdMax == nil {
			return nil, fmt.Errorf("rule %d missing threshold", i)
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

func extractJSONPayload(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```JSON")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(strings.TrimSpace(trimmed), "```")
	trimmed = strings.TrimSpace(trimmed)
	if json.Valid([]byte(trimmed)) {
		return trimmed
	}

	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start == -1 || end == -1 || end < start {
		return trimmed
	}
	return strings.TrimSpace(trimmed[start : end+1])
}

func fallbackRulesFromContext(prompt string, contextText string) []RecommendationRule {
	var rules []RecommendationRule
	if strings.Contains(strings.ToLower(contextText), "blast") {
		rules = append(rules, RecommendationRule{
			MetricType:           "humidity",
			Operator:             "GREATER_THAN",
			ThresholdMin:         85,
			SustainedMinutes:     60,
			RiskLevel:            "CRITICAL",
			ActionRecommendation: "High humidity risk for blast. Follow the local treatment guidance in the advisory context and inspect crop conditions immediately.",
		})
	}
	if strings.Contains(strings.ToLower(contextText), "brown") || strings.Contains(strings.ToLower(contextText), "spot") {
		rules = append(rules, RecommendationRule{
			MetricType:           "temp",
			Operator:             "OUTSIDE_RANGE",
			ThresholdMin:         24,
			ThresholdMax:         32,
			SustainedMinutes:     60,
			RiskLevel:            "MODERATE",
			ActionRecommendation: "Temperature risk detected for disease pressure. Apply the fungicidal treatment described in the advisory context and monitor crop health.",
		})
	}
	if len(rules) == 0 {
		rules = append(rules, RecommendationRule{
			MetricType:           "humidity",
			Operator:             "GREATER_THAN",
			ThresholdMin:         80,
			SustainedMinutes:     60,
			RiskLevel:            "MODERATE",
			ActionRecommendation: "Monitor field conditions and follow guidance from the advisory context for disease prevention.",
		})
	}
	_ = prompt
	return rules
}
