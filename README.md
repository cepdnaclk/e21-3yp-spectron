# SPECTRON - Standardized Modular IoT Adapter Kit

> One reusable device core for multiple sensing applications.

A 3rd Year Project by Group 19, Department of Computer Engineering, Faculty of Engineering, University of Peradeniya.

[Project Website](https://cepdnaclk.github.io/e21-3yp-spectron-dashboard/) | [GitHub Repository](https://github.com/cepdnaclk/e21-3yp-spectron-dashboard) | [Department of Computer Engineering](https://cepdnaclk.github.io/)

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Hardware](#hardware)
- [Software Stack](#software-stack)
- [Data Flow](#data-flow)
- [Dashboard Model](#dashboard-model)
- [Network and Security](#network-and-security)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Budget](#budget)
- [Team](#team)
- [Supervisors](#supervisors)
- [Acknowledgements](#acknowledgements)
- [Useful Links](#useful-links)

## Overview

SPECTRON is a standardized modular IoT adapter kit designed to make sensor-based monitoring faster to deploy, easier to reconfigure, and more maintainable over time.

Instead of building a separate device and dashboard for every monitoring problem, SPECTRON provides one reusable controller and gateway architecture. Sensor modules can be attached, discovered, configured, and presented through a central dashboard according to the user's actual monitoring purpose.

The core idea is:

```text
Physical sensor -> interpreted use case -> dashboard presentation
```

This lets the same hardware platform support different applications such as climate monitoring, bin or tank level monitoring, occupancy counting, load monitoring, and gas safety monitoring.

## The Problem

Traditional IoT deployments are often built as one-off systems:

| Area | Typical IoT Prototype | SPECTRON Approach |
| --- | --- | --- |
| Hardware | Custom wiring per use case | Standardized controller and sensor modules |
| Configuration | Hard-coded firmware or dashboard behavior | Guided sensor configuration from the web app |
| Dashboard | Fixed sensor-specific widgets | Use-case-driven presentation profiles |
| Connectivity | Direct device-to-app paths | ESP-NOW, MQTT, Kafka, API, and dashboard layers |
| Scaling | Difficult to add more devices cleanly | Controller pairing, account ownership, and event streaming |
| Maintenance | Manual changes across firmware and app | Separated hardware, backend, and presentation layers |

This creates a gap between low-cost sensor prototypes and reusable production-style IoT platforms. SPECTRON bridges that gap with a modular architecture that can be adapted to multiple monitoring domains.

## Key Features

- Modular sensor architecture: supports swappable sensor modules connected to ESP32-based hardware.
- Edge gateway design: local ESP32 nodes can communicate through ESP-NOW before uplinking through a gateway.
- MQTT and Kafka telemetry pipeline: raw readings can flow through MQTT into Kafka-backed backend processing.
- Go backend API: authentication, controller pairing, sensor management, alert handling, and dashboard APIs.
- PostgreSQL and TimescaleDB support: stores users, controllers, sensors, configurations, alerts, and time-series readings.
- React dashboard: web interface for controller management, sensor configuration, monitoring, alerts, admin operations, and team/project pages.
- Guided sensor configuration: separates hardware discovery, observable metric selection, visualization, alerts, and review.
- Role-aware access: supports owner, admin, viewer, and system-admin paths in the backend.
- Security-focused backend: supports JWT auth, bcrypt password hashing, secret encryption helpers, Kafka TLS/mTLS, and encrypted database backup scripts.
- GitHub Pages project site: deploys the public project website from `Project_page/`.

## System Architecture

SPECTRON follows a layered IoT architecture from edge sensing to web delivery.

```text
+---------------------------------------------------------------+
| TIER 1 - EDGE SENSOR LAYER                                    |
|                                                               |
|  Sensor Module + ESP32-C3       Sensor Module + ESP32-C3      |
|        |                                   |                  |
|        +----------- ESP-NOW ---------------+                  |
+------------------------------|--------------------------------+
                               |
                               v
+---------------------------------------------------------------+
| TIER 2 - EDGE GATEWAY / UPLINK                                |
|                                                               |
|  ESP32 Gateway -> SIM / Network Module -> MQTT Broker          |
+------------------------------|--------------------------------+
                               |
                               v
+---------------------------------------------------------------+
| TIER 3 - EVENT BACKBONE AND SERVICES                          |
|                                                               |
|  MQTT Bridge -> Apache Kafka -> Go Consumers / Services        |
|                                |                              |
|                                v                              |
|                         PostgreSQL / TimescaleDB              |
+------------------------------|--------------------------------+
                               |
                               v
+---------------------------------------------------------------+
| TIER 4 - APPLICATION LAYER                                    |
|                                                               |
|  Go API Gateway -> React Web Dashboard -> Users / Admins       |
|  Project Website -> GitHub Pages                              |
+---------------------------------------------------------------+
```

The same architecture is documented visually in the project website under the architecture section.

## Hardware

The hardware workspace contains ESP-IDF projects for the controller, sensor module loader, sensor module packager, and an SHT30 payload application.

Main hardware responsibilities:

- Sensor and ESP32-C3 nodes collect local measurements.
- ESP-NOW keeps short-range device communication lightweight.
- ESP32 gateway aggregates data and prepares telemetry for uplink.
- SIM or network module enables remote deployments where Wi-Fi is unavailable.
- Sensor modules can represent temperature, humidity, distance, load, gas, or other supported physical measurements.

Hardware folders:

```text
hardware/
|-- Spectron_Controller/
|-- Spectron_Sensor_Module_Loader/
|-- Spectron_Sensor_Module_Packager/
`-- Spectron_Sht30_PayloadApp/
```

## Software Stack

| Layer | Technology |
| --- | --- |
| Firmware | ESP32 / ESP32-C3, ESP-IDF, ESP-NOW |
| Telemetry | MQTT, MQTT over TLS, optional mTLS |
| Event Streaming | Apache Kafka |
| Backend API | Go 1.22, chi router, pgx, JWT |
| Database | PostgreSQL, optional TimescaleDB, pgcrypto |
| Frontend Dashboard | React 18, TypeScript, Material UI, Recharts |
| Mobile Packaging | Capacitor support in the web app |
| Project Website | Vite, React, GitHub Pages |
| Security Utilities | bcrypt, AES-256-GCM helpers, encrypted backup scripts |

## Data Flow

### 1. Sense

A physical sensor connected to an ESP32-based node captures raw measurements such as temperature, humidity, distance, weight, or gas level.

### 2. Transmit at the Edge

Nearby ESP32 nodes can use ESP-NOW to send readings to a gateway without requiring a local Wi-Fi router for every node.

### 3. Uplink

The ESP32 gateway sends telemetry through a network or SIM module toward the MQTT broker.

Recommended MQTT topic format:

```text
spectron/controllers/<deviceId>/raw
```

Example payload:

```json
{
  "deviceId": "CTRL-MOCK-001",
  "ts": 1700000000,
  "sensors": [
    { "id": "SEN-TH-001", "type": "temp", "v": 31.4 }
  ]
}
```

### 4. Stream

The backend MQTT bridge subscribes to the MQTT topic and republishes valid raw readings to Kafka:

```text
MQTT broker -> mqtt-bridge -> Kafka topic: spectron.raw-readings
```

### 5. Process and Store

The readings consumer consumes Kafka events, upserts controller and sensor state, writes `sensor_readings`, and updates online status.

### 6. Present

The Go API serves the React dashboard with controller, sensor, reading, alert, account, and admin data.

## Dashboard Model

SPECTRON does not treat a physical sensor as a fixed dashboard template. The dashboard model has three layers:

| Layer | Purpose | Example |
| --- | --- | --- |
| Physical Sensor Layer | What hardware is installed | Ultrasonic sensor |
| Interpretation Layer | What the reading means | Fill level monitoring |
| Presentation Profile Layer | How the result is shown | Level gauge plus trend |

This makes the same hardware useful in different contexts.

Example:

```text
Ultrasonic distance sensor -> fill level percent -> level monitoring dashboard
Ultrasonic distance sensor -> occupancy count -> counter/status dashboard
Load sensor -> weight utilization -> gauge/status dashboard
Gas sensor -> gas risk level -> safety gauge dashboard
```

The standard configuration flow is:

1. About Sensor
2. Observable Metric
3. Visualization
4. Alerts
5. Review

## Network and Security

| Layer | Mechanism |
| --- | --- |
| Edge device communication | ESP-NOW for lightweight local wireless communication |
| Device-to-broker messaging | MQTT, with TLS or mTLS support for production |
| Event backbone | Kafka, with optional TLS and client certificate authentication |
| API access | JWT-based authentication and role-aware middleware |
| Password storage | bcrypt password hashing |
| Secret storage | AES-256-GCM helper functions for recoverable secrets |
| Database backup | Encrypted PostgreSQL backup scripts using OpenSSL AES-256 |
| Web deployment | GitHub Actions deploys static project site to GitHub Pages |

Production notes:

- Never commit `.env`, certificates, private keys, or raw backup files.
- Keep `KAFKA_INSECURE_SKIP_VERIFY=false` in production.
- Use Kafka ACLs and private networking for broker deployments.
- Use strong values for `APP_ENCRYPTION_KEY` and `BACKUP_ENCRYPTION_KEY`.

## Repository Structure

```text
e21-3yp-spectron-dashboard/
|-- .github/workflows/              # GitHub Actions workflows
|   `-- deploy-project-page.yml     # GitHub Pages deployment for Project_page
|-- Project_page/                   # Public project website, Vite + React
|   |-- src/
|   |-- public/
|   `-- package.json
|-- software/
|   |-- backend/                    # Go API, MQTT bridge, Kafka consumer
|   |   |-- cmd/
|   |   |-- internal/
|   |   `-- go.mod
|   |-- frontend/
|   |   `-- web/                    # React dashboard
|   |-- database/                   # PostgreSQL/TimescaleDB migrations
|   `-- docs/                       # Dashboard and sensor model docs
|-- hardware/                       # ESP-IDF firmware projects
|-- docs/                           # Security and operational documentation
|-- scripts/                        # Backup and restore scripts
|-- pipeline-demo-site/             # Demo pipeline site and server
`-- README.md
```

## Getting Started

### Prerequisites

| Tool | Version / Notes | Purpose |
| --- | --- | --- |
| Go | 1.22 recommended | Backend API and consumers |
| Node.js | 18+ recommended | React apps and Vite project page |
| PostgreSQL | 14+ recommended | Main database |
| TimescaleDB | Optional but recommended | Time-series readings |
| Kafka | Local or remote broker | Raw readings event stream |
| MQTT broker | Local or remote broker | Device telemetry ingestion |
| ESP-IDF | Current stable version | Firmware builds |

### 1. Clone the Repository

```powershell
git clone https://github.com/cepdnaclk/e21-3yp-spectron-dashboard.git
cd e21-3yp-spectron-dashboard
```

### 2. Configure the Database

Create a PostgreSQL user and database:

```sql
CREATE USER spectron WITH PASSWORD 'spectron';
CREATE DATABASE spectron OWNER spectron;
\c spectron
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

Run the initial migration:

```powershell
cd software\database
psql -U spectron -d spectron -f .\migrations\001_init.sql
```

### 3. Run the Backend

```powershell
cd software\backend
$env:DATABASE_URL="postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
.\start-backend.ps1
```

Health check:

```powershell
curl http://localhost:8080/healthz
```

If port `8080` is busy, the helper script may use `8081`.

### 4. Run the Web Dashboard

```powershell
cd software\frontend\web
npm install
npm start
```

Create `software/frontend/web/.env` if needed:

```env
REACT_APP_API_URL=http://localhost:8080
REACT_APP_DEMO_MODE=false
```

For presentation/demo data:

```env
REACT_APP_DEMO_MODE=true
```

### 5. Run the MQTT Bridge

```powershell
cd software\backend
$env:MQTT_BRIDGE_ENABLED="true"
$env:KAFKA_BROKERS="localhost:9092"
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:MQTT_TOPIC="spectron/controllers/+/raw"
go run cmd\mqtt-bridge\main.go
```

### 6. Run the Kafka Readings Consumer

```powershell
cd software\backend
$env:DATABASE_URL="postgres://spectron:spectron@localhost:5432/spectron?sslmode=disable"
$env:KAFKA_BROKERS="localhost:9092"
go run cmd\readings-consumer\main.go
```

### 7. Run the Project Website Locally

```powershell
cd Project_page
npm install
npm run dev
```

Build the static site:

```powershell
npm run build
```

The GitHub Pages workflow uploads `Project_page/dist`.

## Testing

| Area | Command / Method | Notes |
| --- | --- | --- |
| Backend tests | `go test ./...` from `software/backend` | Unit and integration-style Go tests |
| Frontend tests | `npm test` from `software/frontend/web` | Vitest-based React tests |
| Frontend coverage | `npm run test:coverage` | Generates coverage report |
| Project page build | `npm run build` from `Project_page` | Verifies GitHub Pages artifact |
| Database check | `.\check-db.ps1` from `software/database` | Verifies database connectivity and schema basics |
| Backend health | `curl http://localhost:8080/healthz` | Confirms API startup |

## Budget

Estimated prototype budget:

```text
Rs20,481.00
```

The budget includes hardware modules, power components, 3D printing, hosting, and miscellaneous prototype costs. The visual budget sheet is included in the project website assets at:

```text
Project_page/public/team/budget.png
```

## Team

| Name | Registration | Portfolio | Email |
| --- | --- | --- | --- |
| Jarshigan K. | E/21/188 | [CN ePortfolio](https://www.thecn.com/EJ476) | e21188@eng.pdn.ac.lk |
| Thirumenan S. | E/21/412 | [CN ePortfolio](https://www.thecn.com/ET643) | e21412@eng.pdn.ac.lk |
| Tithurshan T. | E/21/413 | [CN ePortfolio](https://www.thecn.com/ET641) | e21413@eng.pdn.ac.lk |
| Varshan A. | E/21/417 | [CN ePortfolio](https://www.thecn.com/AV864) | e21417@eng.pdn.ac.lk |

## Supervisors

Supervisor details are not currently stored in this repository. Add them here when finalized.

| Name | Title |
| --- | --- |
| To be updated | To be updated |

## Acknowledgements

- Department of Computer Engineering, Faculty of Engineering, University of Peradeniya
- Open-source communities behind ESP-IDF, Go, React, Material UI, PostgreSQL, TimescaleDB, MQTT, Kafka, and Vite
- Project template and infrastructure support from the E21 3YP ecosystem

## Useful Links

- [Project Website](https://cepdnaclk.github.io/e21-3yp-spectron-dashboard/)
- [GitHub Repository](https://github.com/cepdnaclk/e21-3yp-spectron-dashboard)
- [Software Workspace](./software/README.md)
- [Backend README](./software/backend/README.md)
- [Web Dashboard README](./software/frontend/web/README.md)
- [Database README](./software/database/README.md)
- [Three-Layer Dashboard Model](./software/docs/THREE_LAYER_DASHBOARD_MODEL.md)
- [Kafka TLS and mTLS Security](./docs/kafka-mtls-security.md)
- [Backup and Encryption Security](./docs/security-backup-encryption.md)

## About

SPECTRON is a modular IoT adapter and monitoring platform that combines ESP32-based edge hardware, MQTT/Kafka telemetry ingestion, a Go backend, PostgreSQL/TimescaleDB storage, and React dashboards for reusable sensor-driven monitoring systems.

Copyright 2026 SPECTRON, Department of Computer Engineering, University of Peradeniya.
