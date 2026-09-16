//go:build integration

package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func TestFarmCollaboration(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	viewer := app.createTestUser(t, "VIEWER")
	admin := app.createAdminUser(t)
	farm := app.createFarm(t, owner, "Colombo Farm")

	t.Run("owner can invite existing viewer", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/collaborators", owner.token, map[string]any{
			"email": viewer.email,
			"role":  "viewer",
		}))
		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}

		accessRows := 0
		if err := app.pool.QueryRow(context.Background(), `
			SELECT COUNT(*)
			FROM farm_access
			WHERE farm_id = $1
			  AND user_id = $2
		      AND revoked_at IS NULL
		`, farm.id, viewer.id).Scan(&accessRows); err != nil {
			t.Fatalf("check farm access: %v", err)
		}
		if accessRows != 1 {
			t.Fatalf("expected viewer access to be granted, got %d rows", accessRows)
		}
	})

	t.Run("viewer cannot invite collaborators", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/api/farms/"+farm.id.String()+"/collaborators", viewer.token, map[string]any{
			"email": "someone@spectron.test",
			"role":  "viewer",
		}))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("admin cannot access farm collaborators", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String()+"/collaborators", admin.token, nil))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("owner can list and revoke viewer access", func(t *testing.T) {
		rec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String()+"/collaborators", owner.token, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var payload struct {
			Collaborators []struct {
				UserID string `json:"user_id"`
				Role   string `json:"role"`
			} `json:"collaborators"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
			t.Fatalf("decode collaborators: %v", err)
		}

		var viewerEntry string
		for _, collaborator := range payload.Collaborators {
			if collaborator.UserID == viewer.id.String() {
				viewerEntry = collaborator.UserID
				break
			}
		}
		if viewerEntry == "" {
			t.Fatal("expected viewer in collaborator list")
		}

		removeRec := executeRequest(app.rr, jsonRequest(t, http.MethodDelete, "/api/farms/"+farm.id.String()+"/collaborators/"+viewerEntry, owner.token, nil))
		if removeRec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", removeRec.Code, removeRec.Body.String())
		}
	})
}
