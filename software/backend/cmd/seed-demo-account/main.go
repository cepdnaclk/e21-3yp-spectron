// cmd/seed-demo-account/main.go
//
// Seeds a realistic "long-time farmer" demo account with the full AgriAssist
// farm model + complete sensor readings into sensor_readings.
//
//   Farm: Perera Green Farms (Kurunegala District, Sri Lanka)
//   ├── Field 1: North Paddy Block      (Paddy/Rice → Grain filling, 90 days ago)
//   ├── Field 2: South Chilli Plot      (Chilli → Flowering, 60 days ago)
//   ├── Field 3: Warehouse / Storage    (no active crop, monitoring only)
//   ├── Gateway 1 (ONLINE) → legacy CTRL-DEMO-001
//   │   ├── Sensor Base 1 → Field 1
//   │   │   ├── Module 1 (BME280): temperature + humidity
//   │   │   └── Module 2 (VL53L0X / ToF): distance (water tank level)
//   │   └── Sensor Base 2 → Field 2
//   │       └── Module 1 (SoilTH): soil_moisture + temperature
//   └── Gateway 2 (OFFLINE)
//       └── Sensor Base 3 → Field 3
//           └── Module 1 (BME280): temperature + humidity
//
//   Readings: 90 days, every 30 min → ~8,640 rows per sensor_id
//   All rows written to sensor_readings with:
//     - sensor_id   (legacy column — always set)
//     - sensor_channel_id (new column — always set for new hardware)
//
//   Users:
//     Owner  → demo@spectron.lk   / Demo@1234
//     Viewer → viewer@spectron.lk / Viewer@1234
//
// Usage (from backend/ dir):  go run cmd/seed-demo-account/main.go
// Idempotent — safe to re-run.

package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"spectron-backend/internal/auth"
	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
)

// ── Deterministic IDs ─────────────────────────────────────────────────────────

var (
	// Users / Account
	demoUserID    = uuid.MustParse("aaaaaaaa-0001-4000-8000-000000000001")
	demoAccountID = uuid.MustParse("aaaaaaaa-0002-4000-8000-000000000002")
	viewerUserID  = uuid.MustParse("aaaaaaaa-0003-4000-8000-000000000003")

	// Farm
	farmID = uuid.MustParse("fa000000-0001-4000-8000-000000000001")

	// Fields
	field1ID = uuid.MustParse("fe000000-0001-4000-8000-000000000001")
	field2ID = uuid.MustParse("fe000000-0002-4000-8000-000000000002")
	field3ID = uuid.MustParse("fe000000-0003-4000-8000-000000000003")

	// Legacy controllers
	ctrl1ID = uuid.MustParse("bbbbbbbb-0001-4000-8000-000000000001")
	ctrl2ID = uuid.MustParse("bbbbbbbb-0002-4000-8000-000000000002")

	// Legacy sensors (tied to controllers — used as sensor_id in sensor_readings)
	legacySen1TH   = uuid.MustParse("cccccccc-0001-4000-8000-000000000001") // ctrl1, temp+hum (exists)
	legacySen1Tof  = uuid.MustParse("cccccccc-0004-4000-8000-000000000004") // ctrl1, ToF distance (NEW)
	legacySen2Soil = uuid.MustParse("cccccccc-0002-4000-8000-000000000002") // ctrl1, soil moisture (repurposed from ultrasonic)
	legacySen3TH   = uuid.MustParse("cccccccc-0003-4000-8000-000000000003") // ctrl2, temp+hum (exists)

	// Gateways
	gw1ID = uuid.MustParse("aa100000-0001-4000-8000-000000000001")
	gw2ID = uuid.MustParse("aa100000-0002-4000-8000-000000000002")

	// Sensor Bases
	base1ID = uuid.MustParse("bb200000-0001-4000-8000-000000000001")
	base2ID = uuid.MustParse("bb200000-0002-4000-8000-000000000002")
	base3ID = uuid.MustParse("bb200000-0003-4000-8000-000000000003")

	// Sensor Base Assignments
	assign1ID = uuid.MustParse("cc300000-0001-4000-8000-000000000001")
	assign2ID = uuid.MustParse("cc300000-0002-4000-8000-000000000002")
	assign3ID = uuid.MustParse("cc300000-0003-4000-8000-000000000003")

	// Sensor Modules
	mod1ID = uuid.MustParse("dd400000-0001-4000-8000-000000000001") // base1, slot1 — BME280
	mod2ID = uuid.MustParse("dd400000-0002-4000-8000-000000000002") // base1, slot2 — VL53L0X (ToF)
	mod3ID = uuid.MustParse("dd400000-0003-4000-8000-000000000003") // base2, slot1 — SoilTH
	mod4ID = uuid.MustParse("dd400000-0004-4000-8000-000000000004") // base3, slot1 — BME280

	// Sensor Channels
	ch1TempID = uuid.MustParse("ee500000-0001-4000-8000-000000000001") // mod1 → temperature
	ch1HumID  = uuid.MustParse("ee500000-0002-4000-8000-000000000002") // mod1 → humidity
	ch2TofID  = uuid.MustParse("ee500000-0007-4000-8000-000000000007") // mod2 → distance (ToF)
	ch3SoilID = uuid.MustParse("ee500000-0003-4000-8000-000000000003") // mod3 → soil_moisture
	ch3TempID = uuid.MustParse("ee500000-0004-4000-8000-000000000004") // mod3 → temperature
	ch4TempID = uuid.MustParse("ee500000-0005-4000-8000-000000000005") // mod4 → temperature
	ch4HumID  = uuid.MustParse("ee500000-0006-4000-8000-000000000006") // mod4 → humidity

	// Crop Instances
	cropInst1ID = uuid.MustParse("ff600000-0001-4000-8000-000000000001")
	cropInst2ID = uuid.MustParse("ff600000-0002-4000-8000-000000000002")

	// Alerts
	alert1ID = uuid.MustParse("dddddddd-0001-4000-8000-000000000001")
	alert2ID = uuid.MustParse("dddddddd-0002-4000-8000-000000000002")
	alert3ID = uuid.MustParse("dddddddd-0003-4000-8000-000000000003")
)

