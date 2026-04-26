package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"spectron-backend/internal/config"
	"spectron-backend/internal/iot"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if !cfg.MQTT.Enabled {
		log.Println("MQTT bridge is disabled. Set MQTT_BRIDGE_ENABLED=true to activate MQTT ingestion.")
		<-ctx.Done()
		log.Println("shutting down MQTT bridge")
		return
	}

	if strings.TrimSpace(cfg.MQTT.BrokerURL) == "" {
		log.Fatal("MQTT_BROKER_URL is required to run the MQTT bridge")
	}
	if strings.TrimSpace(cfg.MQTT.Topic) == "" {
		log.Fatal("MQTT_TOPIC is required to run the MQTT bridge")
	}
	if len(cfg.Kafka.Brokers) == 0 {
		log.Fatal("KAFKA_BROKERS is required to run the MQTT bridge")
	}

	brokerURL := normalizeBrokerURL(cfg.MQTT.BrokerURL)

	publisher, err := iot.NewKafkaPublisherWithConfig(cfg.Kafka)
	if err != nil {
		log.Fatalf("configure Kafka producer: %v", err)
	}
	defer publisher.Close()

	tlsConfig, err := buildTLSConfig(cfg.MQTT, brokerURL)
	if err != nil {
		log.Fatalf("build MQTT TLS config: %v", err)
	}

	opts := mqtt.NewClientOptions().
		AddBroker(brokerURL).
		SetClientID(strings.TrimSpace(cfg.MQTT.ClientID)).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetOrderMatters(false)

	if cfg.MQTT.Username != "" {
		opts.SetUsername(cfg.MQTT.Username)
	}
	if cfg.MQTT.Password != "" {
		opts.SetPassword(cfg.MQTT.Password)
	}
	if tlsConfig != nil {
		opts.SetTLSConfig(tlsConfig)
	}

	handler := func(_ mqtt.Client, msg mqtt.Message) {
		var req iot.UploadRequest
		if err := json.Unmarshal(msg.Payload(), &req); err != nil {
			log.Printf("discarding MQTT message on topic %q: invalid JSON: %v", msg.Topic(), err)
			return
		}

		if topicDeviceID := extractDeviceIDFromTopic(cfg.MQTT.Topic, msg.Topic()); topicDeviceID != "" {
			if strings.TrimSpace(req.DeviceID) == "" {
				req.DeviceID = topicDeviceID
			} else if !strings.EqualFold(strings.TrimSpace(req.DeviceID), topicDeviceID) {
				log.Printf("discarding MQTT message on topic %q: payload deviceId %q does not match topic deviceId %q", msg.Topic(), req.DeviceID, topicDeviceID)
				return
			}
		}
		if err := iot.ValidateUploadRequest(req); err != nil {
			log.Printf("discarding MQTT message on topic %q: %v", msg.Topic(), err)
			return
		}

		event := iot.BuildRawReadingsEventWithSource(req, time.Now().UTC(), "mqtt-bridge")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := publisher.PublishRawReadings(ctx, event); err != nil {
			log.Printf("publish MQTT event %s for device %s: %v", event.EventID, event.DeviceID, err)
			return
		}

		log.Printf("bridged MQTT message from topic %q as event %s for device %s with %d readings", msg.Topic(), event.EventID, event.DeviceID, len(event.Sensors))
	}

	opts.OnConnect = func(client mqtt.Client) {
		token := client.Subscribe(cfg.MQTT.Topic, cfg.MQTT.QoS, handler)
		token.Wait()
		if err := token.Error(); err != nil {
			log.Printf("subscribe to MQTT topic %q: %v", cfg.MQTT.Topic, err)
			return
		}

		log.Printf(
			"MQTT bridge connected to %q and subscribed to %q with QoS %d; forwarding to Kafka topic %q via brokers %v",
			brokerURL,
			cfg.MQTT.Topic,
			cfg.MQTT.QoS,
			cfg.Kafka.RawReadingsTopic,
			cfg.Kafka.Brokers,
		)
	}

	opts.OnConnectionLost = func(_ mqtt.Client, err error) {
		log.Printf("MQTT connection lost: %v", err)
	}

	client := mqtt.NewClient(opts)
	for {
		token := client.Connect()
		token.Wait()
		if err := token.Error(); err == nil {
			break
		} else {
			log.Printf("connect to MQTT broker %q failed: %v", brokerURL, err)
		}

		select {
		case <-ctx.Done():
			log.Println("shutting down MQTT bridge")
			return
		case <-time.After(5 * time.Second):
		}
	}

	<-ctx.Done()
	log.Println("shutting down MQTT bridge")
	client.Disconnect(250)
}

func buildTLSConfig(cfg config.MQTTConfig, brokerURL string) (*tls.Config, error) {
	u, err := url.Parse(brokerURL)
	if err != nil {
		return nil, fmt.Errorf("parse broker URL: %w", err)
	}

	needsTLS := cfg.CAFile != "" || cfg.ClientCertFile != "" || cfg.ClientKeyFile != "" || cfg.InsecureSkipVerify
	switch strings.ToLower(u.Scheme) {
	case "ssl", "tls", "mqtts", "wss":
		needsTLS = true
	}

	if !needsTLS {
		return nil, nil
	}

	tlsConfig := &tls.Config{
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: cfg.InsecureSkipVerify,
	}

	if host := u.Hostname(); host != "" {
		tlsConfig.ServerName = host
	}

	if cfg.CAFile != "" {
		caPEM, err := os.ReadFile(cfg.CAFile)
		if err != nil {
			return nil, fmt.Errorf("read MQTT_CA_FILE: %w", err)
		}

		pool, err := x509.SystemCertPool()
		if err != nil {
			pool = x509.NewCertPool()
		}
		if pool == nil {
			pool = x509.NewCertPool()
		}
		if ok := pool.AppendCertsFromPEM(caPEM); !ok {
			return nil, fmt.Errorf("append MQTT_CA_FILE certs")
		}
		tlsConfig.RootCAs = pool
	}

	if cfg.ClientCertFile != "" || cfg.ClientKeyFile != "" {
		if cfg.ClientCertFile == "" || cfg.ClientKeyFile == "" {
			return nil, fmt.Errorf("both MQTT_CLIENT_CERT_FILE and MQTT_CLIENT_KEY_FILE are required for mTLS")
		}

		cert, err := tls.LoadX509KeyPair(cfg.ClientCertFile, cfg.ClientKeyFile)
		if err != nil {
			return nil, fmt.Errorf("load MQTT client certificate: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{cert}
	}

	return tlsConfig, nil
}

func normalizeBrokerURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return strings.TrimSpace(raw)
	}

	switch strings.ToLower(u.Scheme) {
	case "mqtt":
		u.Scheme = "tcp"
	case "mqtts":
		u.Scheme = "ssl"
	}

	return u.String()
}

func extractDeviceIDFromTopic(pattern, actual string) string {
	pattern = strings.Trim(strings.TrimSpace(pattern), "/")
	actual = strings.Trim(strings.TrimSpace(actual), "/")
	if pattern == "" || actual == "" {
		return ""
	}

	patternParts := strings.Split(pattern, "/")
	actualParts := strings.Split(actual, "/")
	if len(patternParts) != len(actualParts) {
		return ""
	}

	for i, part := range patternParts {
		switch part {
		case "+":
			return actualParts[i]
		case "#":
			return path.Clean(strings.Join(actualParts[i:], "/"))
		default:
			if part != actualParts[i] {
				return ""
			}
		}
	}

	return ""
}
