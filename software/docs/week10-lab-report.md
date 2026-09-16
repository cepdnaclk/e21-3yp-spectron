# Week 10 Lab Report

## Submission Details

- Course: `[Add course code and course name]`
- Lab: `Week 10 Worksheet`
- Project: `SPECTRON AgriAssist`
- Group: `[Add group number]`
- Team members: `[Add names and index numbers]`
- Date: `2026-08-16`

## 1. Lab Context

This report is prepared for the Week 10 lab using our current project repository in this folder. The project is **SPECTRON AgriAssist**, a farm-first agriculture monitoring and advisory system built on top of the wider SPECTRON modular IoT platform.

The current product direction is focused on non-technical farmers. The main customer workflows are:

- creating and managing farms
- creating fields inside farms
- connecting controllers and sensor bases
- configuring and monitoring farm hardware
- viewing alerts and field conditions
- getting AI-supported advice for farm problems

## 2. Project Summary

SPECTRON AgriAssist combines hardware, backend services, database support, and a frontend dashboard into one agriculture application.

### Main goal

The system helps farmers monitor farm conditions, understand problems early, and take clearer action with less technical overhead.

### Main parts of the system

- **Frontend web application**
  - React and TypeScript based customer-facing dashboard
  - Farm-first pages such as My Farms, Farm Details, Advisor, Alerts, Controllers, and Sensor Configuration
- **Backend API**
  - Go-based service for authentication, farm management, hardware, alerts, readings, and advisor-related flows
- **Database**
  - PostgreSQL with optional TimescaleDB support for time-series sensor readings
- **Hardware layer**
  - ESP32-based controller and sensor module projects
- **Telemetry pipeline**
  - supports device upload and an MQTT to Kafka pipeline for readings ingestion

## 3. Repository Evidence Used For This Report

This report is based on the current repository contents, especially:

- `README.md`
- `AGENTS.md`
- `docs/USER_MANUAL.md`
- `docs/API_DOCUMENTATION.md`
- `software/backend/README.md`
- `software/frontend/README.md`
- `software/database/README.md`
- frontend pages under `software/frontend/web/src/pages/main/`
- existing documentation under `software/docs/`

## 4. Current Product Direction

The current project is no longer treated as only a technical prototype. The repository instructions show a clear shift toward a final-product agriculture application intended for real users.

### Product priorities visible in the repo

- simple and calm UI for farmers
- short labels and focused actions
- progressive disclosure instead of large explanations on screen
- support for Sinhala, Tamil, and English oriented design
- strong backend validation
- strict role separation between admin, owner, and viewer
- hardware complexity hidden unless the user actually needs it

This is important because the lab report should describe the project as an **agriculture product** rather than only as a generic IoT dashboard.

## 5. Implemented User Workflows

Based on the current frontend and documentation, the important user workflows are:

### 5.1 Farm setup

- user creates a farm
- user selects and confirms a farm location
- location is used to support weather-aware features

Evidence:

- `software/frontend/web/src/pages/main/Farms.tsx`

### 5.2 Field and farm management

- farm-focused navigation is used instead of device-first navigation
- the product structure matches the intended customer flow of farm, field, crop, hardware, and alerts

### 5.3 Hardware onboarding

The repository guidance shows a wizard-based setup flow:

1. create or select farm
2. create fields
3. add controller to farm
4. optionally configure Wi-Fi
5. discover or add sensor bases
6. assign sensor bases to fields
7. detect sensor modules and channels
8. verify readings

This aligns hardware setup with farmer tasks instead of technical infrastructure concepts.

### 5.4 Alerts workflow

- farm alerts can be listed and filtered
- owners can acknowledge alerts
- viewers can only review alerts

Evidence:

- `software/frontend/web/src/pages/main/Alerts.tsx`

### 5.5 AI advisor workflow

- users can report a field problem
- the system returns structured advice
- the advice includes likely causes, immediate actions, follow-up checks, warnings, and next questions

Evidence:

- `software/frontend/web/src/pages/main/Advisor.tsx`
- backend advisor support described in `software/backend/README.md`

## 6. Architecture Overview

The current project can be summarized as a layered agriculture monitoring system.

```text
Sensors and farm hardware
    -> Controller / gateway
    -> Upload or MQTT path
    -> Backend API and ingestion services
    -> PostgreSQL / TimescaleDB
    -> Web dashboard
    -> Farmer decisions and actions
```

### Architecture responsibilities

- **Hardware**
  - captures field measurements
  - supports modular sensor payloads
- **Telemetry**
  - transfers readings to the backend
- **Backend**
  - validates data
  - manages farms, access, controllers, sensors, and alerts
  - supports AI-assisted recommendations
- **Database**
  - stores account, farm, hardware, and reading data
- **Frontend**
  - presents a simple farm-first interface for users

