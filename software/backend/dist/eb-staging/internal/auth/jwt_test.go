package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestGenerateAndValidateToken(t *testing.T) {
	SetJWTSecret("unit-test-secret")
	t.Cleanup(func() {
		SetJWTSecret("dev-only-change-me")
	})

	userID := uuid.New()
	accountID := uuid.New()
	email := "owner@spectron.test"

	token, err := GenerateToken(userID, accountID, email)
	if err != nil {
		t.Fatalf("GenerateToken returned error: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	claims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken returned error: %v", err)
	}
	if claims.UserID != userID {
		t.Fatalf("expected user_id %s, got %s", userID, claims.UserID)
	}
	if claims.AccountID != accountID {
		t.Fatalf("expected account_id %s, got %s", accountID, claims.AccountID)
	}
	if claims.Email != email {
		t.Fatalf("expected email %q, got %q", email, claims.Email)
	}
}

func TestValidateTokenRejectsInvalidToken(t *testing.T) {
	SetJWTSecret("unit-test-secret")
	t.Cleanup(func() {
		SetJWTSecret("dev-only-change-me")
	})

	if _, err := ValidateToken("not-a-jwt-token"); err == nil {
		t.Fatal("expected invalid token to fail validation")
	}
}

func TestValidateTokenRejectsExpiredToken(t *testing.T) {
	SetJWTSecret("unit-test-secret")
	t.Cleanup(func() {
		SetJWTSecret("dev-only-change-me")
	})

	claims := Claims{
		UserID:    uuid.New(),
		AccountID: uuid.New(),
		Email:     "expired@spectron.test",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			NotBefore: jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(currentJWTSecret())
	if err != nil {
		t.Fatalf("sign expired token: %v", err)
	}

	if _, err := ValidateToken(token); err == nil {
		t.Fatal("expected expired token to fail validation")
	}
}
