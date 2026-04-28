package db

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Mirror the deployment-critical migrations here so cloud environments can
// bootstrap a private database without requiring a separate migration runner.

//go:embed migrations/001_init.sql
var migration001Init string

//go:embed migrations/003_context_validation_and_security.sql
var migration003ContextValidationAndSecurity string

//go:embed migrations/004_user_profile.sql
var migration004UserProfile string

//go:embed migrations/005_hardware_pairing.sql
var migration005HardwarePairing string

//go:embed migrations/006_admin_account_type.sql
var migration006AdminAccountType string

//go:embed migrations/007_user_status.sql
var migration007UserStatus string

//go:embed migrations/008_seed_single_system_admin.sql
var migration008SeedSingleSystemAdmin string

//go:embed migrations/009_system_assignments.sql
var migration009SystemAssignments string

//go:embed migrations/009_email_verification.sql
var migration009EmailVerification string

//go:embed migrations/010_activate_verified_email_users.sql
var migration010ActivateVerifiedEmailUsers string

//go:embed migrations/011_sensor_readings_retention.sql
var migration011SensorReadingsRetention string

type migration struct {
	name string
	sql  string
}

var startupMigrations = []migration{
	{name: "001_init", sql: migration001Init},
	{name: "003_context_validation_and_security", sql: migration003ContextValidationAndSecurity},
	{name: "004_user_profile", sql: migration004UserProfile},
	{name: "005_hardware_pairing", sql: migration005HardwarePairing},
	{name: "006_admin_account_type", sql: migration006AdminAccountType},
	{name: "007_user_status", sql: migration007UserStatus},
	{name: "008_seed_single_system_admin", sql: migration008SeedSingleSystemAdmin},
	{name: "009_system_assignments", sql: migration009SystemAssignments},
	{name: "009_email_verification", sql: migration009EmailVerification},
	{name: "010_activate_verified_email_users", sql: migration010ActivateVerifiedEmailUsers},
	{name: "011_sensor_readings_retention", sql: migration011SensorReadingsRetention},
}

func ApplyStartupMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	for _, m := range startupMigrations {
		if _, err := pool.Exec(ctx, m.sql); err != nil {
			return fmt.Errorf("apply migration %s: %w", m.name, err)
		}
	}

	return nil
}
