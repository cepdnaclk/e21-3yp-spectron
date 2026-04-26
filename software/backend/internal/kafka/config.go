package kafka

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"strings"
)

type KafkaConfig struct {
	Brokers            []string
	RawReadingsTopic   string
	ConsumerGroup      string
	ClientID           string
	TLSEnabled         bool
	MTLSEnabled        bool
	CACertPath         string
	ClientCertPath     string
	ClientKeyPath      string
	InsecureSkipVerify bool
}

func ValidateKafkaSecurityConfig(cfg KafkaConfig) error {
	if cfg.MTLSEnabled && !cfg.TLSEnabled {
		return fmt.Errorf("Kafka mTLS cannot be enabled when Kafka TLS is disabled")
	}

	if !cfg.TLSEnabled {
		return nil
	}

	if strings.TrimSpace(cfg.CACertPath) == "" {
		return fmt.Errorf("Kafka TLS enabled but KAFKA_CA_CERT_PATH is required")
	}

	if cfg.MTLSEnabled {
		if strings.TrimSpace(cfg.ClientCertPath) == "" {
			return fmt.Errorf("Kafka mTLS enabled but KAFKA_CLIENT_CERT_PATH is required")
		}
		if strings.TrimSpace(cfg.ClientKeyPath) == "" {
			return fmt.Errorf("Kafka mTLS enabled but KAFKA_CLIENT_KEY_PATH is required")
		}
	}

	return nil
}

func BuildTLSConfig(cfg KafkaConfig) (*tls.Config, error) {
	if err := ValidateKafkaSecurityConfig(cfg); err != nil {
		return nil, err
	}
	if !cfg.TLSEnabled {
		return nil, nil
	}

	caPEM, err := os.ReadFile(cfg.CACertPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("Kafka TLS enabled but CA certificate file was not found: %s", cfg.CACertPath)
		}
		return nil, fmt.Errorf("read Kafka CA certificate file: %w", err)
	}

	rootCAs := x509.NewCertPool()
	if ok := rootCAs.AppendCertsFromPEM(caPEM); !ok {
		return nil, fmt.Errorf("Kafka CA certificate file does not contain a valid PEM certificate")
	}

	tlsConfig := &tls.Config{
		MinVersion:         tls.VersionTLS12,
		RootCAs:            rootCAs,
		InsecureSkipVerify: cfg.InsecureSkipVerify,
	}

	if cfg.MTLSEnabled {
		cert, err := tls.LoadX509KeyPair(cfg.ClientCertPath, cfg.ClientKeyPath)
		if err != nil {
			if os.IsNotExist(err) {
				return nil, fmt.Errorf("Kafka mTLS enabled but client certificate or key file was not found")
			}
			return nil, fmt.Errorf("load Kafka client certificate/key pair: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{cert}
	}

	return tlsConfig, nil
}
