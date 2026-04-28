export const siteCopy = {
  en: {
    nav: {
      home: "Home",
      overview: "Overview",
      architecture: "Architecture",
      tech: "Tech",
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
    tech: {
      title: "Technology Stack",
      subtitle:
        "A balanced, production-ready stack chosen for reliability and long-term maintainability.",
      pills: [
        "React Native",
        "Go",
        "ESP32",
        "MQTT",
        "PostgreSQL",
        "Time-Series Storage",
      ],
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
