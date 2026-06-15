package httpapi

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type adminAuditEventInput struct {
	Action      string
	TargetType  string
	TargetID    string
	TargetLabel string
	Outcome     string
	Details     map[string]any
}

type adminAuditEventResponse struct {
	ID          string         `json:"id"`
	ActorUserID *string        `json:"actorUserId,omitempty"`
	ActorEmail  string         `json:"actorEmail"`
	Action      string         `json:"action"`
	TargetType  string         `json:"targetType"`
	TargetID    string         `json:"targetId,omitempty"`
	TargetLabel string         `json:"targetLabel,omitempty"`
	Outcome     string         `json:"outcome"`
	Details     map[string]any `json:"details"`
	IPAddress   string         `json:"ipAddress,omitempty"`
	UserAgent   string         `json:"userAgent,omitempty"`
	CreatedAt   string         `json:"createdAt"`
}

func recordAdminAuditEvent(
	ctx context.Context,
	executor interface {
		Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	},
	r *http.Request,
	actorUserID uuid.UUID,
	event adminAuditEventInput,
) error {
	details, err := json.Marshal(event.Details)
	if err != nil {
		return err
	}
	outcome := strings.ToUpper(strings.TrimSpace(event.Outcome))
	if outcome == "" {
		outcome = "SUCCESS"
	}

	command, err := executor.Exec(ctx, `
		INSERT INTO admin_audit_events (
			id,
			actor_user_id,
			actor_email,
			action,
			target_type,
			target_id,
			target_label,
			outcome,
			details,
			ip_address,
			user_agent
		)
		SELECT $1, u.id, u.email, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, NULLIF($8, ''), NULLIF($9, '')
		FROM users u
		WHERE u.id = $10
	`, uuid.New(), event.Action, event.TargetType, event.TargetID, event.TargetLabel, outcome, details, requestIPAddress(r), r.UserAgent(), actorUserID)
	if err != nil {
		return err
	}
	if command.RowsAffected() != 1 {
		return pgx.ErrNoRows
	}
	return nil
}

func requestIPAddress(r *http.Request) string {
	if forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); forwarded != "" {
		return forwarded
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func (h *ControllerHandler) AdminAuditEventsAPI(w http.ResponseWriter, r *http.Request) {
	limit := parseAuditPageValue(r.URL.Query().Get("limit"), 50, 1, 100)
	offset := parseAuditPageValue(r.URL.Query().Get("offset"), 0, 0, 1000000)
	action := strings.TrimSpace(r.URL.Query().Get("action"))
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	searchPattern := "%"
	if search != "" {
		searchPattern = "%" + search + "%"
	}

	var total int
	err := h.db.QueryRow(r.Context(), `
		SELECT COUNT(*)::int
		FROM admin_audit_events
		WHERE ($1 = '' OR action = $1)
		  AND (
		      $2 = ''
		      OR actor_email ILIKE $3
		      OR COALESCE(target_label, '') ILIKE $3
		      OR COALESCE(target_id, '') ILIKE $3
		      OR target_type ILIKE $3
		  )
	`, action, search, searchPattern).Scan(&total)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT
			id,
			actor_user_id,
			actor_email,
			action,
			target_type,
			COALESCE(target_id, ''),
			COALESCE(target_label, ''),
			outcome,
			details,
			COALESCE(ip_address, ''),
			COALESCE(user_agent, ''),
			created_at
		FROM admin_audit_events
		WHERE ($1 = '' OR action = $1)
		  AND (
		      $2 = ''
		      OR actor_email ILIKE $3
		      OR COALESCE(target_label, '') ILIKE $3
		      OR COALESCE(target_id, '') ILIKE $3
		      OR target_type ILIKE $3
		  )
		ORDER BY created_at DESC, id DESC
		LIMIT $4 OFFSET $5
	`, action, search, searchPattern, limit, offset)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	events := make([]adminAuditEventResponse, 0)
	for rows.Next() {
		var event adminAuditEventResponse
		var id uuid.UUID
		var actorUserID *uuid.UUID
		var rawDetails []byte
		var createdAt time.Time
		if err := rows.Scan(
			&id,
			&actorUserID,
			&event.ActorEmail,
			&event.Action,
			&event.TargetType,
			&event.TargetID,
			&event.TargetLabel,
			&event.Outcome,
			&rawDetails,
			&event.IPAddress,
			&event.UserAgent,
			&createdAt,
		); err != nil {
			continue
		}
		event.ID = id.String()
		if actorUserID != nil {
			value := actorUserID.String()
			event.ActorUserID = &value
		}
		event.Details = map[string]any{}
		_ = json.Unmarshal(rawDetails, &event.Details)
		event.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		events = append(events, event)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"events": events,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func parseAuditPageValue(raw string, fallback int, min int, max int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value < min {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}
