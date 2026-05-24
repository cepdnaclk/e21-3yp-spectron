export const featureHighlights = [
  {
    id: "modular",
    title: "Modular Sensor Platform",
    text:
      "Use one reusable controller/base system with interchangeable sensor modules instead of rebuilding the full IoT device for every use case.",
    metric: "Reusable Core",
    tone: "hardware",
  },
  {
    id: "pairing",
    title: "Controller Pairing",
    text:
      "Users can claim controllers through the dashboard pairing flow, while admin tools support registered device management.",
    metric: "Owner Linked",
    tone: "frontend",
  },
  {
    id: "monitoring",
    title: "Live Monitoring",
    text:
      "The web dashboard shows controller status, connected sensors, recent readings, and operational health in one place.",
    metric: "Real-Time View",
    tone: "pipeline",
  },
  {
    id: "configuration",
    title: "Sensor Configuration",
    text:
      "Sensor setup includes purpose, thresholds, presentation profile, derived metrics, and hardware-specific configuration fields.",
    metric: "Per Sensor",
    tone: "research",
  },
  {
    id: "alerts",
    title: "Alerts & Acknowledgement",
    text:
      "Backend alert monitoring and dashboard alert screens help users identify abnormal readings and acknowledge events.",
    metric: "Audit Ready",
    tone: "backend",
  },
  {
    id: "ingestion",
    title: "Telemetry Ingestion",
    text:
      "Readings can enter through HTTP upload or MQTT, then move through Kafka processing into PostgreSQL storage.",
    metric: "HTTP + MQTT",
    tone: "storage",
  },
];

export const featureWorkflow = [
  "Attach or prepare a sensor module",
  "Pair the controller to a user account",
  "Configure sensor purpose and thresholds",
  "Monitor readings, alerts, and history",
];
