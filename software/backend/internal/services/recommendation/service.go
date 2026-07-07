package recommendation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type OpenRouterRequest struct {
	Model       string    `json:"model"`
	Temperature float64   `json:"temperature"`
	Messages    []Message `json:"messages"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

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

const defaultOpenRouterModel = "meta-llama/llama-3.3-70b-instruct:free"

func GenerateCropRules(farmerInput string, datasetPath string, apiKey string) ([]RecommendationRule, error) {
	resolvedPath := ResolveDatasetPath(datasetPath)
	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read dataset: %w", err)
	}

	contextText := buildDatasetContext(string(data))
	prompt := buildPrompt(farmerInput, contextText)

	if strings.TrimSpace(apiKey) == "" {
		return fallbackRulesFromContext(prompt, contextText), nil
	}

	reqBody := OpenRouterRequest{
		Model:       defaultOpenRouterModel,
		Temperature: 0.2,
		Messages: []Message{
			{Role: "system", Content: "You are the Spectron AgriAssist Rule Architect. Return ONLY valid JSON matching {\"rules\":[{\"metric_type\":\"temp|humidity|soil_moisture\",\"operator\":\"GREATER_THAN|LESS_THAN|OUTSIDE_RANGE\",\"threshold_min\":0,\"threshold_max\":0,\"sustained_minutes\":60,\"risk_level\":\"LOW|MODERATE|CRITICAL\",\"action_recommendation\":\"string\"}]}. Use the provided advisory text as agronomic context and extract the exact treatment advice from the dataset."},
			{Role: "user", Content: prompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal OpenRouter request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, "https://openrouter.ai/api/v1/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("build OpenRouter request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://github.com/cepdnaclk/e21-3yp-spectron-dashboard")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openrouter API call failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read OpenRouter response: %w", err)
	}

	return parseRuleResponse(string(body))
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

func parseRuleResponse(raw string) ([]RecommendationRule, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, fmt.Errorf("empty response")
	}

	var root RuleResponse
	if err := json.Unmarshal([]byte(trimmed), &root); err == nil && len(root.Rules) > 0 {
		return root.Rules, nil
	}

	var wrapper struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal([]byte(trimmed), &wrapper); err == nil && len(wrapper.Choices) > 0 {
		content := strings.TrimSpace(wrapper.Choices[0].Message.Content)
		if content == "" {
			return nil, fmt.Errorf("empty OpenRouter content")
		}
		return parseRuleResponse(content)
	}

	if err := json.Unmarshal([]byte(trimmed), &root); err != nil {
		return nil, fmt.Errorf("failed to parse generated rules: %w", err)
	}
	if len(root.Rules) == 0 {
		return nil, fmt.Errorf("no rules returned")
	}
	return root.Rules, nil
}
