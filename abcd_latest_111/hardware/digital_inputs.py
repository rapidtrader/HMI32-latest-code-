"""
PCB plate / field digital inputs F_IN01–F_IN16 (STM32 → CAN 0x202).

CAN command 0x31–0x40 maps to F_IN01–F_IN16. State 1 = wire/plate ON (active-low).

F_IN01–F_IN10 match the plate wiring sheet (pin + function).
"""

from typing import Dict, List, Optional

DIGITAL_INPUTS: List[Dict[str, object]] = [
    {
        "index": 1,
        "label": "Emergency Input",
        "pin": "PD7",
        "cmd": 0x31,
        "function": "emergency",
    },
    {
        "index": 2,
        "label": "Filter Open",
        "pin": "PD4",
        "cmd": 0x32,
        "function": "filter_open",
    },
    {
        "index": 3,
        "label": "Front Left Brush ON",
        "pin": "PD3",
        "cmd": 0x33,
        "function": "fl_brush_on",
    },
    {
        "index": 4,
        "label": "Front Right Brush ON",
        "pin": "PA12",
        "cmd": 0x34,
        "function": "fr_brush_on",
    },
    {
        "index": 5,
        "label": "Rear Left Brush ON",
        "pin": "PA15",
        "cmd": 0x35,
        "function": "rl_brush_on",
    },
    {
        "index": 6,
        "label": "Rear Right Brush ON",
        "pin": "PA11",
        "cmd": 0x36,
        "function": "rr_brush_on",
    },
    {
        "index": 7,
        "label": "Dump Up Limit",
        "pin": "PA8",
        "cmd": 0x37,
        "function": "dump_up_limit",
    },
    {
        "index": 8,
        "label": "Dump Down Limit",
        "pin": "PC8",
        "cmd": 0x38,
        "function": "dump_down_limit",
    },
    {
        "index": 9,
        "label": "Gate Open",
        "pin": "PC9",
        "cmd": 0x39,
        "function": "gate_open_limit",
    },
    {
        "index": 10,
        "label": "Gate Close",
        "pin": "PD14",
        "cmd": 0x3A,
        "function": "gate_close_limit",
    },
    {"index": 11, "label": "F_IN11", "pin": "PD12", "cmd": 0x3B, "function": None},
    {"index": 12, "label": "F_IN12", "pin": "PD10", "cmd": 0x3C, "function": None},
    {"index": 13, "label": "F_IN13", "pin": "PD15", "cmd": 0x3D, "function": None},
    {"index": 14, "label": "F_IN14", "pin": "PD13", "cmd": 0x3E, "function": None},
    {"index": 15, "label": "F_IN15", "pin": "PD11", "cmd": 0x3F, "function": None},
    {"index": 16, "label": "F_IN16", "pin": "PB15", "cmd": 0x40, "function": None},
]

PLATE_FUNCTION_BY_CMD: Dict[int, str] = {
    int(row["cmd"]): str(row["function"])
    for row in DIGITAL_INPUTS
    if row.get("function")
}

_CMD_TO_INDEX: Dict[int, int] = {int(row["cmd"]): int(row["index"]) for row in DIGITAL_INPUTS}
_INDEX_TO_CMD: Dict[int, int] = {int(row["index"]): int(row["cmd"]) for row in DIGITAL_INPUTS}

CMD_MIN = 0x31
CMD_MAX = 0x40

# F_IN01–10: UI shows latched toggle (wire pulse), not momentary wire level.
PLATE_TOGGLE_CMD_MAX = 0x3A


def is_digital_input_cmd(cmd: int) -> bool:
    return CMD_MIN <= cmd <= CMD_MAX


def is_plate_toggle_cmd(cmd: int) -> bool:
    return CMD_MIN <= int(cmd) <= PLATE_TOGGLE_CMD_MAX


def cmd_for_index(index: int) -> Optional[int]:
    return _INDEX_TO_CMD.get(index)


def index_for_cmd(cmd: int) -> Optional[int]:
    return _CMD_TO_INDEX.get(cmd)


def _row_for_cmd(cmd: int) -> Optional[Dict[str, object]]:
    for row in DIGITAL_INPUTS:
        if int(row["cmd"]) == int(cmd):
            return row
    return None


def label_for_cmd(cmd: int) -> str:
    row = _row_for_cmd(cmd)
    if row:
        return str(row["label"])
    return f"F_IN 0x{int(cmd):02X}"


def pin_for_cmd(cmd: int) -> str:
    row = _row_for_cmd(cmd)
    if row:
        return str(row["pin"])
    return "?"


def qml_rows() -> List[Dict[str, object]]:
    """Rows for QML ListModel: index, label, pin, cmd."""
    return [
        {
            "inputIndex": row["index"],
            "label": row["label"],
            "pin": row["pin"],
            "cmd": row["cmd"],
        }
        for row in DIGITAL_INPUTS
    ]