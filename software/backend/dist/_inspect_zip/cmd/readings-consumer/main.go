package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/segmentio/kafka-go"

	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
	"spectron-backend/internal/iot"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	if len(cfg.Kafka.Brokers) == 0 {
		log.Fatal("KAFKA_BROKERS is required to run the readings consumer")
	}

	pool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	if err := db.ApplyStartupMigrations(context.Background(), pool); err != nil {
		log.Fatalf("apply startup migrations: %v", err)
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     cfg.Kafka.Brokers,
		GroupID:     cfg.Kafka.ConsumerGroup,
		Topic:       cfg.Kafka.RawReadingsTopic,
		MinBytes:    1,
		MaxBytes:    10e6,
		MaxWait:     time.Second,
		StartOffset: kafka.FirstOffset,
	})
	defer reader.Close()

	processor := iot.NewRawReadingsProcessor(pool)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("readings consumer started for topic %q via brokers %v", cfg.Kafka.RawReadingsTopic, cfg.Kafka.Brokers)

	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || ctx.Err() != nil {
				break
			}
			log.Printf("fetch message: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		var event iot.RawReadingsEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("discarding unreadable message at offset %d: %v", msg.Offset, err)
			if commitErr := reader.CommitMessages(ctx, msg); commitErr != nil {
				log.Printf("commit unreadable message offset %d: %v", msg.Offset, commitErr)
			}
			continue
		}

		if err := processor.ProcessEvent(ctx, event); err != nil {
			log.Printf("process event %s for device %s: %v", event.EventID, event.DeviceID, err)
			time.Sleep(2 * time.Second)
			continue
		}

		if err := reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("commit message offset %d: %v", msg.Offset, err)
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("processed event %s for device %s with %d readings", event.EventID, event.DeviceID, len(event.Sensors))
	}

	log.Println("readings consumer stopped")
}