const (
	ownerEmail    = "demo@spectron.lk"
	ownerPassword = "Demo@1234"
	ownerName     = "Kamal Perera"
	ownerPhone    = "+94771234567"
	ownerOrg      = "Perera Green Farms"

	viewerEmail    = "viewer@spectron.lk"
	viewerPassword = "Viewer@1234"
	viewerName     = "Nimal Perera"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	pool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()
	fmt.Println("🌱  Seeding demo account (AgriAssist full model)...")
	fmt.Println()

	steps := []struct {
		name string
		fn   func(context.Context, *pgxpool.Pool) error
	}{
		{"Owner user & account", seedOwner},
		{"Viewer user", seedViewer},
		{"Legacy controllers & sensors (incl. ToF)", seedLegacyControllers},
		{"Farm & farm access", seedFarm},
		{"Fields", seedFields},
		{"Gateways", seedGateways},
		{"Sensor Bases", seedSensorBases},
		{"Sensor Base Assignments", seedSensorBaseAssignments},
		{"Sensor Modules & Channels (incl. ToF)", seedSensorModulesAndChannels},
		{"Crop Instances (Paddy + Chilli)", seedCropInstances},
		{"90-day sensor readings (all channels)", seedReadings},
		{"Alerts + recipient fan-out", seedAlerts},
	}

	for _, s := range steps {
		fmt.Printf("  ⏳  %s...\n", s.name)
		if err := s.fn(ctx, pool); err != nil {
			log.Fatalf("❌  %s: %v", s.name, err)
		}
		fmt.Printf("  ✅  %s\n", s.name)
	}

	printSummary()
}

// ── helpers ───────────────────────────────────────────────────────────────────

func mustUID(ctx context.Context, pool *pgxpool.Pool, query string, args ...any) uuid.UUID {
	var id uuid.UUID
	if err := pool.QueryRow(ctx, query, args...).Scan(&id); err != nil {
		log.Fatalf("mustUID(%q): %v", query, err)
	}
	return id
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// ── Owner ─────────────────────────────────────────────────────────────────────

func seedOwner(ctx context.Context, pool *pgxpool.Pool) error {
	pw, err := auth.HashPassword(ownerPassword)
	if err != nil {
		return err
	}
	twoMonthsAgo := time.Now().AddDate(0, -2, 0)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx, `
		INSERT INTO accounts (id, name, created_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`, demoAccountID, ownerOrg, twoMonthsAgo); err != nil {
		return fmt.Errorf("upsert account: %w", err)
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, phone, name, account_type, status)
		VALUES ($1, $2, $3, $4, $5, 'USER', 'ACTIVE')
		ON CONFLICT (email) DO UPDATE
		SET password_hash = EXCLUDED.password_hash,
		    phone = EXCLUDED.phone, name = EXCLUDED.name, status = 'ACTIVE'
	`, demoUserID, ownerEmail, pw, ownerPhone, ownerName); err != nil {
		return fmt.Errorf("upsert owner user: %w", err)
	}

	uid := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, ownerEmail)
	if _, err = tx.Exec(ctx, `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, 'OWNER')
		ON CONFLICT (account_id, user_id) DO UPDATE SET role = 'OWNER'
	`, demoAccountID, uid); err != nil {
		return fmt.Errorf("upsert membership: %w", err)
	}

	return tx.Commit(ctx)
}

// ── Viewer ────────────────────────────────────────────────────────────────────

func seedViewer(ctx context.Context, pool *pgxpool.Pool) error {
	pw, err := auth.HashPassword(viewerPassword)
	if err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, account_type, status)
		VALUES ($1, $2, $3, $4, 'USER', 'ACTIVE')
		ON CONFLICT (email) DO UPDATE
		SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, status = 'ACTIVE'
	`, viewerUserID, viewerEmail, pw, viewerName); err != nil {
		return fmt.Errorf("upsert viewer: %w", err)
	}

	uid := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, viewerEmail)
	if _, err = tx.Exec(ctx, `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, 'VIEWER')
		ON CONFLICT (account_id, user_id) DO UPDATE SET role = 'VIEWER'
	`, demoAccountID, uid); err != nil {
		return fmt.Errorf("upsert viewer membership: %w", err)
	}

	return tx.Commit(ctx)
}

// ── Legacy Controllers & Sensors (incl. ToF) ─────────────────────────────────

