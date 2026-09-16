# SPECTRON SHT30 Sensor App

SHT30 at 0x44/0x45; temperature + humidity.

## Wiring
- SDA GPIO6
- SCL GPIO7
- Sensor LED GPIO4
- Data-send LED GPIO5

## Sampling
Default is **60,000 ms (1 minute)**. CONFIG_SET can change it and the value is persisted in the app-specific NVS namespace `sht30_cfg`.

## Build
```bash
idf.py set-target esp32c3
idf.py build
idf.py -p <PORT> flash monitor
```

This project includes the same packed `protocol.h` used by the current SPECTRON controller.
