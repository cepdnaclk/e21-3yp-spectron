package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
)

var (
	tempHumSensorID = uuid.MustParse("00000000-0000-0000-0000-00000000e001")
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
	err = db.EnsureMockController(ctx, pool)
	if err != nil {
		log.Fatalf("upsert mock controller: %v", err)
	}

	_, err = pool.Exec(ctx, `
		DELETE FROM sensors
		WHERE controller_id = $1
		  AND hw_id <> $2
	`, db.MockControllerID, "SEN-TH-001")
	if err != nil {
		log.Fatalf("prune extra mock sensors: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, 'OK', $7)
		ON CONFLICT (controller_id, hw_id) DO UPDATE
		SET type = EXCLUDED.type,
		    name = EXCLUDED.name,
		    unit = EXCLUDED.unit,
		    status = EXCLUDED.status,
		    last_seen = EXCLUDED.last_seen
	`, tempHumSensorID, db.MockControllerID, "SEN-TH-001", "temperature_humidity", "Temperature & Humidity Sensor", "°C/%RH", time.Now())
	if err != nil {
		log.Fatalf("upsert sensor SEN-TH-001: %v", err)
	}

	fmt.Println("Mock controller and sensors are ready.")
	fmt.Printf("Controller QR ID: %s\n", db.MockControllerHWID)
	fmt.Println("Sensors:")
	fmt.Println("- Temperature & Humidity Sensor (SEN-TH-001)")
	fmt.Println("Use the QR ID on /controllers/pair to assign this controller to your logged-in account.")
}
