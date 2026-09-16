# AGENTS.md

## Product Priority

SPECTRON AgriAssist is now a final-product agriculture application, not a technical demo. The highest priority is excellent user experience for non-technical farmers.

Every change must protect these goals:

- Make the UI simple, calm, and farmer-friendly.
- Prefer short labels and clear actions over long explanatory text.
- Use `i` info buttons for explanations instead of filling screens with instructions.
- Design for Sinhala, Tamil, and English translation from the beginning.
- Make every workflow understandable without technical training.
- Validate data carefully in both frontend and backend.
- Do not expose hardware complexity unless the user needs it.

## UX And UI Rules

- Treat UX as a core requirement, not polish at the end.
- Build real workflows, not placeholder pages.
- Keep screens focused on one primary task.
- Use progressive disclosure: show advanced details only after the user asks.
- Use simple language such as Farm, Field, Crop, Sensor Base, Controller, Alerts, and Signal.
- Avoid technical wording such as topology, gateway mapping, assignment history, derived relationship, MQTT, Kafka, or device sequence in customer-facing UI.
- Put explanations behind small `i` buttons, tooltips, popovers, or help dialogs.
- Do not add large paragraphs inside normal app screens.
- Use clear empty states with one obvious next action.
- Use visual status indicators: Good, Needs attention, Offline, Waiting setup.
- Keep Owner and Viewer screens visually consistent; hide write controls for Viewers.
- Admin UI must remain separate from the customer farm app.

## Data Validation Rules

All important validation must exist on the backend even if the frontend also validates it.

Validate:

- Required fields.
- Field lengths.
- Email format.
- Password rules.
- Farm ownership and access.
- Viewer invitation eligibility.
- Admin exclusion from farm access.
- Sensor Base assignment state.
- Crop setup values.
- Growth-stage confirmation.
- Sensor reading timestamps.
- Sensor reading ranges and units.
- Offline upload idempotency.
- Wi-Fi/connectivity commands and secrets.

Frontend validation should be friendly and immediate. Backend validation should be authoritative and return clear errors.

## Updated Architecture Facts

Do not forget these architecture rules:

- Controllers belong to Farms, not directly to Fields.
- Sensor Bases connect Controllers to Fields.
- One Controller can serve Sensor Bases across several Fields.
- One Field can use Sensor Bases connected through several Controllers.
- Controller-to-Field relationships are derived from active Sensor Base assignments.
- Sensor Base movement must preserve historical Field assignments.
- One physical Sensor Module can expose multiple Sensor Channels, such as temperature and humidity.
- Sensor Readings belong to Sensor Channels.
- Growth stages are estimated automatically.
- Farmers only confirm or correct growth stages when necessary through a simple visual flow.

## Role And Security Rules

User categories are strict and mutually exclusive:

- SPECTRON Admin: internal platform user only.
- Farm Owner: customer with full control of their Farms.
- Viewer: invited read-only customer-side account.

Security rules:

- Admins cannot be Farm Owners.
- Admins cannot be Viewers.
- Admin accounts cannot appear in farm-access records.
- Admin access to customer farm information is denied by default.
- Farm access must be resolved from active farm-access records on each request.
- Viewer revocation must take effect immediately.
- Hiding UI controls is not enough; write APIs must return `403` for Viewers.
- Wi-Fi passwords are write-only and must never be returned by APIs, stored as plaintext, logged, or exposed to Viewers.

## Frontend Product Direction

The customer app should be farm-first:

- Dashboard
- My Farms
- Farm Details
- Field Details
- Crop Health
- AI Advisor
- Weather
- Hardware
- Alerts
- Manage Access
- Profile/Settings

Hardware setup should be wizard-based:

1. Create or select Farm.
2. Create Fields.
3. Add Controller to Farm.
4. Optionally configure Wi-Fi.
5. Discover or add Sensor Bases.
6. Assign Sensor Bases to Fields.
7. Detect Sensor Modules and Channels.
8. Verify readings.

## Backend Product Direction

Prefer append-only migrations and keep compatibility with existing data where practical.

Core backend areas:

- Farm and Field services.
- Farm access and invitation service.
- Crop and automatic growth-stage service.
- Farm-level Hardware service.
- Sensor Base assignment history.
- Multi-channel sensor ingestion.
- Farm-scoped Alert service with per-recipient read/dismiss state.
- Connectivity status and provisioning audit.
- Strict customer/Admin separation.

## Testing Requirements

Add or update tests when touching user access, farm data, hardware assignment, alerts, or ingestion.

Important test cases:

- Admin denied from farm APIs.
- Admin rejected from farm access.
- Owner creates Farm and Fields.
- Controller is assigned to Farm, not Field.
- One Controller serves Sensor Bases in multiple Fields.
- One Field receives Sensor Bases through multiple Controllers.
- Sensor Base move preserves historical reading context.
- Multi-channel Sensor Module ingestion works.
- Growth stage is estimated automatically and can be confirmed.
- Viewer can read but cannot write.
- Revoked Viewer receives `403`.
- Alert is created and fanned out to Owner and Viewers.
- Alert read/dismiss state is per recipient.
- Offline uploads do not create duplicate readings.

## Final Reminder

When making product decisions, choose the path that makes the farmer's job easier. Technical correctness matters, but the final product must feel simple, trustworthy, and pleasant to use.
