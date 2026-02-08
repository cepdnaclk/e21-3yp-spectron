export const architectureScenarios = [
  {
    id: "discovery",
    label: "Discovery / Sensor Identification",
    short: "Provision and verify new devices.",
    summary:
      "New sensors are discovered, provisioned, and assigned secure identities before joining the network.",
    details: [
      "Claim devices with a secure pairing workflow.",
      "Register inventory metadata and site location.",
      "Run baseline health checks before telemetry starts.",
    ],
    relatedNodes: ["device", "mqtt", "broker"],
    tooltip: "Onboarding flow for new sensors.",
    tags: ["Onboarding", "Identity", "Provisioning"],
  },
  {
    id: "telemetry",
    label: "Telemetry",
    short: "Secure streaming for real-time data.",
    summary:
      "Sensors publish measurements through encrypted channels to storage, analytics, and dashboards.",
    details: [
      "Publish MQTT telemetry with QoS controls.",
      "Stream events to analytics services via Kafka.",
      "Persist data for dashboards and reporting.",
    ],
    relatedNodes: [
      "device",
      "mqtt",
      "broker",
      "kafka",
      "services",
      "database",
      "dashboard",
    ],
    tooltip: "Continuous data pipeline for live monitoring.",
    tags: ["Telemetry", "Streaming", "Analytics"],
  },
  {
    id: "commands",
    label: "Commands / Configuration",
    short: "Push updates back to the edge.",
    summary:
      "Operators send configuration changes and commands to devices with acknowledgements.",
    details: [
      "Validate and authorize outbound commands.",
      "Deliver configuration updates through secure topics.",
      "Track acknowledgements for audit trails.",
    ],
    relatedNodes: [
      "dashboard",
      "services",
      "kafka",
      "broker",
      "mqtt",
      "device",
    ],
    tooltip: "Bi-directional control and configuration flow.",
    tags: ["Control", "Configuration", "Security"],
  },
];

export const architectureFlow = [
  {
    id: "device",
    label: "Device",
    title: "Device",
    summary:
      "Sensor nodes collect signals, run local filtering, and package telemetry payloads.",
    details: [
      "Unique device identity and secure keys.",
      "Local buffering for intermittent connectivity.",
      "Power-aware sampling for long deployments.",
    ],
    tooltip: "Edge device that captures sensor data.",
    tags: ["Edge", "Identity", "Low Power"],
  },
  {
    id: "mqtt",
    label: "MQTT (TLS)",
    title: "MQTT with TLS",
    summary:
      "Telemetry is published over MQTT with TLS encryption for data in transit.",
    details: [
      "Lightweight publish/subscribe messaging.",
      "QoS levels balance reliability and bandwidth.",
      "TLS encrypts device-to-broker traffic.",
    ],
    tooltip: "Lightweight messaging with encrypted transport.",
    tags: ["Pub/Sub", "TLS", "Telemetry"],
  },
  {
    id: "broker",
    label: "MQTT Broker",
    title: "MQTT Broker",
    summary:
      "The broker authenticates devices and routes topics to downstream systems.",
    details: [
      "Client authentication and access control.",
      "Topic routing and fan-out delivery.",
      "Backpressure handling for peak loads.",
    ],
    tooltip: "Routes MQTT topics to the right services.",
    tags: ["Routing", "Auth", "Scaling"],
  },
  {
    id: "kafka",
    label: "Kafka (mTLS)",
    title: "Kafka with mTLS",
    summary:
      "Events are streamed to Kafka with mutual TLS between services.",
    details: [
      "Durable event log for replay and audit.",
      "mTLS authenticates both producer and consumer.",
      "Partitioning enables horizontal scale.",
    ],
    tooltip: "Event streaming with mutual authentication.",
    tags: ["Event Streaming", "mTLS", "Durable"],
  },
  {
    id: "services",
    label: "Backend Services",
    title: "Backend Services",
    summary:
      "Services validate payloads, enrich metadata, and apply business rules.",
    details: [
      "Validation, normalization, and enrichment.",
      "Rules engine for alerts and automation.",
      "Command orchestration and device control.",
    ],
    tooltip: "Processing layer for IoT workloads.",
    tags: ["Processing", "Rules", "Automation"],
  },
  {
    id: "database",
    label: "Database",
    title: "Database",
    summary:
      "Time-series and relational storage support analytics and audit.",
    details: [
      "Hot and warm storage tiers.",
      "Retention policies for cost control.",
      "Indexed queries for dashboards.",
    ],
    tooltip: "Persistent storage for telemetry and events.",
    tags: ["Storage", "Analytics", "Retention"],
  },
  {
    id: "dashboard",
    label: "Dashboard / Mobile App",
    title: "Dashboard and Mobile App",
    summary:
      "Operators monitor health, configure devices, and view analytics in real time.",
    details: [
      "Role-based access for teams.",
      "Alerts, notifications, and SLA tracking.",
      "Command panels for device actions.",
    ],
    tooltip: "User interface for monitoring and control.",
    tags: ["UI", "Monitoring", "Control"],
  },
];
