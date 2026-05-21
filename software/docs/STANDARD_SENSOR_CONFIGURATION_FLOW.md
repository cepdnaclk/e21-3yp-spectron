# Standard Sensor Configuration Flow

## Purpose

This document explains the customer-facing sensor configuration flow used by the standard Spectron package.

It is the practical implementation guide for the layered model:

`discovered physical sensor -> observed metric -> visualization method -> settings -> final preview`

This document is meant to be easier to follow than the code and should help future design, backend, and frontend changes stay aligned.

## Why This Flow Exists

The main goal of this configuration model is customer freedom without exposing unnecessary hardware complexity.

We already know the physical sensor from the controller.
So the customer should not begin by configuring raw hardware.
Instead, the customer should decide:

1. what they want to observe
2. how they want to see it
3. what thresholds and alerts should apply
4. whether the final result looks correct before activation

That is why the page now uses a short step-by-step wizard instead of one long form.

The standard wizard order is:

1. `About Sensor`
2. `Observable Metric`
3. `Visualization`
4. `Alerts`
5. `Review`

## Layer Model

### Layer 1: Physical Sensor

Layer 1 is auto-discovered.
The customer does not configure it.

Step 1, `About Sensor`, shows these facts as read-only:

- module or sensor name
- sensor family
- what the module can measure
- readable range
- accuracy
- common physical use cases

This information exists to anchor the rest of the configuration in real hardware capability.

Examples:

- SHT30: temperature and humidity
- VL53L0X: distance
- load sensor: weight
- gas sensor: gas concentration

### Layer 2: Observation Design

Step 2, `Observable Metric`, is the main customer decision.

The customer chooses:

1. the observable metric
2. the monitoring purpose

The observable metric can be:

- a direct reading
- an operational derived metric
- a planned analytics metric

Examples:

- direct: `temperature`, `humidity`, `distance`, `weight`, `gas_level`
- operational derived: `fill_level`, `occupancy_count`, `attendance_count`
- planned analytics: `heat_index`, `dew_point`, `fill_rate`, `risk_score`

Important rule:

The UI can show both supported metrics and planned metrics.
But planned analytics metrics are previewable only until the runtime derivation engine exists.

So:

- `supported_now` metrics can be selected and activated
- `planned_analytics` metrics can be selected for design review, but not activated

### Layer 3: Presentation

Step 3, `Visualization`, decides how the chosen metric will be represented in the dashboard.

In the UI, this should be shown as a visualization-method step first.
The saved presentation profile is the implementation detail behind that choice.

The customer chooses a presentation profile such as:

- `single_trend`
- `dual_climate`
- `level_monitoring`
- `counter_status`
- `gauge_status`
- `event_timeline`

The customer can also fine-tune presentation semantics:

- `headline_metric`
- `status_mode`
- `comparison_mode`
- `detail_mode`

This layer should answer:

- what should be most visible
- how health or urgency is framed
- what the live value is compared against
- what the supporting panel emphasizes

Examples of visualization methods supported by the current system:

- latest value + line trend
- paired values + area trend
- gauge + recent trend
- live count + bar trend
- event timeline + status

### Layer 4: Settings

Step 4, `Alerts`, defines behavior.

For now, the main focus is semantic alert settings.
These settings depend on both:

- the selected observable metric
- the selected presentation profile

Examples:

- `Temperature Too High`
- `Temperature Too Low`
- `Pickup / Refill Alert`
- `High Occupancy Alert`
- `Heavy Load Alert`
- `Gas Incident Alert`

Each alert family can expose one or more thresholds, such as:

- warning threshold
- critical threshold

The settings layer also includes operational reporting choices:

- reading flow type
- reports per day
- estimated battery life

## Final Preview

Step 5, `Review`, ends with a final preview section.

The preview is important because the customer is making layered decisions across several sections.
Before activation, they should see the combined result in one place.

The preview should summarize:

### 1. Sensor Summary

- module name
- what it measures
- readable range
- accuracy

### 2. Observation Summary

- selected observable metric
- whether it is direct, derived, or planned analytics
- selected purpose
- source metrics
- derivation rule when relevant

### 3. Dashboard Preview

- example headline value
- sample recent readings
- sample trend data
- selected presentation profile
- selected status framing
- selected comparison mode
- selected supporting detail
- visible metrics
- primary and secondary widgets

This is a mock representation, not live sensor data.
Its purpose is configuration review.
The preview should look close enough to a real dashboard card that the customer can understand the final outcome before activation.

### 4. Alert Preview

- semantic alert family names
- alert direction
- warning threshold preview
- critical threshold preview

### 5. Operational Summary

- reading flow type
- reports per day
- estimated battery life

## Planned Analytics Rule

Planned analytics metrics are part of the observation model and should stay visible in the UI.
That helps users understand the future capability of the system.

But until runtime derivation is implemented, they should behave like this:

- selectable for design preview
- usable in the final preview
- not activatable on save

The UI should clearly say this to avoid confusion.

## What Gets Saved

At a high level, the saved configuration should keep these layers distinct:

```json
{
  "hardware": {
    "config": {
      "readingFlowType": "CONSTANT_PER_DAY"
    }
  },
  "interpretation": {
    "use_case": "fill_level_monitoring",
    "primary_metric": "fill_level",
    "purpose": "Smart bin monitoring",
    "derived_metrics": [],
    "metric_thresholds": {}
  },
  "presentation": {
    "profile": "level_monitoring",
    "headline_metric": "fill_level",
    "status_mode": "service_risk",
    "comparison_mode": "capacity_band",
    "detail_mode": "recent_trend"
  },
  "settings": {
    "alerts": []
  },
  "operational": {
    "reading_flow_type": "CONSTANT_PER_DAY",
    "report_interval_per_day": 24
  }
}
```

The exact payload can evolve, but the separation of concerns should remain.

## Current Implementation Notes

The current standard flow is designed around these rules:

- Layer 1 is shown but not configured
- Layer 2 is the first real customer choice
- Layer 3 depends on the selected metric, not directly on hardware type
- Layer 4 uses semantic alert families
- the page ends with a combined preview

The runtime pipeline still does not execute every planned analytics metric.
That is why preview-only behavior exists.

## Related Documents

- [THREE_LAYER_DASHBOARD_MODEL.md](./THREE_LAYER_DASHBOARD_MODEL.md)
- [STANDARD_SENSOR_DERIVED_METRICS.md](./STANDARD_SENSOR_DERIVED_METRICS.md)
- [STANDARD_PRESENTATION_PROFILES.md](./STANDARD_PRESENTATION_PROFILES.md)
