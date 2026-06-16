package main

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	password := "test123"
	storedHash := "$2a$10$9MeJDk9hxia7zNNFMXPpTOJGBzaFLXu9JGw4sleVh3nVUwah7M5d2"

	err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password))
	if err == nil {
		fmt.Println("✅ Hash matches 'test123'")
	} else {
		fmt.Printf("❌ Hash does NOT match 'test123': %v\n", err)
	}

	// Generate a fresh hash for test123 in case we need it
	freshHash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	fmt.Printf("Fresh hash for 'test123': %s\n", freshHash)
}
