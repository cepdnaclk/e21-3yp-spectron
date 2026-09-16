from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Dict, List, Optional
from zlib import crc32


class MessageType(IntEnum):
    BASE_HELLO = 1
    BASE_ACK = 2
    MODULE_INFO = 3
    MODULE_ACK = 4
    SENSOR_DATA = 5
    CONFIG_SET = 6
    CONFIG_ACK = 7
    HEARTBEAT = 8


class SensorType(IntEnum):
    NONE = 0
    SHT30 = 1
    PRESSURE = 2
    VL53 = 3


class AckStatus(IntEnum):
    OK = 1
    BAD_PAYLOAD = 2
    BAD_TARGET = 3
    APPLY_FAIL = 4


@dataclass(frozen=True)
class ModulePackage:
    sensor_type: SensorType
    sensor_name: str
    i2c_address: int
    firmware_address: int
    firmware: bytes
    firmware_crc: int


class ModulePackager:
    firmware_address = 0x1000

    def package(
        self,
        sensor_type: SensorType,
        sensor_name: str,
        i2c_address: int,
        firmware: bytes,
    ) -> ModulePackage:
        return ModulePackage(
            sensor_type=sensor_type,
            sensor_name=sensor_name,
            i2c_address=i2c_address,
            firmware_address=self.firmware_address,
            firmware=firmware,
            firmware_crc=crc32(firmware) & 0xFFFFFFFF,
        )


class ModuleLoader:
    max_firmware_size = 0x140000
    supported_types = {
        SensorType.SHT30,
        SensorType.PRESSURE,
    }

    def validate(self, package: ModulePackage) -> bool:
        return (
            package.sensor_type in self.supported_types
            and 0 < package.i2c_address <= 0x7F
            and package.firmware_address >= ModulePackager.firmware_address
            and 0 < len(package.firmware) <= self.max_firmware_size
            and crc32(package.firmware) & 0xFFFFFFFF == package.firmware_crc
        )


@dataclass(frozen=True)
class Frame:
    source: str
    destination: Optional[str]
    channel: int
    message_type: MessageType
    sensor_type: SensorType
    sequence: int
    base_id: int
    sensor_id: int
    payload: Dict[str, Any] = field(default_factory=dict)


class VirtualEspNow:
    def __init__(self) -> None:
        self.nodes: Dict[str, Any] = {}
        self.frames: List[Frame] = []

    def register(self, node: Any) -> None:
        if node.address in self.nodes:
            raise ValueError(f"duplicate node address: {node.address}")
        self.nodes[node.address] = node
        node.network = self

    def transmit(self, frame: Frame) -> None:
        self.frames.append(frame)
        if frame.destination is None:
            recipients = [
                node
                for node in self.nodes.values()
                if node.address != frame.source
            ]
        else:
            recipient = self.nodes.get(frame.destination)
            recipients = [] if recipient is None else [recipient]

        for recipient in recipients:
            if recipient.channel == frame.channel:
                recipient.receive(frame)


@dataclass
class ControllerNode:
    address: str = "controller"
    base_id: int = 0x0000B001
    channel: int = 6
    network: Optional[VirtualEspNow] = field(
        default=None, init=False, repr=False
    )
    modules: Dict[int, Dict[str, Any]] = field(
        default_factory=dict, init=False
    )
    readings: List[Dict[str, Any]] = field(default_factory=list, init=False)
    rejected_frames: List[str] = field(default_factory=list, init=False)
    _sequence: int = field(default=0, init=False, repr=False)

    def receive(self, frame: Frame) -> None:
        if frame.message_type == MessageType.BASE_HELLO:
            self._send_ack(frame, MessageType.BASE_HELLO)
        elif frame.message_type == MessageType.MODULE_INFO:
            self._handle_module_info(frame)
        elif frame.message_type == MessageType.SENSOR_DATA:
            self._handle_sensor_data(frame)
        elif frame.message_type == MessageType.CONFIG_ACK:
            self._handle_config_ack(frame)

    def configure(self, node: "SensorNode", sample_period_ms: int) -> None:
        self._require_network()
        self._sequence += 1
        self.network.transmit(
            Frame(
                source=self.address,
                destination=node.address,
                channel=self.channel,
                message_type=MessageType.CONFIG_SET,
                sensor_type=node.sensor_type,
                sequence=self._sequence,
                base_id=self.base_id,
                sensor_id=node.sensor_id,
                payload={"sample_period_ms": sample_period_ms},
            )
        )

    def _handle_module_info(self, frame: Frame) -> None:
        if frame.base_id != self.base_id:
            self.rejected_frames.append("module info has wrong base id")
            return
        self.modules[frame.sensor_id] = dict(frame.payload)
        self._send_ack(frame, MessageType.MODULE_INFO)

    def _handle_sensor_data(self, frame: Frame) -> None:
        module = self.modules.get(frame.sensor_id)
        if module is None:
            self.rejected_frames.append("sensor data from unknown module")
            return
        expected = {
            SensorType.SHT30: {"temperature_c_x100", "humidity_rh_x100"},
            SensorType.PRESSURE: {"pressure_pa", "temperature_c_x100"},
        }.get(frame.sensor_type)
        if expected is None or not expected.issubset(frame.payload):
            self.rejected_frames.append(
                "sensor payload does not match sensor type"
            )
            return
        self.readings.append(dict(frame.payload, sensor_id=frame.sensor_id))

    def _handle_config_ack(self, frame: Frame) -> None:
        if frame.payload.get("status") != AckStatus.OK:
            self.rejected_frames.append("node rejected configuration")

    def _send_ack(self, request: Frame, acknowledged: MessageType) -> None:
        self._require_network()
        self._sequence += 1
        self.network.transmit(
            Frame(
                source=self.address,
                destination=request.source,
                channel=self.channel,
                message_type=(
                    MessageType.BASE_ACK
                    if acknowledged == MessageType.BASE_HELLO
                    else MessageType.MODULE_ACK
                ),
                sensor_type=request.sensor_type,
                sequence=self._sequence,
                base_id=self.base_id,
                sensor_id=request.sensor_id,
                payload={
                    "acked_sequence": request.sequence,
                    "acked_message": int(acknowledged),
                    "status": int(AckStatus.OK),
                },
            )
        )

    def _require_network(self) -> None:
        if self.network is None:
            raise RuntimeError(
                "controller is not connected to a virtual network"
            )


