# Week 6: Testing

## Contributor

* Team: Spectron
* Group: 5

## Project Testing Stack

The repository contains a Go backend and a React/TypeScript frontend. The backend module is `spectron-backend` with `go 1.22` declared in `backend/go.mod`; tests use Go's standard `testing` package with package-local `_test.go` files. The frontend web app uses React 18, TypeScript, MUI, and Vitest with jsdom from `frontend/web/vitest.config.ts`; tests live under `src/**/__tests__`.

Dependency installation commands used:

* Backend: `go mod download`
* Frontend: `npm ci`

Test commands used:

* Backend individual workstreams: `go test ./internal/httpapi -run <test name> -count=1`
* Backend full suite: `go test ./...`
* Frontend full suite: `npm test -- --run`
* Backend coverage: `go test ./... -coverprofile .\coverage.out`

Existing GitHub Actions workflows: none were present under `.github/workflows` before this work.

## Phase 1 Inspection Summary

* Language/framework: Go backend API, React/TypeScript frontend.
* Dependency files: `backend/go.mod`, `backend/go.sum`, `frontend/web/package.json`, `frontend/web/package-lock.json`.
* Backend tests: standard Go tests in package directories such as `backend/internal/httpapi`, `backend/internal/iot`, `backend/internal/auth`.
* Frontend tests: Vitest tests in `frontend/web/src/**/__tests__`.
* Business logic inspected: sensor configuration validation, ingestion helpers, IoT threshold processing, authentication helpers, agriculture context matching, frontend sensor utilities.
* CI before this task: `.github` existed, but `.github/workflows` did not.

## Workstream 1

* Function and file: `inferUseCaseAndProfile` in `backend/internal/httpapi/sensor_config_validation.go`
* Reason for selection: It maps sensor type, purpose text, requested use case, and requested presentation profile into dashboard behavior. Incorrect inference would select the wrong operational mode or UI profile.
* External dependencies: none. Inputs are plain values and `models.SensorContext`.
* Current test coverage before this task: Indirectly exercised through `validateAndFinalizeConfig`; no focused tests for inference partitions and compatibility adjustments.
* Equivalence partitions: climate sensor, distance sensor, load/safety/default sensor, explicit requested use case/profile.
* Boundary values: blank versus populated requested values; whitespace/case normalization.
* Negative/error cases: nil context, empty strings, incompatible profile.

| Test ID | Technique | Input or condition | Expected result | Dependency mocked |
| ------- | --------- | ------------------ | --------------- | ----------------- |
| WS1-T1 | Equivalence partitioning | `temperature_humidity` with no requested use case/profile | Climate monitoring, dual climate profile, temperature primary metric | None |
| WS1-T2 | Equivalence partitioning | `vl53l0x` with class/lecture attendance purpose and context | Attendance use case, counter profile | None |
| WS1-T3 | Negative compatibility | `ultrasonic`, requested fill level use case with counter profile | Profile adjusted to level monitoring | None |
| WS1-T4 | Negative compatibility | `pressure`, requested generic use case with level profile | Profile adjusted to single trend | None |

* Number of tests written: 4
* Number passing: 4
* Coverage result: 59.4% for targeted workstream run; 62.5% in backend full coverage profile.
* Review gap: Additional tests could cover every sensor-type branch, especially `gas_sensor`, `air_quality`, and unknown sensor fallback.
* Final status: Passing.

## Workstream 2

* Function and file: `metricSpecsForUseCase` in `backend/internal/httpapi/sensor_config_validation.go`
* Reason for selection: It decides the primary metric, allowed range, and default thresholds for use-case-specific metrics.
* External dependencies: none.
* Current test coverage before this task: Indirect coverage through config-finalization tests; no table-driven coverage for use-case metric mapping.
* Equivalence partitions: distance generic, distance fill level, distance attendance, non-distance sensor fallback.
* Boundary values: allowed min/max limits for distance `0..500`, fill level `0..100`, attendance `0..500`, temperature `-10..60`.
* Negative/error cases: unsupported or fallback use case path.

