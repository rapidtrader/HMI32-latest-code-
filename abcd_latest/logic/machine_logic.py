import json
import os
import time
import threading
import urllib.error
import urllib.request
from datetime import datetime
import hardware.gpio_control as hw
from hardware.relay_io_map import relay_log
from hardware.can_sender import can_send, set_suction_speed

# Runtime tracking (shared across all Machine instances)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_FILE = os.path.join(BASE_DIR, "data", "runtime.json")
SESSIONS_FILE = os.path.join(BASE_DIR, "data", "suction_sessions.json")
MACHINE_INFO_FILE = os.path.join(BASE_DIR, "data", "machine_info.json")
def _production_run_log_url():
    """Node API — same base as get_backend_base() (logic.backend_clinet)."""
    from logic.backend_clinet import get_backend_base

    return f"{get_backend_base()}/api/production-run-log"

_suction_total_seconds = 0.0
_suction_start_time = None  # active litter-picker session (MCP 0x27 PB0 + PA0 air)
_pa0_fan_start_time = None  # follow-up / PA0-only suction without litter session rows
_daily_seconds = {}  # date_str "YYYY-MM-DD" -> seconds

# Per-cycle suction session log for Reports (start/stop + duration)
_suction_sessions = []  # list of dicts: {"date", "start", "stop", "duration_sec", "machine_id"}


# --- Litter = MCP2 0x27 PB0; sweeping = MCP2 0x27 PB1; suction motor = MCP1 PA0 ---
# HMI callbacks keep litter vs sweeping cards aligned when the other mode is forced off.
_sweeping_forced_off_ui = None
_litter_forced_off_ui = None
_litter_state = False
_sweeping_state = False

# State tracking for all functions
_left_extend_state = False
_left_retract_state = False
_right_extend_state = False
_right_retract_state = False
_front_up_state = False
_front_down_state = False
_rear_up_state = False
_rear_down_state = False

# CAN state tracking to avoid duplicate sends
_can_states = {
    0x01: None,  # SUCTION
    0x02: None,  # JET SPRAY
    0x03: None,  # BRUSH SPRAY
    0x04: None,  # DUMP UP
    0x05: None,  # DUMP DOWN
    0x06: None,  # GATE OPEN
    0x07: None,  # GATE CLOSE
    0x08: None,  # LEFT EXTEND
    0x09: None,  # LEFT RETRACT
    0x0A: None,  # RIGHT EXTEND
    0x0B: None,  # RIGHT RETRACT
    0x0C: None,  # REAR UP
    0x0D: None,  # REAR DOWN
    0x0E: None,  # FRONT UP
    0x0F: None,  # FRONT DOWN
    0x10: None,  # LITTER
    0x11: None,  # SWEEPING
    0x12: None,  # FCA OPEN
    0x13: None,  # FCA CLOSE
    0x14: None,  # FILTER MOTOR
    0x15: None,  # SUCTION SPEED
    0x16: None,  # EMERGENCY INPUT
    0x17: None,  # FRONT RIGHT BRUSH UP
    0x18: None,  # FRONT RIGHT BRUSH DOWN
    0x19: None,  # FRONT LEFT BRUSH MOTOR
    0x1A: None,  # FRONT RIGHT BRUSH MOTOR
    0x1B: None,  # REAR BRUSH MOTOR
}

_can_send_callback = None

def set_can_send_callback(callback):
    """Set the callback for sending CAN messages (for UI feedback)."""
    global _can_send_callback
    _can_send_callback = callback

def _send_can(cmd: int, state: int, force: bool = False):
    """Send CAN message and update UI feedback."""
    global _can_states, _can_send_callback
    if force or _can_states.get(cmd) != state:
        # Arm UI pending on main thread BEFORE sending so 0x202 is not missed.
        if _can_send_callback:
            try:
                _can_send_callback(cmd, state)
            except Exception as e:
                print(f"[DEBUG] CAN UI callback error: {e}")
        can_send(cmd, state, force)
        try:
            from logic.socket_client import emit_can_command
            emit_can_command(cmd, state)
        except Exception:
            pass
        _can_states[cmd] = state


def set_sweeping_forced_off_ui(cb):
    """Sweeper page: when litter picker turns on, force the SWEEPING card to show OFF."""
    global _sweeping_forced_off_ui
    _sweeping_forced_off_ui = cb


