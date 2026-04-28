package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"

	"spectron-backend/internal/auth"
	"spectron-backend/internal/config"
	"spectron-backend/internal/db"
)

func main() {
	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	// Connect to database
	pool, err := db.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	// Default test credentials
	email := "test@spectron.com"
	password := "test123"
	phone := "+1234567890"
	name := "Test Account"

	// Allow override via environment variables
	if envEmail := os.Getenv("TEST_EMAIL"); envEmail != "" {
		email = envEmail
	}
	if envPassword := os.Getenv("TEST_PASSWORD"); envPassword != "" {
		password = envPassword
	}
	if envPhone := os.Getenv("TEST_PHONE"); envPhone != "" {
		phone = envPhone
	}
	if envName := os.Getenv("TEST_NAME"); envName != "" {
		name = envName
	}

	// Hash password
	hashedPassword, err := auth.HashPassword(password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	// Generate IDs
	userID := uuid.New()
	accountID := uuid.New()

	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("begin transaction: %v", err)
	}
	defer tx.Rollback(ctx)

	// Check if user already exists
	var existingUserID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingUserID)
	if err == nil {
		log.Fatalf("User with email %s already exists (ID: %s)", email, existingUserID)
	}

	// Create user
	_, err = tx.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, phone)
		VALUES ($1, $2, $3, $4)
	`, userID, email, hashedPassword, phone)
	if err != nil {
		log.Fatalf("create user: %v", err)
	}

	// Create account
	_, err = tx.Exec(ctx, `
		INSERT INTO accounts (id, name)
		VALUES ($1, $2)
	`, accountID, name)
	if err != nil {
		log.Fatalf("create account: %v", err)
	}

	// Create membership (user is OWNER of their account)
	_, err = tx.Exec(ctx, `
		INSERT INTO account_memberships (account_id, user_id, role)
		VALUES ($1, $2, 'OWNER')
	`, accountID, userID)
	if err != nil {
		log.Fatalf("create membership: %v", err)
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("commit transaction: %v", err)
	}

	fmt.Println("✅ Test user created successfully!")
	fmt.Println("")
	fmt.Println("Credentials:")
	fmt.Printf("  Email:    %s\n", email)
	fmt.Printf("  Password: %s\n", password)
	fmt.Printf("  Phone:    %s\n", phone)
	fmt.Println("")
	fmt.Printf("User ID:    %s\n", userID)
	fmt.Printf("Account ID: %s\n", accountID)
	fmt.Println("")
	fmt.Println("You can now use these credentials to log in to the mobile app.")
}
