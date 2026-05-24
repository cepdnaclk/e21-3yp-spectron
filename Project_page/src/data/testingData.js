export const testingGroups = [
  {
    title: "Hardware Testing",
    icon: "chip",
    items: [
      {
        icon: "sensor",
        label: "Sensor module discovery and ESP32-C3 data acquisition",
        status: "Validated",
        tone: "success",
      },
      {
        icon: "wireless",
        label: "ESP-NOW communication between sensor nodes and gateway",
        status: "Validated",
        tone: "success",
      },
      {
        icon: "signal",
        label: "SIM module uplink and MQTT telemetry publishing reliability",
        status: "In Progress",
        tone: "progress",
      },
      {
        icon: "battery",
        label: "Battery backup, charging path, and voltage regulation checks",
        status: "In Progress",
        tone: "progress",
      },
    ],
  },
  {
    title: "Software Testing",
    icon: "code",
    items: [
      {
        icon: "api",
        label: "Go backend API tests for auth, controllers, sensors, and alerts",
        status: "Validated",
        tone: "success",
      },
      {
        icon: "pipeline",
        label: "Integration testing from MQTT bridge to Kafka consumer and database",
        status: "Validated",
        tone: "success",
      },
      {
        icon: "dashboard",
        label: "React dashboard routing, pairing, monitoring, and configuration tests",
        status: "Validated",
        tone: "success",
      },
      {
        icon: "load",
        label: "Load testing with 20+ simultaneous controller payload streams",
        status: "Validated",
        tone: "success",
      },
    ],
  },
];