def set_litter_forced_off_ui(cb):
    """Sweeper page: when sweeping turns on, force LITTER PICKER card to show OFF."""
    global _litter_forced_off_ui
    _litter_forced_off_ui = cb


def _notify_sweeping_forced_off_ui():
    if _sweeping_forced_off_ui:
        try:
            _sweeping_forced_off_ui()
        except Exception:
            pass


def _notify_litter_forced_off_ui():
    if _litter_forced_off_ui:
        try:
            _litter_forced_off_ui()
        except Exception:
            pass


def _today_str():
    return datetime.now().strftime("%Y-%m-%d")


def _now_date_time():
    now = datetime.now()
    return now.strftime("%Y-%m-%d"), now.strftime("%H:%M:%S")


def _get_machine_id():
    """Load machine_id from machine_info.json; create stable auto ID if missing (see machine_identity)."""
    try:
        if os.path.exists(MACHINE_INFO_FILE):
            with open(MACHINE_INFO_FILE, "r") as f:
                data = json.load(f)
                mid = data.get("machineId") or data.get("machine_id", "") or ""
                if mid:
                    return str(mid).strip()
    except Exception:
        pass
    try:
        from logic.machine_identity import read_or_create_machine_id

        return read_or_create_machine_id()
    except Exception:
        return ""


def _load_runtime():
    """Load saved suction runtime from file."""
    global _suction_total_seconds, _daily_seconds
    try:
        if os.path.exists(RUNTIME_FILE):
            with open(RUNTIME_FILE, "r") as f:
                data = json.load(f)
                _suction_total_seconds = float(data.get("suction_total_seconds", 0))
                _daily_seconds = data.get("daily_seconds", {})
                if not isinstance(_daily_seconds, dict):
                    _daily_seconds = {}
                _daily_seconds = {k: float(v) for k, v in _daily_seconds.items()}
    except Exception:
        pass


