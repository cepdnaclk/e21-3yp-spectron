import unittest

from simulation.spectron_sim import (
    ControllerNode,
    Frame,
    ModuleLoader,
    ModulePackager,
    MessageType,
    SensorNode,
    SensorType,
    VirtualEspNow,
    build_demo_network,
)


class SpectronSimulationTests(unittest.TestCase):
    def test_controller_handles_sht30_app(self):
        network, controller, sht30, _ = build_demo_network()

        self.assertEqual(sht30.sensor_type, SensorType.SHT30)
        self.assertTrue(sht30.discover())
        self.assertTrue(sht30.send_reading())
        self.assertEqual(controller.readings[0]["humidity_rh_x100"], 4820)
        self.assertEqual(len(network.frames), 10)

    def test_controller_handles_bmx280_app(self):
        _, controller, _, bme280 = build_demo_network()

        self.assertEqual(bme280.sensor_type, SensorType.PRESSURE)
        self.assertTrue(bme280.discover())
        self.assertTrue(bme280.send_reading())
        self.assertEqual(controller.readings[0]["pressure_pa"], 101325)

    def test_sht30_app_reports_temperature_and_humidity(self):
        _, controller, sht30, _ = build_demo_network()

        sht30.discover()
        sht30.send_reading()

        reading = controller.readings[0]
        self.assertEqual(reading["temperature_c_x100"], 2315)
        self.assertEqual(reading["humidity_rh_x100"], 4820)

    def test_bmx280_app_reports_pressure_temperature_and_humidity(self):
        _, controller, _, bme280 = build_demo_network()

        bme280.discover()
        bme280.send_reading()

        reading = controller.readings[0]
        self.assertEqual(reading["pressure_pa"], 101325)
        self.assertEqual(reading["temperature_c_x100"], 2240)
        self.assertEqual(reading["humidity_rh_x100"], 5010)

    def test_packager_creates_a_valid_sht30_package(self):
        package = ModulePackager().package(
            SensorType.SHT30, "SHT30", 0x44, b"sht30-firmware"
        )

        self.assertEqual(package.firmware_address, 0x1000)
        self.assertTrue(ModuleLoader().validate(package))

    def test_packager_creates_a_valid_bmx280_package(self):
        package = ModulePackager().package(
            SensorType.PRESSURE, "BME280", 0x76, b"bmx280-firmware"
        )

        self.assertEqual(package.sensor_name, "BME280")
        self.assertTrue(ModuleLoader().validate(package))

    def test_loader_rejects_a_changed_firmware_crc(self):
        package = ModulePackager().package(
            SensorType.SHT30, "SHT30", 0x44, b"firmware"
        )
        changed = package.__class__(
            sensor_type=package.sensor_type,
            sensor_name=package.sensor_name,
            i2c_address=package.i2c_address,
            firmware_address=package.firmware_address,
            firmware=b"changed-firmware",
            firmware_crc=package.firmware_crc,
        )

        self.assertFalse(ModuleLoader().validate(changed))

    def test_loader_rejects_an_invalid_i2c_address(self):
        package = ModulePackager().package(
            SensorType.PRESSURE, "BME280", 0x76, b"firmware"
        )
        invalid = package.__class__(
            sensor_type=package.sensor_type,
            sensor_name=package.sensor_name,
            i2c_address=0x80,
            firmware_address=package.firmware_address,
            firmware=package.firmware,
            firmware_crc=package.firmware_crc,
        )

        self.assertFalse(ModuleLoader().validate(invalid))

    def test_controller_requires_network_for_configuration(self):
        controller = ControllerNode()
        node = SensorNode("node", 1, SensorType.SHT30, "SHT30")

        with self.assertRaises(RuntimeError):
            controller.configure(node, 10000)

    def test_sensor_requires_network_for_discovery(self):
        node = SensorNode("node", 1, SensorType.SHT30, "SHT30")

        with self.assertRaises(RuntimeError):
            node.discover()

    def test_duplicate_node_addresses_are_rejected(self):
        network = VirtualEspNow()
        network.register(ControllerNode())

        with self.assertRaises(ValueError):
            network.register(ControllerNode())

    def test_sensor_cannot_send_before_registration(self):
        network = VirtualEspNow()
        node = SensorNode(
            address="unregistered-node",
            sensor_id=100,
            sensor_type=SensorType.SHT30,
            sensor_name="SHT30",
            readings={"temperature_c_x100": 2000},
        )
        network.register(node)

        self.assertFalse(node.send_reading())
        self.assertEqual(network.frames, [])

    def test_nodes_discover_register_and_send_readings(self):
        network, controller, sht30, bme280 = build_demo_network()

        self.assertTrue(sht30.discover())
        self.assertTrue(bme280.discover())
        self.assertTrue(sht30.registered)
        self.assertTrue(bme280.registered)

        self.assertTrue(sht30.send_reading())
        self.assertTrue(bme280.send_reading())

        self.assertEqual(
            set(controller.modules), {sht30.sensor_id, bme280.sensor_id}
        )
        self.assertEqual(len(controller.readings), 2)
        self.assertEqual(controller.readings[0]["sensor_id"], sht30.sensor_id)
        self.assertEqual(controller.readings[1]["pressure_pa"], 101325)
        self.assertFalse(controller.rejected_frames)
        self.assertGreater(len(network.frames), 0)

    def test_discovery_scans_until_controller_channel(self):
        network = VirtualEspNow()
        controller = ControllerNode(channel=11)
        node = SensorNode(
            address="distance-node",
            sensor_id=42,
            sensor_type=SensorType.VL53,
            sensor_name="VL53L0X",
        )
        network.register(controller)
        network.register(node)

        self.assertTrue(node.discover())
        self.assertEqual(node.channel, 11)
        self.assertTrue(node.discovered)
        self.assertEqual(node._controller_address, controller.address)

    def test_node_on_wrong_channel_does_not_receive_unicast(self):
        network, controller, node, _ = build_demo_network()
        node.channel = controller.channel + 1

        self.assertFalse(node.discover(channels=range(1, 6)))
        self.assertFalse(node.discovered)
        self.assertEqual(len(controller.modules), 0)
        self.assertEqual(len(network.frames), 5)

    def test_configuration_is_applied_and_acknowledged(self):
        _, controller, node, _ = build_demo_network()
        node.discover()

        controller.configure(node, 10000)

        self.assertEqual(node.sample_period_ms, 10000)
        self.assertEqual(node.config_acks, 1)
        self.assertFalse(controller.rejected_frames)

    def test_minimum_valid_configuration_is_applied(self):
        _, controller, node, _ = build_demo_network()
        node.discover()

        controller.configure(node, 5000)

        self.assertEqual(node.sample_period_ms, 5000)
        self.assertEqual(node.config_acks, 1)

    def test_repeated_configuration_replaces_previous_value(self):
        _, controller, node, _ = build_demo_network()
        node.discover()

        controller.configure(node, 10000)
        controller.configure(node, 15000)

        self.assertEqual(node.sample_period_ms, 15000)
        self.assertEqual(node.config_acks, 2)
        self.assertFalse(controller.rejected_frames)

    def test_invalid_configuration_is_rejected(self):
        network, controller, node, _ = build_demo_network()
        node.discover()
        frame = Frame(
            source=controller.address,
            destination=node.address,
            channel=node.channel,
            message_type=MessageType.CONFIG_SET,
            sensor_type=node.sensor_type,
            sequence=99,
            base_id=controller.base_id,
            sensor_id=node.sensor_id,
            payload={"sample_period_ms": 1000},
        )

        network.transmit(frame)

        self.assertEqual(node.sample_period_ms, 60000)
        self.assertEqual(node.config_acks, 1)
        self.assertIn(
            "node rejected configuration", controller.rejected_frames
        )

    def test_non_integer_configuration_is_rejected(self):
        network, controller, node, _ = build_demo_network()
        node.discover()
        frame = Frame(
            source=controller.address,
            destination=node.address,
            channel=node.channel,
            message_type=MessageType.CONFIG_SET,
            sensor_type=node.sensor_type,
            sequence=99,
            base_id=controller.base_id,
            sensor_id=node.sensor_id,
            payload={"sample_period_ms": "10000"},
        )

        network.transmit(frame)

        self.assertEqual(node.sample_period_ms, 60000)
        self.assertEqual(node.config_acks, 1)
        self.assertIn(
            "node rejected configuration", controller.rejected_frames
        )

    def test_configuration_for_another_sensor_is_rejected(self):
        network, controller, node, other_node = build_demo_network()
        node.discover()
        other_node.discover()
        frame = Frame(
            source=controller.address,
            destination=node.address,
            channel=node.channel,
            message_type=MessageType.CONFIG_SET,
            sensor_type=node.sensor_type,
            sequence=100,
            base_id=controller.base_id,
            sensor_id=other_node.sensor_id,
            payload={"sample_period_ms": 10000},
        )

        network.transmit(frame)

        self.assertEqual(node.sample_period_ms, 60000)
        self.assertIn(
            "node rejected configuration", controller.rejected_frames
        )

    def test_module_info_with_wrong_base_id_is_rejected(self):
        network, controller, node, _ = build_demo_network()
        frame = Frame(
            source=node.address,
            destination=controller.address,
            channel=controller.channel,
            message_type=MessageType.MODULE_INFO,
            sensor_type=node.sensor_type,
            sequence=1,
            base_id=0xDEADBEEF,
            sensor_id=node.sensor_id,
            payload={"sensor_name": node.sensor_name},
        )

        network.transmit(frame)

        self.assertEqual(controller.modules, {})
        self.assertEqual(
            controller.rejected_frames[-1], "module info has wrong base id"
        )

    def test_unknown_sensor_data_is_rejected(self):
        network, controller, _, _ = build_demo_network()
        frame = Frame(
            source="unknown-node",
            destination=controller.address,
            channel=controller.channel,
            message_type=MessageType.SENSOR_DATA,
            sensor_type=SensorType.SHT30,
            sequence=1,
            base_id=controller.base_id,
            sensor_id=0x9999,
            payload={
                "temperature_c_x100": 2000,
                "humidity_rh_x100": 4500,
            },
        )

        network.transmit(frame)

        self.assertEqual(controller.readings, [])
        self.assertEqual(
            controller.rejected_frames[-1], "sensor data from unknown module"
        )

    def test_missing_required_sensor_field_is_rejected(self):
        network, controller, node, _ = build_demo_network()
        node.discover()
        frame = Frame(
            source=node.address,
            destination=controller.address,
            channel=controller.channel,
            message_type=MessageType.SENSOR_DATA,
            sensor_type=SensorType.SHT30,
            sequence=2,
            base_id=controller.base_id,
            sensor_id=node.sensor_id,
            payload={"temperature_c_x100": 2000},
        )

        network.transmit(frame)

        self.assertEqual(controller.readings, [])
        self.assertEqual(
            controller.rejected_frames[-1],
            "sensor payload does not match sensor type",
        )

    def test_unsupported_sensor_type_payload_is_rejected(self):
        network, controller, node, _ = build_demo_network()
        node.sensor_type = SensorType.VL53
        node.discover()
        node.readings = {"distance_mm": 120}
        node.send_reading()

        self.assertEqual(controller.readings, [])
        self.assertEqual(
            controller.rejected_frames[-1],
            "sensor payload does not match sensor type",
        )

    def test_unknown_unicast_destination_is_logged_but_not_delivered(self):
        network, controller, _, _ = build_demo_network()
        frame = Frame(
            source=controller.address,
            destination="missing-node",
            channel=controller.channel,
            message_type=MessageType.HEARTBEAT,
            sensor_type=SensorType.NONE,
            sequence=1,
            base_id=controller.base_id,
            sensor_id=0,
        )

        network.transmit(frame)

        self.assertEqual(network.frames[-1], frame)
        self.assertEqual(controller.rejected_frames, [])

    def test_frame_log_preserves_protocol_order(self):
        network, controller, node, _ = build_demo_network()
        node.discover()
        node.send_reading()

        message_types = [frame.message_type for frame in network.frames]

        self.assertEqual(
            message_types[-5:],
            [
                MessageType.BASE_HELLO,
                MessageType.BASE_ACK,
                MessageType.MODULE_INFO,
                MessageType.MODULE_ACK,
                MessageType.SENSOR_DATA,
            ],
        )
        self.assertEqual(network.frames[-4].destination, node.address)
        self.assertEqual(network.frames[-3].destination, controller.address)

    def test_controller_rejects_payload_that_does_not_match_sensor_type(self):
        network, controller, node, _ = build_demo_network()
        node.discover()
        node.send_reading()
        rejected_before = len(controller.rejected_frames)
        bad_frame = Frame(
            source=node.address,
            destination=controller.address,
            channel=controller.channel,
            message_type=MessageType.SENSOR_DATA,
            sensor_type=SensorType.SHT30,
            sequence=100,
            base_id=controller.base_id,
            sensor_id=node.sensor_id,
            payload={"pressure_pa": 101325},
        )

        network.transmit(bad_frame)

        self.assertEqual(len(controller.rejected_frames), rejected_before + 1)
        self.assertEqual(len(controller.readings), 1)
        self.assertEqual(
            controller.rejected_frames[-1],
            "sensor payload does not match sensor type",
        )


if __name__ == "__main__":
    unittest.main()
