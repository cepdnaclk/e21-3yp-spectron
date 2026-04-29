package main

import (
	"fmt"
	"os"

	"spectron-backend/internal/auth"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run cmd/hash-password/main.go <password>")
		os.Exit(1)
	}

	password := os.Args[1]
	hash, err := auth.HashPassword(password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(hash)
}