func seedLegacyControllers(ctx context.Context, pool *pgxpool.Pool) error {
	now := time.Now()
	twoMonthsAgo := now.AddDate(0, -2, 0)
	threeWeeksAgo := now.AddDate(0, 0, -21)
	lastSeen2 := now.AddDate(0, 0, -7)

	ownerUID := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, ownerEmail)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Controller 1 — ONLINE
	if _, err = tx.Exec(ctx, `
		INSERT INTO controllers (
			id, account_id, registered_by_account_id,
			hw_id, controller_uid, name, purpose, location,
			qr_code, status, claim_status, operational_status,
			owner_user_id, owner_account_id,
			last_seen, created_at, updated_at, min_reporting_interval_sec
		) VALUES (
			$1, $2, $2,
			'CTRL-DEMO-001', 'CTRL-DEMO-001',
			'Main Field Gateway', 'Field temp, humidity, soil & water-level monitoring',
			'North Field – Perera Green Farms',
			'CTRL-DEMO-001', 'ONLINE', 'CLAIMED', 'ONLINE', $3, $2,
			$4, $5, $4, 60
		)
		ON CONFLICT (hw_id) DO UPDATE
		SET name = EXCLUDED.name, purpose = EXCLUDED.purpose,
		    status = EXCLUDED.status, claim_status = EXCLUDED.claim_status,
		    operational_status = EXCLUDED.operational_status,
		    owner_user_id = EXCLUDED.owner_user_id,
		    owner_account_id = EXCLUDED.owner_account_id,
		    account_id = EXCLUDED.account_id,
		    last_seen = EXCLUDED.last_seen, updated_at = EXCLUDED.updated_at
	`, ctrl1ID, demoAccountID, ownerUID, now, twoMonthsAgo); err != nil {
		return fmt.Errorf("upsert ctrl1: %w", err)
	}

	// Controller 2 — OFFLINE
	if _, err = tx.Exec(ctx, `
		INSERT INTO controllers (
			id, account_id, registered_by_account_id,
			hw_id, controller_uid, name, purpose, location,
			qr_code, status, claim_status, operational_status,
			owner_user_id, owner_account_id,
			last_seen, created_at, updated_at, min_reporting_interval_sec
		) VALUES (
			$1, $2, $2,
			'CTRL-DEMO-002', 'CTRL-DEMO-002',
			'Warehouse Sensor', 'Grain storage humidity tracking',
			'Warehouse – Perera Green Farms',
			'CTRL-DEMO-002', 'OFFLINE', 'CLAIMED', 'OFFLINE', $3, $2,
			$4, $5, $4, 120
		)
		ON CONFLICT (hw_id) DO UPDATE
		SET name = EXCLUDED.name, status = EXCLUDED.status,
		    claim_status = EXCLUDED.claim_status,
		    operational_status = EXCLUDED.operational_status,
		    owner_user_id = EXCLUDED.owner_user_id,
		    owner_account_id = EXCLUDED.owner_account_id,
		    account_id = EXCLUDED.account_id,
		    last_seen = EXCLUDED.last_seen, updated_at = EXCLUDED.updated_at
	`, ctrl2ID, demoAccountID, ownerUID, lastSeen2, threeWeeksAgo); err != nil {
		return fmt.Errorf("upsert ctrl2: %w", err)
	}

	// Legacy sensors
	type legacySensor struct {
		id       uuid.UUID
		ctrlID   uuid.UUID
		hwID     string
		sType    string
		name     string
		unit     string
		status   string
		lastSeen time.Time
	}

	sensors := []legacySensor{
		{legacySen1TH,   ctrl1ID, "SEN-TH-DEMO-001",   "temperature_humidity", "Field Temperature & Humidity",  "°C/%RH", "OK", now},
		{legacySen1Tof,  ctrl1ID, "SEN-TOF-DEMO-001",  "distance",             "Water Tank Level (ToF/VL53L0X)","cm",     "OK", now},
		{legacySen2Soil, ctrl1ID, "SEN-SOIL-DEMO-001", "soil_moisture",        "Soil Moisture & Temp Probe",    "%",      "OK", now},
		{legacySen3TH,   ctrl2ID, "SEN-TH-DEMO-002",   "temperature_humidity", "Warehouse Temp & Humidity",     "°C/%RH", "OK", lastSeen2},
	}

	for _, s := range sensors {
		// Use ON CONFLICT on hw_id so re-runs update type/name even if PK already exists
		if _, err = tx.Exec(ctx, `
			INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (controller_id, hw_id) DO UPDATE
			SET type = EXCLUDED.type, name = EXCLUDED.name,
			    unit = EXCLUDED.unit, status = EXCLUDED.status,
			    last_seen = EXCLUDED.last_seen
		`, s.id, s.ctrlID, s.hwID, s.sType, s.name, s.unit, s.status, s.lastSeen); err != nil {
			return fmt.Errorf("upsert sensor %s: %w", s.hwID, err)
		}
	}

	return tx.Commit(ctx)
}

// ── Farm & Farm Access ────────────────────────────────────────────────────────

