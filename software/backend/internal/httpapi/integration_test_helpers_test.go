//go:build integration

package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/auth"
	"spectron-backend/internal/config"
	internaldb "spectron-backend/internal/db"
	"spectron-backend/internal/geocoding"
	"spectron-backend/internal/iot"
)

type integrationApp struct {
	pool *pgxpool.Pool
	rr   http.Handler
}

type testUser struct {
	id        uuid.UUID
	accountID uuid.UUID
	email     string
	token     string
}

type testController struct {
	id  uuid.UUID
	uid string
}

type testSystem struct {
	id uuid.UUID
}

type testSensor struct {
	id  uuid.UUID
	uid string
}

type testFarm struct {
	id uuid.UUID
}

type testField struct {
	id uuid.UUID
}

func newIntegrationApp(t *testing.T) *integrationApp {
	t.Helper()

	dbURL := testDatabaseURL(t)
	ctx := context.Background()

	controlPool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect control db: %v", err)
	}
	defer controlPool.Close()

	schema := "test_" + strings.ReplaceAll(uuid.NewString(), "-", "_")
	if _, err := controlPool.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = controlPool.Exec(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`)
	})

	cfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		t.Fatalf("parse test db url: %v", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect schema pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := internaldb.ApplyStartupMigrations(ctx, pool); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	auth.SetJWTSecret("integration-test-secret")
	t.Cleanup(func() {
		auth.SetJWTSecret("dev-only-change-me")
	})

	r := chi.NewRouter()
	RegisterRoutes(r, pool, []string{"http://localhost:3000"}, iot.NewDisabledPublisher("integration test"), config.EmailConfig{}, testGeocoder{})

	return &integrationApp{pool: pool, rr: r}
}

type testGeocoder struct{}

func (testGeocoder) Search(_ context.Context, query string, limit int) ([]geocoding.Location, error) {
	if limit <= 0 {
		limit = 1
	}
	return []geocoding.Location{
		{
			Label:     "Galgamuwa, Kurunegala",
			Latitude:  7.9956,
			Longitude: 80.2674,
		},
	}, nil
}

func (testGeocoder) Reverse(_ context.Context, latitude float64, longitude float64) (geocoding.Location, error) {
	return geocoding.Location{
		Label:     "Galgamuwa, Kurunegala",
		Latitude:  latitude,
		Longitude: longitude,
	}, nil
}

func testDatabaseURL(t *testing.T) string {
	t.Helper()

	if dbURL := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL")); dbURL != "" {
		return dbURL
	}

	host := strings.TrimSpace(os.Getenv("TEST_DB_HOST"))
	name := strings.TrimSpace(os.Getenv("TEST_DB_NAME"))
	user := strings.TrimSpace(os.Getenv("TEST_DB_USER"))
	if host == "" || name == "" || user == "" {
		t.Skip("set TEST_DATABASE_URL or TEST_DB_HOST/TEST_DB_NAME/TEST_DB_USER to run integration tests")
	}

	port := strings.TrimSpace(os.Getenv("TEST_DB_PORT"))
	if port == "" {
		port = "5432"
	}
	values := url.Values{}
	values.Set("sslmode", "disable")

	u := &url.URL{
		Scheme:   "postgres",
		Host:     host + ":" + port,
		Path:     name,
		RawQuery: values.Encode(),
		User:     url.UserPassword(user, os.Getenv("TEST_DB_PASSWORD")),
	}
	return u.String()
}

func (app *integrationApp) createTestUser(t *testing.T, role string) testUser {
	t.Helper()

	ctx := context.Background()
	accountID := uuid.New()
	userID := uuid.New()
	email := fmt.Sprintf("%s@spectron.test", uuid.NewString())

	if _, err := app.pool.Exec(ctx, `
		INSERT INTO accounts (id, name)
		VALUES ($1, $2)
	`, accountID, "Test Account"); err != nil {
		t.Fatalf("insert account: %v", err)
	}

	hash, err := auth.HashPassword("test-password")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := app.pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, account_type, status, is_email_verified)
		VALUES ($1, $2, $3, 'Test User', 'USER', 'ACTIVE', true)
	`, userID, email, hash); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	if _, err := app.pool.Exec(ctx, `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, $3)
	`, accountID, userID, role); err != nil {
		t.Fatalf("insert membership: %v", err)
	}

	token, err := auth.GenerateToken(userID, accountID, email)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	return testUser{id: userID, accountID: accountID, email: email, token: token}
}

