# Standard Sensor Derived Metrics

## Purpose

This document defines the Layer 2 catalog for the standard Spectron package.

The standard package assumes four supported physical sensor types:

- `temperature_humidity`
- `ultrasonic`
- `load`
- `gas_sensor`

Layer 1 is auto-discovered by the controller.
Because of that, the customer configuration flow should start from Layer 2:

1. choose the observed or derived metric
2. choose the business purpose
3. choose the presentation profile
4. review thresholds and alerts

The important rule is:

`raw sensor reading -> interpreted metric -> business purpose -> presentation`

## Metric Types

For the standard package, Layer 2 should treat these as valid customer-facing choices:

- `direct metrics`: pass-through readings such as temperature, humidity, weight, gas level, distance
- `operational derived metrics`: simple interpreted metrics such as fill level percentage or occupancy count
- `analytics derived metrics`: spike, rate-of-change, stability, exposure, or risk metrics that require historical or event logic

The configuration UI should focus on direct metrics and operational derived metrics first.
Analytics derived metrics should be documented and introduced only when the runtime pipeline is ready to compute them.

## Sensor Matrix

### 1. Temperature and Humidity Sensor

Physical sensor:

- type: `temperature_humidity`
- raw readings: `temperature`, `humidity`

Metrics suitable for the standard configuration flow now:

- `temperature`
  - meaning: direct ambient or process temperature
  - good purposes:
    - greenhouse temperature monitoring
    - room comfort monitoring
    - cold storage temperature monitoring
- `humidity`
  - meaning: direct relative humidity
  - good purposes:
    - greenhouse humidity monitoring
    - indoor moisture monitoring
    - storage humidity protection

Metrics that should be planned as analytics extensions:

- `temperature_spike`
  - meaning: sudden upward or downward temperature change in a short window
  - good purposes:
    - cold-chain spike detection
    - equipment overheating event detection
    - climate instability tracking
- `humidity_spike`
  - meaning: sudden humidity change
  - good purposes:
    - greenhouse misting anomaly detection
    - unexpected moisture event detection
- `heat_index`
  - meaning: perceived thermal stress from temperature and humidity together
  - good purposes:
    - human comfort monitoring
    - greenhouse heat stress monitoring
- `dew_point`
  - meaning: condensation risk signal derived from temperature and humidity
  - good purposes:
    - cold room condensation prevention
    - moisture-risk monitoring
- `climate_condition`
  - meaning: summarized state such as dry, stable, humid, hot, or cold
  - good purposes:
    - simple operator dashboards
    - traffic-light climate status

Recommended presentation profiles:

- `dual_climate` for paired temperature and humidity interpretation
- `single_trend` for one primary observed metric
- `event_timeline` later for spike-based analytics

### 2. Ultrasonic Sensor

Physical sensor:

- type: `ultrasonic`
- raw reading: `distance`

Metrics suitable for the standard configuration flow now:

- `distance`
  - meaning: direct measured distance
  - good purposes:
    - sensor diagnostics
    - clearance monitoring
    - proximity tracking
- `fill_level`
  - meaning: interpreted fill level percentage from distance
  - good purposes:
    - smart bin monitoring
    - water tank level monitoring
    - material storage level tracking
- `occupancy_count`
  - meaning: current people count inferred from the sensing setup
  - good purposes:
    - room occupancy monitoring
    - crowd zone monitoring
    - queue density tracking
- `attendance_count`
  - meaning: attendance or session presence count
  - good purposes:
    - classroom attendance tracking
    - event attendance monitoring
    - hall presence tracking

Metrics that should be planned as analytics extensions:

- `fill_rate`
  - meaning: rate at which the container is filling or emptying
  - good purposes:
    - collection planning
    - consumption forecasting
- `remaining_capacity_percent`
  - meaning: unused capacity derived from fill level
  - good purposes:
    - storage planning
    - service scheduling
- `occupancy_spike`
  - meaning: sudden increase in people count
  - good purposes:
    - crowd surge detection
    - entrance rush monitoring
