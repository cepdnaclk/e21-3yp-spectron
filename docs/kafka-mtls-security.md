# Kafka TLS And mTLS Security

This document explains the SPECTRON backend support for encrypted Kafka producer connections.

## What Kafka mTLS Is

TLS encrypts traffic between the backend and Kafka broker. Mutual TLS, or mTLS, also requires the backend to present a client certificate so Kafka can authenticate the backend service.

SPECTRON uses this for production IoT/event pipelines where raw readings and device events must not travel over unencrypted broker connections.

## What Is Implemented In Backend Code

The backend Kafka producer can now run in three modes:

- Plain Kafka for local development.
- TLS Kafka with CA certificate verification.
- mTLS Kafka with CA verification plus backend client certificate authentication.

The implementation uses the existing `github.com/segmentio/kafka-go` producer and adds a `kafka.Transport` with a Go `tls.Config` only when TLS is enabled.

## Required Environment Variables

```env
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=spectron-backend
KAFKA_TLS_ENABLED=false
KAFKA_MTLS_ENABLED=false
KAFKA_CA_CERT_PATH=./certs/ca.pem
KAFKA_CLIENT_CERT_PATH=./certs/client.pem
KAFKA_CLIENT_KEY_PATH=./certs/client-key.pem
KAFKA_INSECURE_SKIP_VERIFY=false
```

Existing Kafka variables still apply:

```env
KAFKA_RAW_READINGS_TOPIC=spectron.raw-readings
KAFKA_CONSUMER_GROUP=spectron-readings-consumer
```

## Local Development Without TLS

Default local development remains unchanged:

```env
KAFKA_BROKERS=localhost:9092
KAFKA_TLS_ENABLED=false
KAFKA_MTLS_ENABLED=false
```

When TLS is disabled, certificate paths are ignored.

## Enable TLS

Place the Kafka CA certificate locally, for example:

```text
certs/ca.pem
```

Then set:

```env
KAFKA_BROKERS=your-kafka-broker:9093
KAFKA_TLS_ENABLED=true
KAFKA_MTLS_ENABLED=false
KAFKA_CA_CERT_PATH=./certs/ca.pem
```

The backend verifies the Kafka broker certificate using the CA certificate. If the CA file is missing, startup fails with a clear error.

## Enable mTLS

Place all certificate files locally:

```text
certs/ca.pem
certs/client.pem
certs/client-key.pem
```

Then set:

```env
KAFKA_BROKERS=your-kafka-broker:9093
KAFKA_TLS_ENABLED=true
KAFKA_MTLS_ENABLED=true
KAFKA_CA_CERT_PATH=./certs/ca.pem
KAFKA_CLIENT_CERT_PATH=./certs/client.pem
KAFKA_CLIENT_KEY_PATH=./certs/client-key.pem
```

When mTLS is enabled, TLS must also be enabled. The backend loads the client certificate and key and attaches them to the Kafka TLS connection.

## AWS MSK Or Kafka Broker Setup

The backend code only configures the Kafka client. The broker side must still be configured separately:

- Enable TLS listeners on the Kafka broker or AWS MSK cluster.
- Configure broker trust store with the client CA for mTLS.
- Create client certificate and private key for the backend service.
- Configure Kafka ACLs so the backend can only write/read required topics.
- Use private networking and security groups to restrict broker access.

## Production Warnings

- Never commit real certificates or private keys.
- Keep `certs/`, `*.pem`, `*.key`, `*.crt`, `*.p12`, and `*.jks` ignored.
- Use a secret manager or deployment secret mount for production certs.
- Keep `KAFKA_INSECURE_SKIP_VERIFY=false` in production.
- Rotate client certificates on a defined schedule.
- Use Kafka ACLs in addition to mTLS.
