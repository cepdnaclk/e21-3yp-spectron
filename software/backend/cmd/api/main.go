package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"spectron-backend/internal/auth"
	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
	"spectron-backend/internal/geocoding"
	"spectron-backend/internal/httpapi"
	"spectron-backend/internal/iot"
	"spectron-backend/internal/realtime"
)

func main() {
	log.Println("BOOT_MARKER backend 2026-04-29-fix2")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	if cfg.JWTSecret == config.DefaultDevJWTSecret {
		log.Println("WARNING: using default development JWT secret. Set JWT_SECRET before deploying to AWS.")
	}

	pool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	if err := db.ApplyStartupMigrations(context.Background(), pool); err != nil {
		log.Fatalf("apply startup migrations: %v", err)
	}

	auth.SetJWTSecret(cfg.JWTSecret)
	realtimeHub := realtime.NewHub()
	realtimeCtx, stopRealtime := context.WithCancel(context.Background())
	defer stopRealtime()
	go realtimeHub.Run(realtimeCtx)

	rawReadingsPublisher, err := iot.NewKafkaPublisherWithConfig(cfg.Kafka)
	if err != nil {
		log.Fatalf("configure Kafka producer: %v", err)
	}
	defer rawReadingsPublisher.Close()
	if len(cfg.Kafka.Brokers) == 0 {
		log.Println("WARNING: Kafka is not configured. POST /api/iot/upload will return 503 until KAFKA_BROKERS is set.")
	} else {
		log.Printf("Kafka raw readings topic %q via brokers %v", cfg.Kafka.RawReadingsTopic, cfg.Kafka.Brokers)
	}

	r := chi.NewRouter()
	geocoder := geocoding.NewNominatimProvider(geocoding.Config{
		BaseURL:   cfg.Geocoding.BaseURL,
		APIKey:    cfg.Geocoding.APIKey,
		UserAgent: cfg.Geocoding.UserAgent,
		Timeout:   time.Duration(cfg.Geocoding.TimeoutMS) * time.Millisecond,
	})
	httpapi.RegisterRoutes(r, pool, cfg.AllowedOrigins, rawReadingsPublisher, cfg.Email, geocoder, realtimeHub)

	monitorCtx, stopMonitor := context.WithCancel(context.Background())
	defer stopMonitor()
	go iot.NewAlertMonitor(pool).Run(monitorCtx)

	srv := &http.Server{
		Addr:         "0.0.0.0:" + cfg.HTTPPort, // Listen on all interfaces for mobile access
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("API server listening on 0.0.0.0:%s", cfg.HTTPPort)
		log.Printf("Mobile app should connect to: http://<your-ip>:%s", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	// graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}
}
