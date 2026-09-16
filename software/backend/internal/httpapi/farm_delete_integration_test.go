//go:build integration

package httpapi

import (
	"context"
	"net/http"
	"testing"
)

func TestFarmDeleteArchivesAndRevokesAccess(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	viewer := app.createTestUser(t, "VIEWER")
	farm := app.createFarm(t, owner, "Farm To Delete")
	if _, err := app.pool.Exec(context.Background(), `INSERT INTO farm_access (farm_id,user_id,role,added_at) VALUES ($1,$2,'viewer',NOW())`, farm.id, viewer.id); err != nil {
		t.Fatalf("grant viewer access: %v", err)
	}

	viewerDelete := executeRequest(app.rr, jsonRequest(t, http.MethodDelete, "/api/farms/"+farm.id.String(), viewer.token, nil))
	if viewerDelete.Code != http.StatusForbidden {
		t.Fatalf("viewer delete status = %d, body = %s", viewerDelete.Code, viewerDelete.Body.String())
	}

	deleted := executeRequest(app.rr, jsonRequest(t, http.MethodDelete, "/api/farms/"+farm.id.String(), owner.token, nil))
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("owner delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}

	for label, user := range map[string]testUser{"owner": owner, "viewer": viewer} {
		response := executeRequest(app.rr, jsonRequest(t, http.MethodGet, "/api/farms/"+farm.id.String(), user.token, nil))
		if response.Code != http.StatusForbidden {
			t.Fatalf("%s access after delete = %d, body = %s", label, response.Code, response.Body.String())
		}
	}

	var archived bool
	if err := app.pool.QueryRow(context.Background(), `SELECT archived_at IS NOT NULL FROM farms WHERE id=$1`, farm.id).Scan(&archived); err != nil || !archived {
		t.Fatalf("expected archived farm, archived=%v err=%v", archived, err)
	}
}