def _save_runtime():
    """Save suction runtime to file."""
    global _suction_total_seconds, _suction_start_time, _pa0_fan_start_time, _daily_seconds
    try:
        total = _suction_total_seconds
        if _suction_start_time is not None:
            total += time.time() - _suction_start_time
        if _pa0_fan_start_time is not None:
            total += time.time() - _pa0_fan_start_time
        data = {
            "suction_total_seconds": total,
            "daily_seconds": _daily_seconds,
        }
        os.makedirs(os.path.dirname(RUNTIME_FILE), exist_ok=True)
        with open(RUNTIME_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


def _load_sessions():
    """Load per-cycle suction sessions from file."""
    global _suction_sessions
    try:
        if os.path.exists(SESSIONS_FILE):
            with open(SESSIONS_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    _suction_sessions = data
                else:
                    _suction_sessions = []
    except Exception:
        _suction_sessions = []


def _save_sessions():
    """Persist per-cycle suction sessions to file."""
    try:
        os.makedirs(os.path.dirname(SESSIONS_FILE), exist_ok=True)
        with open(SESSIONS_FILE, "w") as f:
            json.dump(_suction_sessions, f, indent=2)
    except Exception:
        pass


def sync_suction_sessions_to_api():
    """POST each completed, unsynced suction session to production-run-log API (one log per request) in a separate thread."""
    def _do_sync():
        global _suction_sessions
        synced_any = False
        for s in _suction_sessions:
            if s.get("synced"):
                continue
            stop_val = s.get("stop")
            if not stop_val:
                continue
            machine_id = str(s.get("machine_id") or s.get("machineId", "") or "")
            date_val = s.get("date", "")
            start_val = s.get("start", "")
            duration_sec = float(s.get("duration_sec", 0) or 0)
            if not all([machine_id, date_val, start_val]):
                continue
            total_sec = int(round(duration_sec))
            hours = total_sec // 3600
            minutes = (total_sec % 3600) // 60
            seconds = total_sec % 60
            formatted = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            payload = {
                "machine_id": machine_id,
                "date": date_val,
                "start_time": start_val,
                "stop_time": stop_val,
                "total_running_time": total_sec,
                "total_running_time_formatted": formatted,
            }
            try:
                req = urllib.request.Request(
                    _production_run_log_url(),
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if 200 <= resp.status < 300:
                        s["synced"] = True
                        synced_any = True
            except urllib.error.HTTPError as e:
                if e.fp:
                    e.read()
            except (urllib.error.URLError, Exception):
                pass
        if synced_any:
            _save_sessions()
    threading.Thread(target=_do_sync, daemon=True).start()


_load_runtime()
_load_sessions()


def save_runtime():
    """Persist runtime to file (call periodically or on shutdown)."""
    _save_runtime()
    _save_sessions()


def get_suction_runtime_seconds():
    """Total suction running time in seconds (for Reports)."""
    global _suction_total_seconds, _suction_start_time, _pa0_fan_start_time
    total = _suction_total_seconds
    if _suction_start_time is not None:
        total += time.time() - _suction_start_time
    if _pa0_fan_start_time is not None:
        total += time.time() - _pa0_fan_start_time
    return total


def get_suction_runtime_hours():
    """Total suction running time in hours (for Reports)."""
    return get_suction_runtime_seconds() / 3600.0


def get_daily_runtimes():
    """List of (date_str, seconds) sorted by date, for chart. Includes today's live total."""
    global _suction_total_seconds, _suction_start_time, _pa0_fan_start_time, _daily_seconds
    result = dict(_daily_seconds)
    today = _today_str()
    if _suction_start_time is not None:
        result[today] = result.get(today, 0) + (time.time() - _suction_start_time)
    if _pa0_fan_start_time is not None:
        result[today] = result.get(today, 0) + (time.time() - _pa0_fan_start_time)
    return sorted(result.items(), key=lambda x: x[0])


def get_suction_sessions(limit=None):
    """Return list of suction sessions for reports.

    Each entry: {"date", "start", "stop", "duration_sec", "machine_id"}
    """
    global _suction_sessions, _suction_start_time
    sessions = list(_suction_sessions)

    # If suction currently running, update the last open session's duration for display
    if _suction_start_time is not None and sessions:
        last = sessions[-1]
        if last.get("stop") is None and last.get("date") and last.get("start"):
            try:
                dt = datetime.strptime(
                    f"{last['date']} {last['start']}", "%Y-%m-%d %H:%M:%S"
                )
                last = dict(last)
                last["duration_sec"] = (datetime.now() - dt).total_seconds()
                sessions[-1] = last
            except Exception:
                pass

    if limit is not None:
        sessions = sessions[-int(limit) :]
    return sessions


def get_litter_state() -> bool:
    """Return current state of litter picker."""
    global _litter_state
    return _litter_state


def get_sweeping_state() -> bool:
    """Return current state of auto sweeping."""
    global _sweeping_state
    return _sweeping_state


def get_left_extend_state() -> bool:
    global _left_extend_state
    return _left_extend_state


def get_left_retract_state() -> bool:
    global _left_retract_state
    return _left_retract_state


def get_right_extend_state() -> bool:
    global _right_extend_state
    return _right_extend_state


def get_right_retract_state() -> bool:
    global _right_retract_state
    return _right_retract_state


def get_front_up_state() -> bool:
    global _front_up_state
    return _front_up_state


def get_front_down_state() -> bool:
    global _front_down_state
    return _front_down_state


def get_rear_up_state() -> bool:
    global _rear_up_state
    return _rear_up_state


def get_rear_down_state() -> bool:
    global _rear_down_state
    return _rear_down_state




class Machine:
    # ----- MCP2 @ 0x27: litter PB0, sweeping PB1 -----

    def _litter_relay_line_off(self):
        try:
            hw.interlock(hw.LITTER_ON, hw.LITTER_OFF)
        except Exception:
            pass
        try:
            hw.LITTER_ON.off()
        except Exception:
            pass

    def _litter_relay_line_on(self):
        try:
            hw.interlock(hw.LITTER_ON, hw.LITTER_OFF)
        except Exception:
            pass
        hw.LITTER_ON.on()

    def _sweep_relay_line_off(self):
        try:
            hw.interlock(hw.SWEEP_ON, hw.SWEEP_OFF)
        except Exception:
            pass
        try:
            hw.SWEEP_ON.off()
        except Exception:
            pass

    def _sweep_relay_line_on(self):
        try:
            hw.interlock(hw.SWEEP_ON, hw.SWEEP_OFF)
        except Exception:
            pass
        hw.SWEEP_ON.on()

    def _turn_off_sweeping_for_litter(self):
        """Turn sweeping relay (PB1) off when starting litter; sync SWEEPING card."""
        global _sweeping_state
        print(f"AUTO SWEEPING OFF{relay_log('SWEEP_ON')}")
        self._sweep_relay_line_off()
        _sweeping_state = False
        _notify_sweeping_forced_off_ui()

    def _stop_litter_picker_before_starting_sweeping(self):
        """Ensure litter PB0 is off before sweeping (PA0 suction left alone)."""
        global _litter_state
        if _suction_start_time is not None:
            self.litter_picker_off()
        else:
            print(f"LITTER PICKER OFF{relay_log('LITTER_ON')}")
            self._litter_relay_line_off()
            _litter_state = False

    def _accrue_pa0_fan_only_if_running(self):
        """Fold follow-up PA0-only runtime into totals before starting a litter session."""
        global _pa0_fan_start_time, _suction_total_seconds, _daily_seconds
        if _pa0_fan_start_time is None:
            return
        delta = time.time() - _pa0_fan_start_time
        _pa0_fan_start_time = None
        _suction_total_seconds += delta
        today = _today_str()
        _daily_seconds[today] = _daily_seconds.get(today, 0) + delta

    def force_zero_suction_pwm_hw(self):
        """Zero suction PWM state; force hardware suction off."""
        try:
            hw.SUCTION.off()
            su = hw.SUCTION
            if hasattr(su, "_value"):
                su._value = 0.0
        except Exception:
            pass

    # ===== LITTER PICKER (MCP 0x27 PB0 = LITTER_ON only — no PA0 suction here) =====
    def litter_picker_on(self):
        global _suction_start_time, _suction_sessions, _litter_state
        self._accrue_pa0_fan_only_if_running()
        self._turn_off_sweeping_for_litter()
        # print(f"LITTER PICKER ON{relay_log('LITTER_ON')}")
        self._litter_relay_line_on()
        _send_can(0x10, 1)
        _can_states[0x11] = 0
        _litter_state = True
        if _suction_start_time is None:
            _suction_start_time = time.time()
            date_str, time_str = _now_date_time()
            machine_id = _get_machine_id()
            _suction_sessions.append(
                {
                    "date": date_str,
                    "start": time_str,
                    "stop": None,
                    "duration_sec": 0.0,
                    "machine_id": machine_id,
                }
            )
            _save_sessions()
            try:
                from logic.socket_client import emit_suction_start
                emit_suction_start(date_str, time_str)
            except Exception:
                pass

    def litter_picker_off(self):
        global _suction_total_seconds, _suction_start_time, _daily_seconds, _suction_sessions, _litter_state
        # print(f"LITTER PICKER OFF{relay_log('LITTER_ON')}")
        self._litter_relay_line_off()
        _send_can(0x10, 0)
        _litter_state = False
        if _suction_start_time is not None:
            delta = time.time() - _suction_start_time
            _suction_total_seconds += delta
            today = _today_str()
            _daily_seconds[today] = _daily_seconds.get(today, 0) + delta
            _suction_start_time = None

            date_val = None
            start_val = None
            stop_val = None
            if _suction_sessions:
                last = _suction_sessions[-1]
                if last.get("stop") is None:
                    _, time_str = _now_date_time()
                    last["stop"] = time_str
                    last["duration_sec"] = float(last.get("duration_sec", 0.0)) + float(
                        delta
                    )
                    date_val = last.get("date")
                    start_val = last.get("start")
                    stop_val = time_str
            _save_sessions()
            if date_val and start_val and stop_val:
                try:
                    total_sec = int(round(delta))
                    hh = total_sec // 3600
                    mm = (total_sec % 3600) // 60
                    ss = total_sec % 60
                    formatted = f"{hh:02d}:{mm:02d}:{ss:02d}"
                    from logic.socket_client import emit_suction_stop
                    emit_suction_stop(date_val, start_val, stop_val, delta, formatted)
                except Exception:
                    pass
            sync_suction_sessions_to_api()
        _save_runtime()

    # ===== SUCTION MOTOR (MCP 0x26 PA0 PWM only — e.g. follow-up slider) =====
    def suction_on(self):
        global _pa0_fan_start_time
        # print(f"SUCTION ON{relay_log('SUCTION')}")
        hw.SUCTION.on()
        _send_can(0x01, 1)
        if _pa0_fan_start_time is None:
            _pa0_fan_start_time = time.time()

    def suction_set_power(self, volts: float):
        """Adjust suction PWM using 0–3.3 V-equivalent input from UI slider."""
        try:
            hw.set_suction_power(volts)
        except Exception:
            pass

    def suction_off(self):
        global _pa0_fan_start_time, _suction_total_seconds, _daily_seconds
        # print(f"SUCTION OFF{relay_log('SUCTION')}")
        hw.SUCTION.off()
        _send_can(0x01, 0)
        if _pa0_fan_start_time is not None:
            delta = time.time() - _pa0_fan_start_time
            _pa0_fan_start_time = None
            _suction_total_seconds += delta
            today = _today_str()
            _daily_seconds[today] = _daily_seconds.get(today, 0) + delta
        _save_runtime()

    def suction_set_speed(self, percent: int):
        """Set suction speed (0-100%) via PA4 DAC."""
        set_suction_speed(percent)

    # ===== JET =====
    def jet_on(self):
        # print(f"JET ON{relay_log('JET')}")
        hw.JET.on()
        _send_can(0x02, 1)

    def jet_off(self):
        # print(f"JET OFF{relay_log('JET')}")
        hw.JET.off()
        _send_can(0x02, 0)

    # ===== BRUSH SPRAY =====
    def spray_on(self):
        # print(f"SPRAY ON{relay_log('BRUSH_SPRAY')}")
        hw.BRUSH_SPRAY.on()
        _send_can(0x03, 1)

    def spray_off(self):
        # print(f"SPRAY OFF{relay_log('BRUSH_SPRAY')}")
        hw.BRUSH_SPRAY.off()
        _send_can(0x03, 0)

    # ===== VACUUM SYSTEM (independent of sweeping) =====
    def vacuum_on(self):
        # print(f"VACUUM ON{relay_log('VACUUM')}")
        hw.VACUUM.on()

    def vacuum_off(self):
        # print(f"VACUUM OFF{relay_log('VACUUM')}")
        hw.VACUUM.off()

    # ===== FILTER CLEAN (MCP2 0x27: PB3 open, PB4 close, PB5 motor) =====
    def _filter_clean_print_state(self, pb3_open: bool, pb5_motor: bool, pb4_close: bool) -> None:
        """3 outputs: whichever phase is active is ON; the other two show OFF in the log."""
        # print(f"FCA OPEN PB3 {'ON' if pb3_open else 'OFF'}{relay_log('FILTER_ACT_OPEN')}")
        # print(f"FILTER MOTOR PB5 {'ON' if pb5_motor else 'OFF'}{relay_log('FILTER_MOTOR')}")
        # print(f"FCA CLOSE PB4 {'ON' if pb4_close else 'OFF'}{relay_log('FILTER_ACT_CLOSE')}")
        pass

    def filter_clean_phase_purge(self):
        """PB3 OPEN on, PB4/PB5 off — start of cycle (5s purge on HMI)."""
        try:
            hw.FILTER_ACT_CLOSE.off()
            hw.FILTER_MOTOR.off()
            hw.FILTER_ACT_OPEN.on()
            self._filter_clean_print_state(True, False, False)
        except Exception:
            pass
        _send_can(0x12, 1)

    def filter_clean_phase_motor(self):
        """After purge: PB3 off, PB5 motor runs until user stops."""
        try:
            hw.FILTER_ACT_OPEN.off()
            hw.FILTER_MOTOR.on()
            self._filter_clean_print_state(False, True, False)
        except Exception:
            pass
        _send_can(0x12, 0)
        _send_can(0x14, 1)

    def filter_clean_phase_user_stopped(self):
        """User stopped motor: PB5 off, PB4 close actuator on."""
        try:
            hw.FILTER_MOTOR.off()
            hw.FILTER_ACT_CLOSE.on()
            self._filter_clean_print_state(False, False, True)
        except Exception:
            pass
        _send_can(0x14, 0)
        _send_can(0x13, 1)

    def filter_clean_phase_finish(self):
        """User finished: PB4 close actuator off."""
        try:
            hw.FILTER_ACT_CLOSE.off()
            self._filter_clean_print_state(False, False, False)
        except Exception:
            pass
        _send_can(0x13, 0)

    def filter_clean_off(self):
        """Master reset / page reset — all filter lines off."""
        try:
            hw.FILTER_ACT_OPEN.off()
            hw.FILTER_ACT_CLOSE.off()
            hw.FILTER_MOTOR.off()
            self._filter_clean_print_state(False, False, False)
        except Exception:
            pass
        _send_can(0x12, 0)
        _send_can(0x13, 0)
        _send_can(0x14, 0)

    # ===== AUTO SWEEPING (MCP2 0x27 PB1 — exclusive with litter PB0 in software) =====
    def auto_sweeping_on(self):
        global _sweeping_state
        self._stop_litter_picker_before_starting_sweeping()
        _notify_litter_forced_off_ui()
        # print(f"AUTO SWEEPING ON{relay_log('SWEEP_ON')}")
        self._sweep_relay_line_on()
        _send_can(0x11, 1)
        _can_states[0x10] = 0
        _sweeping_state = True

    def auto_sweeping_off(self):
        global _sweeping_state
        # print(f"AUTO SWEEPING OFF{relay_log('SWEEP_ON')}")
        self._sweep_relay_line_off()
        _send_can(0x11, 0)
        _sweeping_state = False

    # ===== DUMP MOMENTARY =====
    def dump_up_on(self):
        # print(f"DUMP UP ON{relay_log('DUMP_UP')}")
        hw.DUMP_UP.on()
        _send_can(0x04, 1)

    def dump_up_off(self):
        # print(f"DUMP UP OFF{relay_log('DUMP_UP')}")
        hw.DUMP_UP.off()
        _send_can(0x04, 0)

    def dump_down_on(self):
        # print(f"DUMP DOWN ON{relay_log('DUMP_DOWN')}")
        hw.DUMP_DOWN.on()
        _send_can(0x05, 1)

    def dump_down_off(self):
        # print(f"DUMP DOWN OFF{relay_log('DUMP_DOWN')}")
        hw.DUMP_DOWN.off()
        _send_can(0x05, 0)

    def dump_left_on(self):
        # print(f"DUMP LEFT ON{relay_log('DUMP_LEFT')}")
        hw.DUMP_LEFT.on()

    def dump_left_off(self):
        # print(f"DUMP LEFT OFF{relay_log('DUMP_LEFT')}")
        hw.DUMP_LEFT.off()

    # ===== GATE MOMENTARY =====
    def gate_open_on(self):
        # print(f"GATE OPEN ON{relay_log('GATE_OPEN')}")
        hw.GATE_OPEN.on()
        _send_can(0x06, 1)

    def gate_open_off(self):
        # print(f"GATE OPEN OFF{relay_log('GATE_OPEN')}")
        hw.GATE_OPEN.off()
        _send_can(0x06, 0)

    def gate_close_on(self):
        # print(f"GATE CLOSE ON{relay_log('GATE_CLOSE')}")
        hw.GATE_CLOSE.on()
        _send_can(0x07, 1)

    def gate_close_off(self):
        # print(f"GATE CLOSE OFF{relay_log('GATE_CLOSE')}")
        hw.GATE_CLOSE.off()
        _send_can(0x07, 0)

    # ===== BRUSH UP / DOWN (Front) — print opposite OFF first, then commanded ON =====
    def brush_down(self):
        global _front_up_state, _front_down_state
        # print(f"BRUSH UP OFF (Front){relay_log('FRONT_UP')}")
        hw.FRONT_UP.off()
        _front_up_state = False
        hw.FRONT_DOWN.on()
        _send_can(0x0F, 1)
        _can_states[0x0E] = 0
        _front_down_state = True

    def brush_up(self):
        global _front_up_state, _front_down_state
        # print(f"BRUSH DOWN OFF (Front){relay_log('FRONT_DOWN')}")
        hw.FRONT_DOWN.off()
        _front_down_state = False
        hw.FRONT_UP.on()
        _send_can(0x0E, 1)
        _can_states[0x0F] = 0
        _front_up_state = True

    def brush_down_off(self):
        global _front_down_state
        # print(f"BRUSH DOWN OFF (Front){relay_log('FRONT_DOWN')}")
        hw.FRONT_DOWN.off()
        _send_can(0x0F, 0)
        _front_down_state = False

    def brush_up_off(self):
        global _front_up_state
        # print(f"BRUSH UP OFF (Front){relay_log('FRONT_UP')}")
        hw.FRONT_UP.off()
        _send_can(0x0E, 0)
        _front_up_state = False

    # ===== BRUSH UP / DOWN (Rear) — OFF line first, then ON =====
    def rear_brush_down(self):
        global _rear_up_state, _rear_down_state
        # print(f"BRUSH UP OFF (Rear){relay_log('REAR_UP')}")
        hw.REAR_UP.off()
        _rear_up_state = False
        hw.REAR_DOWN.on()
        _send_can(0x0D, 1)
        _can_states[0x0C] = 0
        _rear_down_state = True

    def rear_brush_up(self):
        global _rear_up_state, _rear_down_state
        # print(f"BRUSH DOWN OFF (Rear){relay_log('REAR_DOWN')}")
        hw.REAR_DOWN.off()
        _rear_down_state = False
        hw.REAR_UP.on()
        _send_can(0x0C, 1)
        _can_states[0x0D] = 0
        _rear_up_state = True

    def rear_brush_down_off(self):
        global _rear_down_state
        # print(f"BRUSH DOWN OFF (Rear){relay_log('REAR_DOWN')}")
        hw.REAR_DOWN.off()
        _send_can(0x0D, 0)
        _rear_down_state = False

    def rear_brush_up_off(self):
        global _rear_up_state
        # print(f"BRUSH UP OFF (Rear){relay_log('REAR_UP')}")
        hw.REAR_UP.off()
        _send_can(0x0C, 0)
        _rear_up_state = False

    # ===== LEFT EXTRACT / RETRACT — opposite OFF print first, then ON =====
    def brush_left_left_on(self):
        global _left_extend_state, _left_retract_state
        # print(f"BRUSH LEFT - RETRACT OFF{relay_log('LEFT_RETRACT')}")
        hw.LEFT_RETRACT.off()
        _left_retract_state = False
        hw.LEFT_EXTEND.on()
        _send_can(0x08, 1)
        _can_states[0x09] = 0
        _left_extend_state = True

    def brush_left_left_off(self):
        global _left_extend_state
        # print(f"BRUSH LEFT - EXTRACT OFF{relay_log('LEFT_EXTEND')}")
        hw.LEFT_EXTEND.off()
        _send_can(0x08, 0)
        _left_extend_state = False

    def brush_left_right_on(self):
        global _left_extend_state, _left_retract_state
        # print(f"BRUSH LEFT - EXTRACT OFF{relay_log('LEFT_EXTEND')}")
        hw.LEFT_EXTEND.off()
        _left_extend_state = False
        hw.LEFT_RETRACT.on()
        _send_can(0x09, 1)
        _can_states[0x08] = 0
        _left_retract_state = True

    def brush_left_right_off(self):
        global _left_retract_state
        # print(f"BRUSH LEFT - RIGHT OFF{relay_log('LEFT_RETRACT')}")
        hw.LEFT_RETRACT.off()
        _send_can(0x09, 0)
        _left_retract_state = False

    # ===== RIGHT EXTRACT / RETRACT — opposite OFF print first, then ON =====
    def brush_right_left_on(self):
        global _right_extend_state, _right_retract_state
        print("Machine.brush_right_left_on() CALLED!")
        # print(f"BRUSH RIGHT - RETRACT OFF{relay_log('RIGHT_RETRACT')}")
        hw.RIGHT_RETRACT.off()
        _right_retract_state = False
        hw.RIGHT_EXTEND.on()
        _send_can(0x0A, 1)
        _can_states[0x0B] = 0
        _right_extend_state = True

    def brush_right_left_off(self):
        global _right_extend_state
        print("Machine.brush_right_left_off() CALLED!")
        # print(f"BRUSH RIGHT - EXTRACT OFF{relay_log('RIGHT_EXTEND')}")
        hw.RIGHT_EXTEND.off()
        _send_can(0x0A, 0)
        _right_extend_state = False

    def brush_right_right_on(self):
        global _right_extend_state, _right_retract_state
        # print(f"BRUSH RIGHT - EXTRACT OFF{relay_log('RIGHT_EXTEND')}")
        hw.RIGHT_EXTEND.off()
        _right_extend_state = False
        hw.RIGHT_RETRACT.on()
        _send_can(0x0B, 1)
        _can_states[0x0A] = 0
        _right_retract_state = True

    def brush_right_right_off(self):
        global _right_retract_state
        # print(f"BRUSH RIGHT - RIGHT OFF{relay_log('RIGHT_RETRACT')}")
        hw.RIGHT_RETRACT.off()
        _send_can(0x0B, 0)
        _right_retract_state = False