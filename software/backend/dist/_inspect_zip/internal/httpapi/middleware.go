package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/auth"
)

type contextKey string

const userIDKey contextKey = "user_id"
const accountIDKey contextKey = "account_id"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "invalid authorization header", http.StatusUnauthorized)
			return
		}

		claims, err := auth.ValidateToken(parts[1])
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, claims.UserID)
		ctx = context.WithValue(ctx, accountIDKey, claims.AccountID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserID(r *http.Request) interface{} {
	return r.Context().Value(userIDKey)
}

func GetAccountID(r *http.Request) interface{} {
	return r.Context().Value(accountIDKey)
}

func RequireAccountRole(db *pgxpool.Pool, allowedRoles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, role := range allowedRoles {
		allowed[strings.ToUpper(strings.TrimSpace(role))] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserID(r).(uuid.UUID)
			if !ok {
				http.Error(w, "missing user context", http.StatusUnauthorized)
				return
			}
			accountID, ok := GetAccountID(r).(uuid.UUID)
			if !ok {
				http.Error(w, "missing account context", http.StatusUnauthorized)
				return
			}

			var role string
			err := db.QueryRow(r.Context(), `
				SELECT role
				FROM account_memberships
				WHERE user_id = $1 AND account_id = $2
			`, userID, accountID).Scan(&role)
			if err != nil || !allowed[strings.ToUpper(role)] {
				http.Error(w, "insufficient permissions", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func RequireSystemAdmin(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserID(r).(uuid.UUID)
			if !ok {
				http.Error(w, "missing user context", http.StatusUnauthorized)
				return
			}

			var accountType string
			var status string
			err := db.QueryRow(r.Context(), `
				SELECT account_type, status
				FROM users
				WHERE id = $1
			`, userID).Scan(&accountType, &status)
			if err != nil || accountType != "ADMIN" || status != "ACTIVE" {
				http.Error(w, "admin account required", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
