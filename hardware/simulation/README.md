# SPECTRON Hardware Simulation

This is a dependency-free host simulation of the SPECTRON controller and ESP-NOW sensor-node protocol. It does not require ESP-IDF, a serial port, or physical sensors.

## Run tests and create results

From the `hardware` directory:

```text
python -m simulation.run_tests
```

This runs the full suite and writes the latest Markdown report to
`simulation/results.md`.

To run the tests without replacing the report:

```text
python -m unittest discover -s simulation -p "test_*.py" -v
```

## Add a virtual node

Create a `SensorNode` with a unique address and sensor ID, register it on a `VirtualEspNow`, and provide a payload matching its `SensorType`. The controller currently validates SHT30 and pressure payloads just like the firmware contract.

The simulator intentionally uses logical payload dictionaries. This keeps behavior tests readable while leaving binary serialization and ESP-IDF integration to the firmware builds.