func seedFarm(ctx context.Context, pool *pgxpool.Pool) error {
	ownerUID := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, ownerEmail)
	viewerUID := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, viewerEmail)

	twoMonthsAgo := time.Now().AddDate(0, -2, 0)
	oneMonthAgo := time.Now().AddDate(0, -1, 0)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx, `
		INSERT INTO farms (
			id, name, latitude, longitude, area,
			location_label, location_source,
			created_by_user_id, created_at, updated_at
		) VALUES (
			$1, 'Perera Green Farms',
			7.8731, 80.7718, 12.5,
			'Kurunegala District, North Western Province, Sri Lanka',
			'map_pin', $2, $3, $3
		)
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, latitude = EXCLUDED.latitude,
		    longitude = EXCLUDED.longitude, area = EXCLUDED.area,
		    location_label = EXCLUDED.location_label, updated_at = EXCLUDED.updated_at
	`, farmID, ownerUID, twoMonthsAgo); err != nil {
		return fmt.Errorf("upsert farm: %w", err)
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO farm_access (farm_id, user_id, role, added_at)
		VALUES ($1, $2, 'owner', $3)
		ON CONFLICT (farm_id, user_id) DO UPDATE SET role = 'owner'
	`, farmID, ownerUID, twoMonthsAgo); err != nil {
		return fmt.Errorf("upsert owner farm_access: %w", err)
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO farm_access (farm_id, user_id, role, invited_by_user_id, added_at)
		VALUES ($1, $2, 'viewer', $3, $4)
		ON CONFLICT (farm_id, user_id) DO UPDATE SET role = 'viewer'
	`, farmID, viewerUID, ownerUID, oneMonthAgo); err != nil {
		return fmt.Errorf("upsert viewer farm_access: %w", err)
	}

	return tx.Commit(ctx)
}

// ── Fields ────────────────────────────────────────────────────────────────────

func seedFields(ctx context.Context, pool *pgxpool.Pool) error {
	twoMonthsAgo := time.Now().AddDate(0, -2, 0)

	type fieldRow struct {
		id        uuid.UUID
		name      string
		lat, lon  float64
		area      float64
	}
	fields := []fieldRow{
		{field1ID, "North Paddy Block",       7.8745, 80.7710, 4.2},
		{field2ID, "South Chilli Plot",       7.8718, 80.7725, 2.8},
		{field3ID, "Warehouse / Storage Area", 7.8730, 80.7740, 0.5},
	}

	for _, f := range fields {
		if _, err := pool.Exec(ctx, `
			INSERT INTO fields (id, farm_id, name, latitude, longitude, area, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
			ON CONFLICT (id) DO UPDATE
			SET name = EXCLUDED.name, latitude = EXCLUDED.latitude,
			    longitude = EXCLUDED.longitude, area = EXCLUDED.area, updated_at = EXCLUDED.updated_at
		`, f.id, farmID, f.name, f.lat, f.lon, f.area, twoMonthsAgo); err != nil {
			return fmt.Errorf("upsert field %s: %w", f.name, err)
		}
	}
	return nil
}

// ── Gateways ──────────────────────────────────────────────────────────────────