- `peak_occupancy`
  - meaning: maximum observed occupancy in a window
  - good purposes:
    - utilization reporting
    - staffing decisions

Recommended presentation profiles:

- `level_monitoring` for fill level interpretation
- `counter_status` for occupancy or attendance counting
- `single_trend` for direct distance diagnostics
- `event_timeline` later for spike-heavy analytics

### 3. Load Sensor

Physical sensor:

- type: `load`
- raw reading: `weight`

Metrics suitable for the standard configuration flow now:

- `weight`
  - meaning: direct measured load
  - good purposes:
    - shelf load monitoring
    - payload weight monitoring
    - container weight tracking

Metrics that should be planned as analytics extensions:

- `utilization_percent`
  - meaning: percentage of allowed capacity currently in use
  - good purposes:
    - capacity monitoring
    - overload prevention
    - stock bay utilization tracking
- `load_change_rate`
  - meaning: speed at which weight increases or decreases
  - good purposes:
    - restock behavior monitoring
    - rapid load shift detection
- `overload_risk`
  - meaning: interpreted overload state or score
  - good purposes:
    - safety dashboards
    - preventive maintenance alerts
- `depletion_rate`
  - meaning: how quickly inventory weight is dropping
  - good purposes:
    - stock forecasting
    - refill planning

Recommended presentation profiles:

- `gauge_status` for direct load monitoring
- `single_trend` for weight history
- `event_timeline` later for overload events or rapid shifts

### 4. Gas Sensor

Physical sensor:

- type: `gas_sensor`
- raw reading: `gas_level`

Metrics suitable for the standard configuration flow now:

- `gas_level`
  - meaning: direct gas concentration reading
  - good purposes:
    - air safety baseline monitoring
    - enclosed space gas monitoring
    - ventilation effectiveness monitoring

Metrics that should be planned as analytics extensions:

- `gas_spike`
  - meaning: sudden gas increase over a short window
  - good purposes:
    - leak detection
    - abnormal event detection
- `risk_score`
  - meaning: normalized risk score derived from raw gas level and thresholds
  - good purposes:
    - operator safety dashboards
    - hazardous-zone risk tracking
- `exposure_state`
  - meaning: safe, caution, or critical state
  - good purposes:
    - traffic-light safety displays
    - evacuation or ventilation guidance
- `unsafe_duration`
  - meaning: time spent above a danger boundary
  - good purposes:
    - compliance monitoring
    - incident review

Recommended presentation profiles:

- `gauge_status` for safety-first live status
- `single_trend` for concentration history
- `event_timeline` later for leak or spike incidents

## What The Configuration Page Should Do

The standard configuration page should not ask the user to configure Layer 1.
Layer 1 is already discovered from hardware.

The page should start with:

1. detected sensor label
2. observed or derived metric selection
3. purpose selection for that metric
4. dashboard profile selection
5. thresholds for the chosen observed metric

The page should not start with:

- raw hardware setup forms
- sensor-type-specific template logic
- a generic use-case dropdown that hides the actual metric choice

## Recommended Standard Package Scope

### Supported in configuration now

- `temperature`
- `humidity`
- `distance`
- `fill_level`
- `occupancy_count`
- `attendance_count`
- `weight`
- `gas_level`

### Documented now, but better enabled after analytics support

- `temperature_spike`
- `humidity_spike`
- `heat_index`
- `dew_point`
- `climate_condition`
- `fill_rate`
- `remaining_capacity_percent`
- `occupancy_spike`
- `peak_occupancy`
- `utilization_percent`
- `load_change_rate`
- `overload_risk`
- `gas_spike`
- `risk_score`
- `exposure_state`
- `unsafe_duration`

## Decision Rule

When configuring a sensor:

- Layer 1 says what the controller discovered
- Layer 2 says what the customer wants to observe
- Layer 3 says how that observation is shown

That is the model the implementation should follow going forward.
