const simpleIcon = (slug, color) => `https://cdn.simpleicons.org/${slug}/${color}`;

export const softwareViews = [
  {
    id: "dashboard",
    label: "Web & Mobile",
    eyebrow: "User applications",
    title: "Web dashboard and mobile sensor configuration app",
    text:
      "SPECTRON includes two user-facing apps: a web dashboard for day-to-day monitoring and administration, and a mobile app screen for configuring sensors during setup or field work.",
    features: [
      {
        title: "Web dashboard for users",
        text:
          "Owners and operators can sign in, pair controllers, view connected sensors, monitor readings, configure sensors, and manage alerts from the browser.",
      },
      {
        title: "Admin web area",
        text:
          "Administrators get separate screens for device registration, QR-based pairing support, users, system health, and device operations.",
      },
      {
        title: "Mobile sensor setup",
        text:
          "The mobile app provides a focused sensor configuration flow with purpose entry, AI-assisted suggestions, thresholds, and battery-life settings.",
      },
      {
        title: "Same backend data",
        text:
          "Both apps communicate with the backend API for sensor data, saved configurations, controller ownership, and account permissions.",
      },
    ],
    stats: [
      { label: "Web App", value: "React 18 + TypeScript" },
      { label: "Mobile App", value: "React Native" },
      { label: "UI Systems", value: "Material UI + React Native Paper" },
    ],
  },
  {
    id: "backend",
    label: "Backend API",
    eyebrow: "software/backend",
    title: "Go API services for auth, controllers, sensors, alerts, and IoT ingest",
    text:
      "The backend is a Go 1.22 service using chi, pgx, JWT, and startup migrations. It exposes public auth and IoT endpoints plus protected owner/admin APIs.",
    features: [
      {
        title: "Authentication and account roles",
        text:
          "The API supports registration, login, admin login, email verification, profile updates, viewers, owners, and system admins.",
      },
      {
        title: "Controller and sensor APIs",
        text:
          "Routes cover pairing, owned controllers, systems, sensor lists, sensor configuration, rename/update, and release flows.",
      },
      {
        title: "Dashboard and alert endpoints",
        text:
          "The backend serves overview data, controller dashboards, sensor reading history, alert listing, and alert acknowledgement.",
      },
      {
        title: "Startup migrations",
        text:
          "Database migrations are applied from backend startup code so core schema changes stay versioned with the service.",
      },
    ],
    stats: [
      { label: "Language", value: "Go 1.22" },
      { label: "Router", value: "chi + CORS" },
      { label: "Database", value: "pgx + PostgreSQL" },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    eyebrow: "MQTT -> Kafka -> PostgreSQL",
    title: "Telemetry pipeline for modular IoT readings",
    text:
      "Device telemetry can enter through HTTP upload or MQTT. The MQTT bridge validates payloads, forwards raw readings to Kafka, and the consumer persists processed readings.",
    features: [
      {
        title: "MQTT bridge",
        text:
          "cmd/mqtt-bridge subscribes to configured topics, validates JSON payloads, supports TLS/mTLS, and publishes raw events to Kafka.",
      },
      {
        title: "Kafka event backbone",
        text:
          "Raw readings are published to the spectron.raw-readings topic and consumed with a configured consumer group.",
      },
      {
        title: "Readings processor",
        text:
          "cmd/readings-consumer processes events, upserts controllers and sensors, writes readings, and commits Kafka offsets.",
      },
      {
        title: "Time-series persistence",
        text:
          "PostgreSQL stores users, controllers, sensors, configs, alerts, and sensor_readings with optional TimescaleDB hypertables.",
      },
    ],
    stats: [
      { label: "Broker", value: "MQTT" },
      { label: "Stream", value: "Apache Kafka" },
      { label: "Storage", value: "PostgreSQL / TimescaleDB" },
    ],
  },
];

export const softwareTechCards = [
  {
    title: "React 18 + TypeScript",
    text: "Browser dashboard for monitoring, pairing, alerts, and admin views.",
    tone: "frontend",
    logos: [
      { src: simpleIcon("react", "61DAFB"), alt: "React logo" },
      { src: simpleIcon("typescript", "3178C6"), alt: "TypeScript logo" },
    ],
  },
  {
    title: "Material UI + Recharts",
    text: "Component system and charting for operational views.",
    tone: "frontend",
    logos: [
      { src: simpleIcon("mui", "007FFF"), alt: "Material UI logo" },
      { label: "RC", alt: "Recharts charting library" },
    ],
  },
  {
    title: "React Native + Paper",
    text: "Mobile sensor setup interface for field configuration.",
    tone: "frontend",
    logos: [
      { src: simpleIcon("react", "61DAFB"), alt: "React Native logo" },
      { label: "RP", alt: "React Native Paper" },
    ],
  },
  {
    title: "Capacitor",
    text: "Optional mobile packaging path for the React web dashboard.",
    tone: "frontend",
    logos: [{ src: simpleIcon("capacitor", "119EFF"), alt: "Capacitor logo" }],
  },
  {
    title: "Go 1.22 + chi",
    text: "HTTP API, middleware, auth, and domain handlers.",
    tone: "backend",
    logos: [
      { src: simpleIcon("go", "00ADD8"), alt: "Go logo" },
      { label: "chi", alt: "chi router" },
    ],
  },
  {
    title: "PostgreSQL + TimescaleDB",
    text: "Relational data and time-series sensor readings.",
    tone: "storage",
    logos: [
      { src: simpleIcon("postgresql", "4169E1"), alt: "PostgreSQL logo" },
      { label: "TS", alt: "TimescaleDB" },
    ],
  },
  {
    title: "MQTT + Kafka",
    text: "IoT ingestion bridge and durable event stream.",
    tone: "pipeline",
    logos: [
      { src: simpleIcon("mqtt", "660066"), alt: "MQTT logo" },
      { src: simpleIcon("apachekafka", "231F20"), alt: "Apache Kafka logo" },
    ],
  },
  {
    title: "JWT + bcrypt",
    text: "Token auth and secure password hashing.",
    tone: "security",
    logos: [
      { src: simpleIcon("jsonwebtokens", "D63AFF"), alt: "JSON Web Tokens logo" },
      { label: "bc", alt: "bcrypt password hashing" },
    ],
  },
  {
    title: "Vitest",
    text: "Frontend tests for routes, pages, and API behavior.",
    tone: "testing",
    logos: [{ src: simpleIcon("vitest", "6E9F18"), alt: "Vitest logo" }],
  },
];
