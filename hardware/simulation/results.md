# SPECTRON Simulation Results

- Generated: `2026-09-15T15:47:11+00:00`
- Status: **PASS**
- Tests run: `20`
- Failures: `0`
- Errors: `0`
- Skipped: `0`

## Demo Snapshot

| Metric | Value |
| --- | ---: |
| Registered modules | 2 |
| Readings received | 2 |
| Frames exchanged | 22 |
| Rejected frames | 0 |

## Test Output

```text
test_configuration_for_another_sensor_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_configuration_for_another_sensor_is_rejected) ... ok
test_configuration_is_applied_and_acknowledged (simulation.test_simulation.SpectronSimulationTests.test_configuration_is_applied_and_acknowledged) ... ok
test_controller_rejects_payload_that_does_not_match_sensor_type (simulation.test_simulation.SpectronSimulationTests.test_controller_rejects_payload_that_does_not_match_sensor_type) ... ok
test_controller_requires_network_for_configuration (simulation.test_simulation.SpectronSimulationTests.test_controller_requires_network_for_configuration) ... ok
test_discovery_scans_until_controller_channel (simulation.test_simulation.SpectronSimulationTests.test_discovery_scans_until_controller_channel) ... ok
test_duplicate_node_addresses_are_rejected (simulation.test_simulation.SpectronSimulationTests.test_duplicate_node_addresses_are_rejected) ... ok
test_frame_log_preserves_protocol_order (simulation.test_simulation.SpectronSimulationTests.test_frame_log_preserves_protocol_order) ... ok
test_invalid_configuration_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_invalid_configuration_is_rejected) ... ok
test_minimum_valid_configuration_is_applied (simulation.test_simulation.SpectronSimulationTests.test_minimum_valid_configuration_is_applied) ... ok
test_missing_required_sensor_field_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_missing_required_sensor_field_is_rejected) ... ok
test_module_info_with_wrong_base_id_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_module_info_with_wrong_base_id_is_rejected) ... ok
test_node_on_wrong_channel_does_not_receive_unicast (simulation.test_simulation.SpectronSimulationTests.test_node_on_wrong_channel_does_not_receive_unicast) ... ok
test_nodes_discover_register_and_send_readings (simulation.test_simulation.SpectronSimulationTests.test_nodes_discover_register_and_send_readings) ... ok
test_non_integer_configuration_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_non_integer_configuration_is_rejected) ... ok
test_repeated_configuration_replaces_previous_value (simulation.test_simulation.SpectronSimulationTests.test_repeated_configuration_replaces_previous_value) ... ok
test_sensor_cannot_send_before_registration (simulation.test_simulation.SpectronSimulationTests.test_sensor_cannot_send_before_registration) ... ok
test_sensor_requires_network_for_discovery (simulation.test_simulation.SpectronSimulationTests.test_sensor_requires_network_for_discovery) ... ok
test_unknown_sensor_data_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_unknown_sensor_data_is_rejected) ... ok
test_unknown_unicast_destination_is_logged_but_not_delivered (simulation.test_simulation.SpectronSimulationTests.test_unknown_unicast_destination_is_logged_but_not_delivered) ... ok
test_unsupported_sensor_type_payload_is_rejected (simulation.test_simulation.SpectronSimulationTests.test_unsupported_sensor_type_payload_is_rejected) ... ok

----------------------------------------------------------------------
Ran 20 tests in 0.001s

OK
```
