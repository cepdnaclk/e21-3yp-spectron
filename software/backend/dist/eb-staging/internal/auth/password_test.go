package auth

import "testing"

func TestHashPasswordAndCheckPasswordHash(t *testing.T) {
	password := "correct horse battery staple"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword returned error: %v", err)
	}
	if hash == "" {
		t.Fatal("expected non-empty hash")
	}
	if hash == password {
		t.Fatal("password hash must not equal the plain password")
	}
	if !CheckPasswordHash(password, hash) {
		t.Fatal("expected CheckPasswordHash to accept the correct password")
	}
	if CheckPasswordHash("wrong password", hash) {
		t.Fatal("expected CheckPasswordHash to reject the wrong password")
	}
}
