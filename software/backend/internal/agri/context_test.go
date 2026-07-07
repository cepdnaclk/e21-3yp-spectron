package agri

import (
	"strings"
	"testing"
)

func TestLoadEmbeddedAdvisoriesSummarizesSriLankaDataset(t *testing.T) {
	advisories, err := LoadEmbeddedAdvisories()
	if err != nil {
		t.Fatalf("load embedded advisories: %v", err)
	}
	if len(advisories) == 0 {
		t.Fatal("expected advisories")
	}

	summary := Summarize(advisories)
	if !contains(summary.Crops, "Paddy/Rice") {
		t.Fatalf("expected Paddy/Rice crop, got %v", summary.Crops)
	}
	if !contains(summary.Issues, "Rice Blast") {
		t.Fatalf("expected Rice Blast issue, got %v", summary.Issues)
	}
	if !contains(summary.Issues, "Brown Spot") {
		t.Fatalf("expected Brown Spot issue, got %v", summary.Issues)
	}
}

func TestBuildCSVContextIncludesLocalTreatments(t *testing.T) {
	advisories, err := LoadEmbeddedAdvisories()
	if err != nil {
		t.Fatalf("load embedded advisories: %v", err)
	}

	matches := MatchAdvisories(advisories, "Monitor paddy rice crop for blast disease", 4)
	context := BuildCSVContext(matches)
	if context == "" {
		t.Fatal("expected CSV context")
	}
	if !containsText(context, "Captan/Carbendazim/Thiram") {
		t.Fatalf("expected seed treatment context, got %s", context)
	}
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func containsText(text string, expected string) bool {
	return strings.Contains(text, expected)
}