func (app *integrationApp) createAdminUser(t *testing.T) testUser {
	t.Helper()

	ctx := context.Background()
	accountID := uuid.New()
	userID := uuid.New()
	email := fmt.Sprintf("admin-%s@spectron.test", uuid.NewString())

	if _, err := app.pool.Exec(ctx, `
		INSERT INTO accounts (id, name)
		VALUES ($1, $2)
	`, accountID, "Admin Account"); err != nil {
		t.Fatalf("insert admin account: %v", err)
	}

	hash, err := auth.HashPassword("test-password")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if _, err := app.pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, account_type, status, is_email_verified)
		VALUES ($1, $2, $3, 'Admin User', 'ADMIN', 'ACTIVE', true)
	`, userID, email, hash); err != nil {
		t.Fatalf("insert admin user: %v", err)
	}

	token, err := auth.GenerateToken(userID, accountID, email)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	return testUser{id: userID, accountID: accountID, email: email, token: token}
}

func (app *integrationApp) createFarm(t *testing.T, owner testUser, name string) testFarm {
	t.Helper()

	ctx := context.Background()
	farmID := uuid.New()
	if _, err := app.pool.Exec(ctx, `
		INSERT INTO farms (id, name, created_by_user_id, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
	`, farmID, name, owner.id); err != nil {
		t.Fatalf("insert farm: %v", err)
	}
	if _, err := app.pool.Exec(ctx, `
		INSERT INTO farm_access (farm_id, user_id, role, added_at)
		VALUES ($1, $2, 'owner', NOW())
	`, farmID, owner.id); err != nil {
		t.Fatalf("insert farm access: %v", err)
	}

	return testFarm{id: farmID}
}

func (app *integrationApp) createField(t *testing.T, farm testFarm, name string) testField {
	t.Helper()

	fieldID := uuid.New()
	if _, err := app.pool.Exec(context.Background(), `
		INSERT INTO fields (id, farm_id, name, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
	`, fieldID, farm.id, name); err != nil {
		t.Fatalf("insert field: %v", err)
	}

	return testField{id: fieldID}
}

func (app *integrationApp) createController(t *testing.T, accountID uuid.UUID, ownerUserID *uuid.UUID, uid string, status string) testController {
	t.Helper()

	controllerID := uuid.New()
	if uid == "" {
		uid = "CTRL-" + strings.ToUpper(strings.ReplaceAll(uuid.NewString()[:8], "-", ""))
	}
	if status == "" {
		status = "unclaimed"
	}
	claimStatus := "UNCLAIMED"
	operationalStatus := "OFFLINE"
	var ownerAccountID *uuid.UUID
	var legacyAccountID *uuid.UUID
	if ownerUserID != nil {
		claimStatus = "CLAIMED"
		operationalStatus = "PENDING_CONFIG"
		ownerAccountID = &accountID
		legacyAccountID = &accountID
	}

	if _, err := app.pool.Exec(context.Background(), `
		INSERT INTO controllers (
			id,
			account_id,
			owner_account_id,
			registered_by_account_id,
			hw_id,
			controller_uid,
			name,
			status,
			claim_status,
			operational_status,
			owner_user_id,
			created_at,
			updated_at,
			min_reporting_interval_sec
		)
		VALUES ($1, $2, $3, $4, $5, $5, 'Main Controller', $6, $7, $8, $9, NOW(), NOW(), 300)
	`, controllerID, legacyAccountID, ownerAccountID, accountID, uid, operationalStatus, claimStatus, operationalStatus, ownerUserID); err != nil {
		t.Fatalf("insert controller: %v", err)
	}

	return testController{id: controllerID, uid: uid}
}

func (app *integrationApp) createLegacySensors(t *testing.T, controllerID uuid.UUID) []testSensor {
	t.Helper()

	ctx := context.Background()
	now := time.Now().UTC()
	sensors := []testSensor{}

	for index, sensor := range []struct {
		uid        string
		name       string
		sensorType string
		unit       string
	}{
		{uid: "SEN-LOAD-001", name: "Load Sensor", sensorType: "load", unit: "kg"},
		{uid: "SEN-TH-001", name: "Temperature & Humidity Sensor", sensorType: "temperature_humidity", unit: "C/%RH"},
		{uid: "SEN-US-001", name: "Ultrasonic Sensor", sensorType: "ultrasonic", unit: "cm"},
	} {
		sensorID := uuid.New()
		if _, err := app.pool.Exec(ctx, `
			INSERT INTO sensors (
				id,
				controller_id,
				hw_id,
				type,
				name,
				unit,
				status,
				last_seen
			)
			VALUES ($1, $2, $3, $4, $5, $6, 'OK', $7)
		`, sensorID, controllerID, sensor.uid, sensor.sensorType, sensor.name, sensor.unit, now.Add(time.Duration(index)*time.Second)); err != nil {
			t.Fatalf("insert legacy sensor: %v", err)
		}

		sensors = append(sensors, testSensor{id: sensorID, uid: sensor.uid})
	}

	return sensors
}

func (app *integrationApp) createSystemWithSensors(t *testing.T, accountID uuid.UUID, controllerID *uuid.UUID) (testSystem, []testSensor) {
	t.Helper()

	ctx := context.Background()
	systemID := uuid.New()
	if _, err := app.pool.Exec(ctx, `
		INSERT INTO systems (id, account_id, name, status, created_at, updated_at)
		VALUES ($1, $2, 'Greenhouse System', 'active', NOW(), NOW())
	`, systemID, accountID); err != nil {
		t.Fatalf("insert system: %v", err)
	}

	if controllerID != nil {
		if _, err := app.pool.Exec(ctx, `
			INSERT INTO system_controller_assignments (id, system_id, controller_id, assigned_at)
			VALUES ($1, $2, $3, NOW())
		`, uuid.New(), systemID, *controllerID); err != nil {
			t.Fatalf("insert system controller assignment: %v", err)
		}
	}

	now := time.Now().UTC()
	sensors := []testSensor{}
	for index, sensor := range []struct {
		uid        string
		slot       string
		name       string
		sensorType string
		configured bool
	}{
		{uid: "sensor-load-01", slot: "load-01", name: "Load Sensor", sensorType: "load"},
		{uid: "sensor-temp-01", slot: "temp-01", name: "Temperature & Humidity Sensor", sensorType: "temperature_humidity"},
		{uid: "sensor-ultra-01", slot: "ultra-01", name: "Ultrasonic Sensor", sensorType: "ultrasonic"},
	} {
		systemSensorID := uuid.New()
		if _, err := app.pool.Exec(ctx, `
			INSERT INTO system_sensors (
				id,
				system_id,
				slot_key,
				name,
				type,
				status,
				configured,
				current_controller_id,
				current_sensor_uid,
				created_at,
				updated_at,
				last_seen
			)
			VALUES ($1, $2, $3, $4, $5, 'live', $6, $7, $8, NOW(), NOW(), $9)
		`, systemSensorID, systemID, sensor.slot, sensor.name, sensor.sensorType, sensor.configured, controllerID, sensor.uid, now.Add(time.Duration(index)*time.Second)); err != nil {
			t.Fatalf("insert system sensor: %v", err)
		}

		if controllerID != nil {
			controllerSensorID := uuid.New()
			if _, err := app.pool.Exec(ctx, `
				INSERT INTO controller_sensors (
					id,
					sensor_uid,
					controller_id,
					system_sensor_id,
					name,
					type,
					status,
					configured,
					created_at,
					updated_at
				)
				VALUES ($1, $2, $3, $4, $5, $6, 'live', $7, NOW(), NOW())
			`, controllerSensorID, sensor.uid, *controllerID, systemSensorID, sensor.name, sensor.sensorType, sensor.configured); err != nil {
				t.Fatalf("insert controller sensor: %v", err)
			}
		}

		sensors = append(sensors, testSensor{id: systemSensorID, uid: sensor.uid})
	}

	return testSystem{id: systemID}, sensors
}

func jsonRequest(t *testing.T, method string, path string, token string, body any) *http.Request {
	t.Helper()

	var payload bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&payload).Encode(body); err != nil {
			t.Fatalf("encode request body: %v", err)
		}
	}

	req := httptest.NewRequest(method, path, &payload)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func executeRequest(handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}
