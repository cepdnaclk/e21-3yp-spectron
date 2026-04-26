package config

import (
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const DefaultDevJWTSecret = "dev-only-change-me"

type Config struct {
	HTTPPort       string
	DatabaseURL    string
	JWTSecret      string
	AllowedOrigins []string
	Kafka          KafkaConfig
	MQTT           MQTTConfig
}

type KafkaConfig struct {
	Brokers          []string
	RawReadingsTopic string
	ConsumerGroup    string
}

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

func Load() (*Config, error) {
	// Load .env if present; ignore error if file is missing
	_ = godotenv.Load()

	httpPort := getenv("PORT", "")
	if httpPort == "" {
		httpPort = getenv("HTTP_PORT", "8080")
	}
	dbURL := os.Getenv("DATABASE_URL")
	jwtSecret := getenv("JWT_SECRET", DefaultDevJWTSecret)
	allowedOrigins := parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS"))
	kafkaBrokers := parseCSV(os.Getenv("KAFKA_BROKERS"))
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
			Brokers:          kafkaBrokers,
			RawReadingsTopic: kafkaTopic,
			ConsumerGroup:    kafkaConsumerGroup,
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
	}, nil
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
		return []string{
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:3002",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
			"http://127.0.0.1:3002",
		}
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
		return []string{
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:3002",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
			"http://127.0.0.1:3002",
		}
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
