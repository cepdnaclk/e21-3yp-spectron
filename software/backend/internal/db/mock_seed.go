package db

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	MockAccountID    = uuid.MustParse("00000000-0000-0000-0000-00000000c001")
	MockControllerID = uuid.MustParse("00000000-0000-0000-0000-00000000d001")
)

const MockControllerHWID = "CTRL-MOCK-001"

func EnsureMockController(ctx context.Context, pool *pgxpool.Pool) error {
	now := time.Now()

	_, err := pool.Exec(ctx, `
		INSERT INTO accounts (id, name)
		VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`, MockAccountID, "Mock Device Pool")
	if err != nil {
		return err
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO controllers (id, account_id, hw_id, controller_uid, name, purpose, location, qr_code, status, last_seen, created_at, updated_at)
		VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'OFFLINE', $8, $9, $9)
		ON CONFLICT (hw_id) DO UPDATE
		SET account_id = EXCLUDED.account_id,
		    controller_uid = EXCLUDED.controller_uid,
		    name = EXCLUDED.name,
		    purpose = EXCLUDED.purpose,
		    location = EXCLUDED.location,
		    qr_code = EXCLUDED.qr_code,
		    status = EXCLUDED.status,
		    last_seen = EXCLUDED.last_seen,
		    updated_at = EXCLUDED.updated_at
	`,
		MockControllerID,
		MockAccountID,
		MockControllerHWID,
		"Mock Yard Controller",
		"Demo controller for pairing and sensor configuration",
		"Demo Site",
		MockControllerHWID,
		now,
		now,
	)
	if err != nil {
		return err
	}

	return nil
}