| Test ID | Technique | Input or condition | Expected result | Dependency mocked |
| ------- | --------- | ------------------ | --------------- | ----------------- |
| WS2-T1 | Equivalence partitioning | `vl53l0x` and generic monitoring | Primary metric `distance`, range `0..500` | None |
| WS2-T2 | Equivalence partitioning/boundary | `ultrasonic` and fill level monitoring | Primary metric `fill_level`, range `0..100`, default max `80` | None |
| WS2-T3 | Equivalence partitioning/boundary | `distance` and attendance monitoring | Primary metric `attendance_count`, range `0..500`, default min `20` | None |
| WS2-T4 | Fallback/context partition | `temperature`, climate use case, warehouse context | Temperature spec with warehouse defaults | None |

* Number of tests written: 4
* Number passing: 4
* Coverage result: 87.5% for targeted workstream run; 100.0% in backend full coverage profile.
* Review gap: Occupancy mapping is covered indirectly by existing tests, but not explicitly in this workstream table.
* Final status: Passing.

## Workstream 3

* Function and file: `validateThreshold` in `backend/internal/httpapi/sensor_config_validation.go`
* Reason for selection: It enforces numeric bounds and threshold consistency before sensor alerts are persisted or sent to controllers.
* External dependencies: none.
* Current test coverage before this task: No direct focused tests for clamping, swapping, or warning-threshold consistency.
* Equivalence partitions: valid thresholds, out-of-range thresholds, inverted min/max, inconsistent warning ranges.
* Boundary values: just below min, exactly min, just above max, exactly max.
* Negative/error cases: warning minimum greater than warning maximum; warning thresholds conflicting with hard thresholds.

| Test ID | Technique | Input or condition | Expected result | Dependency mocked |
| ------- | --------- | ------------------ | --------------- | ----------------- |
| WS3-T1 | Boundary value analysis | Min `-0.1`, max `100.1`, warnings outside `0..100` | Values clamped to `0` and `100`, clamp rule recorded | None |
| WS3-T2 | Boundary value analysis | Min `0`, max `100`, warnings exactly on bounds | Values unchanged, no warnings | None |
| WS3-T3 | Negative consistency | Min `80`, max `20` | Min/max swapped to `20..80` | None |
| WS3-T4 | Negative consistency | Warning min above min, warning max below max | Warning thresholds aligned to hard thresholds | None |
| WS3-T5 | Negative consistency | Warning min `75`, warning max `25` with no hard thresholds | Warning minimum removed | None |

* Number of tests written: 5
* Number passing: 5
* Coverage result: 100.0% for targeted workstream run and backend full coverage profile.
* Review gap: NaN and infinity are not covered; current production code does not explicitly reject them.
* Final status: Passing.

## Workstream 4

* Function and file: `validateAndFinalizeConfig` in `backend/internal/httpapi/sensor_config_validation.go`
* Reason for selection: This is the final business-rule aggregator for sensor config defaults, validation status, reporting frequency, controller capability constraints, confidence, and confirmation requirements.
* External dependencies: none in these tests. The function calls local helpers only.
* Current test coverage before this task: Existing tests covered derived metrics, observable selections, and selected alert preservation. Boundary reporting, context quality, and calibration paths were insufficiently covered.
* Equivalence partitions: complete valid config, blank required fields, low/high report frequency, invalid controller capability, overdue calibration.
* Boundary values: report frequency just below lower bound (`0`), exactly controller maximum (`144` for 600-second minimum), just above maximum (`145`), fallback maximum (`288` for 300-second default).
* Negative/error cases: blank friendly name, incomplete context, overdue calibration.

| Test ID | Technique | Input or condition | Expected result | Dependency mocked |
| ------- | --------- | ------------------ | --------------- | ----------------- |
| WS4-T1 | Boundary value analysis | Complete config, report frequency exactly `144` for 600-second minimum | Status `valid`, no confirmation, frequency unchanged | None |
| WS4-T2 | Boundary/negative | Blank friendly name and report frequency `0` | Name defaults to `Sensor`, frequency raised to `1`, adjusted status | None |
| WS4-T3 | Boundary value analysis | Report frequency `145` with 600-second controller minimum | Frequency clamped to `144` | None |
| WS4-T4 | Negative dependency-like config | Controller capability minimum interval `0`, report frequency `289` | Fallback interval `300` seconds used, max `288` | None |
| WS4-T5 | Negative state | Incomplete context and calibration status `overdue` | Confirmation required, context/calibration rules recorded | None |

