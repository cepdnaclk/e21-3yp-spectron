export const architectureScenarios = [
  {
    id: "edge-telemetry",
    label: "Edge Telemetry",
    short: "Sensors send data through ESP-NOW and cellular uplink.",
    summary:
      "Sensor modules connect to ESP32-C3 boards, forward readings over ESP-NOW, and use the ESP32 gateway with a SIM module for uplink.",
    details: [
      "Sensor and ESP32-C3 nodes collect local measurements.",
      "ESP-NOW keeps the nearby device network lightweight.",
      "The ESP32 gateway and SIM module bridge field data to the cloud.",
    ],
    relatedNodes: ["sensor-node", "espnow", "edge-gateway", "sim-module"],
    tooltip: "Hardware path from sensors to the gateway.",
    tags: ["Sensors", "ESP32-C3", "ESP-NOW", "SIM"],
  },
  {
    id: "event-backbone",
    label: "Event Backbone",
    short: "MQTT and Kafka stream telemetry to services.",
    summary:
      "MQTT receives field messages and Kafka distributes them to processing, integration, automation, and storage workloads.",
    details: [
      "The MQTT broker accepts telemetry from the SIM-connected gateway.",
      "Kafka provides the central event streaming layer.",
      "Service lanes consume events independently for scale and resilience.",
    ],
    relatedNodes: [
      "mqtt-broker",
      "kafka-bus",
      "data-processing",
      "integration-service",
      "event-automation",
      "storage-services",
    ],
    tooltip: "Streaming and routing layer for telemetry events.",
    tags: ["MQTT", "Kafka", "Streaming", "Services"],
  },
  {
    id: "application-delivery",
    label: "Application Delivery",
    short: "APIs expose processed data to web and mobile clients.",
    summary:
      "Backend services expose synchronous APIs through the Go API gateway, which powers the React dashboard and mobile-facing experience.",
    details: [
      "Go services run in containers on Kubernetes.",
      "The API gateway gives clients one controlled entry point.",
      "React interfaces present live monitoring, analytics, and operational views.",
    ],
    relatedNodes: [
      "data-processing",
      "integration-service",
      "event-automation",
      "storage-services",
      "api-gateway",
      "dashboard-app",
    ],
    tooltip: "API and application layer for users.",
    tags: ["Go", "Kubernetes", "Docker", "React"],
  },
];

