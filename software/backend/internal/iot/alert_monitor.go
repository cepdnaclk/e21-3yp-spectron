package iot

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultAlertMonitorInterval = time.Minute
	defaultOfflineAfter         = 2 * time.Hour
)

type AlertMonitor struct {
	db       *pgxpool.Pool
	interval time.Duration
}

func NewAlertMonitor(db *pgxpool.Pool) *AlertMonitor {
	return &AlertMonitor{
		db:       db,
		interval: defaultAlertMonitorInterval,
	}
}

func (m *AlertMonitor) Run(ctx context.Context) {
	if m == nil || m.db == nil {
		return
	}

	m.checkOnce(ctx)

	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.checkOnce(ctx)
		}
	}
}

func (m *AlertMonitor) checkOnce(ctx context.Context) {
	if err := markStaleControllersOffline(ctx, m.db, defaultOfflineAfter); err != nil {
		log.Printf("alert monitor controller check failed: %v", err)
	}
	if err := markStaleSensorsOffline(ctx, m.db, defaultOfflineAfter); err != nil {
		log.Printf("alert monitor sensor check failed: %v", err)
	}
}

func markStaleControllersOffline(ctx context.Context, db *pgxpool.Pool, offlineAfter time.Duration) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		UPDATE controllers
		SET status = 'OFFLINE',
		    updated_at = NOW()
		WHERE owner_user_id IS NOT NULL
		  AND UPPER(COALESCE(status, '')) NOT IN ('OFFLINE', 'UNCLAIMED')
		  AND last_seen IS NOT NULL
		  AND last_seen < NOW() - ($1::double precision * INTERVAL '1 second')
		RETURNING id, account_id, COALESCE(name, hw_id), last_seen
	`, offlineAfter.Seconds())
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var controllerID string
		var accountID string
		var name string
		var lastSeen time.Time
		if err := rows.Scan(&controllerID, &accountID, &name, &lastSeen); err != nil {
			return err
		}

		message := fmt.Sprintf("%s has not reported since %s.", name, lastSeen.UTC().Format(time.RFC3339))
		if err := insertOpenAlertIfMissing(ctx, tx, accountID, &controllerID, nil, "CONTROLLER_OFFLINE", "WARN", message); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func markStaleSensorsOffline(ctx context.Context, db *pgxpool.Pool, offlineAfter time.Duration) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		UPDATE sensors s
		SET status = 'OFFLINE'
		FROM controllers c
		WHERE s.controller_id = c.id
		  AND c.owner_user_id IS NOT NULL
		  AND UPPER(COALESCE(c.status, '')) <> 'UNCLAIMED'
		  AND UPPER(COALESCE(s.status, '')) <> 'OFFLINE'
		  AND s.last_seen IS NOT NULL
		  AND s.last_seen < NOW() - ($1::double precision * INTERVAL '1 second')
		RETURNING s.id, c.id, c.account_id, COALESCE(s.name, s.hw_id), s.last_seen
	`, offlineAfter.Seconds())
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var sensorID string
		var controllerID string
		var accountID string
		var name string
		var lastSeen time.Time
		if err := rows.Scan(&sensorID, &controllerID, &accountID, &name, &lastSeen); err != nil {
			return err
		}

		message := fmt.Sprintf("%s has not reported since %s.", name, lastSeen.UTC().Format(time.RFC3339))
		if err := insertOpenAlertIfMissing(ctx, tx, accountID, &controllerID, &sensorID, "SENSOR_OFFLINE", "WARN", message); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

type alertExecutor interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func insertOpenAlertIfMissing(ctx context.Context, tx alertExecutor, accountID string, controllerID *string, sensorID *string, alertType string, severity string, message string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO alerts (id, account_id, controller_id, sensor_id, type, severity, message, created_at)
		SELECT $7, $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, NOW()
		WHERE NOT EXISTS (
			SELECT 1
			FROM alerts
			WHERE account_id = $1::uuid
			  AND ($2::uuid IS NULL OR controller_id = $2::uuid)
			  AND ($3::uuid IS NULL OR sensor_id = $3::uuid)
			  AND type = $4
			  AND severity = $5
			  AND acknowledged_at IS NULL
		)
	`, accountID, controllerID, sensorID, alertType, severity, message, uuid.New())
	return err
}