## 7. Key Domain Design Decisions

The repository contains several important architecture and product rules that shape the system.

### 7.1 Farm-centered model

- controllers belong to farms, not directly to fields
- sensor bases connect controllers to fields
- one controller can serve sensor bases across multiple fields
- one field can use sensor bases through multiple controllers

### 7.2 Historical correctness

- sensor base movement must preserve assignment history
- sensor readings belong to sensor channels
- one physical module can expose multiple channels

### 7.3 Growth-stage support

- growth stages are estimated automatically
- farmers confirm or correct them only when needed

### 7.4 Role and security boundaries

- Spectron Admin is separate from customer roles
- admin cannot be farm owner or viewer
- viewer access is read-only
- backend must enforce access rules with `403` responses

These decisions are important to include in the report because they show the project is designed as a real product with domain-specific rules.

## 8. Validation And Security

The repository instructions require both frontend and backend validation.

### Validation areas already emphasized in the project

- required fields
- field lengths
- email format
- password rules
- farm ownership and access checks
- viewer invitation eligibility
- sensor base assignment state
- crop setup values
- growth-stage confirmation
- sensor reading timestamps
- sensor reading ranges and units
- offline upload idempotency
- Wi-Fi and connectivity secret handling

### Security expectations

- Wi-Fi passwords are write-only
- secrets must not be exposed through APIs or logs
- viewer revocation must take effect immediately
- admin access to customer farm information is denied by default
- JWT-based API authorization is used
- bcrypt is used for password storage

## 9. Technologies Used

### Frontend

- React 18
- TypeScript
- Material UI
- Vitest

### Backend

- Go
- chi router
- JWT authentication
- Kafka support
- MQTT bridge support

### Database

- PostgreSQL
- TimescaleDB optional support
- pgcrypto extension support

### Hardware and device side

- ESP32 / ESP32-C3
- ESP-IDF
- ESP-NOW

## 10. Testing And Quality Evidence

The repository already includes tests and earlier testing documentation.

### Evidence found

- frontend tests in `software/frontend/web/src/**/__tests__`
- backend tests across `software/backend/internal/...`
- previous structured testing report in `software/docs/week6-testing-report.md`

### Quality-related observations

- the project has both unit and UI-level tests
- there is already a pattern for documenting test work in Markdown
- backend behavior and role restrictions are treated as important test targets

### Suggested items to include in the final submission

- test commands used
- screenshots of passing test runs
- screenshots of major user workflows
- screenshots of UI pages related to the lab

## 11. Strengths Of The Current Project

- clear farm-first product direction
- practical separation between farmer UI and admin UI
- strong emphasis on validation and access control
- reusable modular hardware concept
- AI-assisted farm problem support
- documented backend, frontend, API, and user manual
- test coverage and earlier lab-report precedent already exist

## 12. Current Limitations And Gaps

The report should also acknowledge current limitations.

- some areas are still transitioning from older generic Spectron flows to the AgriAssist farm-first model
- some repository documentation still describes the wider modular IoT platform rather than only the final agriculture product
- worksheet-specific screenshots or evidence still need to be inserted manually
- final wording may need to be adjusted to exactly match the Week 10 worksheet headings

## 13. Proposed Conclusion

SPECTRON AgriAssist is evolving from a modular IoT platform into a farmer-friendly agriculture product. The current repository already shows the main elements of a production-oriented system: farm-centered workflows, role-based security, backend validation, modular hardware support, alert handling, and AI-assisted advisory features.

For this lab, the project provides enough implemented functionality and documentation to present a meaningful report based on the real system rather than a mock prototype. The strongest theme across the current codebase is the shift toward a simple and trustworthy user experience for farmers.

## 14. Items To Customize Before Submission

- replace contributor placeholders
- add exact course and group details
- adjust section titles if the worksheet uses specific headings
- add screenshots requested by the worksheet
- add exact commands run during the lab, if required
- add any diagrams requested by the worksheet
- convert the final Markdown to PDF using the required file name format

## 15. Optional Screenshot Placeholders

Add screenshots under these headings if the worksheet requires evidence:

### Screenshot 1: Main dashboard or My Farms page

`[Insert screenshot here]`

### Screenshot 2: Farm creation or setup workflow

`[Insert screenshot here]`

### Screenshot 3: Alerts page

`[Insert screenshot here]`

### Screenshot 4: AI Advisor page

`[Insert screenshot here]`

### Screenshot 5: Architecture or repository structure evidence

`[Insert screenshot here]`

## 16. Submission Checklist

- [ ] course code and lab title added
- [ ] group number added
- [ ] member names and index numbers added
- [ ] worksheet-specific headings checked
- [ ] screenshots inserted
- [ ] final proofreading completed
- [ ] exported to PDF if required
- [ ] final file renamed to required submission format
