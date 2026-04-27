package iot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"

	kafkasecurity "spectron-backend/internal/kafka"
)

var ErrProducerDisabled = errors.New("raw readings producer is disabled")

type RawReadingsPublisher interface {
	PublishRawReadings(ctx context.Context, event RawReadingsEvent) error
	Close() error
}

type DisabledPublisher struct {
	reason string
}

func NewDisabledPublisher(reason string) *DisabledPublisher {
	return &DisabledPublisher{reason: strings.TrimSpace(reason)}
}

func (p *DisabledPublisher) PublishRawReadings(context.Context, RawReadingsEvent) error {
	if p.reason == "" {
		return ErrProducerDisabled
	}
	return fmt.Errorf("%w: %s", ErrProducerDisabled, p.reason)
}

func (p *DisabledPublisher) Close() error {
	return nil
}

type KafkaPublisher struct {
	writer    *kafka.Writer
	transport *kafka.Transport
}

func NewKafkaPublisher(brokers []string, topic string) RawReadingsPublisher {
	publisher, err := NewKafkaPublisherWithConfig(kafkasecurity.KafkaConfig{
		Brokers:          brokers,
		RawReadingsTopic: topic,
		ClientID:         "spectron-backend",
	})
	if err != nil {
		return NewDisabledPublisher(err.Error())
	}
	return publisher
}

func NewKafkaPublisherWithConfig(cfg kafkasecurity.KafkaConfig) (RawReadingsPublisher, error) {
	trimmedTopic := strings.TrimSpace(cfg.RawReadingsTopic)
	if len(cfg.Brokers) == 0 || trimmedTopic == "" {
		return NewDisabledPublisher("configure KAFKA_BROKERS and KAFKA_RAW_READINGS_TOPIC to enable device ingest"), nil
	}

	tlsConfig, err := kafkasecurity.BuildTLSConfig(cfg)
	if err != nil {
		return nil, err
	}

	dialer := &net.Dialer{
		Timeout:   3 * time.Second,
		DualStack: true,
	}
	transport := &kafka.Transport{
		Dial:     dialer.DialContext,
		ClientID: strings.TrimSpace(cfg.ClientID),
		TLS:      tlsConfig,
	}

	if cfg.TLSEnabled {
		log.Println("Kafka TLS enabled")
	}
	if cfg.MTLSEnabled {
		log.Println("Kafka mTLS enabled")
	}
	log.Println("Kafka producer configured")

	return &KafkaPublisher{
		writer: &kafka.Writer{
			Addr:         kafka.TCP(cfg.Brokers...),
			Topic:        trimmedTopic,
			Balancer:     &kafka.Hash{},
			RequiredAcks: kafka.RequireOne,
			Async:        false,
			BatchTimeout: 250 * time.Millisecond,
			Transport:    transport,
		},
		transport: transport,
	}, nil
}

func (p *KafkaPublisher) PublishRawReadings(ctx context.Context, event RawReadingsEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal raw readings event: %w", err)
	}

	err = p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(event.DeviceID),
		Time:  event.ReceivedAt,
		Value: payload,
		Headers: []kafka.Header{
			{Key: "event_id", Value: []byte(event.EventID)},
			{Key: "device_id", Value: []byte(event.DeviceID)},
		},
	})
	if err != nil {
		return fmt.Errorf("publish raw readings event: %w", err)
	}

	return nil
}

func (p *KafkaPublisher) Close() error {
	if p == nil || p.writer == nil {
		return nil
	}
	err := p.writer.Close()
	if p.transport != nil {
		p.transport.CloseIdleConnections()
	}
	return err
}
