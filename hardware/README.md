# SPECTRON Hardware

This folder contains the ESP-IDF firmware, sensor module tools, and host-side simulation for the SPECTRON hardware system.

## Projects

| Project | Purpose | Target |
| --- | --- | --- |
| `Spectron_Controller` | Main controller. Connects sensor nodes over ESP-NOW and uploads data to the backend. | ESP32 |
| `SPECTRON_SHT30_App` | SHT30 temperature and humidity sensor node. | ESP32-C3 |
| `SPECTRON_BMX280_App` | BME280/BMP280 pressure sensor node. | ESP32-C3 |
| `Spectron_Sensor_Module_Loader` | Reads module metadata and installs payload firmware from external flash. | ESP32-C3 |
| `Spectron_Sensor_Module_Packager` | Writes a sensor module header and payload binary to external flash. | ESP32-C3 |
| `simulation` | Dependency-free host simulation and protocol tests. | Python |

## Recommended Workflow

Run the host simulation before flashing hardware:

```text
python -m simulation.run_tests
```

The command runs the simulator tests and writes the report to [simulation/results.md](simulation/results.md).

The suite covers the controller, SHT30 app, BMX280 app, module packager, and
module loader, including discovery, telemetry, configuration, CRC, and invalid
module data cases.

## ESP-IDF Builds

Open an ESP-IDF PowerShell or terminal, then run the commands from the project directory.

```text
cd Spectron_Controller
idf.py set-target esp32
idf.py build
idf.py -p <PORT> flash monitor
```

For either sensor application:

```text
cd SPECTRON_SHT30_App
idf.py set-target esp32c3
idf.py build
idf.py -p <PORT> flash monitor
```

Use the same commands in `SPECTRON_BMX280_App` when building the BMX280 node.

The loader and packager also target ESP32-C3:

```text
cd Spectron_Sensor_Module_Loader
idf.py set-target esp32c3
idf.py build
```

```text
cd Spectron_Sensor_Module_Packager
idf.py set-target esp32c3
idf.py build
```

## Sensor Wiring

The SHT30 and BMX280 applications use the same node wiring:

- I2C SDA: GPIO 6
- I2C SCL: GPIO 7
- Sensor LED: GPIO 4
- Data LED: GPIO 5

SHT30 addresses are `0x44` and `0x45`. BMX280 addresses are `0x76` and `0x77`.

## Module Packaging

The packager embeds `main/template.bin`, writes a module header at flash address `0x000000`, and writes the payload at `0x001000`. The loader validates the header, CRC, sensor type, I2C settings, and firmware range before installing the payload.

Keep the packed protocol definitions aligned between the controller, sensor apps, loader, and packager. Changes to message IDs, sensor types, payload structs, or module header layout require rebuilding all affected projects.

## Requirements

- ESP-IDF 5.x for firmware projects
- Python 3 for simulation tests
- An ESP32 or ESP32-C3 board matching the selected project target
- Correct serial port permissions and a connected board for flashing

Do not commit real Wi-Fi passwords or other device credentials to the firmware source. Configure network credentials through the intended NVS/backend flow.
