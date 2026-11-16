"""
MCP23017 I2C address + pin index for terminal logs (matches gpio_control_pi wiring).
mcp1 = 0x26, mcp2 = 0x27; pin = get_pin(0..15) -> PA0..PA7, PB0..PB7.
"""

def _port_name(pin_idx: int) -> str:
    if pin_idx < 8:
        return f"PA{pin_idx}"
    return f"PB{pin_idx - 8}"


# Logical name -> (I2C hex, MCP pin index 0-15)
RELAY_ADDR_PIN = {
    "SUCTION": ("0x26", 0),
    "VACUUM": ("0x26", 0),
    "JET": ("0x26", 1),
    "BRUSH_SPRAY": ("0x26", 2),
    "DUMP_UP": ("0x26", 3),
    "DUMP_DOWN": ("0x26", 4),
    "GATE_OPEN": ("0x26", 5),
    "GATE_CLOSE": ("0x26", 6),
    "RESERVE": ("0x26", 7),
    "DUMP_LEFT": ("0x26", 7),
    "LEFT_EXTEND": ("0x26", 8),
    "LEFT_RETRACT": ("0x26", 9),
    "RIGHT_EXTEND": ("0x26", 10),
    "RIGHT_RETRACT": ("0x26", 11),
    "REAR_UP": ("0x26", 12),
    "REAR_DOWN": ("0x26", 13),
    "FRONT_UP": ("0x26", 14),
    "FRONT_DOWN": ("0x26", 15),
    "LITTER_ON": ("0x27", 8),   # MCP2 PB0
    "LITTER_OFF": ("0x27", 8),
    "SWEEP_ON": ("0x27", 9),    # MCP2 PB1
    "SWEEP_OFF": ("0x27", 9),
    "FILTER_ACT_OPEN": ("0x27", 11),
    "FILTER_ACT_CLOSE": ("0x27", 12),
    "FILTER_MOTOR": ("0x27", 13),
    "FILTER_CLEAN": ("0x27", 13),
    "MCP2_PB6_ALWAYS_ON": ("0x27", 14),
}

# Same order as ALL_RELAYS in gpio_control_pi / gpio_control_mock
ALL_RELAY_ORDER = [
    "SUCTION",
    "JET",
    "BRUSH_SPRAY",
    "DUMP_UP",
    "DUMP_DOWN",
    "GATE_OPEN",
    "GATE_CLOSE",
    "LEFT_EXTEND",
    "LEFT_RETRACT",
    "RIGHT_EXTEND",
    "RIGHT_RETRACT",
    "REAR_UP",
    "REAR_DOWN",
    "FRONT_UP",
    "FRONT_DOWN",
    "LITTER_ON",
    "LITTER_OFF",
    "SWEEP_ON",
    "SWEEP_OFF",
    "FILTER_ACT_OPEN",
    "FILTER_ACT_CLOSE",
    "FILTER_MOTOR",
    "MCP2_PB6_ALWAYS_ON",
    "RESERVE",
]


def relay_log(name: str) -> str:
    """Suffix for terminal: MCP address, pin index, port bit."""
    row = RELAY_ADDR_PIN.get(name)
    if not row:
        return ""
    addr, pin = row
    return f" | MCP addr={addr} pin={pin} ({_port_name(pin)})"


def print_all_stop_pin_table(prefix: str = "  ") -> None:
    """Print each relay line with board+pin after ALL STOP banner."""
    print(f"{prefix}Relays (MCP23017):")
    for name in ALL_RELAY_ORDER:
        print(f"{prefix}  {name}{relay_log(name)}")
