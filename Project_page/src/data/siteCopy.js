export const siteCopy = {
  en: {
    nav: {
      home: "Home",
      overview: "Overview",
      features: "Features",
      architecture: "Architecture",
      hardware: "Hardware",
      software: "Software",
      testing: "Testing",
      budget: "Budget",
      team: "Team",
    },
    toggles: {
      theme: {
        toDark: "Dark",
        toLight: "Light",
      },
    },
    hero: {
      eyebrow: "Standardized Modular IoT Adapter Kit",
      title: "SPECTRON",
      text:
        "One reusable device core for multiple sensing applications. Attach different sensor modules, configure behavior in the dashboard, and deploy secure monitoring without rebuilding the full system.",
      primaryCta: "Explore Architecture",
      secondaryCta: "Meet the Team",
      highlightsTitle: "Reusable Adapter Core",
      highlights: [
        "Swappable sensor interfaces",
        "ESP32 edge gateway",
        "MQTT telemetry pipeline",
        "Live dashboard delivery",
      ],
    },
    overview: {
      title: "Project Overview",
      subtitle:
        "The system is designed to be modular, reliable, and easy to maintain, with clear separation between hardware, firmware, and the web dashboard.",
      cards: [
        {
          title: "Modular Hardware",
          text:
            "Plug-and-play sensor boards with standardized connectors for rapid field replacements.",
        },
        {
          title: "Smart Firmware",
          text:
            "Lightweight firmware stack handling data acquisition and resilient connectivity.",
        },
        {
          title: "Central Dashboard",
          text:
            "Web interface for monitoring, analytics, and remote configuration.",
        },
      ],
    },
    features: {
      eyebrow: "Core Features",
      title: "Features built around real SPECTRON workflows",
      subtitle:
        "The platform covers the full path from modular sensor setup to controller ownership, live readings, alerts, and stored telemetry.",
      workflowEyebrow: "How users move through the system",
      workflowTitle: "A simple flow from hardware setup to dashboard insight",
    },
    architecture: {
      title: "Solution Architecture",
      subtitle:
        "The updated architecture shows the full path from sensor nodes to backend services, API gateway, and React applications.",
      panelTitle: "Explanation Panel",
      panelEmpty:
        "Select an architecture view above to view its details. Use Reset View to clear the selection.",
      badges: {
        scenario: "Scenario",
        flow: "Architecture Block",
      },
      resetLabel: "Reset View",
      modesTitle: "Architecture View",
      flowTitle: "End-to-End IoT Solution",
      diagramLabel: "Spectron solution architecture diagram",
      diagramDescription:
        "Sensor and ESP32-C3 nodes communicate over ESP-NOW to an ESP32 gateway, then through a SIM module, MQTT broker, Kafka streaming layer, backend services, API gateway, and React applications.",
      diagramImageAlt:
        "Spectron solution architecture showing sensor nodes, ESP32 gateway, SIM module, MQTT broker, Kafka, backend services, API gateway, and React applications.",
    },
    hardware: {
      title: "Hardware",
      subtitle:
        "The hardware layer combines a controller gateway, removable sensor modules, firmware packaging, OTA loading, and an SHT30 payload app for real temperature and humidity sensing.",
      flowEyebrow: "Device workflow",
      flowTitle: "From packaged sensor module to uploaded telemetry",
      summaryEyebrow: "What the boards provide",
      summaryTitle: "A modular ESP32 hardware system for field sensing",
      summaryText:
        "SPECTRON separates the controller gateway from the sensor module firmware path. This keeps the core hardware reusable while allowing each sensor module to carry its own identity, configuration, and payload firmware.",
    },
    software: {
      title: "Software",
      subtitle:
        "The SPECTRON codebase combines a React dashboard, Go API services, MQTT/Kafka ingestion, PostgreSQL storage, and admin tooling for real controller and sensor operations.",
    },
    testing: {
      title: "Testing",
      subtitle:
        "SPECTRON is tested across hardware, connectivity, backend services, and the React dashboard to verify reliability, data integrity, and field readiness.",
    },
    budget: {
      eyebrow: "Cost Breakdown",
      title: "Project Budget",
      subtitle:
        "The project budget tracks the hardware modules, power components, 3D printing, hosting, and miscellaneous costs required for the Spectron prototype.",
      totalLabel: "Estimated Budget",
      totalValue: "Rs20,481.00",
      totalTableValue: "20,481.00",
      tableLabel: "Spectron project budget table",
    },
    team: {
      title: "Our Team",
      subtitle:
        "A multidisciplinary team bringing together frontend, backend, hardware, and research expertise.",
      portfolioLabel: "CN eportfolio",
    },
    footer: {
      brand: "SPECTRON",
      tagline: "One reusable device core for multiple sensing applications.",
      quickLinksTitle: "Quick Links",
      contactTitle: "Contact Us",
      contact: {
        address:
          "Department of Computer Engineering, Faculty of Engineering, University of Peradeniya",
        email: "spectron@eng.pdn.ac.lk",
      },
      copyright: "© 2026 Spectron — All Rights Reserved",
    },
  },
};
