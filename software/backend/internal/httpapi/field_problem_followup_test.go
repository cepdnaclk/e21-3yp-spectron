package httpapi

import (
	"encoding/json"
	"testing"

	"spectron-backend/internal/advisor"
)

func TestEnsureEvolvingFollowUpReplacesRepeatedQuestion(t *testing.T) {
	history := []map[string]any{{
		"advisor_response": json.RawMessage(`{"tell_us_next":"Do leaves recover in the evening?"}`),
	}}
	result := advisor.Result{TellUsNext: advisor.AdvisorText("Do leaves recover in the evening?")}

	updated := ensureEvolvingFollowUp(result, history, 2)
	if normalizeAdvisorQuestion(string(updated.TellUsNext)) == normalizeAdvisorQuestion(string(result.TellUsNext)) {
		t.Fatal("expected a new follow-up question")
	}
	if string(updated.TellUsNext) == "" {
		t.Fatal("expected a useful second follow-up question")
	}
}

func TestEnsureEvolvingFollowUpKeepsNewQuestion(t *testing.T) {
	history := []map[string]any{{
		"advisor_response": map[string]any{"tell_us_next": "Do leaves recover in the evening?"},
	}}
	result := advisor.Result{TellUsNext: advisor.AdvisorText("Is the change spreading to new plants?")}

	updated := ensureEvolvingFollowUp(result, history, 2)
	if updated.TellUsNext != result.TellUsNext {
		t.Fatalf("expected new provider question to remain unchanged, got %q", updated.TellUsNext)
	}
}

func TestEnsureEvolvingFollowUpStopsAfterThirdTurn(t *testing.T) {
	result := advisor.Result{TellUsNext: advisor.AdvisorText("Another question?")}
	updated := ensureEvolvingFollowUp(result, nil, 3)
	if updated.TellUsNext != "" {
		t.Fatalf("expected no follow-up after third turn, got %q", updated.TellUsNext)
	}
}
