"""
Plate inputs F_IN01–F_IN10 (0x31–0x3A): wire pulse → toggle latched ON/OFF.

- First rising edge (wire to GND): latched ON (green), mapped output ON.
- Second rising edge (after wire released): latched OFF (red), output OFF.
- UI / notifications use latched state; raw pin may go 0 while wire is open.
"""

from typing import Any, Dict, Optional

from app.worker import run_machine_background
from hardware.digital_inputs import (
    PLATE_FUNCTION_BY_CMD,
    index_for_cmd,
    is_plate_toggle_cmd,
    label_for_cmd,
    pin_for_cmd,
)
from logic.machine_logic import _send_can

_raw_last: Dict[int, int] = {}
_latched: Dict[int, int] = {}


def get_plate_latched_state(cmd: int) -> Optional[int]:
    """Latched 0/1 for F_IN01–10; None if not a plate toggle cmd."""
    c = int(cmd)
    if not is_plate_toggle_cmd(c):
        return None
    return int(_latched.get(c, 0))


def handle_plate_input_status(cmd: int, state: int, bridge: Any) -> Optional[int]:
    """Process one 0x202 F_IN update. Returns latched UI state for F_IN01–10."""
    c = int(cmd)
    if not is_plate_toggle_cmd(c):
        return None

    st = 1 if int(state) else 0
    prev_raw = _raw_last.get(c, 0)
    if prev_raw == st:
        return _latched.get(c, 0)
    _raw_last[c] = st

    rising = st == 1 and prev_raw == 0
    prev_latch = int(_latched.get(c, 0))

    if rising:
        new_latch = 0 if prev_latch else 1
        _latched[c] = new_latch
        _on_latch_transition(c, new_latch, bridge)
    else:
        new_latch = prev_latch

    idx = index_for_cmd(c) or 0
    label = label_for_cmd(c)
    pin = pin_for_cmd(c)

    try:
        bridge.plateInputChanged.emit(idx, new_latch, label)
    except Exception:
        pass

    if rising:
        if new_latch == 1:
            bridge.commandErrorOccurred.emit(
                f"Plate ON (toggle): {label} ({pin})", "warning"
            )
        else:
            bridge.commandErrorOccurred.emit(
                f"Plate OFF (toggle): {label} ({pin})", "warning"
            )

    return new_latch


def _on_latch_transition(cmd: int, latch_on: int, bridge: Any) -> None:
    func = PLATE_FUNCTION_BY_CMD.get(int(cmd))
    if not func:
        return

    machine = bridge.machine
    on = bool(latch_on)

    if func == "emergency":
        if on:
            if not bridge.isEmergencyActive():
                bridge.emergencyStop()
        else:
            if bridge.isEmergencyActive():
                bridge.emergencyRelease()
        return

    if func == "filter_open":
        if on:
            run_machine_background("plate_filter_open", machine.filter_clean_phase_purge)
        else:
            run_machine_background("plate_filter_off", machine.filter_clean_off)
        return

    if func == "fl_brush_on":
        run_machine_background(
            "plate_fl_brush", lambda: _send_can(0x19, 1 if on else 0, force=not on)
        )
        return
    if func == "fr_brush_on":
        run_machine_background(
            "plate_fr_brush", lambda: _send_can(0x1A, 1 if on else 0, force=not on)
        )
        return
    if func in ("rl_brush_on", "rr_brush_on"):
        run_machine_background(
            "plate_rear_brush", lambda: _send_can(0x1B, 1 if on else 0, force=not on)
        )
        return

    if func == "dump_up_limit":
        if on:
            run_machine_background("plate_dump_up_lim", machine.dump_up_off)
        return
    if func == "dump_down_limit":
        if on:
            run_machine_background("plate_dump_down_lim", machine.dump_down_off)
        return
    if func == "gate_open_limit":
        if on:
            run_machine_background("plate_gate_open_lim", machine.gate_open_off)
        return
    if func == "gate_close_limit":
        if on:
            run_machine_background("plate_gate_close_lim", machine.gate_close_off)
        return