* Number of tests written: 5
* Number passing: 5
* Coverage result: 76.9% for targeted workstream run; 91.7% in backend full coverage profile.
* Review gap: Recommendation-rule normalization and AgriAssist alert appending are still mostly covered by existing integration-style backend tests, not this isolated workstream.
* Final status: Passing.

## Full Test-Suite Results

Backend full suite:

* Command: `go test ./...`
* Result: Passed.
* Summary: backend command reported all packages passing or no test files, including `spectron-backend/internal/httpapi`.

Frontend full suite:

* Command: `npm test -- --run`
* Result: Passed after updating stale frontend UI test expectations for the current two-step sensor configuration flow and controller dashboard labels.
* Summary: Vitest reported `13 passed` test files and `50 passed` tests.

Coverage:

* Command: `go test ./... -coverprofile .\coverage.out`
* Result: Passed for backend.
* Backend coverage highlights: `internal/httpapi` package coverage `16.6%`; full profile total `17.7%`.
* Selected function coverage in full backend profile: `inferUseCaseAndProfile` 62.5%, `metricSpecsForUseCase` 100.0%, `validateThreshold` 100.0%, `validateAndFinalizeConfig` 91.7%.

## Continuous Integration

* Workflow path: `.github/workflows/tests.yml`
* Trigger conditions: every `push` and every `pull_request`
* Runtime version: Go from `backend/go.mod`; Node.js 22
* Dependency-installation command: `go mod download` and `npm ci`
* Test command: `go test ./...` and `npm test -- --run`
* Expected GitHub Actions behavior: CI checks out the repo, restores Go/npm caches, installs dependencies from lock/module files, runs backend tests, then runs frontend tests. The workflow passes only when both suites pass.
* YAML validation: Parsed successfully with `node -e "const fs=require('fs'); const yaml=require('./frontend/web/node_modules/js-yaml'); yaml.load(fs.readFileSync('.github/workflows/tests.yml','utf8')); console.log('YAML syntax OK')"`
* GitHub confirmation after pushing: open the repository on GitHub, go to the Actions tab, choose the `Tests` workflow run for the pushed branch or pull request, and inspect the backend/frontend test steps.
* `[Insert GitHub Actions workflow screenshot here]`

## Self-Review Findings

| Workstream | Function | Potential missed case | Action taken | Remaining risk |
| ---------- | -------- | --------------------- | ------------ | -------------- |
| 1 | `inferUseCaseAndProfile` | Unknown sensor type with incompatible dual-climate profile | Outside current focused set; default path remains indirectly exercised by finalization | Unknown sensor fallback rules could regress without a direct test |
| 2 | `metricSpecsForUseCase` | Explicit occupancy metric mapping | Existing `validateAndFinalizeConfig` test covers occupancy output; no extra test added | Direct mapping assertion for occupancy could be added later |
| 3 | `validateThreshold` | NaN or infinity threshold inputs | Documented as outside current unit scope because production code has no explicit invalid-number policy | Non-finite values may pass through unexpectedly |
| 4 | `validateAndFinalizeConfig` | Recommendation rules merged into generated alerts | Existing `agriassist_test.go` covers AgriAssist recommendation behavior; no duplicate added | Complex recommendation combinations remain higher-risk |

## Trello Tasks

* Design Test Cases
* Write Unit Tests — Workstream 1
* Write Unit Tests — Workstream 2
* Write Unit Tests — Workstream 3
* Write Unit Tests — Workstream 4
* Set Up CI Workflow
* Run Full Test Suite
* Peer-Style Test Review
* Prepare Week 6 PDF
* Upload Week 6 Submission

## Submission Checklist

* [x] Four critical functions selected
* [x] Equivalence partitioning documented
* [x] Boundary value analysis documented
* [x] Negative cases documented
* [x] Dependencies mocked
* [x] All new tests run
* [x] Full suite run
* [x] GitHub Actions workflow added
* [ ] Workflow screenshot captured
* [x] Review gaps documented
* [ ] Contributor details updated
* [ ] PDF created
* [ ] Filename changed to `CO328_GroupNumber_Week6.pdf`
* [ ] PDF uploaded to the LMS
* [ ] Trello board updated
