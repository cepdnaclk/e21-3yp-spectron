package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/google/uuid"

	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
)

type mockSensor struct {
	id                                   uuid.UUID
	hwID, sensorType, name, unit, status string
	baseValue                            float64
}

func mockReadingValue(sensor mockSensor, index, sampleCount int) float64 {
	// One complete cycle across the generated day gives the monitoring chart a
	// visible trend while keeping the values within plausible field conditions.
	phase := 2 * math.Pi * float64(index) / float64(sampleCount)
	switch sensor.sensorType {
	case "temperature":
		return sensor.baseValue + 2.8*math.Sin(phase)
	case "humidity":
		return sensor.baseValue - 8*math.Sin(phase)
	case "pressure":
		return sensor.baseValue + 2.2*math.Sin(phase)
	case "soil_moisture":
		return sensor.baseValue - 3.5*math.Sin(phase)
	case "light":
		return math.Max(0, sensor.baseValue+9000*math.Sin(phase))
	case "temperature_humidity":
		return sensor.baseValue + 1.8*math.Sin(phase)
	default:
		return sensor.baseValue
	}
}

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
	if err := db.ApplyStartupMigrations(ctx, pool); err != nil {
		log.Fatalf("apply migrations: %v", err)
	}
	if err := db.EnsureMockController(ctx, pool); err != nil {
		log.Fatalf("upsert mock controller: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE controllers SET status='ONLINE', operational_status='ONLINE', last_seen=now(), updated_at=now() WHERE id=$1`, db.MockControllerID); err != nil {
		log.Fatalf("mark mock controller online: %v", err)
	}

	sensors := []mockSensor{
		{uuid.MustParse("00000000-0000-0000-0000-00000000e001"), "SEN-TH-001", "temperature_humidity", "Temperature & Humidity", "C/%RH", "OK", 28.5},
		{uuid.MustParse("00000000-0000-0000-0000-00000000e104"), "SEN-TEMP-001", "temperature", "Field Temperature", "C", "OK", 29.4},
		{uuid.MustParse("00000000-0000-0000-0000-00000000e105"), "SEN-HUM-001", "humidity", "Field Humidity", "%", "OK", 78},
		{uuid.MustParse("00000000-0000-0000-0000-00000000e106"), "SEN-PRESS-001", "pressure", "Air Pressure", "hPa", "OK", 1008.6},
		{uuid.MustParse("00000000-0000-0000-0000-00000000e101"), "SEN-SOIL-001", "soil_moisture", "Soil Moisture", "%", "OK", 46},
		{uuid.MustParse("00000000-0000-0000-0000-00000000e102"), "SEN-LIGHT-001", "light", "Sunlight", "lux", "OK", 18500},
		{uuid.MustParse("00000000-0000-0000-0000-00000000e103"), "SEN-TH-OLD-001", "temperature", "Old Field Temperature", "C", "ERROR", 0},
	}

	for _, sensor := range sensors {
		lastSeen := time.Now().UTC()
		if sensor.status == "ERROR" {
			lastSeen = lastSeen.Add(-2 * time.Hour)
		}
		_, err = pool.Exec(ctx, `INSERT INTO sensors(id,controller_id,hw_id,type,name,unit,status,last_seen) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(controller_id,hw_id) DO UPDATE SET type=EXCLUDED.type,name=EXCLUDED.name,unit=EXCLUDED.unit,status=EXCLUDED.status,last_seen=EXCLUDED.last_seen`, sensor.id, db.MockControllerID, sensor.hwID, sensor.sensorType, sensor.name, sensor.unit, sensor.status, lastSeen)
		if err != nil {
			log.Fatalf("upsert sensor %s: %v", sensor.hwID, err)
		}
		if sensor.status != "OK" {
			continue
		}
		sampleCount := 72 // 24 hours at 20-minute intervals
		now := time.Now().UTC().Truncate(20 * time.Minute)
		for i := 0; i < sampleCount; i++ {
			readingTime := now.Add(-time.Duration(i) * 20 * time.Minute)
			value := mockReadingValue(sensor, i, sampleCount)
			_, err = pool.Exec(ctx, `INSERT INTO sensor_readings(time,sensor_id,value,meta) VALUES($1,$2,$3,'{"source":"mock"}'::jsonb) ON CONFLICT(time,sensor_id) DO UPDATE SET value=EXCLUDED.value,meta=EXCLUDED.meta`, readingTime, sensor.id, value)
			if err != nil {
				log.Fatalf("seed readings for %s: %v", sensor.hwID, err)
			}
		}
	}

	var gatewayID, fieldID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT g.id,f.id FROM gateways g JOIN fields f ON f.farm_id=g.farm_id WHERE g.legacy_controller_id=$1 AND f.archived_at IS NULL ORDER BY f.created_at LIMIT 1`, db.MockControllerID).Scan(&gatewayID, &fieldID); err == nil {
		baseID := uuid.MustParse("00000000-0000-0000-0000-00000000b101")
		assignmentID := uuid.MustParse("00000000-0000-0000-0000-00000000a101")
		moduleID := uuid.MustParse("00000000-0000-0000-0000-00000000f101")
		_, err = pool.Exec(ctx, `INSERT INTO sensor_bases(id,gateway_id,serial_number,label,status,last_seen) VALUES($1,$2,'BASE-MOCK-001','Field Climate Base','live',now()) ON CONFLICT(serial_number) DO UPDATE SET gateway_id=EXCLUDED.gateway_id,label=EXCLUDED.label,status='live',last_seen=now()`, baseID, gatewayID)
		if err != nil {
			log.Fatalf("seed sensor base: %v", err)
		}
		_, _ = pool.Exec(ctx, `UPDATE sensor_base_assignments SET unassigned_at=now() WHERE base_id=$1 AND unassigned_at IS NULL AND field_id<>$2`, baseID, fieldID)
		_, err = pool.Exec(ctx, `INSERT INTO sensor_base_assignments(id,base_id,field_id,monitoring_zone) VALUES($1,$2,$3,'Crop zone') ON CONFLICT(id) DO UPDATE SET field_id=EXCLUDED.field_id,monitoring_zone=EXCLUDED.monitoring_zone,unassigned_at=NULL`, assignmentID, baseID, fieldID)
		if err != nil {
			log.Fatalf("assign sensor base: %v", err)
		}
		_, err = pool.Exec(ctx, `INSERT INTO sensor_modules(id,base_id,slot_number,model,status) VALUES($1,$2,1,'Mock Climate Module','live') ON CONFLICT(base_id,slot_number) DO UPDATE SET model=EXCLUDED.model,status='live'`, moduleID, baseID)
		if err != nil {
			log.Fatalf("seed sensor module: %v", err)
		}
		channels := []struct {
			id                     uuid.UUID
			key, measurement, unit string
		}{{uuid.MustParse("00000000-0000-0000-0000-00000000c101"), "temperature", "temperature", "C"}, {uuid.MustParse("00000000-0000-0000-0000-00000000c102"), "humidity", "humidity", "%"}}
		for _, ch := range channels {
			_, err = pool.Exec(ctx, `INSERT INTO sensor_channels(id,module_id,channel_key,measurement_type,unit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(module_id,channel_key) DO UPDATE SET measurement_type=EXCLUDED.measurement_type,unit=EXCLUDED.unit`, ch.id, moduleID, ch.key, ch.measurement, ch.unit)
			if err != nil {
				log.Fatalf("seed sensor channel: %v", err)
			}
		}
	}

	fmt.Println("Mock controller and sensors are ready.")
	fmt.Printf("Controller QR ID: %s\n", db.MockControllerHWID)
	fmt.Println("- Temperature & Humidity (SEN-TH-001) - Good")
	fmt.Println("- Field Temperature (SEN-TEMP-001) - Good")
	fmt.Println("- Field Humidity (SEN-HUM-001) - Good")
	fmt.Println("- Air Pressure (SEN-PRESS-001) - Good")
	fmt.Println("- Soil Moisture (SEN-SOIL-001) - Good")
	fmt.Println("- Sunlight (SEN-LIGHT-001) - Good")
	fmt.Println("- Old Field Temperature (SEN-TH-OLD-001) - Needs attention")
}
