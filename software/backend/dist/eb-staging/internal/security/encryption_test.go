package security

import "testing"

func TestEncryptDecryptSecret(t *testing.T) {
	t.Setenv("APP_ENCRYPTION_KEY", "12345678901234567890123456789012")

	encrypted, err := EncryptSecret("mqtt-password")
	if err != nil {
		t.Fatalf("EncryptSecret returned error: %v", err)
	}
	if encrypted == "mqtt-password" {
		t.Fatal("encrypted secret should not equal plaintext")
	}

	decrypted, err := DecryptSecret(encrypted)
	if err != nil {
		t.Fatalf("DecryptSecret returned error: %v", err)
	}
	if decrypted != "mqtt-password" {
		t.Fatalf("unexpected decrypted secret: %q", decrypted)
	}
}

func TestEncryptSecretRequiresValidKey(t *testing.T) {
	t.Setenv("APP_ENCRYPTION_KEY", "short")

	if _, err := EncryptSecret("secret"); err == nil {
		t.Fatal("expected invalid key error")
	}
}
