package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
)

func TestHashPairingTokenNormalizesInput(t *testing.T) {
	first := hashPairingToken(" pair-abc123 ")
	second := hashPairingToken("PAIR-ABC123")

	if first == "" {
		t.Fatal("expected token hash")
	}
	if first != second {
		t.Fatal("expected pairing token hashing to normalize case and whitespace")
	}
	if strings.Contains(first, "PAIR-ABC123") {
		t.Fatal("token hash should not contain the plain token")
	}
}

func TestFindControllerForClaimRejectsPairingTokenInput(t *testing.T) {
	handler := &ControllerHandler{}

	_, err := handler.findControllerForClaim(context.Background(), nil, "PAIR-ABC123")
	if err == nil {
		t.Fatal("expected pairing token input to be rejected by current controller ID claim path")
	}

	var apiErr apiError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected apiError, got %T", err)
	}
	if apiErr.status != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, apiErr.status)
	}
}
