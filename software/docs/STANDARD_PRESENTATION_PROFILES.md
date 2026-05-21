# Standard Presentation Profiles

## Purpose

This document defines the standard Layer 3 and Layer 4 behavior for the Spectron package.

The model is:

`Layer 2 metric -> Layer 3 presentation profile -> Layer 4 settings`

Layer 3 decides how the observation is represented.
Layer 4 decides which alert families and reporting settings are configurable for that representation.

In the UI, Layer 3 should be presented as a visualization choice first.
The stored `presentation profile` is the implementation detail behind that choice.

The current implementation stores four explicit Layer 3 presentation choices:

- `headline_metric`
- `status_mode`
- `comparison_mode`
- `detail_mode`

These let the same profile behave differently depending on the observed metric and customer goal.

## Standard Profiles

### `single_trend`

Visualization method:

- latest value + line trend

Best for:

- direct temperature
- direct humidity
- direct distance diagnostics
- direct weight
- direct gas level

Representation:

- primary widget: `trend`
- secondary widgets: `status`
- chart style: `line`

Typical alert families:

- one lower-band alert, when the metric needs a minimum
- one upper-band alert, when the metric needs a maximum

### `dual_climate`

Visualization method:

- paired values + area trend

Best for:

- temperature and humidity sensors where both readings matter together

Representation:

- primary widget: `dual_stat`
- secondary widgets: `trend`, `status`
- chart style: `area`

Typical alert families:

- `Temperature Too Low`
- `Temperature Too High`
- `Humidity Too Low`
- `Humidity Too High`

### `level_monitoring`

Visualization method:

- gauge + recent trend

Best for:

- ultrasonic fill-level monitoring

Representation:

- primary widget: `gauge`
- secondary widgets: `trend`, `status`
- chart style: `line`

Typical alert families:

- `Pickup / Refill Alert`

This family uses:

- warning threshold for service soon
- critical threshold for urgent service

### `counter_status`

Visualization method:

- live count + bar trend

Best for:

- occupancy count
- attendance count

Representation:

- primary widget: `counter`
- secondary widgets: `status`, `trend`
- chart style: `bar`

Typical alert families:

- `High Occupancy Alert` for occupancy
- `Low Attendance Alert` for attendance

### `gauge_status`

Visualization method:

- gauge + status band

Best for:

- load monitoring
- gas safety monitoring
- some fill-level use cases that prefer status-first dashboards

Representation:

- primary widget: `gauge`
- secondary widgets: `status`, `trend`
- chart style: `line`

Typical alert families:

- `Load Capacity Alert`
- `Safety Exposure Alert`
- `Level Capacity Alert`

### `event_timeline`

Visualization method:

- event timeline + status

Best for:

- event-heavy monitoring where threshold crossings matter more than smooth trends

Representation:

- primary widget: `timeline`
- secondary widgets: `status`
- chart style: `timeline`

Typical alert families:

- one event threshold family for the chosen metric

## Settings Layer

The standard settings layer has two parts:

1. semantic alert families
2. reporting and power settings

Each alert family should expose:

- a warning threshold
- an optional critical threshold

Each alert family maps to the runtime threshold model like this:

- `below` family:
  - warning threshold -> `min`
  - critical threshold -> `warning_min`
- `above` family:
  - warning threshold -> `max`
  - critical threshold -> `warning_max`

This lets the customer use semantic settings in the UI while the backend runtime keeps using the existing threshold processor safely.

## Current Standard Mapping

- `temperature` -> `single_trend` or `dual_climate`
- `humidity` -> `single_trend` or `dual_climate`
- `distance` -> `single_trend` or `event_timeline`
- `fill_level` -> `level_monitoring`, `gauge_status`, or `single_trend`
- `occupancy_count` -> `counter_status`, `event_timeline`, or `single_trend`
- `attendance_count` -> `counter_status`, `event_timeline`, or `single_trend`
- `weight` -> `gauge_status` or `single_trend`
- `gas_level` -> `gauge_status`, `single_trend`, or `event_timeline`

## Visualization Rationale

The current system already supports these dashboard patterns in the live monitoring UI:

- line or area trend views for time-series behavior
- gauge-led views for threshold-oriented single values
- bar-style views for count comparison
- timeline-style views for event-heavy metrics

This matches common observability guidance:

- time series for values changing over time
- gauges for latest value against a range
- bar charts for comparing discrete counts or grouped values

So Layer 3 should expose only these supported visualization methods instead of generic chart choices that the runtime cannot render consistently.

## Implementation Rule

The configuration page should now work like this:

1. Layer 1 stays hidden because hardware is auto-discovered
2. Layer 2 chooses the observed metric and monitoring purpose
3. Layer 3 chooses the presentation profile
4. Layer 3 also chooses profile configuration such as headline metric, status framing, comparison mode, and supporting detail
5. Layer 4 configures semantic alert families and reporting settings

That is the standard package behavior going forward.
