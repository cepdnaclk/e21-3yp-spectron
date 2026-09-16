package main

import (
	"context"
	"flag"
	"log"
	"strings"

	"github.com/google/uuid"

	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
	"spectron-backend/internal/knowledge"
)

func main() {
	crop := flag.String("crop", "", "canonical crop name: Chilli, Maize, Potato, Tomato, or Paddy / Rice")
	path := flag.String("path", "", "directory containing crop JSON files")
	version := flag.String("version", "initial", "idempotent dataset version")
	flag.Parse()
	if strings.TrimSpace(*crop) == "" || strings.TrimSpace(*path) == "" {
		log.Fatal("-crop and -path are required")
	}
	if err := knowledge.ValidateDatasetCrop(*path, *crop); err != nil {
		log.Fatalf("dataset validation failed: %v", err)
	}
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	pool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := db.ApplyStartupMigrations(context.Background(), pool); err != nil {
		log.Fatalf("apply database migrations: %v", err)
	}
	var cropID uuid.UUID
	err = pool.QueryRow(context.Background(), `SELECT id FROM crops WHERE lower(name)=lower($1)`, strings.TrimSpace(*crop)).Scan(&cropID)
	if err != nil {
		log.Fatalf("crop %q is not seeded: %v", *crop, err)
	}
	count, err := knowledge.ImportDataset(context.Background(), pool, cropID, *path, strings.TrimSpace(*version))
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("imported %d knowledge entries for %s", count, *crop)
}