func seedGateways(ctx context.Context, pool *pgxpool.Pool) error {
	now := time.Now()
	twoMonthsAgo := now.AddDate(0, -2, 0)
	lastSeen2 := now.AddDate(0, 0, -7)
	threeWeeksAgo := now.AddDate(0, 0, -21)

	var ctrl1Exists bool
	pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM controllers WHERE id = $1)`, ctrl1ID).Scan(&ctrl1Exists)
	var legacyRef *uuid.UUID
	if ctrl1Exists {
		legacyRef = &ctrl1ID
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO gateways (
			id, farm_id, legacy_controller_id,
			serial_number, model, latitude, longitude,
			status, last_seen, created_at, updated_at
		) VALUES ($1, $2, $3, 'GW-DEMO-001', 'Spectron GW v2', 7.8745, 80.7710,
		          'online', $4, $5, $4)
		ON CONFLICT (id) DO UPDATE
		SET farm_id = EXCLUDED.farm_id, legacy_controller_id = EXCLUDED.legacy_controller_id,
		    status = EXCLUDED.status, last_seen = EXCLUDED.last_seen, updated_at = EXCLUDED.updated_at
	`, gw1ID, farmID, legacyRef, now, twoMonthsAgo); err != nil {
		return fmt.Errorf("upsert gw1: %w", err)
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO gateways (
			id, farm_id, legacy_controller_id,
			serial_number, model, latitude, longitude,
			status, last_seen, created_at, updated_at
		) VALUES ($1, $2, NULL, 'GW-DEMO-002', 'Spectron GW v1', 7.8730, 80.7740,
		          'offline', $3, $4, $3)
		ON CONFLICT (id) DO UPDATE
		SET farm_id = EXCLUDED.farm_id, status = EXCLUDED.status,
		    last_seen = EXCLUDED.last_seen, updated_at = EXCLUDED.updated_at
	`, gw2ID, farmID, lastSeen2, threeWeeksAgo); err != nil {
		return fmt.Errorf("upsert gw2: %w", err)
	}
	return nil
}

// ── Sensor Bases ──────────────────────────────────────────────────────────────

func seedSensorBases(ctx context.Context, pool *pgxpool.Pool) error {
	now := time.Now()
	type base struct {
		id       uuid.UUID
		gwID     uuid.UUID
		serial   string
		label    string
		status   string
		lastSeen time.Time
	}
	bases := []base{
		{base1ID, gw1ID, "SB-DEMO-001", "Field 1 Node",   "live",    now},
		{base2ID, gw1ID, "SB-DEMO-002", "Field 2 Node",   "live",    now},
		{base3ID, gw2ID, "SB-DEMO-003", "Warehouse Node", "offline", now.AddDate(0, 0, -7)},
	}
	for _, b := range bases {
		if _, err := pool.Exec(ctx, `
			INSERT INTO sensor_bases (id, gateway_id, serial_number, label, status, last_seen, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
			ON CONFLICT (id) DO UPDATE
			SET gateway_id = EXCLUDED.gateway_id, label = EXCLUDED.label,
			    status = EXCLUDED.status, last_seen = EXCLUDED.last_seen, updated_at = EXCLUDED.updated_at
		`, b.id, b.gwID, b.serial, b.label, b.status, b.lastSeen); err != nil {
			return fmt.Errorf("upsert base %s: %w", b.serial, err)
		}
	}
	return nil
}

// ── Sensor Base Assignments ───────────────────────────────────────────────────

func seedSensorBaseAssignments(ctx context.Context, pool *pgxpool.Pool) error {
	ownerUID := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, ownerEmail)
	twoMonthsAgo := time.Now().AddDate(0, -2, 0)

	type asgn struct {
		id      uuid.UUID
		baseID  uuid.UUID
		fieldID uuid.UUID
		zone    string
	}
	asgns := []asgn{
		{assign1ID, base1ID, field1ID, "North section – paddy"},
		{assign2ID, base2ID, field2ID, "Centre – chilli rows"},
		{assign3ID, base3ID, field3ID, "Main storage zone"},
	}
	for _, a := range asgns {
		if _, err := pool.Exec(ctx, `
			INSERT INTO sensor_base_assignments
				(id, base_id, field_id, monitoring_zone, assigned_at, assigned_by_user_id)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (id) DO NOTHING
		`, a.id, a.baseID, a.fieldID, a.zone, twoMonthsAgo, ownerUID); err != nil {
			return fmt.Errorf("upsert assignment %s: %w", a.id, err)
		}
	}
	return nil
}

// ── Sensor Modules & Channels (incl. ToF) ────────────────────────────────────

func seedSensorModulesAndChannels(ctx context.Context, pool *pgxpool.Pool) error {
	now := time.Now()

	// Modules
	type mod struct {
		id     uuid.UUID
		baseID uuid.UUID
		slot   int
		model  string
		status string
	}
	mods := []mod{
		{mod1ID, base1ID, 1, "BME280",    "live"},    // Field 1 — temp+hum
		{mod2ID, base1ID, 2, "VL53L0X",   "live"},    // Field 1 — ToF distance
		{mod3ID, base2ID, 1, "SoilTH-v1", "live"},    // Field 2 — soil+temp
		{mod4ID, base3ID, 1, "BME280",    "offline"}, // Warehouse — temp+hum
	}
	for _, m := range mods {
		if _, err := pool.Exec(ctx, `
			INSERT INTO sensor_modules (id, base_id, slot_number, model, status, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $6)
			ON CONFLICT (base_id, slot_number) DO UPDATE
			SET model = EXCLUDED.model, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
		`, m.id, m.baseID, m.slot, m.model, m.status, now); err != nil {
			return fmt.Errorf("upsert module %s slot%d: %w", m.baseID, m.slot, err)
		}
	}

	// Channels
	type ch struct {
		id      uuid.UUID
		modID   uuid.UUID
		key     string
		mtype   string
		unit    string
	}
	channels := []ch{
		{ch1TempID, mod1ID, "temperature",  "temperature",  "°C"},
		{ch1HumID,  mod1ID, "humidity",     "humidity",     "%RH"},
		{ch2TofID,  mod2ID, "distance",     "distance",     "cm"},
		{ch3SoilID, mod3ID, "soil_moisture","soil_moisture","%"},
		{ch3TempID, mod3ID, "temperature",  "temperature",  "°C"},
		{ch4TempID, mod4ID, "temperature",  "temperature",  "°C"},
		{ch4HumID,  mod4ID, "humidity",     "humidity",     "%RH"},
	}
	for _, c := range channels {
		if _, err := pool.Exec(ctx, `
			INSERT INTO sensor_channels (id, module_id, channel_key, measurement_type, unit, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $6)
			ON CONFLICT (module_id, channel_key) DO UPDATE
			SET measurement_type = EXCLUDED.measurement_type,
			    unit = EXCLUDED.unit, updated_at = EXCLUDED.updated_at
		`, c.id, c.modID, c.key, c.mtype, c.unit, now); err != nil {
			return fmt.Errorf("upsert channel %s/%s: %w", c.modID, c.key, err)
		}
	}
	return nil
}

// ── Crop Instances ────────────────────────────────────────────────────────────

func seedCropInstances(ctx context.Context, pool *pgxpool.Pool) error {
	var paddyID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM crops WHERE name = 'Paddy / Rice'`).Scan(&paddyID); err != nil {
		return fmt.Errorf("find Paddy crop: %w", err)
	}
	var chilliID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM crops WHERE name = 'Chilli'`).Scan(&chilliID); err != nil {
		return fmt.Errorf("find Chilli crop: %w", err)
	}

	var paddyStageID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM growth_stages WHERE crop_id = $1 AND stage_name = 'Grain filling'`, paddyID).Scan(&paddyStageID); err != nil {
		return fmt.Errorf("find Paddy grain-filling stage: %w", err)
	}
	var chilliStageID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM growth_stages WHERE crop_id = $1 AND stage_name = 'Flowering'`, chilliID).Scan(&chilliStageID); err != nil {
		return fmt.Errorf("find Chilli flowering stage: %w", err)
	}

	now := time.Now()
	stageEst := now.AddDate(0, 0, -5)
	paddyPlanted := now.AddDate(0, -3, 0)
	chilliPlanted := now.AddDate(0, -2, 0)

	for _, ci := range []struct {
		id         uuid.UUID
		fieldID    uuid.UUID
		cropID     uuid.UUID
		planted    time.Time
		stageID    uuid.UUID
		confidence float64
	}{
		{cropInst1ID, field1ID, paddyID,  paddyPlanted,  paddyStageID,  0.87},
		{cropInst2ID, field2ID, chilliID, chilliPlanted, chilliStageID, 0.92},
	} {
		if _, err := pool.Exec(ctx, `
			INSERT INTO crop_instances (
				id, field_id, crop_id, planting_date,
				current_stage_id, stage_source, stage_confidence, stage_estimated_at,
				active, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, 'automatic', $6, $7, true, $8, $8)
			ON CONFLICT (id) DO UPDATE
			SET current_stage_id = EXCLUDED.current_stage_id,
			    stage_source = EXCLUDED.stage_source,
			    stage_confidence = EXCLUDED.stage_confidence,
			    stage_estimated_at = EXCLUDED.stage_estimated_at,
			    updated_at = EXCLUDED.updated_at
		`, ci.id, ci.fieldID, ci.cropID, ci.planted.Format("2006-01-02"),
			ci.stageID, ci.confidence, stageEst, ci.planted); err != nil {
			return fmt.Errorf("upsert crop instance %s: %w", ci.id, err)
		}
	}
	return nil
}

// ── Sensor Readings ───────────────────────────────────────────────────────────
// Every 30 minutes for 90 days for each sensor.
// Writes into sensor_readings with both sensor_id (legacy) and sensor_channel_id (new).
// Sensors covered:
//   legacySen1TH  / ch1TempID + ch1HumID  — Field 1 air temp & humidity
//   legacySen1Tof / ch2TofID              — Field 1 ToF water tank distance
//   legacySen2Soil/ ch3SoilID + ch3TempID — Field 2 soil moisture & soil temp
//   legacySen3TH  / ch4TempID + ch4HumID  — Warehouse (last 80 days only, then offline)

func seedReadings(ctx context.Context, pool *pgxpool.Pool) error {
	// Clear existing demo readings first to avoid duplicates on re-run
	_, err := pool.Exec(ctx, `
		DELETE FROM sensor_readings
		WHERE sensor_id IN ($1, $2, $3, $4)
	`, legacySen1TH, legacySen1Tof, legacySen2Soil, legacySen3TH)
	if err != nil {
		return fmt.Errorf("clear old readings: %w", err)
	}

	rng := rand.New(rand.NewSource(42))
	now := time.Now().UTC().Truncate(30 * time.Minute)
	start := now.AddDate(0, 0, -90)

	type reading struct {
		t       time.Time
		senID   uuid.UUID
		chanID  *uuid.UUID
		value   float64
		meta    *string
	}

	batch := make([]reading, 0, 90*48*6)

	warehouseOfflineAfter := now.AddDate(0, 0, -7) // warehouse went offline 7 days ago

	for ts := start; !ts.After(now); ts = ts.Add(30 * time.Minute) {
		hf := float64(ts.Hour()) + float64(ts.Minute())/60.0

		// ── Field 1: Air temperature (BME280, ch1TempID)
		airTemp := 28.0 + 6.0*math.Sin((hf-6.0)*math.Pi/12.0) + rng.NormFloat64()*0.8
		// Occasional spikes > 34°C to trigger alerts
		dayN := int(ts.Sub(start).Hours() / 24)
		if dayN%15 == 3 && ts.Hour() == 14 {
			airTemp += 3.5 // push above alert threshold
		}

		// ── Field 1: Air humidity (BME280, ch1HumID)
		airHum := clamp(75.0-1.5*(airTemp-28.0)+rng.NormFloat64()*3.0, 30, 100)

		// ── Field 1: Water tank ToF distance (VL53L0X, ch2TofID)
		// Tank: 30 cm (full) → 150 cm (empty). Refill every 30 days.
		cycleDays := math.Mod(float64(dayN), 30.0)
		tofDist := clamp(30.0+120.0*(cycleDays/30.0)+rng.NormFloat64()*1.5, 10, 160)
		tofMeta := fmt.Sprintf(`{"field_id":"%s","farm_id":"%s"}`, field1ID, farmID)

		// ── Field 2: Soil moisture (SoilTH, ch3SoilID)
		soilMoist := clamp(67.5+12.5*math.Sin((hf-8.0)*math.Pi/12.0)+rng.NormFloat64()*2.5, 20, 100)
		// Simulate drought stress every ~20 days
		if dayN%20 >= 17 {
			soilMoist -= 20.0
			if soilMoist < 25 {
				soilMoist = 25
			}
		}

		// ── Field 2: Soil temperature (SoilTH, ch3TempID)
		soilTemp := clamp(airTemp-2.0+rng.NormFloat64()*0.5, 18, 38)

		// Append all readings for this timestamp
		ch1Temp := ch1TempID
		ch1Hum := ch1HumID
		ch2Tof := ch2TofID
		ch3Soil := ch3SoilID
		ch3Temp := ch3TempID

		batch = append(batch,
			reading{ts, legacySen1TH,   &ch1Temp, airTemp,   nil},
			// humidity stored as separate channel but same legacy sensor_id (with meta key)
			reading{ts, legacySen1TH,   &ch1Hum,  airHum,    strPtr(`{"channel":"humidity"}`)},
			reading{ts, legacySen1Tof,  &ch2Tof,  tofDist,   strPtr(tofMeta)},
			reading{ts, legacySen2Soil, &ch3Soil, soilMoist, nil},
			reading{ts, legacySen2Soil, &ch3Temp, soilTemp,  strPtr(`{"channel":"temperature"}`)},
		)

		// Warehouse sensor — only up to 7 days ago
		if ts.Before(warehouseOfflineAfter) {
			whTemp := clamp(airTemp-3.0+rng.NormFloat64()*0.4, 20, 36) // warehouse cooler
			whHum := clamp(airHum+5.0+rng.NormFloat64()*2.0, 40, 95)
			ch4Temp := ch4TempID
			ch4Hum := ch4HumID
			batch = append(batch,
				reading{ts, legacySen3TH, &ch4Temp, whTemp, nil},
				reading{ts, legacySen3TH, &ch4Hum,  whHum,  strPtr(`{"channel":"humidity"}`)},
			)
		}
	}

	fmt.Printf("    inserting %d readings...\n", len(batch))

	// Insert in chunks of 1000
	const chunkSize = 1000
	for i := 0; i < len(batch); i += chunkSize {
		end := i + chunkSize
		if end > len(batch) {
			end = len(batch)
		}
		chunk := batch[i:end]

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		for _, r := range chunk {
			if _, err = tx.Exec(ctx, `
				INSERT INTO sensor_readings (time, sensor_id, value, meta, sensor_channel_id)
				VALUES ($1, $2, $3, $4::jsonb, $5)
				ON CONFLICT (time, sensor_id) DO NOTHING
			`, r.t, r.senID, r.value, r.meta, r.chanID); err != nil {
				tx.Rollback(ctx)
				return fmt.Errorf("insert reading at %s: %w", r.t, err)
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit chunk: %w", err)
		}
	}

	// Also insert channel-keyed rows (time + sensor_channel_id unique index)
	// These go into separate rows since the unique key is (time, sensor_channel_id)
	fmt.Println("    inserting channel-indexed readings...")

	type chReading struct {
		t      time.Time
		chanID uuid.UUID
		value  float64
	}
	chBatch := make([]chReading, 0, len(batch))

	rng2 := rand.New(rand.NewSource(99))
	for ts := start; !ts.After(now); ts = ts.Add(30 * time.Minute) {
		hf := float64(ts.Hour()) + float64(ts.Minute())/60.0
		dayN := int(ts.Sub(start).Hours() / 24)

		airTemp := 28.0 + 6.0*math.Sin((hf-6.0)*math.Pi/12.0) + rng2.NormFloat64()*0.8
		airHum := clamp(75.0-1.5*(airTemp-28.0)+rng2.NormFloat64()*3.0, 30, 100)
		cycleDays := math.Mod(float64(dayN), 30.0)
		tofDist := clamp(30.0+120.0*(cycleDays/30.0)+rng2.NormFloat64()*1.5, 10, 160)
		soilMoist := clamp(67.5+12.5*math.Sin((hf-8.0)*math.Pi/12.0)+rng2.NormFloat64()*2.5, 20, 100)
		if dayN%20 >= 17 {
			soilMoist = clamp(soilMoist-20, 20, 100)
		}
		soilTemp := clamp(airTemp-2.0+rng2.NormFloat64()*0.5, 18, 38)

		chBatch = append(chBatch,
			chReading{ts, ch1TempID, airTemp},
			chReading{ts, ch1HumID, airHum},
			chReading{ts, ch2TofID, tofDist},
			chReading{ts, ch3SoilID, soilMoist},
			chReading{ts, ch3TempID, soilTemp},
		)

		if ts.Before(warehouseOfflineAfter) {
			whTemp := clamp(airTemp-3.0+rng2.NormFloat64()*0.4, 20, 36)
			whHum := clamp(airHum+5.0+rng2.NormFloat64()*2.0, 40, 95)
			chBatch = append(chBatch,
				chReading{ts, ch4TempID, whTemp},
				chReading{ts, ch4HumID, whHum},
			)
		}
	}

	// These use a DIFFERENT unique index: (time, sensor_channel_id)
	// We must use a dummy sensor_id here — use the corresponding legacy sensor_id
	chanToSensor := map[uuid.UUID]uuid.UUID{
		ch1TempID: legacySen1TH,
		ch1HumID:  legacySen1TH,
		ch2TofID:  legacySen1Tof,
		ch3SoilID: legacySen2Soil,
		ch3TempID: legacySen2Soil,
		ch4TempID: legacySen3TH,
		ch4HumID:  legacySen3TH,
	}

	for i := 0; i < len(chBatch); i += chunkSize {
		end := i + chunkSize
		if end > len(chBatch) {
			end = len(chBatch)
		}
		chunk := chBatch[i:end]

		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		for _, r := range chunk {
			senID := chanToSensor[r.chanID]
			// Use a synthetic sensor_id offset to avoid PK collision with the rows above
			// We store channel readings with a fake time offset (+1 microsecond)
			syntheticTime := r.t.Add(time.Microsecond)
			if _, err = tx.Exec(ctx, `
				INSERT INTO sensor_readings (time, sensor_id, value, sensor_channel_id)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (time, sensor_channel_id) DO NOTHING
			`, syntheticTime, senID, r.value, r.chanID); err != nil {
				tx.Rollback(ctx)
				return fmt.Errorf("insert channel reading: %w", err)
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit channel chunk: %w", err)
		}
	}

	return nil
}

func strPtr(s string) *string { return &s }

// ── Alerts + Recipient Fan-out ────────────────────────────────────────────────

func seedAlerts(ctx context.Context, pool *pgxpool.Pool) error {
	ownerUID := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, ownerEmail)
	viewerUID := mustUID(ctx, pool, `SELECT id FROM users WHERE email = $1`, viewerEmail)
	now := time.Now()
	ackTime := now.AddDate(0, 0, -6)

	type alert struct {
		id      uuid.UUID
		fieldID *uuid.UUID
		aType   string
		sev     string
		msg     string
		status  string
		created time.Time
		ackAt   *time.Time
	}

	alerts := []alert{
		{
			id: alert1ID, fieldID: &field1ID,
			aType: "HIGH_TEMPERATURE", sev: "WARNING", status: "open",
			msg:     "North Paddy Block: air temperature exceeded 34 °C for more than 2 hours. Consider supplemental irrigation or shade.",
			created: now.AddDate(0, 0, -3),
		},
		{
			id: alert2ID, fieldID: &field2ID,
			aType: "LOW_SOIL_MOISTURE", sev: "CRITICAL", status: "open",
			msg:     "South Chilli Plot: soil moisture dropped below 35 %. Irrigation recommended within 6 hours.",
			created: now.AddDate(0, 0, -1),
		},
		{
			id: alert3ID, fieldID: &field3ID,
			aType: "GATEWAY_OFFLINE", sev: "INFO", status: "open",
			msg:     "Warehouse gateway GW-DEMO-002 has been offline for 7 days. Check power and Wi-Fi connectivity.",
			created: now.AddDate(0, 0, -7),
			ackAt:   &ackTime,
		},
	}

	for _, a := range alerts {
		if _, err := pool.Exec(ctx, `
			INSERT INTO alerts (
				id, account_id, farm_id, field_id,
				type, severity, message,
				status, created_at, acknowledged_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (id) DO UPDATE
			SET type = EXCLUDED.type, severity = EXCLUDED.severity,
			    message = EXCLUDED.message, status = EXCLUDED.status,
			    acknowledged_at = EXCLUDED.acknowledged_at
		`, a.id, demoAccountID, farmID, a.fieldID, a.aType, a.sev, a.msg, a.status, a.created, a.ackAt); err != nil {
			return fmt.Errorf("upsert alert %s: %w", a.id, err)
		}

		// Fan out to owner + viewer
		for _, uid := range []uuid.UUID{ownerUID, viewerUID} {
			if _, err := pool.Exec(ctx, `
				INSERT INTO alert_recipients (alert_id, user_id, created_at)
				VALUES ($1, $2, $3)
				ON CONFLICT (alert_id, user_id) DO NOTHING
			`, a.id, uid, a.created); err != nil {
				return fmt.Errorf("upsert alert_recipient %s/%s: %w", a.id, uid, err)
			}
		}
	}
	return nil
}

// ── Summary ───────────────────────────────────────────────────────────────────

func printSummary() {
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println("  SPECTRON AGRIASSIST — DEMO ACCOUNT READY  ✅")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println()
	fmt.Println("  🔑  Farm Owner")
	fmt.Printf("      Email:    %s\n", ownerEmail)
	fmt.Printf("      Password: %s\n", ownerPassword)
	fmt.Println()
	fmt.Println("  👁️   Read-Only Viewer")
	fmt.Printf("      Email:    %s\n", viewerEmail)
	fmt.Printf("      Password: %s\n", viewerPassword)
	fmt.Println()
	fmt.Println("  🏡  Farm: Perera Green Farms  (Kurunegala District, Sri Lanka)")
	fmt.Println()
	fmt.Println("  🌾  Fields & Crops")
	fmt.Println("      Field 1 — North Paddy Block  (4.2 ha)  Paddy/Rice → Grain filling")
	fmt.Println("      Field 2 — South Chilli Plot  (2.8 ha)  Chilli     → Flowering")
	fmt.Println("      Field 3 — Warehouse/Storage  (0.5 ha)  No active crop")
	fmt.Println()
	fmt.Println("  📡  Hardware")
	fmt.Println("      GW-DEMO-001 (ONLINE) ← linked to CTRL-DEMO-001")
	fmt.Println("        SB-DEMO-001 → Field 1")
	fmt.Println("          mod1 BME280   : air temperature + air humidity")
	fmt.Println("          mod2 VL53L0X  : ToF distance (water tank level)")
	fmt.Println("        SB-DEMO-002 → Field 2")
	fmt.Println("          mod1 SoilTH   : soil moisture + soil temperature")
	fmt.Println("      GW-DEMO-002 (OFFLINE, 7 days)")
	fmt.Println("        SB-DEMO-003 → Field 3")
	fmt.Println("          mod1 BME280   : air temperature + air humidity")
	fmt.Println()
	fmt.Println("  📊  Sensor Readings  (90 days, every 30 min)")
	fmt.Println("      Air temp/humidity, ToF distance, soil moisture/temp, warehouse")
	fmt.Println("      Written with both sensor_id AND sensor_channel_id columns")
	fmt.Println()
	fmt.Println("  🚨  Alerts (fanned out to owner + viewer)")
	fmt.Println("      ⚠️   HIGH_TEMPERATURE  — North Paddy Block  (3 days ago, OPEN)")
	fmt.Println("      🔴  LOW_SOIL_MOISTURE  — South Chilli Plot  (1 day ago, OPEN)")
	fmt.Println("      ℹ️   GATEWAY_OFFLINE    — Warehouse          (7 days ago, ACKNOWLEDGED)")
	fmt.Println()
}
