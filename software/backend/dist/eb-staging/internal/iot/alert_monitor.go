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

	type staleController struct {
		id        string
		accountID string
		name      string
		lastSeen  time.Time
	}

	rows, err := tx.Query(ctx, `
		UPDATE controllers
		SET operational_status = 'OFFLINE',
		    status = 'OFFLINE',
		    updated_at = NOW()
		WHERE claim_status = 'CLAIMED'
		  AND owner_account_id IS NOT NULL
		  AND operational_status <> 'OFFLINE'
		  AND last_seen IS NOT NULL
		  AND last_seen < NOW() - ($1::double precision * INTERVAL '1 second')
		RETURNING id, owner_account_id, COALESCE(name, hw_id), last_seen
	`, offlineAfter.Seconds())
	if err != nil {
		return err
	}

	var staleControllers []staleController
	for rows.Next() {
		var controller staleController
		if err := rows.Scan(&controller.id, &controller.accountID, &controller.name, &controller.lastSeen); err != nil {
			rows.Close()
			return err
		}
		staleControllers = append(staleControllers, controller)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, controller := range staleControllers {
		message := fmt.Sprintf("%s has not reported since %s.", controller.name, controller.lastSeen.UTC().Format(time.RFC3339))
		if err := insertOpenAlertIfMissing(ctx, tx, controller.accountID, &controller.id, nil, "CONTROLLER_OFFLINE", "WARN", message); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func markStaleSensorsOffline(ctx context.Context, db *pgxpool.Pool, offlineAfter time.Duration) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	type staleSensor struct {
		id           string
		controllerID string
		accountID    string
		name         string
		lastSeen     time.Time
	}

	rows, err := tx.Query(ctx, `
		UPDATE sensors s
		SET status = 'OFFLINE'
		FROM controllers c
		WHERE s.controller_id = c.id
		  AND c.claim_status = 'CLAIMED'
		  AND c.owner_account_id IS NOT NULL
		  AND UPPER(COALESCE(s.status, '')) <> 'OFFLINE'
		  AND s.last_seen IS NOT NULL
		  AND s.last_seen < NOW() - ($1::double precision * INTERVAL '1 second')
		RETURNING s.id, c.id, c.owner_account_id, COALESCE(s.name, s.hw_id), s.last_seen
	`, offlineAfter.Seconds())
	if err != nil {
		return err
	}

	var staleSensors []staleSensor
	for rows.Next() {
		var sensor staleSensor
		if err := rows.Scan(&sensor.id, &sensor.controllerID, &sensor.accountID, &sensor.name, &sensor.lastSeen); err != nil {
			rows.Close()
			return err
		}
		staleSensors = append(staleSensors, sensor)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, sensor := range staleSensors {
		message := fmt.Sprintf("%s has not reported since %s.", sensor.name, sensor.lastSeen.UTC().Format(time.RFC3339))
		if err := insertOpenAlertIfMissing(ctx, tx, sensor.accountID, &sensor.controllerID, &sensor.id, "SENSOR_OFFLINE", "WARN", message); err != nil {
			return err
		}
	}

	if err := markStaleControllerSensorsOffline(ctx, tx, offlineAfter); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func markStaleControllerSensorsOffline(ctx context.Context, tx interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}, offlineAfter time.Duration) error {
	_, err := tx.Exec(ctx, `
		UPDATE controller_sensors cs
		SET status = 'offline',
		    updated_at = NOW()
		FROM controllers c
		WHERE cs.controller_id = c.id
		  AND c.claim_status = 'CLAIMED'
		  AND c.owner_account_id IS NOT NULL
		  AND UPPER(COALESCE(cs.status, '')) = 'live'
		  AND cs.updated_at < NOW() - ($1::double precision * INTERVAL '1 second')
	`, offlineAfter.Seconds())
	return err
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
