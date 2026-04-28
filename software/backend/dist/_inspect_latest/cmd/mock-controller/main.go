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
	tempHumSensorID    = uuid.MustParse("00000000-0000-0000-0000-00000000e001")
	loadSensorID       = uuid.MustParse("00000000-0000-0000-0000-00000000e002")
	ultrasonicSensorID = uuid.MustParse("00000000-0000-0000-0000-00000000e003")
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

	type mockSensor struct {
		id       uuid.UUID
		hwID     string
		typeName string
		name     string
		unit     string
	}

	sensors := []mockSensor{
		{tempHumSensorID, "SEN-TH-001", "temperature_humidity", "Temperature & Humidity Sensor", "°C/%RH"},
		{loadSensorID, "SEN-LOAD-001", "load", "Load Sensor", "kg"},
		{ultrasonicSensorID, "SEN-US-001", "ultrasonic", "Ultrasonic Sensor", "cm"},
	}

	for _, sensor := range sensors {
		_, err = pool.Exec(ctx, `
			INSERT INTO sensors (id, controller_id, hw_id, type, name, unit, status, last_seen)
			VALUES ($1, $2, $3, $4, $5, $6, 'OK', $7)
			ON CONFLICT (controller_id, hw_id) DO UPDATE
			SET type = EXCLUDED.type,
			    name = EXCLUDED.name,
			    unit = EXCLUDED.unit,
			    status = EXCLUDED.status,
			    last_seen = EXCLUDED.last_seen
		`, sensor.id, db.MockControllerID, sensor.hwID, sensor.typeName, sensor.name, sensor.unit, time.Now())
		if err != nil {
			log.Fatalf("upsert sensor %s: %v", sensor.hwID, err)
		}
	}

	fmt.Println("Mock controller and sensors are ready.")
	fmt.Printf("Controller QR ID: %s\n", db.MockControllerHWID)
	fmt.Println("Sensors:")
	fmt.Println("- Temperature & Humidity Sensor (SEN-TH-001)")
	fmt.Println("- Load Sensor (SEN-LOAD-001)")
	fmt.Println("- Ultrasonic Sensor (SEN-US-001)")
	fmt.Println("Use the QR ID on /controllers/pair to assign this controller to your logged-in account.")
}
