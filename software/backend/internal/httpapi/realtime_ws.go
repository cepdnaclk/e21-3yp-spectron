package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/auth"
	"spectron-backend/internal/realtime"
)

var realtimeHub *realtime.Hub
var realtimeAllowedOrigins []string

func setRealtimeHub(hub *realtime.Hub, allowedOrigins []string) {
	realtimeHub = hub
	realtimeAllowedOrigins = append([]string(nil), allowedOrigins...)
}

func broadcastAdminChange(kind string) {
	broadcastRealtimeChange(realtime.Event{
		Scope:    "admin",
		Kind:     kind,
		Resource: "admin",
	})
}

func broadcastCustomerChange(accountID uuid.UUID, farmID uuid.UUID, kind string) {
	event := realtime.Event{
		Scope:     "customer",
		Kind:      kind,
		Resource:  "farm",
		AccountID: accountID.String(),
	}
	if farmID != uuid.Nil {
		event.FarmID = farmID.String()
	}
	broadcastRealtimeChange(event)
}

func notifyCustomerChange(r *http.Request, farmID uuid.UUID, kind string) {
	accountID, ok := GetAccountID(r).(uuid.UUID)
	if !ok {
		return
	}
	broadcastCustomerChange(accountID, farmID, kind)
}

func broadcastRealtimeChange(event realtime.Event) {
	if realtimeHub == nil {
		return
	}
	if event.OccurredAt == "" {
		event.OccurredAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	realtimeHub.Broadcast(event)
}

func RealtimeUpdatesHandler(db *pgxpool.Pool) http.HandlerFunc {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     realtimeOriginAllowed,
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if realtimeHub == nil {
			http.Error(w, "realtime updates unavailable", http.StatusServiceUnavailable)
			return
		}

		token := bearerTokenFromRequest(r)
		if token == "" {
			token = strings.TrimSpace(r.URL.Query().Get("token"))
		}
		if token == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		claims, err := auth.ValidateToken(token)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		scope, err := realtimeScopeForUser(r, db, claims.UserID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		realtimeHub.ServeConn(r.Context(), conn, scope, claims.AccountID.String())
	}
}

func bearerTokenFromRequest(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func realtimeScopeForUser(r *http.Request, db *pgxpool.Pool, userID uuid.UUID) (string, error) {
	var accountType string
	var status string
	if err := db.QueryRow(r.Context(), `
		SELECT account_type, status
		FROM users
		WHERE id = $1
	`, userID).Scan(&accountType, &status); err != nil {
		return "", err
	}
	if status != "ACTIVE" {
		return "", errForbidden("active account required")
	}
	if accountType == "ADMIN" {
		return "admin", nil
	}
	return "customer", nil
}

func realtimeOriginAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	for _, allowed := range realtimeAllowedOrigins {
		if strings.EqualFold(origin, strings.TrimRight(strings.TrimSpace(allowed), "/")) {
			return true
		}
	}
	return false
}

type errForbidden string

func (e errForbidden) Error() string {
	return string(e)
}
