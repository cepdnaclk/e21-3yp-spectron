# Spectron API Documentation

**Service:** `spectron-backend`
**API style:** HTTP/JSON REST-style API
**Document version:** 1.0
**System baseline:** Registered Go routes as of June 11, 2026
**Default local URL:** `http://localhost:8080`

## Document Scope

This document describes the HTTP routes currently registered in
`software/backend/internal/httpapi/routes.go`. It covers authentication,
accounts, controller ownership, hardware sensors, sensor configuration,
readings, alerts, administration, and controller ingestion.

The document uses the concepts expected in a standard API reference:
overview, environments, authentication, authorization, conventions, error
handling, endpoint contracts, schemas, examples, security considerations, and
revision history. Its structure is informed by the OpenAPI Specification, but
this Markdown file is not itself a machine-readable OpenAPI Description.

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Environments and Configuration](#2-environments-and-configuration)
3. [Authentication and Authorization](#3-authentication-and-authorization)
4. [Request and Response Conventions](#4-request-and-response-conventions)
5. [Quick Start](#5-quick-start)
6. [Endpoint Summary](#6-endpoint-summary)
7. [Service Endpoints](#7-service-endpoints)
8. [Authentication and Account Endpoints](#8-authentication-and-account-endpoints)
9. [Primary Hardware and System Endpoints](#9-primary-hardware-and-system-endpoints)
10. [Compatibility Controller and Sensor Endpoints](#10-compatibility-controller-and-sensor-endpoints)
11. [Dashboard, Readings, and Alert Endpoints](#11-dashboard-readings-and-alert-endpoints)
12. [System Administrator Endpoints](#12-system-administrator-endpoints)
13. [Controller Ingestion Endpoints](#13-controller-ingestion-endpoints)
14. [Data Models](#14-data-models)
15. [Error Handling](#15-error-handling)
16. [Security and Operational Notes](#16-security-and-operational-notes)
17. [Known API Limitations](#17-known-api-limitations)
18. [References and Revision History](#18-references-and-revision-history)

## 1. API Overview

Spectron exposes four related HTTP surfaces:

| Surface | Prefix | Purpose |
| --- | --- | --- |
| Authentication/account | `/auth`, `/users` | User sessions, profiles, passwords, and workspace members |
| Primary hardware API | `/api/controllers`, `/api/systems` | Controller claiming, hardware sensors, and current configuration |
| Compatibility API | `/controllers`, `/sensors`, `/dashboard`, `/alerts` | UUID-based controller, sensor, dashboard, reading, and alert operations |
| Device ingestion | `/api/iot` | Controller discovery, configuration pull, and reading upload |
| System administration | `/api/admin` | Hardware registry, users, owners, and system health |

For new dashboard integrations, prefer the primary hardware routes under
`/api/controllers` for pairing and hardware management. The compatibility
routes remain registered because the backend and frontend still support
legacy UUID-based resources.

### 1.1 High-Level Data Flow

```text
Controller -> POST /api/iot/discover
Controller -> POST /api/iot/config
Controller -> POST /api/iot/upload
                     |
                     v
          PostgreSQL + optional Kafka
                     |
                     v
User dashboard -> authenticated API routes
```

## 2. Environments and Configuration

### 2.1 Base URLs

| Environment | Typical URL |
| --- | --- |
| Local backend default | `http://localhost:8080` |
| Local helper fallback | `http://localhost:8081` |
| Frontend default API URL | `http://localhost:8081` |
| Production | Deployment-specific HTTPS URL |

The frontend uses `REACT_APP_API_URL`. The backend listens on `PORT`, then
`HTTP_PORT`, and defaults to `8080`.

### 2.2 Relevant Backend Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL |
| `JWT_SECRET` | HS256 JWT signing secret |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `PORT` / `HTTP_PORT` | HTTP listening port |
| `KAFKA_BROKERS` | Kafka broker list |
| `KAFKA_RAW_READINGS_TOPIC` | Raw reading topic; default `spectron.raw-readings` |
| `MQTT_BRIDGE_ENABLED` | Enables the separate MQTT bridge process |
| `MQTT_BROKER_URL` | MQTT broker URL |
| `MQTT_TOPIC` | MQTT subscription; default `spectron/controllers/+/raw` |

The development JWT fallback is `dev-only-change-me`. It must be replaced in
any shared or production deployment.

### 2.3 CORS

The API allows `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, and `OPTIONS`.
Allowed request headers are:

- `Accept`
- `Authorization`
- `Content-Type`

Credentials are allowed. Default local origins cover ports `3000`, `3001`,
and `3002` on `localhost` and `127.0.0.1`.

## 3. Authentication and Authorization

### 3.1 Bearer Token

Protected endpoints require:

```http
Authorization: Bearer <jwt>
```

JWT characteristics:

- Algorithm: HS256.
- Lifetime: 24 hours.
- Claims: `user_id`, `account_id`, `email`, issued time, not-before time, and
  expiry.
- Refresh endpoint: none.

### 3.2 Account Types and Roles

`account_type` identifies the login surface:

- `USER`: normal owner, account admin, or viewer.
- `ADMIN`: Spectron system administrator.

Workspace membership `role` controls normal write operations:

- `OWNER`
- `ADMIN`
- `VIEWER`

### 3.3 Access Labels Used in This Document

| Label | Requirement |
| --- | --- |
| Public | No bearer token |
| Authenticated | Any valid token |
| Owner/Admin | Workspace role `OWNER` or `ADMIN` |
| Owner | Workspace role `OWNER` |
| System Admin | Active user with `account_type=ADMIN`; admin handlers also verify suitable account membership |

### 3.4 Authentication Failures

| Condition | Status | Body |
| --- | --- | --- |
| Header missing | `401` | `missing authorization header` |
| Header is not `Bearer <token>` | `401` | `invalid authorization header` |
| Token invalid or expired | `401` | `invalid token` |
| Workspace role not allowed | `403` | `insufficient permissions` |
| System-admin account required | `403` | `admin account required` |

## 4. Request and Response Conventions

### 4.1 Media Type

Send JSON bodies with:

```http
Content-Type: application/json
Accept: application/json
```

Successful resource responses are JSON. Current error handling generally uses
Go `http.Error`, so error bodies are plain text rather than a standard JSON
error object.

### 4.2 Identifiers

| Identifier | Format | Example |
| --- | --- | --- |
| Database resource ID | UUID | `45c2e738-8133-4f51-9204-fc8b4075aa57` |
| Controller hardware ID | String beginning `CTRL-` | `CTRL-8F2A19` |
| Sensor hardware ID | Controller-defined string | `SEN-TH-001` |
| Hardware/system sensor ID | UUID | `1df18f32-22ae-4aba-8468-81bdf9e2fe69` |

Primary hardware route parameters accept a controller hardware ID or its UUID.
Hardware sensor parameters accept a system-sensor UUID or the current sensor
hardware UID.

Compatibility routes under `/controllers/{id}` and `/sensors/{id}` require
UUIDs.

### 4.3 Time Values

- API timestamps are generally RFC 3339 strings.
- Reading upload `ts` accepts Unix seconds, milliseconds, microseconds, or
  nanoseconds. A missing or non-positive value uses server receipt time.
- Reading filters `from` and `to` accept RFC 3339.

### 4.4 Collection Behavior

- Most collections are returned as arrays or as a named array property.
- Pagination is not currently implemented.
- Raw readings are limited to 1,000 rows per request.
- Raw readings are returned newest first.
- Aggregated readings are returned by ascending time bucket.

### 4.5 HTTP Status Behavior

The current handlers normally return `200 OK` for successful create, update,
delete, pairing, and acknowledgement operations. They do not consistently use
`201 Created` or `204 No Content`.

## 5. Quick Start

### 5.1 Register

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "secret12",
    "name": "Example Owner",
    "organizationName": "Example Lab"
  }'
```

Response:

```json
{
  "status": "ACTIVE",
  "message": "Account created. You can sign in now."
}
```

### 5.2 Login

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@example.com",
    "password": "secret12"
  }'
```

Response excerpt:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "45c2e738-8133-4f51-9204-fc8b4075aa57",
    "email": "owner@example.com",
    "name": "Example Owner",
    "account_type": "USER",
    "status": "ACTIVE",
    "is_email_verified": true
  }
}
```

### 5.3 Call a Protected Endpoint

```bash
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer <jwt>" \
  -H "Accept: application/json"
```

### 5.4 Claim a Controller

```bash
curl -X POST http://localhost:8080/api/controllers/pair \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "pairingTokenOrControllerId": "CTRL-8F2A19"
  }'
```

## 6. Endpoint Summary

### 6.1 Public and Authentication

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Public | Service metadata |
| `GET` | `/healthz` | Public | API health |
| `GET` | `/favicon.ico` | Public | Empty favicon response |
| `POST` | `/auth/register` | Public | Create active owner workspace |
| `POST` | `/auth/login` | Public | Normal user login |
| `POST` | `/auth/admin/login` | Public | System-admin login |
| `POST` | `/auth/verify-email` | Public | Return verification-disabled status |
| `POST` | `/auth/resend-verification` | Public | Return verification-disabled message |
| `GET` | `/auth/me` | Authenticated | Current user and workspace access |
| `PATCH` | `/auth/me` | Authenticated | Update profile |
| `DELETE` | `/auth/me` | Owner | Permanently delete workspace account |
| `POST` | `/auth/change-password` | Authenticated | Change password |
| `GET` | `/users` | Owner | List workspace users |
| `POST` | `/users/viewers` | Owner | Create viewer |

### 6.2 Primary Hardware and Systems

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/controllers/pair` | Owner/Admin | Claim an unowned controller |
| `GET` | `/api/controllers/my` | Authenticated | List claimed controllers and sensors |
| `PATCH`, `PUT` | `/api/controllers/{controllerId}` | Owner/Admin | Rename controller and active system |
| `GET` | `/api/controllers/{controllerId}/sensors` | Authenticated | List hardware/system sensors |
| `DELETE` | `/api/controllers/{controllerId}/claim` | Owner/Admin | Release controller ownership |
| `PATCH`, `PUT` | `/api/controllers/{controllerId}/sensors/{sensorId}` | Owner/Admin | Rename sensor |
| `POST` | `/api/controllers/{controllerId}/sensors/{sensorId}/config` | Owner/Admin | Activate sensor configuration |
| `GET` | `/api/controllers/{controllerId}/sensors/{sensorId}/config` | Authenticated | Get active/default sensor configuration |
| `GET` | `/api/systems/my` | Authenticated | List logical monitoring systems |

### 6.3 Compatibility, Dashboard, and Alerts

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/controllers` | Authenticated | List account controllers |
| `POST` | `/controllers/pair` | Owner/Admin | Compatibility pairing by `qr_token` |
| `GET` | `/controllers/{id}` | Authenticated | Get controller by UUID |
| `PATCH` | `/controllers/{id}` | Owner/Admin | Update controller metadata |
| `GET` | `/controllers/{controllerId}/sensors` | Authenticated | List sensors by controller UUID |
| `GET` | `/sensors/{id}` | Authenticated | Get sensor by UUID |
| `PATCH`, `PUT` | `/sensors/{id}` | Owner/Admin | Rename sensor |
| `POST` | `/sensors/{id}/config` | Owner/Admin | Save layered sensor configuration |
| `GET` | `/dashboard/overview` | Authenticated | Controller, sensor, and active-alert counts |
| `GET` | `/controllers/{id}/dashboard` | Authenticated | Controller dashboard counts |
| `GET` | `/sensors/{id}/readings` | Authenticated | Raw or bucketed readings |
| `GET` | `/alerts` | Authenticated | List alerts with filters |
| `POST` | `/alerts/{id}/ack` | Owner/Admin | Acknowledge alert |

### 6.4 System Administration

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/overview` | System Admin | Device/sensor totals |
| `GET` | `/api/admin/devices` | System Admin | List registered controllers |
| `POST` | `/api/admin/devices` | System Admin | Register a controller |
| `GET` | `/api/admin/users` | System Admin | List users in admin account context |
| `GET` | `/api/admin/owners` | System Admin | List owner workspaces |
| `POST` | `/api/admin/owners` | System Admin | Create active owner workspace |
| `PATCH` | `/api/admin/owners/{userId}/approve` | System Admin | Activate owner |
| `PATCH` | `/api/admin/owners/{userId}/reject` | System Admin | Reject owner |
| `GET` | `/api/admin/system` | System Admin | API/database health |

### 6.5 Controller Ingestion

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/iot/discover` | Public | Register the controller's current sensors |
| `POST` | `/api/iot/config` | Public | Pull effective firmware configuration |
| `POST` | `/api/iot/upload` | Public | Persist and optionally publish readings |

## 7. Service Endpoints

### 7.1 `GET /`

Returns service metadata.

```json
{
  "service": "spectron-backend",
  "status": "ok",
  "health": "./healthz"
}
```

### 7.2 `GET /healthz`

Returns:

```json
{
  "status": "ok"
}
```

This endpoint confirms the HTTP service is running. It does not ping the
database. Use the admin system-health endpoint for a database check.

### 7.3 `GET /favicon.ico`

Returns `204 No Content`.

## 8. Authentication and Account Endpoints

### 8.1 `POST /auth/register`

**Access:** Public

Request:

```json
{
  "email": "owner@example.com",
  "password": "secret12",
  "phone": "+94 77 123 4567",
  "name": "Example Owner",
  "organizationName": "Example Lab"
}
```

Rules:

- `email` is required and normalized to lowercase.
- `password` must contain at least 6 characters.
- `phone`, `name`, and `organizationName` are optional.
- The user is created as `USER`, `ACTIVE`, and email-verified.
- A workspace account and `OWNER` membership are created.

Success `200`:

```json
{
  "status": "ACTIVE",
  "message": "Account created. You can sign in now."
}
```

Common errors: `400` invalid input, `409` email already registered.

### 8.2 `POST /auth/login`

**Access:** Public
**Account type:** `USER`

Request:

```json
{
  "email": "owner@example.com",
  "password": "secret12"
}
```

Success `200`: `AuthResponse` containing `token` and `user`.

Common errors:

- `400` invalid JSON.
- `401` invalid credentials.
- `403` pending, rejected, disabled, or otherwise inactive account.

### 8.3 `POST /auth/admin/login`

Same request and response as normal login, but only users with
`account_type=ADMIN` are selected.

### 8.4 `POST /auth/verify-email`

Email verification is disabled. The request body is currently ignored.

Success:

```json
{
  "status": "disabled",
  "message": "Email verification is no longer required. You can sign in now."
}
```

### 8.5 `POST /auth/resend-verification`

Email verification is disabled. The request body is currently ignored.

Success:

```json
{
  "message": "Email verification is no longer required. You can sign in now."
}
```

### 8.6 `GET /auth/me`

**Access:** Authenticated

Success:

```json
{
  "id": "45c2e738-8133-4f51-9204-fc8b4075aa57",
  "email": "owner@example.com",
  "name": "Example Owner",
  "phone": "+94 77 123 4567",
  "avatar_url": "data:image/png;base64,...",
  "account_type": "USER",
  "status": "ACTIVE",
  "is_email_verified": true,
  "accounts": [
    {
      "id": "fd4d2a2b-1750-431c-b37a-07aaeff0e389",
      "name": "Example Lab",
      "role": "OWNER"
    }
  ]
}
```

### 8.7 `PATCH /auth/me`

**Access:** Authenticated

Request:

```json
{
  "name": "Updated Name",
  "phone": "+94 77 000 0000",
  "avatar_url": "data:image/png;base64,..."
}
```

All fields are optional. Empty strings are stored as null. The handler updates
all three profile fields from the supplied request values, so omitted fields
also normalize to null in the current implementation. Clients should send the
complete profile state.

Success: updated `User`.

### 8.8 `POST /auth/change-password`

**Access:** Authenticated

Request:

```json
{
  "current_password": "secret12",
  "new_password": "newsecret34"
}
```

Rules:

- New password must have at least 8 characters.
- Current password must match.

Success:

```json
{
  "status": "password_updated"
}
```

### 8.9 `DELETE /auth/me`

**Access:** Owner

Request:

```json
{
  "confirm_email": "owner@example.com"
}
```

The confirmation email is matched case-insensitively. The operation deletes
the owner, workspace memberships, controllers, sensors, readings,
configurations, alerts, and related account data.

Success:

```json
{
  "status": "account_deleted"
}
```

### 8.10 `GET /users`

**Access:** Owner

Success:

```json
{
  "users": [
    {
      "id": "45c2e738-8133-4f51-9204-fc8b4075aa57",
      "email": "owner@example.com",
      "name": "Example Owner",
      "phone": "+94 77 123 4567",
      "status": "ACTIVE",
      "created_at": "2026-06-11T10:00:00Z",
      "role": "OWNER"
    }
  ],
  "count": 1
}
```

### 8.11 `POST /users/viewers`

**Access:** Owner

Request:

```json
{
  "email": "viewer@example.com",
  "password": "viewer12",
  "name": "Example Viewer",
  "phone": "+94 77 111 1111"
}
```

Rules:

- Email and a password of at least 6 characters are required.
- The user is created as an active `USER`.
- Membership role is `VIEWER`.

Success: created `User`.

## 9. Primary Hardware and System Endpoints

### 9.1 `POST /api/controllers/pair`

**Access:** Owner/Admin

Accepted request fields:

```json
{
  "controllerId": "CTRL-8F2A19",
  "pairingTokenOrControllerId": "CTRL-8F2A19",
  "qr_token": "CTRL-8F2A19"
}
```

The controller value is resolved in this order:

1. `controllerId`
2. `pairingTokenOrControllerId`
3. `qr_token`

Only one is required. The controller must be registered and available to
claim. A used, owned, unknown, or conflicting controller returns an error.

Success:

```json
{
  "id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
  "controllerId": "CTRL-8F2A19",
  "systemId": "876053f0-927a-4514-8dd6-29782786bf8e",
  "systemName": "Main Controller",
  "status": "paired",
  "sensors": []
}
```

### 9.2 `GET /api/controllers/my`

**Access:** Authenticated

Returns claimed controllers with active systems and sensors:

```json
{
  "controllers": [
    {
      "controllerId": "CTRL-8F2A19",
      "systemId": "876053f0-927a-4514-8dd6-29782786bf8e",
      "systemName": "Greenhouse West",
      "name": "Greenhouse West",
      "status": "ONLINE",
      "sensors": [
        {
          "id": "1df18f32-22ae-4aba-8468-81bdf9e2fe69",
          "sensorUid": "SEN-TH-001",
          "systemId": "876053f0-927a-4514-8dd6-29782786bf8e",
          "slotKey": "temperature_humidity",
          "name": "Air Temperature",
          "type": "temperature_humidity",
          "status": "live",
          "configured": true
        }
      ]
    }
  ]
}
```

### 9.3 `PATCH|PUT /api/controllers/{controllerId}`

**Access:** Owner/Admin

`controllerId` accepts hardware ID or UUID.

Request:

```json
{
  "name": "Greenhouse West"
}
```

The name must be non-empty. The active logical system is renamed with the
controller.

Success:

```json
{
  "controllerId": "CTRL-8F2A19",
  "systemName": "Greenhouse West",
  "name": "Greenhouse West",
  "status": "ONLINE",
  "sensors": null
}
```

### 9.4 `GET /api/controllers/{controllerId}/sensors`

**Access:** Authenticated

Optional query:

| Parameter | Values | Meaning |
| --- | --- | --- |
| `live` | `true` or `1` | Return only live sensors; returns an empty list if the controller is not online |

Success:

```json
{
  "controllerId": "CTRL-8F2A19",
  "systemId": "876053f0-927a-4514-8dd6-29782786bf8e",
  "sensors": []
}
```

### 9.5 `DELETE /api/controllers/{controllerId}/claim`

**Access:** Owner/Admin

Releases ownership, marks the controller `unclaimed`, and preserves the
logical monitoring system for later reassignment.

Success:

```json
{
  "message": "Controller removed from this account. The monitoring system was preserved for later reassignment.",
  "controllerId": "CTRL-8F2A19"
}
```

### 9.6 `PATCH|PUT /api/controllers/{controllerId}/sensors/{sensorId}`

**Access:** Owner/Admin

Request:

```json
{
  "name": "Tank Level"
}
```

The name must be non-empty. The operation synchronizes the system sensor,
controller sensor, and compatibility sensor where those records exist.

Success: `HardwareSensor`.

### 9.7 `POST /api/controllers/{controllerId}/sensors/{sensorId}/config`

**Access:** Owner/Admin

Request:

```json
{
  "systemName": "Water Storage",
  "sensorType": "ultrasonic",
  "sensorName": "Main Tank Level",
  "usedFor": "Fill level monitoring",
  "dashboardView": "Level Monitoring",
  "config": {
    "distanceMin": 10,
    "distanceMax": 200,
    "distanceWarningMax": 170,
    "readingFlowType": "CONSTANT_PER_DAY",
    "reportsPerDay": 24,
    "estimatedBatteryLifeDays": 77
  },
  "appConfig": {
    "friendly_name": "Main Tank Level",
    "use_case": "fill_level_monitoring",
    "presentation_profile": "level_monitoring",
    "primary_metric": "distance",
    "thresholds": {
      "warning_max": 170,
      "max": 200
    },
    "report_interval_per_day": 24,
    "power_management": {
      "battery_life_days": 77,
      "sampling_frequency": 24
    }
  }
}
```

Required:

- `systemName`
- Allowed and matching `sensorType`
- `sensorName`
- `config` object

Allowed hardware sensor types:

```text
load
temperature_humidity
ultrasonic
gas
weight
temperature
humidity
pressure
bme280
bmp280
vl53l0x
distance
```

`reportsPerDay`, when present, must be positive. Numeric configuration fields
must contain numbers.

The backend validates and normalizes the layered application configuration,
archives prior active configurations, activates the new configuration, and
updates related hardware and compatibility records.

Success:

```json
{
  "message": "Configuration activated successfully",
  "controllerId": "CTRL-8F2A19",
  "systemId": "876053f0-927a-4514-8dd6-29782786bf8e",
  "sensorId": "1df18f32-22ae-4aba-8468-81bdf9e2fe69",
  "configured": true
}
```

### 9.8 `GET /api/controllers/{controllerId}/sensors/{sensorId}/config`

**Access:** Authenticated

Returns the active configuration. If none exists, the endpoint returns a
generated default rather than `404`.

Success:

```json
{
  "controllerId": "CTRL-8F2A19",
  "systemId": "876053f0-927a-4514-8dd6-29782786bf8e",
  "sensorId": "1df18f32-22ae-4aba-8468-81bdf9e2fe69",
  "sensorUid": "SEN-US-001",
  "sensorType": "ultrasonic",
  "sensorName": "Main Tank Level",
  "usedFor": "Fill level monitoring",
  "dashboardView": "Level Monitoring",
  "config": {
    "reportsPerDay": 24,
    "estimatedBatteryLifeDays": 77
  },
  "appConfig": {
    "friendly_name": "Main Tank Level",
    "thresholds": {},
    "report_interval_per_day": 24,
    "power_management": {
      "battery_life_days": 77,
      "sampling_frequency": 24
    }
  }
}
```

### 9.9 `GET /api/systems/my`

**Access:** Authenticated

Success:

```json
{
  "systems": [
    {
      "id": "876053f0-927a-4514-8dd6-29782786bf8e",
      "name": "Greenhouse West",
      "purpose": "Climate monitoring",
      "location": "Greenhouse 2",
      "status": "active",
      "activeControllerId": "8b61f995-73e8-4e1c-b923-5b32b9501520",
      "activeControllerHw": "CTRL-8F2A19",
      "sensorCount": 2,
      "configuredSensors": 2
    }
  ]
}
```

## 10. Compatibility Controller and Sensor Endpoints

### 10.1 `GET /controllers`

**Access:** Authenticated

Returns an array of non-unclaimed `Controller` objects for the token's
workspace.

### 10.2 `POST /controllers/pair`

**Access:** Owner/Admin

Compatibility request:

```json
{
  "qr_token": "CTRL-8F2A19"
}
```

The value must begin with `CTRL-`. Unlike the primary pairing endpoint, this
compatibility handler can create a controller record when the hardware ID is
unknown. New integrations should use `/api/controllers/pair`.

Success: `Controller`.

### 10.3 `GET /controllers/{id}`

**Access:** Authenticated
**Path ID:** Controller UUID

Returns `404` if the controller is missing, unclaimed, or belongs to another
workspace.

### 10.4 `PATCH /controllers/{id}`

**Access:** Owner/Admin
**Path ID:** Controller UUID

Request may contain one or more fields:

```json
{
  "name": "Greenhouse West",
  "purpose": "Climate monitoring",
  "location": "Greenhouse 2"
}
```

Success: updated `Controller`.

### 10.5 `GET /controllers/{controllerId}/sensors`

**Access:** Authenticated
**Path ID:** Controller UUID

Returns an array of compatibility `Sensor` records with active configuration,
context, observation status, and calibration fields when available.

### 10.6 `GET /sensors/{id}`

**Access:** Authenticated
**Path ID:** Sensor UUID

Success: `Sensor`.

### 10.7 `PATCH|PUT /sensors/{id}`

**Access:** Owner/Admin
**Path ID:** Sensor UUID

Request:

```json
{
  "name": "Air Temperature"
}
```

The name must be non-empty. Success returns the updated `Sensor`.

### 10.8 `POST /sensors/{id}/config`

**Access:** Owner/Admin
**Path ID:** Sensor UUID

Preferred wrapped request:

```json
{
  "purpose": "Climate monitoring",
  "context": {
    "domain": "agriculture",
    "environment_type": "greenhouse",
    "indoor_outdoor": "indoor",
    "asset_type": "Tomato crop",
    "installation_notes": "Mounted 1.5 m above floor",
    "historical_window_days": 14,
    "location": {
      "mode": "manual",
      "country": "Sri Lanka",
      "region": "Kandy",
      "label": "Greenhouse West"
    }
  },
  "config": {
    "friendly_name": "Greenhouse Climate",
    "use_case": "climate_monitoring",
    "presentation_profile": "dual_climate",
    "primary_metric": "temperature",
    "thresholds": {
      "min": 18,
      "max": 35,
      "warning_min": 20,
      "warning_max": 32
    },
    "metric_thresholds": {
      "temperature": {
        "min": 18,
        "max": 35,
        "warning_min": 20,
        "warning_max": 32
      }
    },
    "report_interval_per_day": 24,
    "power_management": {
      "battery_life_days": 77,
      "sampling_frequency": 24
    }
  }
}
```

The endpoint also accepts a bare `SensorConfig` body for compatibility. The
backend validates and normalizes the configuration and stores a new active
version.

Success:

```json
{
  "status": "ok",
  "validated_config": {},
  "validation_status": "valid",
  "warnings": [],
  "applied_rules": [],
  "confidence_score": 0.92,
  "requires_user_confirmation": false,
  "config_active": true,
  "observation": {
    "status": "awaiting_data",
    "message": "Configured. Waiting for live readings before recommending improvements.",
    "window_days": 14,
    "readings_collected": 0,
    "minimum_readings": 72
  }
}
```

## 11. Dashboard, Readings, and Alert Endpoints

### 11.1 `GET /dashboard/overview`

**Access:** Authenticated

Success:

```json
{
  "controllers": 2,
  "sensors": 5,
  "alerts": 1
}
```

`alerts` counts only unacknowledged alerts.

### 11.2 `GET /controllers/{id}/dashboard`

**Access:** Authenticated
**Path ID:** Controller UUID

Success:

```json
{
  "controller_id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
  "sensor_count": 3,
  "recent_readings": 720
}
```

`recent_readings` covers the previous 24 hours.

### 11.3 `GET /sensors/{id}/readings`

**Access:** Authenticated
**Path ID:** Compatibility sensor UUID or system-sensor UUID

Query parameters:

| Name | Required | Description |
| --- | --- | --- |
| `from` | No | RFC 3339 start; default is 24 hours ago |
| `to` | No | RFC 3339 end; default is now |
| `interval` | No | Aggregate bucket, for example `15m`, `1h`, `1d`, `2 days` |

Raw success, no `interval`:

```json
[
  {
    "time": "2026-06-11T10:00:00Z",
    "value": 28.4,
    "meta": {
      "type": "temperature"
    }
  }
]
```

Aggregate success:

```json
[
  {
    "time": "2026-06-11T10:00:00Z",
    "avg_value": 28.1,
    "min_value": 27.8,
    "max_value": 28.4
  }
]
```

Supported interval syntax:

- Go duration syntax such as `15m`, `1h`, or `24h`.
- Day shorthand such as `1d`.
- Word syntax such as `15 minutes`, `2 hours`, or `1 day`.

Invalid `interval` returns `400`. Invalid `from` or `to` values are currently
ignored rather than rejected.

### 11.4 `GET /alerts`

**Access:** Authenticated

Optional filters:

| Name | Values |
| --- | --- |
| `controller_id` | Controller UUID |
| `sensor_id` | Sensor UUID |
| `type` | `THRESHOLD_BREACH`, `SENSOR_OFFLINE`, `CONTROLLER_OFFLINE` |
| `severity` | `INFO`, `WARN`, `CRITICAL` |
| `acknowledged` | `true` or `false` |

Success: array of `Alert`, newest first.

Malformed UUID filter values are currently ignored.

### 11.5 `POST /alerts/{id}/ack`

**Access:** Owner/Admin
**Path ID:** Alert UUID

No request body.

Success:

```json
{
  "status": "ok"
}
```

## 12. System Administrator Endpoints

All endpoints in this section require an active system-admin token.

### 12.1 `GET /api/admin/overview`

Success:

```json
{
  "totalDevices": 10,
  "unclaimedDevices": 3,
  "pairedDevices": 7,
  "onlineDevices": 5,
  "offlineDevices": 2,
  "configuredSensors": 12,
  "unconfiguredSensors": 4
}
```

### 12.2 `GET /api/admin/devices`

Success:

```json
{
  "devices": [
    {
      "id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
      "controllerId": "CTRL-8F2A19",
      "name": "Main Controller",
      "location": "Greenhouse 2",
      "status": "unclaimed",
      "ownerEmail": "",
      "sensorCount": 0,
      "configuredSensors": 0,
      "updatedAt": "2026-06-11T10:00:00Z"
    }
  ]
}
```

### 12.3 `POST /api/admin/devices`

Request:

```json
{
  "controllerId": "CTRL-8F2A19",
  "name": "Main Controller",
  "location": "Greenhouse 2",
  "createDefaultSensors": false
}
```

Behavior:

- `controllerId` is optional.
- If omitted, a unique `CTRL-` code is generated.
- A supplied ID must begin with `CTRL-` and be unique.
- Empty `name` defaults to `Main Controller`.
- The new device is `unclaimed`.

Success:

```json
{
  "device": {
    "id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
    "controllerId": "CTRL-8F2A19",
    "name": "Main Controller",
    "status": "unclaimed",
    "sensorCount": 0,
    "configuredSensors": 0
  },
  "qrPayload": "CTRL-8F2A19",
  "claimUrl": "/controllers/pair?code=CTRL-8F2A19"
}
```

### 12.4 `GET /api/admin/users`

Returns users in the administrator token's account context:

```json
{
  "users": [
    {
      "id": "45c2e738-8133-4f51-9204-fc8b4075aa57",
      "email": "admin@example.com",
      "name": "System Admin",
      "role": "OWNER",
      "controllerCount": 0,
      "createdAt": "2026-06-11T10:00:00Z"
    }
  ]
}
```

### 12.5 `GET /api/admin/owners`

Returns owner workspaces:

```json
{
  "owners": [
    {
      "id": "45c2e738-8133-4f51-9204-fc8b4075aa57",
      "email": "owner@example.com",
      "name": "Example Owner",
      "phone": "+94 77 123 4567",
      "status": "ACTIVE",
      "accountId": "fd4d2a2b-1750-431c-b37a-07aaeff0e389",
      "organizationName": "Example Lab",
      "controllerCount": 2,
      "viewerCount": 3,
      "createdAt": "2026-06-11T10:00:00Z"
    }
  ]
}
```

### 12.6 `POST /api/admin/owners`

Request:

```json
{
  "email": "owner@example.com",
  "password": "secret12",
  "name": "Example Owner",
  "phone": "+94 77 123 4567",
  "organizationName": "Example Lab"
}
```

Email and a password of at least 6 characters are required. The owner is
created active and email-verified.

Success: `AdminOwner`.

### 12.7 `PATCH /api/admin/owners/{userId}/approve`

Sets the owner status to `ACTIVE`.

Success:

```json
{
  "id": "45c2e738-8133-4f51-9204-fc8b4075aa57",
  "status": "ACTIVE"
}
```

### 12.8 `PATCH /api/admin/owners/{userId}/reject`

Sets the owner status to `REJECTED`.

### 12.9 `GET /api/admin/system`

Success:

```json
{
  "apiStatus": "ok",
  "databaseStatus": "ok",
  "serverTime": "2026-06-11T10:00:00Z"
}
```

The endpoint still returns a JSON response if the database ping fails, with
`databaseStatus` set to `error`.

## 13. Controller Ingestion Endpoints

The registered ingestion routes are public in the current router. See the
security section before exposing them outside a trusted network.

### 13.1 `POST /api/iot/discover`

Registers or updates the sensor list reported by a known controller.

Request:

```json
{
  "deviceId": "CTRL-8F2A19",
  "ts": 1781172000,
  "sensors": [
    {
      "id": "SEN-TH-001",
      "type": "temperature_humidity",
      "name": "SHT30",
      "unit": "C/%RH"
    }
  ]
}
```

Rules:

- `deviceId` is required.
- At least one sensor is required.
- Every sensor requires `id` and `type`.
- Controller must already exist.

Effects:

- Marks the controller online.
- Updates last-seen time.
- Upserts compatibility and hardware sensor records.
- Binds sensors to the active logical system.

Success:

```json
{
  "ok": true,
  "discovered": true,
  "controller_id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
  "device_id": "CTRL-8F2A19",
  "sensor_count": 1,
  "discovered_at": "2026-06-11T10:00:00Z"
}
```

### 13.2 `POST /api/iot/config`

Returns the current firmware-oriented configuration.

Request:

```json
{
  "deviceId": "CTRL-8F2A19",
  "sensorId": "SEN-TH-001",
  "sensorType": "temperature_humidity"
}
```

Only `deviceId` is required. If `sensorType` is omitted, it defaults to
`temperature_humidity`.

Success:

```json
{
  "ok": true,
  "deviceId": "CTRL-8F2A19",
  "sensorId": "SEN-TH-001",
  "sensorType": "temperature_humidity",
  "configId": "generated-or-persisted-id",
  "hasActiveConfig": true,
  "samplePeriodMs": 3600000,
  "tempThresholdHiX100": 3500,
  "humidityThresholdHiX100": 8500,
  "configuredAt": "2026-06-11T09:00:00Z"
}
```

The fixed firmware response fields are reused for non-temperature sensors:

- For BME280/BMP280, `humidityThresholdHiX100` carries pressure upper
  threshold data.
- For distance sensors, `tempThresholdHiX100` is zero and
  `humidityThresholdHiX100` carries distance upper threshold data.

Consumers must interpret these fields using `sensorType`.

### 13.3 `POST /api/iot/upload`

Persists a reading event and attempts to publish it to Kafka.

Request:

```json
{
  "deviceId": "CTRL-8F2A19",
  "ts": 1781172000,
  "sensors": [
    {
      "id": "SEN-TH-001",
      "type": "temperature",
      "v": 28.4
    },
    {
      "id": "SEN-H-001",
      "type": "humidity",
      "v": 67.0
    }
  ]
}
```

Rules:

- `deviceId` is required.
- At least one reading is required.
- Each reading requires `id` and `type`.
- `v` is a JSON number.
- Controller must already exist.

Success:

```json
{
  "ok": true,
  "persisted": true,
  "queued": true,
  "controller_id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
  "device_id": "CTRL-8F2A19",
  "event_id": "b8a71da1-4e19-40b6-9368-c3a84a0b0d6b",
  "reading_time": "2026-06-11T10:00:00Z",
  "received_at": "2026-06-11T10:00:01Z",
  "sensor_count": 2
}
```

`persisted=true` means synchronous database processing succeeded.
`queued=false` may still accompany a successful response when Kafka is
disabled or publishing fails after persistence.

## 14. Data Models

### 14.1 User

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | User ID |
| `email` | string | Normalized email |
| `name` | string, optional | Display name |
| `phone` | string, optional | Phone |
| `avatar_url` | string, optional | URL or data URL |
| `account_type` | string | `USER` or `ADMIN` |
| `status` | string | `ACTIVE`, `PENDING_APPROVAL`, `REJECTED`, `DISABLED` |
| `is_email_verified` | boolean | Currently true for newly created users |
| `created_at` | RFC 3339 | Creation time |

### 14.2 Controller

| Field | Type |
| --- | --- |
| `id` | UUID |
| `account_id` | UUID |
| `hw_id` | string |
| `name` | string, optional |
| `purpose` | string, optional |
| `location` | string, optional |
| `qr_code` | string, optional |
| `status` | `ONLINE`, `OFFLINE`, `PENDING_CONFIG`, or deployment state |
| `last_seen` | RFC 3339, optional |
| `created_at` | RFC 3339 |

### 14.3 HardwareSensor

| Field | Type |
| --- | --- |
| `id` | UUID string |
| `sensorUid` | string, optional |
| `systemId` | UUID string, optional |
| `slotKey` | string, optional |
| `name` | string |
| `type` | string |
| `status` | string |
| `configured` | boolean |

### 14.4 Sensor

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Compatibility sensor ID |
| `controller_id` | UUID | Parent controller |
| `hw_id` | string | Hardware sensor ID |
| `type` | string | Sensor type |
| `name` | string, optional | Friendly name |
| `purpose` | string, optional | Monitoring purpose |
| `unit` | string, optional | Display/raw unit |
| `status` | string | `OK`, `OFFLINE`, `ERROR` |
| `config_active` | boolean | Active config exists |
| `active_config` | SensorConfig, optional | Current config |
| `last_seen` | RFC 3339, optional | Last sensor activity |
| `context` | SensorContext, optional | Deployment context |
| `observation` | SensorObservation, optional | Post-config collection status |
| `last_calibrated_at` | RFC 3339, optional | Calibration metadata |
| `calibration_due_at` | RFC 3339, optional | Calibration metadata |
| `calibration_status` | string | For example `UNKNOWN` or `OVERDUE` |

### 14.5 SensorConfig

Top-level fields:

| Field | Type |
| --- | --- |
| `friendly_name` | string |
| `use_case` | string, optional |
| `presentation_profile` | string, optional |
| `primary_metric` | string, optional |
| `thresholds` | ThresholdConfig |
| `metric_thresholds` | map of metric key to ThresholdConfig |
| `report_interval_per_day` | integer |
| `power_management` | PowerManagement |
| `hardware_config` | object, optional |
| `hardware` | SensorHardwareLayer, optional |
| `interpretation` | SensorInterpretationLayer, optional |
| `presentation` | SensorPresentationLayer, optional |
| `settings` | SensorSettingsLayer, optional |
| `operational` | SensorOperationalLayer, optional |

Supported use-case keys include:

```text
generic_monitoring
climate_monitoring
fill_level_monitoring
occupancy_monitoring
attendance_monitoring
load_monitoring
safety_monitoring
```

Presentation profile keys include:

```text
single_trend
dual_climate
level_monitoring
counter_status
gauge_status
event_timeline
```

### 14.6 ThresholdConfig

```json
{
  "min": 0,
  "max": 100,
  "warning_min": 10,
  "warning_max": 90
}
```

All properties are optional numbers.

### 14.7 SensorContext

```json
{
  "domain": "agriculture",
  "environment_type": "greenhouse",
  "indoor_outdoor": "indoor",
  "asset_type": "Tomato crop",
  "installation_notes": "Mounted away from direct irrigation",
  "historical_window_days": 14,
  "location": {
    "mode": "manual",
    "label": "Greenhouse West",
    "country": "Sri Lanka",
    "region": "Kandy",
    "latitude": 7.2906,
    "longitude": 80.6337
  }
}
```

### 14.8 SensorObservation

| Field | Type |
| --- | --- |
| `status` | `awaiting_data`, `observing`, `ready_for_review` |
| `message` | string |
| `window_days` | integer |
| `readings_collected` | integer |
| `minimum_readings` | integer |
| `started_at` | RFC 3339, optional |
| `last_reading_at` | RFC 3339, optional |

### 14.9 Alert

```json
{
  "id": "2f720068-b5ea-46b8-93b8-2f5462ba9c26",
  "account_id": "fd4d2a2b-1750-431c-b37a-07aaeff0e389",
  "controller_id": "8b61f995-73e8-4e1c-b923-5b32b9501520",
  "sensor_id": "45b1b358-2d29-4f06-8470-86ae4183e108",
  "type": "THRESHOLD_BREACH",
  "severity": "WARN",
  "message": "Temperature exceeded the warning threshold.",
  "created_at": "2026-06-11T10:00:00Z"
}
```

`controller_id`, `sensor_id`, and `acknowledged_at` are omitted when they are
not present.

## 15. Error Handling

### 15.1 Current Error Format

Most errors are plain text:

```http
HTTP/1.1 400 Bad Request
Content-Type: text/plain; charset=utf-8

sensor name required
```

Clients should inspect both the status code and text body.

### 15.2 Common Status Codes

| Status | Meaning |
| --- | --- |
| `200` | Request succeeded |
| `204` | Favicon response only |
| `400` | Invalid JSON, ID, input, interval, or missing required field |
| `401` | Missing/invalid token or resource ownership mismatch in some compatibility handlers |
| `403` | Authenticated but role/account type is not allowed |
| `404` | Resource or known controller not found |
| `409` | Duplicate email/controller or controller ownership conflict |
| `500` | Database, persistence, configuration, or internal processing failure |

### 15.3 Representative Error Bodies

```text
invalid request
invalid credentials
email already registered
insufficient permissions
controller not found
sensor not found
Controller ID already exists. Use a different controller ID.
This controller is already owned by another account.
reportsPerDay should be positive
unknown controller
database error
```

## 16. Security and Operational Notes

### 16.1 Production Requirements

- Set a strong, private `JWT_SECRET`.
- Use HTTPS for all web and API traffic.
- Restrict `ALLOWED_ORIGINS` to deployed frontend origins.
- Store database, SMTP, MQTT, Kafka, and encryption secrets outside source
  control.
- Use TLS or mTLS for MQTT and Kafka in production.
- Apply database least privilege.
- Monitor failed login, pairing, ingestion, and admin requests.

### 16.2 Device Endpoint Exposure

`/api/iot/discover`, `/api/iot/config`, and `/api/iot/upload` do not currently
use `AuthMiddleware` or a device credential. If reachable from an untrusted
network, a caller who knows a controller ID can attempt discovery, config
pulls, or uploads.

Until device authentication is implemented:

- Place ingestion endpoints behind a private network, VPN, gateway, or mTLS
  proxy.
- Apply rate limiting and request-size limits at the reverse proxy.
- Validate controller identity at the network or broker layer.
- Alert on unexpected controller IDs, sensor IDs, and upload rates.

### 16.3 Sensitive Response Data

- JWTs grant account access for 24 hours.
- Profile avatars may be data URLs and can make responses large.
- Admin owner lists expose account and organization metadata.
- Do not log bearer tokens or full credential request bodies.

## 17. Known API Limitations

1. There is no URL-based API version such as `/v1`.
2. There is no machine-readable OpenAPI file in the current backend.
3. Error responses are plain text and do not have stable error codes.
4. Successful create operations generally return `200`, not `201`.
5. Collection pagination is not implemented.
6. Rate limiting and request-size limiting are not implemented in the Go
   router.
7. Device-ingestion routes do not authenticate controllers.
8. JWT refresh and token revocation endpoints are not implemented.
9. Email verification endpoints are retained but verification is disabled.
10. The registered route set contains both primary hardware and compatibility
    APIs, which creates overlapping controller and sensor models.
11. Admin audit-event storage and an audit API are not implemented.
12. Some malformed optional filters are ignored instead of returning `400`.
13. Hardware firmware config uses temperature/humidity-named fields for
    pressure and distance compatibility.

## 18. References and Revision History

### 18.1 Documentation References

- OpenAPI Specification:
  <https://spec.openapis.org/oas/latest.html>
- OpenAPI Initiative learning guide:
  <https://learn.openapis.org/>
- IEEE/ISO/IEC user-documentation standard overview:
  <https://standards.ieee.org/ieee/26514/7467/>

### 18.2 Implementation Sources

- `software/backend/internal/httpapi/routes.go`
- `software/backend/internal/httpapi/middleware.go`
- `software/backend/internal/httpapi/*_handler.go`
- `software/backend/internal/models/*.go`
- `software/backend/internal/iot/payload.go`
- `software/frontend/web/src/services/*.ts`

### 18.3 Revision History

| Version | Date | Description |
| --- | --- | --- |
| 1.0 | June 11, 2026 | Initial API reference for all routes registered by the Go backend |