export const architectureFlow = [
  {
    id: "sensor-node",
    label: "Sensor + ESP32-C3",
    title: "Edge sensor node",
    summary:
      "Each field node combines a sensor with an ESP32-C3 controller to collect and prepare measurements near the source.",
    details: [
      "Captures raw sensor readings at the deployment location.",
      "Uses ESP32-C3 modules for compact, low-power local processing.",
      "Multiple nodes can report to the same local gateway.",
    ],
    tooltip: "Field sensor node with ESP32-C3 controller.",
    tags: ["Hardware", "Sensor", "ESP32-C3"],
  },
  {
    id: "espnow",
    label: "ESP-NOW",
    title: "Local wireless link",
    summary:
      "ESP-NOW moves readings from ESP32-C3 nodes to the gateway without needing a full Wi-Fi network.",
    details: [
      "Keeps nearby device communication lightweight.",
      "Reduces network setup complexity in field deployments.",
      "Supports low-latency messages between ESP devices.",
    ],
    tooltip: "Low-overhead wireless protocol between ESP devices.",
    tags: ["ESP-NOW", "Wireless", "Edge"],
  },
  {
    id: "edge-gateway",
    label: "ESP32 Gateway",
    title: "Gateway controller",
    summary:
      "The ESP32 gateway aggregates local sensor traffic and prepares it for cellular transmission through the SIM module.",
    details: [
      "Receives readings from multiple ESP32-C3 sensor nodes.",
      "Packages telemetry for broker ingestion.",
      "Acts as the edge bridge between local devices and cloud services.",
    ],
    tooltip: "Central ESP32 gateway for the local sensor network.",
    tags: ["ESP32", "Gateway", "Aggregation"],
  },
  {
    id: "sim-module",
    label: "SIM Module",
    title: "Cellular uplink",
    summary:
      "The SIM module gives the gateway internet connectivity when fixed Wi-Fi or Ethernet is unavailable.",
    details: [
      "Provides cellular backhaul for remote deployments.",
      "Carries MQTT messages from the gateway to the broker.",
      "Keeps the hardware architecture field-ready.",
    ],
    tooltip: "Cellular network module for gateway connectivity.",
    tags: ["SIM", "Cellular", "Connectivity"],
  },
  {
    id: "mqtt-broker",
    label: "MQTT Broker",
    title: "Telemetry broker",
    summary:
      "The MQTT broker receives gateway telemetry and routes publish/subscribe topics toward the event backbone.",
    details: [
      "Handles lightweight IoT messaging from the gateway.",
      "Separates device traffic from backend consumers.",
      "Feeds downstream streaming infrastructure.",
    ],
    tooltip: "MQTT broker that accepts telemetry messages.",
    tags: ["MQTT", "Broker", "Pub/Sub"],
  },
  {
    id: "kafka-bus",
    label: "Apache Kafka",
    title: "Data streaming",
    summary:
      "Apache Kafka acts as the durable event streaming backbone for telemetry and service integration.",
    details: [
      "Stores event streams for independent service consumption.",
      "Supports replay for processing and recovery workflows.",
      "Decouples ingestion from backend service workloads.",
    ],
    tooltip: "Kafka event streaming layer.",
    tags: ["Kafka", "Streaming", "Durable Events"],
  },
  {
    id: "data-processing",
    label: "Data Processing Service",
    title: "Processing workload",
    summary:
      "The data processing service normalizes, validates, and prepares telemetry for analytics and dashboards.",
    details: [
      "Consumes telemetry streams from Kafka.",
      "Applies validation, filtering, and transformation rules.",
      "Publishes clean data for downstream services.",
    ],
    tooltip: "Service responsible for cleaning and processing telemetry.",
    tags: ["Processing", "Kubernetes", "Docker"],
  },
  {
    id: "integration-service",
    label: "Integration Service",
    title: "System integration",
    summary:
      "The integration service connects streaming data with external systems and internal service contracts.",
    details: [
      "Bridges Kafka events to application workflows.",
      "Handles service-to-service data exchange.",
      "Keeps integrations isolated from device ingestion.",
    ],
    tooltip: "Service layer for integrating internal and external systems.",
    tags: ["Integration", "Services", "Cloud"],
  },
  {
    id: "event-automation",
    label: "Event Driven Automation",
    title: "Automation service",
    summary:
      "Event driven automation reacts to incoming telemetry and triggers operational workflows.",
    details: [
      "Runs rules against live telemetry events.",
      "Triggers alerts, actions, or follow-up processing.",
      "Supports real-time operational automation.",
    ],
    tooltip: "Automation service triggered by telemetry events.",
    tags: ["Automation", "Events", "Rules"],
  },
  {
    id: "storage-services",
    label: "Storage Services",
    title: "Data persistence",
    summary:
      "Storage services retain processed telemetry, events, and operational records for dashboards and reporting.",
    details: [
      "Stores processed telemetry and historical records.",
      "Supports queries from the API gateway and dashboards.",
      "Can use relational, time-series, or cloud storage backends.",
    ],
    tooltip: "Storage layer for telemetry and operational data.",
    tags: ["Storage", "PostgreSQL", "AWS"],
  },
  {
    id: "api-gateway",
    label: "API Gateway",
    title: "Go API gateway",
    summary:
      "The Go API gateway exposes backend capabilities through a controlled API layer for web and mobile clients.",
    details: [
      "Runs as containerized services on Kubernetes.",
      "Provides a single client-facing API boundary.",
      "Coordinates synchronous requests to backend services.",
    ],
    tooltip: "Go API gateway running with Kubernetes and Docker.",
    tags: ["Go", "API", "Kubernetes", "Docker"],
  },
  {
    id: "dashboard-app",
    label: "React Dashboard",
    title: "User applications",
    summary:
      "React-based web and mobile-facing interfaces show monitoring, analytics, alerts, and system state.",
    details: [
      "Displays live and historical telemetry.",
      "Gives users a clear operational dashboard.",
      "Consumes data through the API gateway.",
    ],
    tooltip: "React dashboard and application clients.",
    tags: ["React", "Dashboard", "Mobile"],
  },
];
