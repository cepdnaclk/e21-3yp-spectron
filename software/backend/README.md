# Backend (Go API)

This folder contains the Go backend API and backend utility scripts.

## Folder Layout

- `cmd/` → Go entry points (`api`, utilities)
- `internal/` → core backend packages
- `scripts/` → operational/test PowerShell scripts
- root `*.ps1` files → compatibility wrappers that call `scripts/`

## Prerequisites

- Go 1.21+ installed and available in `PATH`
- PostgreSQL running (local or remote)
- Database already created (default project DB is `spectron`)

Check Go:

```powershell
go version
```

## Run the Backend

From this folder (`software/backend`):

```powershell
.\start-backend.ps1
```

This script:
- checks Go installation,
- sets default `DATABASE_URL` if missing,
- picks port `8080` (or `8081` if busy),
- runs `go run cmd\api\main.go`.

Health check:

```powershell
curl http://localhost:8080/healthz
```

If the script switched to 8081, use:

```powershell
curl http://localhost:8081/healthz
```

## Run Manually (without script)

```powershell
go mod download
go run cmd\api\main.go
```

To run the Kafka-backed readings consumer:

```powershell
go run cmd\readings-consumer\main.go
```

## Environment Variables

Most important variable:

```powershell
$env:DATABASE_URL="postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
```

Optional:

```powershell
$env:HTTP_PORT="8080"
$env:KAFKA_BROKERS="172.31.13.87:9092"
$env:KAFKA_RAW_READINGS_TOPIC="spectron.raw-readings"
$env:KAFKA_CONSUMER_GROUP="spectron-readings-consumer"
$env:MQTT_BRIDGE_ENABLED="false"
$env:MQTT_BROKER_URL="mqtts://mqtt.example.com:8883"
$env:MQTT_TOPIC="spectron/controllers/+/raw"
$env:MQTT_CLIENT_ID="spectron-mqtt-bridge"
```

Email verification requires SMTP settings. Put real SMTP credentials in `software/backend/.env.local` so they stay out of the tracked `.env` file:

```powershell
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="Spectron <your-email@gmail.com>"
FRONTEND_URL=http://localhost:3001
```

If `SMTP_HOST` is not set, the backend will reject signup/resend requests that need to send a verification email.

`POST /api/iot/upload` now accepts controller payloads in this shape and publishes them to Kafka:

```json
{
  "deviceId": "CTRL01",
  "ts": 1700000000,
  "sensors": [
    { "id": "T01", "type": "temp", "v": 31.4 },
    { "id": "M01", "type": "motion", "v": 1 }
  ]
}
```

The consumer reads `spectron.raw-readings`, upserts sensors for the controller, writes `sensor_readings`, and marks the controller/sensors as online.

## MQTT Bridge

To align the target architecture, the backend now includes an MQTT-to-Kafka bridge:

```powershell
go run cmd\mqtt-bridge\main.go
```

This service:
- subscribes to `MQTT_TOPIC`
- accepts the same JSON payload shape as `POST /api/iot/upload`
- republishes the event into Kafka topic `spectron.raw-readings`

Required environment variables:

```powershell
$env:MQTT_BRIDGE_ENABLED="true"
$env:KAFKA_BROKERS="172.31.13.87:9092"
$env:MQTT_BROKER_URL="mqtts://mqtt.example.com:8883"
$env:MQTT_TOPIC="spectron/controllers/+/raw"
```

`MQTT_BROKER_URL` accepts `mqtt://`, `mqtts://`, `tcp://`, `ssl://`, `ws://`, or `wss://`.

Optional MQTT auth and TLS / mTLS variables:

```powershell
$env:MQTT_CLIENT_ID="spectron-mqtt-bridge"
$env:MQTT_USERNAME=""
$env:MQTT_PASSWORD=""
$env:MQTT_QOS="1"
$env:MQTT_CA_FILE="C:\path\to\ca.pem"
$env:MQTT_CLIENT_CERT_FILE="C:\path\to\client.crt"
$env:MQTT_CLIENT_KEY_FILE="C:\path\to\client.key"
$env:MQTT_INSECURE_SKIP_VERIFY="false"
```

Recommended MQTT topic contract:

```text
spectron/controllers/<deviceId>/raw
```

Example:

```text
spectron/controllers/CTRL-MOCK-001/raw
```

Expected MQTT payload:

```json
{
  "deviceId": "CTRL-MOCK-001",
  "ts": 1700000000,
  "sensors": [
    { "id": "SEN-TH-001", "type": "temp", "v": 31.4 }
  ]
}
```

The bridge will also accept a payload without `deviceId` if the MQTT topic already contains it:

```json
{
  "ts": 1700000000,
  "sensors": [
    { "id": "SEN-TH-001", "type": "temp", "v": 31.4 }
  ]
}
```

If the topic contains `CTRL-MOCK-001` but the payload contains a different `deviceId`, the bridge rejects the message.

That means the target device-side path becomes:

```text
Controller / gateway -> MQTT broker -> mqtt-bridge -> Kafka -> readings-consumer -> PostgreSQL
```

For a full broker-side example, see [hardware/mqtt/README.md](../../hardware/mqtt/README.md).

## Typical Kafka Demo Run

In one terminal:

```powershell
$env:DATABASE_URL="postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
$env:KAFKA_BROKERS="172.31.13.87:9092"
go run cmd\readings-consumer\main.go
```

In another terminal:

```powershell
$env:DATABASE_URL="postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
$env:KAFKA_BROKERS="172.31.13.87:9092"
go run cmd\api\main.go
```

## Helpful Scripts in This Folder

- `scripts/create-test-user.ps1`
- `scripts/test-login.ps1`
- `scripts/test-registration.ps1`
- `scripts/test-get-users.ps1`
- `scripts/get-users-simple.ps1`

You can still run legacy root commands (for example `./test-login.ps1`) because wrappers are kept for compatibility.

Run example:

```powershell
.\test-login.ps1
```
