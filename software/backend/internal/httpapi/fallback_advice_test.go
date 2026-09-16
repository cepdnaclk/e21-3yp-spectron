package httpapi

import (
	"strings"
	"testing"
)

func TestFallbackAdviceFocusUsesReportedSymptom(t *testing.T) {
	tests := []struct {
		observation  string
		wantFocus    string
		wantQuestion string
	}{
		{"Lower leaves are yellow between the veins", "yellowing leaves", "older lower leaves"},
		{"Dark spots are spreading after rain", "leaf spots", "dark edges"},
		{"Plants wilt in the afternoon", "wilting plants", "recover by evening"},
		{"Small insects are under the leaves", "possible pest damage", "insects, eggs"},
	}

	for _, test := range tests {
		focus, _, question, _ := fallbackAdviceFocus(test.observation)
		if focus != test.wantFocus {
			t.Errorf("%q: focus = %q, want %q", test.observation, focus, test.wantFocus)
		}
		if !strings.Contains(strings.ToLower(question), strings.ToLower(test.wantQuestion)) {
			t.Errorf("%q: question = %q, want it to include %q", test.observation, question, test.wantQuestion)
		}
	}
}
