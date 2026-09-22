"""
Mock GPIO/relay layer (does nothing)
"""
from typing import Any, Optional


class MockRelay:
    def __init__(self, name: str = ""):
        self.name = name
    
    def on(self) -> None:
        pass
    
    def off(self) -> None:
        pass
    
    def set(self, value: Any) -> None:
        pass


# All relay definitions (all do nothing)
SUCTION = MockRelay("SUCTION")
JET = MockRelay("JET")
BRUSH_SPRAY = MockRelay("BRUSH_SPRAY")
VACUUM = MockRelay("VACUUM")
FILTER_ACT_OPEN = MockRelay("FILTER_ACT_OPEN")
FILTER_ACT_CLOSE = MockRelay("FILTER_ACT_CLOSE")
FILTER_MOTOR = MockRelay("FILTER_MOTOR")
LITTER_ON = MockRelay("LITTER_ON")
LITTER_OFF = MockRelay("LITTER_OFF")
SWEEP_ON = MockRelay("SWEEP_ON")
SWEEP_OFF = MockRelay("SWEEP_OFF")
DUMP_UP = MockRelay("DUMP_UP")
DUMP_DOWN = MockRelay("DUMP_DOWN")
DUMP_LEFT = MockRelay("DUMP_LEFT")
GATE_OPEN = MockRelay("GATE_OPEN")
GATE_CLOSE = MockRelay("GATE_CLOSE")
FRONT_UP = MockRelay("FRONT_UP")
FRONT_DOWN = MockRelay("FRONT_DOWN")
REAR_UP = MockRelay("REAR_UP")
REAR_DOWN = MockRelay("REAR_DOWN")
LEFT_EXTEND = MockRelay("LEFT_EXTEND")
LEFT_RETRACT = MockRelay("LEFT_RETRACT")
RIGHT_EXTEND = MockRelay("RIGHT_EXTEND")
RIGHT_RETRACT = MockRelay("RIGHT_RETRACT")
RESERVE = MockRelay("RESERVE")
MCP2_PB6_ALWAYS_ON = MockRelay("MCP2_PB6_ALWAYS_ON")

ALL_RELAYS = [
    SUCTION,
    JET,
    BRUSH_SPRAY,
    VACUUM,
    FILTER_ACT_OPEN,
    FILTER_ACT_CLOSE,
    FILTER_MOTOR,
    LITTER_ON,
    LITTER_OFF,
    SWEEP_ON,
    SWEEP_OFF,
    DUMP_UP,
    DUMP_DOWN,
    DUMP_LEFT,
    GATE_OPEN,
    GATE_CLOSE,
    FRONT_UP,
    FRONT_DOWN,
    REAR_UP,
    REAR_DOWN,
    LEFT_EXTEND,
    LEFT_RETRACT,
    RIGHT_EXTEND,
    RIGHT_RETRACT,
    RESERVE,
]


def interlock(*args) -> None:
    pass


def set_suction_power(volts: float) -> None:
    pass


def safe_shutdown() -> None:
    pass
