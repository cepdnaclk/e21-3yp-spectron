package config

import (
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"

	kafkasecurity "spectron-backend/internal/kafka"
)

const DefaultDevJWTSecret = "dev-only-change-me"

var defaultAllowedOrigins = []string{
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:3001",
	"http://127.0.0.1:3002",
	"https://localhost",
	"capacitor://localhost",
}

type Config struct {
	HTTPPort       string
	DatabaseURL    string
	JWTSecret      string
	AllowedOrigins []string
	Kafka          KafkaConfig
	MQTT           MQTTConfig
	Email          EmailConfig
}

type KafkaConfig = kafkasecurity.KafkaConfig

type MQTTConfig struct {
	Enabled            bool
	BrokerURL          string
	Topic              string
	ClientID           string
	Username           string
	Password           string
	QoS                byte
	CAFile             string
	ClientCertFile     string
	ClientKeyFile      string
	InsecureSkipVerify bool
}

type EmailConfig struct {
	SMTPHost    string
	SMTPPort    int
	SMTPUser    string
	SMTPPass    string
	EmailFrom   string
	FrontendURL string
}

func Load() (*Config, error) {
	loadEnvFiles()

	httpPort := getenv("PORT", "")
	if httpPort == "" {
		httpPort = getenv("HTTP_PORT", "8081")
	}
	dbURL := os.Getenv("DATABASE_URL")
	jwtSecret := getenv("JWT_SECRET", DefaultDevJWTSecret)
	allowedOrigins := parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS"))
	kafkaBrokers := parseCSV(os.Getenv("KAFKA_BROKERS"))
	kafkaClientID := getenv("KAFKA_CLIENT_ID", "spectron-backend")
	kafkaTopic := getenv("KAFKA_RAW_READINGS_TOPIC", "spectron.raw-readings")
	kafkaConsumerGroup := getenv("KAFKA_CONSUMER_GROUP", "spectron-readings-consumer")
	mqttQoS, err := parseQoS(getenv("MQTT_QOS", "1"))
	if err != nil {
		return nil, err
	}

	if dbURL == "" {
		// For local development and cloud deployments you can set individual parts instead.
		dbURL = buildDBURL()
	}

	return &Config{
		HTTPPort:       httpPort,
		DatabaseURL:    dbURL,
		JWTSecret:      jwtSecret,
		AllowedOrigins: allowedOrigins,
		Kafka: KafkaConfig{
			Brokers:            kafkaBrokers,
			RawReadingsTopic:   kafkaTopic,
			ConsumerGroup:      kafkaConsumerGroup,
			ClientID:           kafkaClientID,
			TLSEnabled:         parseBool(getenv("KAFKA_TLS_ENABLED", "false")),
			MTLSEnabled:        parseBool(getenv("KAFKA_MTLS_ENABLED", "false")),
			CACertPath:         getenv("KAFKA_CA_CERT_PATH", "./certs/ca.pem"),
			ClientCertPath:     getenv("KAFKA_CLIENT_CERT_PATH", "./certs/client.pem"),
			ClientKeyPath:      getenv("KAFKA_CLIENT_KEY_PATH", "./certs/client-key.pem"),
			InsecureSkipVerify: parseBool(getenv("KAFKA_INSECURE_SKIP_VERIFY", "false")),
		},
		MQTT: MQTTConfig{
			Enabled:            parseBool(getenv("MQTT_BRIDGE_ENABLED", "false")),
			BrokerURL:          getenv("MQTT_BROKER_URL", ""),
			Topic:              getenv("MQTT_TOPIC", "spectron/controllers/+/raw"),
			ClientID:           getenv("MQTT_CLIENT_ID", "spectron-mqtt-bridge"),
			Username:           getenv("MQTT_USERNAME", ""),
			Password:           os.Getenv("MQTT_PASSWORD"),
			QoS:                mqttQoS,
			CAFile:             getenv("MQTT_CA_FILE", ""),
			ClientCertFile:     getenv("MQTT_CLIENT_CERT_FILE", ""),
			ClientKeyFile:      getenv("MQTT_CLIENT_KEY_FILE", ""),
			InsecureSkipVerify: parseBool(getenv("MQTT_INSECURE_SKIP_VERIFY", "false")),
		},
		Email: EmailConfig{
			SMTPHost:    getenv("SMTP_HOST", ""),
			SMTPPort:    parseInt(getenv("SMTP_PORT", "587"), 587),
			SMTPUser:    getenv("SMTP_USER", ""),
			SMTPPass:    os.Getenv("SMTP_PASS"),
			EmailFrom:   getenv("EMAIL_FROM", getenv("SMTP_USER", "no-reply@spectron.local")),
			FrontendURL: strings.TrimRight(getenv("FRONTEND_URL", "http://localhost:3001"), "/"),
		},
	}, nil
}

func loadEnvFiles() {
	backendRoot, ok := findBackendRoot()
	if !ok {
		// Fall back to the current working directory for non-standard launches.
		_ = godotenv.Load()
		// Keep local secrets such as SMTP credentials outside tracked .env files.
		_ = godotenv.Overload(".env.local")
		return
	}

	_ = godotenv.Load(filepath.Join(backendRoot, ".env"))
	// Keep local secrets such as SMTP credentials outside tracked .env files.
	_ = godotenv.Overload(filepath.Join(backendRoot, ".env.local"))
}

func findBackendRoot() (string, bool) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", false
	}

	for dir := cwd; ; dir = filepath.Dir(dir) {
		if isBackendRoot(dir) {
			return dir, true
		}

		nestedBackend := filepath.Join(dir, "software", "backend")
		if isBackendRoot(nestedBackend) {
			return nestedBackend, true
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	return "", false
}

func isBackendRoot(dir string) bool {
	if dir == "" {
		return false
	}

	if _, err := os.Stat(filepath.Join(dir, "go.mod")); err != nil {
		return false
	}

	if _, err := os.Stat(filepath.Join(dir, "cmd", "api", "main.go")); err != nil {
		return false
	}

	return true
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func buildDBURL() string {
	host := getenv("DB_HOST", "localhost")
	port := getenv("DB_PORT", "5432")
	user := getenv("DB_USER", "spectron")
	pass := getenv("DB_PASSWORD", "spectron")
	name := getenv("DB_NAME", "spectron")
	sslMode := getenv("DB_SSLMODE", "disable")

	u := &url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, pass),
		Host:   host + ":" + port,
		Path:   "/" + name,
	}

	query := url.Values{}
	query.Set("sslmode", sslMode)
	u.RawQuery = query.Encode()

	return u.String()
}

func parseAllowedOrigins(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return append([]string(nil), defaultAllowedOrigins...)
	}

	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		origins = append(origins, origin)
	}

	if len(origins) == 0 {
		return append([]string(nil), defaultAllowedOrigins...)
	}

	return origins
}

func parseCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		values = append(values, value)
	}

	if len(values) == 0 {
		return nil
	}

	return values
}

func parseBool(raw string) bool {
	value, err := strconv.ParseBool(strings.TrimSpace(raw))
	return err == nil && value
}

func parseInt(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	return value
}

func parseQoS(raw string) (byte, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 1, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, err
	}
	if parsed < 0 || parsed > 2 {
		return 0, strconv.ErrRange
	}

	return byte(parsed), nil
}
