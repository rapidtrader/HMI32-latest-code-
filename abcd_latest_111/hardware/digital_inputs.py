"""
PCB plate / field digital inputs F_IN01–F_IN16 (STM32 → CAN 0x202).

CAN command 0x31–0x40 maps to F_IN01–F_IN16. State 1 = wire/plate ON (green on HMI).
"""

from typing import Dict, List, Optional

DIGITAL_INPUTS: List[Dict[str, object]] = [
    {"index": 1, "label": "F_IN01", "pin": "PD7", "cmd": 0x31},
    {"index": 2, "label": "F_IN02", "pin": "PD4", "cmd": 0x32},
    {"index": 3, "label": "F_IN03", "pin": "PD3", "cmd": 0x33},
    {"index": 4, "label": "F_IN04", "pin": "PA12", "cmd": 0x34},
    {"index": 5, "label": "F_IN05", "pin": "PA15", "cmd": 0x35},
    {"index": 6, "label": "F_IN06", "pin": "PA11", "cmd": 0x36},
    {"index": 7, "label": "F_IN07", "pin": "PA8", "cmd": 0x37},
    {"index": 8, "label": "F_IN08", "pin": "PC8", "cmd": 0x38},
    {"index": 9, "label": "F_IN09", "pin": "PC9", "cmd": 0x39},
    {"index": 10, "label": "F_IN10", "pin": "PD14", "cmd": 0x3A},
    {"index": 11, "label": "F_IN11", "pin": "PD12", "cmd": 0x3B},
    {"index": 12, "label": "F_IN12", "pin": "PD10", "cmd": 0x3C},
    {"index": 13, "label": "F_IN13", "pin": "PD15", "cmd": 0x3D},
    {"index": 14, "label": "F_IN14", "pin": "PD13", "cmd": 0x3E},
    {"index": 15, "label": "F_IN15", "pin": "PD11", "cmd": 0x3F},
    {"index": 16, "label": "F_IN16", "pin": "PB15", "cmd": 0x40},
]

_CMD_TO_INDEX: Dict[int, int] = {int(row["cmd"]): int(row["index"]) for row in DIGITAL_INPUTS}
_INDEX_TO_CMD: Dict[int, int] = {int(row["index"]): int(row["cmd"]) for row in DIGITAL_INPUTS}

CMD_MIN = 0x31
CMD_MAX = 0x40


def is_digital_input_cmd(cmd: int) -> bool:
    return CMD_MIN <= cmd <= CMD_MAX


def cmd_for_index(index: int) -> Optional[int]:
    return _INDEX_TO_CMD.get(index)


def index_for_cmd(cmd: int) -> Optional[int]:
    return _CMD_TO_INDEX.get(cmd)


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