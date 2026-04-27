package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

const encryptedSecretPrefix = "v1:"

var errInvalidAppEncryptionKey = errors.New("APP_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded 32 bytes, or hex-encoded 32 bytes")

func EncryptSecret(plainText string) (string, error) {
	key, err := appEncryptionKey()
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	cipherText := gcm.Seal(nil, nonce, []byte(plainText), nil)
	payload := append(nonce, cipherText...)
	return encryptedSecretPrefix + base64.StdEncoding.EncodeToString(payload), nil
}

func DecryptSecret(cipherText string) (string, error) {
	key, err := appEncryptionKey()
	if err != nil {
		return "", err
	}

	trimmed := strings.TrimSpace(cipherText)
	if !strings.HasPrefix(trimmed, encryptedSecretPrefix) {
		return "", errors.New("unsupported encrypted secret format")
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(trimmed, encryptedSecretPrefix))
	if err != nil {
		return "", fmt.Errorf("decode encrypted secret: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	if len(payload) <= gcm.NonceSize() {
		return "", errors.New("encrypted secret payload is too short")
	}

	nonce := payload[:gcm.NonceSize()]
	encrypted := payload[gcm.NonceSize():]
	plainText, err := gcm.Open(nil, nonce, encrypted, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt secret: %w", err)
	}

	return string(plainText), nil
}

func appEncryptionKey() ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv("APP_ENCRYPTION_KEY"))
	if raw == "" {
		return nil, errors.New("APP_ENCRYPTION_KEY is required")
	}

	if decoded, err := base64.StdEncoding.DecodeString(raw); err == nil && len(decoded) == 32 {
		return decoded, nil
	}

	if decoded, err := hex.DecodeString(raw); err == nil && len(decoded) == 32 {
		return decoded, nil
	}

	if len([]byte(raw)) == 32 {
		return []byte(raw), nil
	}

	return nil, errInvalidAppEncryptionKey
}
