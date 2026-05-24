const simpleIcon = (slug, color) => `https://cdn.simpleicons.org/${slug}/${color}`;

export const softwareViews = [
  {
    id: "dashboard",
    label: "Dashboard",
    eyebrow: "software/frontend/web",
    title: "React dashboard for controller owners and system administrators",
    text:
      "The web application is a React 18 + TypeScript dashboard with protected user routes, a separate admin area, controller pairing, sensor configuration, monitoring, alerts, and profile management.",
    features: [
      {
        title: "Role-aware application routing",
        text:
          "User routes and admin routes are separated in App.tsx with PrivateRoute and AdminRoute guards.",
      },
      {
        title: "Controller pairing workflow",
        text:
          "Users can claim controllers, view owned systems, rename hardware, release devices, and manage paired sensors.",
      },
      {
        title: "Five-step sensor configuration",
        text:
          "The SensorConfig page guides users through sensor details, observable metric, visualization, alerts, and review.",
      },
      {
        title: "Operational views",
        text:
          "The app includes controller dashboards, monitoring, alerts, profile, team, and admin device/user/system screens.",
      },
    ],
    stats: [
      { label: "Frontend", value: "React 18 + TypeScript" },
      { label: "UI", value: "Material UI + Recharts" },
      { label: "Tests", value: "Vitest + Testing Library" },
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
    text: "Main dashboard frontend in software/frontend/web.",
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
    title: "Capacitor",
    text: "Mobile packaging path for the React dashboard.",
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
