//go:build integration

package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestCreateViewerUpdatesAccountUserListIntegration(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")

	viewerEmail := "viewer-" + time.Now().UTC().Format("20060102150405.000000000") + "@spectron.test"
	createRec := executeRequest(app.rr, jsonRequest(t, http.MethodPost, "/users/viewers", owner.token, map[string]string{
		"email":    viewerEmail,
		"password": "viewer-password",
		"name":     "Test Viewer",
		"phone":    "+94770000000",
	}))
	if createRec.Code != http.StatusOK {
		t.Fatalf("expected create viewer 200, got %d: %s", createRec.Code, createRec.Body.String())
	}

	listRec := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/users", owner.token, nil))
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected list users 200, got %d: %s", listRec.Code, listRec.Body.String())
	}

	var response struct {
		Users []struct {
			Email     string `json:"email"`
			Role      string `json:"role"`
			Status    string `json:"status"`
			CreatedAt string `json:"created_at"`
		} `json:"users"`
		Count int `json:"count"`
	}
	if err := json.NewDecoder(listRec.Body).Decode(&response); err != nil {
		t.Fatalf("decode list users response: %v", err)
	}
	if response.Count != 2 {
		t.Fatalf("expected owner and viewer in table, got %d users", response.Count)
	}

	for _, user := range response.Users {
		if user.Email != viewerEmail {
			continue
		}
		if user.Role != "VIEWER" {
			t.Fatalf("expected VIEWER role, got %s", user.Role)
		}
		if user.Status != "ACTIVE" {
			t.Fatalf("expected ACTIVE status, got %s", user.Status)
		}
		if _, err := time.Parse(time.RFC3339, user.CreatedAt); err != nil {
			t.Fatalf("expected RFC3339 created_at, got %q: %v", user.CreatedAt, err)
		}
		return
	}

	t.Fatalf("created viewer %s was not returned by GET /users", viewerEmail)
}
