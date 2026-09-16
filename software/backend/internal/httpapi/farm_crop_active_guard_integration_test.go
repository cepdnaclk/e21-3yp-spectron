//go:build integration

package httpapi

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestCropInstanceActiveGuardMigration(t *testing.T) {
	app := newIntegrationApp(t)
	owner := app.createTestUser(t, "OWNER")
	farm := app.createFarm(t, owner, "Guard Farm")
	field := app.createField(t, farm, "Guard Field")
	cropID, _ := seededRiceReferenceIDs(t, app)

	firstID := uuid.New()
	if _, err := app.pool.Exec(t.Context(), `
		INSERT INTO crop_instances (
			id,
			field_id,
			crop_id,
			planting_date,
			planting_date_precision,
			active,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, 'exact', true, NOW(), NOW())
	`, firstID, field.id, cropID, time.Now().UTC().AddDate(0, 0, -20)); err != nil {
		t.Fatalf("insert first active crop: %v", err)
	}

	secondID := uuid.New()
	_, err := app.pool.Exec(t.Context(), `
		INSERT INTO crop_instances (
			id,
			field_id,
			crop_id,
			planting_date,
			planting_date_precision,
			active,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, 'exact', true, NOW(), NOW())
	`, secondID, field.id, cropID, time.Now().UTC().AddDate(0, 0, -5))
	if err == nil {
		t.Fatal("expected active crop uniqueness violation")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "idx_crop_instances_one_active_per_field") {
		t.Fatalf("expected active crop guard error, got %v", err)
	}

	var activeCount int
	if err := app.pool.QueryRow(context.Background(), `
		SELECT COUNT(*)
		FROM crop_instances
		WHERE field_id = $1
		  AND active = true
	`, field.id).Scan(&activeCount); err != nil {
		t.Fatalf("count active crops: %v", err)
	}
	if activeCount != 1 {
		t.Fatalf("expected one active crop, got %d", activeCount)
	}
}
