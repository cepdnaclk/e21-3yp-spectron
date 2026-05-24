export const hardwareFlow = [
  {
    step: "01",
    title: "Sensor module is prepared",
    text:
      "The packager writes a sensor profile and firmware image to the module flash chip.",
  },
  {
    step: "02",
    title: "Base board validates module",
    text:
      "The loader checks the module header, I2C settings, firmware size, and CRC before installing it.",
  },
  {
    step: "03",
    title: "Payload reads the sensor",
    text:
      "The SHT30 payload app reads temperature and humidity using the saved module metadata.",
  },
  {
    step: "04",
    title: "Controller uploads telemetry",
    text:
      "The controller receives ESP-NOW readings and sends them to the backend through the SIM800 data link.",
  },
];

export const hardwareModules = [
  {
    id: "controller",
    title: "Controller Gateway",
    source: "hardware/Spectron_Controller",
    text:
      "Acts as the main field gateway. It receives wireless sensor data, keeps a small registry of active bases, sends configuration acknowledgements, and uploads readings to the backend.",
    highlights: [
      "ESP-NOW communication with nearby sensor bases",
      "SIM800 PPP internet link for remote upload",
      "HTTP telemetry posting to the IoT upload endpoint",
    ],
    facts: [
      { label: "Device ID", value: "CTRL-REAL-001" },
      { label: "Upload period", value: "30 seconds" },
      { label: "Max bases", value: "8" },
    ],
  },
  {
    id: "loader",
    title: "Sensor Module Loader",
    source: "hardware/Spectron_Sensor_Module_Loader",
    text:
      "Runs on the base board when a sensor module is attached. It reads the external module flash, validates the module package, saves metadata, and installs the payload firmware into OTA storage.",
    highlights: [
      "SPI flash read path for plug-in modules",
      "CRC32 and module-header validation",
      "OTA install with NVS metadata storage",
    ],
    facts: [
      { label: "Flash header", value: "0x000000" },
      { label: "Payload start", value: "0x001000" },
      { label: "Max image", value: "0x140000" },
    ],
  },
  {
    id: "packager",
    title: "Sensor Module Packager",
    source: "hardware/Spectron_Sensor_Module_Packager",
    text:
      "Builds the removable sensor module image. It combines the embedded payload firmware with module settings such as sensor type, I2C pins, address, thresholds, and sample period.",
    highlights: [
      "Writes template.bin to external SPI flash",
      "Stores sensor identity and default settings",
      "Verifies the written header and payload",
    ],
    facts: [
      { label: "Sensor profile", value: "SHT30" },
      { label: "I2C address", value: "0x44" },
      { label: "Default sample", value: "5 seconds" },
    ],
  },
  {
    id: "payload",
    title: "SHT30 Sensor Payload",
    source: "hardware/Spectron_Sht30_PayloadApp",
    text:
      "Runs after the loader installs the module firmware. It reads temperature and humidity from the SHT30 sensor, applies thresholds, and sends readings to the controller over ESP-NOW.",
    highlights: [
      "Dynamic I2C pins and address from saved metadata",
      "Temperature and humidity alert flags",
      "ESP-NOW discovery, module info, and sensor-data frames",
    ],
    facts: [
      { label: "Sensor", value: "SHT30" },
      { label: "Runtime sample", value: "1 minute" },
      { label: "Wireless", value: "ESP-NOW" },
    ],
  },
];

export const hardwareCapabilities = [
  {
    title: "Reusable sensor base",
    text:
      "A common base board can accept packaged sensor modules instead of needing separate firmware for every deployment.",
  },
  {
    title: "Firmware safety checks",
    text:
      "Module headers, firmware size, supported sensor type, and CRC are checked before installation.",
  },
  {
    title: "Field-friendly connectivity",
    text:
      "ESP-NOW handles local device communication while the SIM800 link provides wide-area upload when Wi-Fi is unavailable.",
  },
  {
    title: "Configurable sensing",
    text:
      "Sensor ID, I2C pins, sample period, and alert thresholds are stored with the module and loaded at runtime.",
  },
];