@dataclass
class SensorNode:
    address: str
    sensor_id: int
    sensor_type: SensorType
    sensor_name: str
    channel: int = 1
    readings: Dict[str, Any] = field(default_factory=dict)
    sample_period_ms: int = 60000
    network: Optional[VirtualEspNow] = field(
        default=None, init=False, repr=False
    )
    discovered: bool = field(default=False, init=False)
    registered: bool = field(default=False, init=False)
    config_acks: int = field(default=0, init=False)
    _sequence: int = field(default=0, init=False, repr=False)
    _controller_address: Optional[str] = field(
        default=None, init=False, repr=False
    )
    _controller_base_id: Optional[int] = field(
        default=None, init=False, repr=False
    )

    def discover(self, channels: range = range(1, 14)) -> bool:
        self._require_network()
        for channel in channels:
            self.channel = channel
            self._sequence += 1
            self.network.transmit(
                Frame(
                    source=self.address,
                    destination=None,
                    channel=channel,
                    message_type=MessageType.BASE_HELLO,
                    sensor_type=self.sensor_type,
                    sequence=self._sequence,
                    base_id=0,
                    sensor_id=self.sensor_id,
                    payload={"sensor_name": self.sensor_name},
                )
            )
            if self.discovered:
                return True
        return False

    def send_module_info(self) -> bool:
        if not self.discovered or self._controller_address is None:
            return False
        self._sequence += 1
        self.network.transmit(
            Frame(
                source=self.address,
                destination=self._controller_address,
                channel=self.channel,
                message_type=MessageType.MODULE_INFO,
                sensor_type=self.sensor_type,
                sequence=self._sequence,
                base_id=self._controller_base_id or 0,
                sensor_id=self.sensor_id,
                payload={
                    "sensor_name": self.sensor_name,
                    "sample_period_ms": self.sample_period_ms,
                    "i2c_sda_gpio": 6,
                    "i2c_scl_gpio": 7,
                },
            )
        )
        return self.registered

    def send_reading(self) -> bool:
        if not self.registered or self._controller_address is None:
            return False
        self._sequence += 1
        self.network.transmit(
            Frame(
                source=self.address,
                destination=self._controller_address,
                channel=self.channel,
                message_type=MessageType.SENSOR_DATA,
                sensor_type=self.sensor_type,
                sequence=self._sequence,
                base_id=self._controller_base_id or 0,
                sensor_id=self.sensor_id,
                payload=dict(self.readings),
            )
        )
        return True

    def receive(self, frame: Frame) -> None:
        if frame.message_type == MessageType.BASE_ACK:
            if frame.payload.get("acked_sequence") == self._sequence:
                self.discovered = True
                self._controller_address = frame.source
                self._controller_base_id = frame.base_id
                self.send_module_info()
        elif frame.message_type == MessageType.MODULE_ACK:
            if frame.payload.get("acked_sequence") == self._sequence:
                self.registered = True
        elif frame.message_type == MessageType.CONFIG_SET:
            if frame.sensor_id != self.sensor_id:
                self._send_config_ack(frame, AckStatus.BAD_TARGET)
                return
            period = frame.payload.get("sample_period_ms", 0)
            if not isinstance(period, int) or period < 5000:
                self._send_config_ack(frame, AckStatus.BAD_PAYLOAD)
                return
            self.sample_period_ms = period
            self._send_config_ack(frame, AckStatus.OK)

    def _send_config_ack(self, request: Frame, status: AckStatus) -> None:
        self.config_acks += 1
        self._sequence += 1
        self.network.transmit(
            Frame(
                source=self.address,
                destination=request.source,
                channel=self.channel,
                message_type=MessageType.CONFIG_ACK,
                sensor_type=self.sensor_type,
                sequence=self._sequence,
                base_id=self._controller_base_id or request.base_id,
                sensor_id=self.sensor_id,
                payload={
                    "acked_sequence": request.sequence,
                    "status": int(status),
                },
            )
        )

    def _require_network(self) -> None:
        if self.network is None:
            raise RuntimeError("sensor is not connected to a virtual network")


def build_demo_network() -> tuple[
    VirtualEspNow, ControllerNode, SensorNode, SensorNode
]:
    network = VirtualEspNow()
    controller = ControllerNode()
    sht30 = SensorNode(
        address="sht30-node",
        sensor_id=0x30000001,
        sensor_type=SensorType.SHT30,
        sensor_name="SHT30",
        readings={"temperature_c_x100": 2315, "humidity_rh_x100": 4820},
    )
    bme280 = SensorNode(
        address="bme280-node",
        sensor_id=0x30000002,
        sensor_type=SensorType.PRESSURE,
        sensor_name="BME280",
        readings={
            "pressure_pa": 101325,
            "temperature_c_x100": 2240,
            "humidity_rh_x100": 5010,
        },
    )
    for node in (controller, sht30, bme280):
        network.register(node)
    return network, controller, sht30, bme280
