package auth

import (
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	jwtSecretMu sync.RWMutex
	jwtSecret   = []byte("dev-only-change-me")
)

func SetJWTSecret(secret string) {
	trimmed := strings.TrimSpace(secret)
	if trimmed == "" {
		trimmed = "dev-only-change-me"
	}

	jwtSecretMu.Lock()
	jwtSecret = []byte(trimmed)
	jwtSecretMu.Unlock()
}

func currentJWTSecret() []byte {
	jwtSecretMu.RLock()
	defer jwtSecretMu.RUnlock()
	return append([]byte(nil), jwtSecret...)
}

type Claims struct {
	UserID    uuid.UUID `json:"user_id"`
	AccountID uuid.UUID `json:"account_id"`
	Email     string    `json:"email"`
	jwt.RegisteredClaims
}

func GenerateToken(userID, accountID uuid.UUID, email string) (string, error) {
	claims := Claims{
		UserID:    userID,
		AccountID: accountID,
		Email:     email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(currentJWTSecret())
}

func ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return currentJWTSecret(), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}
