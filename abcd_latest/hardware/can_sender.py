"""
CAN sender/receiver — shared bus singleton for machine_logic.py.
Opens can0 once on first call; degrades silently if unavailable.
Uses a message queue to handle rapid sends without overwhelming the bus.
Receives distance (0x201) and GPIO status (0x202) messages from STM32.
"""

import sys
import threading
import queue
import time
import math
from datetime import datetime

try:
    import can as _can
    # Only enable CAN on Linux (socketcan is Linux-only)
    if sys.platform != "linux":
        _CAN_AVAILABLE = False
        print("[DEBUG] python-can imported but not on Linux — CAN disabled")
    else:
        _CAN_AVAILABLE = True
        print("[DEBUG] python-can imported successfully!")
except ImportError:
    _CAN_AVAILABLE = False
    print("[DEBUG] python-can NOT installed — CAN disabled")    

from app.config import show_error

CAN_INTERFACE = "can0"
CAN_ID = 0x200
CAN_ID_DISTANCE = 0x201
CAN_ID_GPIO_STATUS = 0x202
CAN_ID_A25_SENSOR = 0x203
CAN_ID_SUCTION_ANALOG = 0x204
CAN_ID_PA0_ANALOG = 0x205
_RECV_CAN_IDS = (
    CAN_ID_DISTANCE,
    CAN_ID_GPIO_STATUS,
    CAN_ID_A25_SENSOR,
    CAN_ID_SUCTION_ANALOG,
    CAN_ID_PA0_ANALOG,
)
_RECV_CAN_FILTERS = [
    {"can_id": can_id, "can_mask": 0x7FF, "extended": False}
    for can_id in _RECV_CAN_IDS
]
COMMAND_NAMES = {
    0x01: "VACUUM RELAY",     # PA7
    0x02: "JET SPRAY",        # PC5
    0x03: "BRUSH SPRAY",      # PB1
    0x04: "DUMP UP",          # PE8
    0x05: "DUMP DOWN",        # PE10
    0x06: "GATE OPEN",        # PE12
    0x07: "GATE CLOSE",       # PE14
    0x08: "LB EXTEND",        # PB10
    0x09: "LB RETRACT",       # PA6
    0x0A: "RB EXTEND",        # PC4
    0x0B: "RB RETRACT",       # PB0
    0x0C: "RB UP",            # PE7
    0x0D: "RB DOWN",          # PE9
    0x0E: "FB UP",            # PE11
    0x0F: "FB DOWN",          # PE13
    0x10: "LITTER",           # PE15
    0x11: "SWEEPING",         # PE3
    0x12: "FCA OPEN",         # PE5
    0x13: "FCA CLOSE",        # PC13
    0x14: "FILTER MOTOR",     # PC1
    0x15: "SUCTION SPEED",    # PA5 (Analog/PWM)
}

STM32_PIN = {
    0x01: "PA7",    # VACUUM RELAY
    0x02: "PC5",    # JET SPRAY
    0x03: "PB1",    # BRUSH SPRAY
    0x04: "PE8",    # DUMP UP
    0x05: "PE10",   # DUMP DOWN
    0x06: "PE12",   # GATE OPEN
    0x07: "PE14",   # GATE CLOSE
    0x08: "PB10",   # LB EXTEND
    0x09: "PA6",    # LB RETRACT
    0x0A: "PC4",    # RB EXTEND
    0x0B: "PB0",    # RB RETRACT    
    0x0C: "PE7",    # RB UP
    0x0D: "PE9",    # RB DOWN
    0x0E: "PE11",   # FB UP
    0x0F: "PE13",   # FB DOWN
    0x10: "PE15",   # LITTER
    0x11: "PE3",    # SWEEPING
    0x12: "PE5",    # FCA OPEN
    0x13: "PC13",   # FCA CLOSE
    0x14: "PC1",    # FILTER MOTOR
    0x15: "PA5",    # SUCTION SPEED (Analog/PWM)
    
}
_bus_send = None
_bus_recv = None
_bus_lock = threading.Lock()
_msg_queue = queue.Queue()
_worker_thread = None
_worker_running = False
_receiver_thread = None
_receiver_running = False
_last_cmd = None
_last_state = None

# Real-time data storage
_distance_cm = 0
_gpio_status = {}  # cmd -> state
_suction_adc = 0  # 0-4095
_pa0_adc = 0  # 0-4095
_a25_distance = 0
_a25_raw_data = []
_a25_last_valid_raw_data = []
_a25_invalid_count = 0
_a25_has_valid_data = False  # Track if we've ever received valid data
_a25_status = "Waiting for A25 data..."
_a25_debug_info = ""  # For detailed debugging
_distance_callbacks = []
_gpio_status_callbacks = []
_send_success_callbacks = []
_suction_adc_callbacks = []
_pa0_adc_callbacks = []
_a25_callbacks = []
_message_log = []
_max_log_entries = 200  # Increased to show more history
_data_lock = threading.Lock()  # Add lock for thread safety

def _get_timestamp_ms():
    """Get timestamp with milliseconds in HH:MM:SS.sss format."""
    now = datetime.now()
    return now.strftime("%H:%M:%S.") + f"{now.microsecond // 1000:03d}"

# Add test log entries and simulated updates if we're not on Linux
_simulated_update_count = 0

def _simulated_update_loop():
    """Simulates periodic CAN updates when CAN is not available (for testing)."""
    global _simulated_update_count, _distance_cm, _message_log, _suction_adc, _a25_distance, _a25_raw_data, _a25_last_valid_raw_data, _a25_status, _a25_debug_info, _a25_invalid_count, _a25_has_valid_data
    print("[DEBUG] Starting simulated update loop for testing")
    while True:
        time.sleep(0.2)  # 200ms
        _simulated_update_count += 1
        # Update distance
        new_dist = 50 + (_simulated_update_count % 50)
        _distance_cm = new_dist
        # Update suction ADC (simulate 0-4095)
        _suction_adc = int(2047 + 2047 * math.sin(_simulated_update_count * 0.1))
        # Update PA0 ADC (simulate 0-4095)
        _pa0_adc = int(2047 + 2047 * math.cos(_simulated_update_count * 0.15))
        # Update A25 distance (simulate 0-700 mm → 0-70 cm)
        _a25_distance = 300 + (_simulated_update_count % 70)*10  # in mm
        byte0 = 0xFF
        byte1 = (_a25_distance >> 8) & 0xFF
        byte2 = _a25_distance & 0xFF
        calculated_checksum = (byte0 + byte1 + byte2) & 0xFF
        _a25_raw_data = [byte0, byte1, byte2, calculated_checksum, byte1, byte2, 0x00, 0x00]
        _a25_last_valid_raw_data = _a25_raw_data
        _a25_has_valid_data = True
        _a25_status = "Valid data"
        last_valid_str = " ".join(f"{b:02X}" for b in _a25_last_valid_raw_data[:4])
        _a25_debug_info = f"Invalid ignored: {_a25_invalid_count} | Last valid raw: {last_valid_str}"
        # Add distance log entry
        timestamp = _get_timestamp_ms()
        _message_log.append({
            "timestamp": timestamp,
            "arbitration_id": 0x201,
            "data": [(new_dist >> 8) & 0xFF, new_dist & 0xFF],
            "type": "distance",
            "value": new_dist
        })
        # Add A25 log entry
        _message_log.append({
            "timestamp": timestamp,
            "arbitration_id": 0x203,
            "data": _a25_raw_data,
            "type": "a25",
            "value": _a25_distance,
            "raw_data": _a25_raw_data,
            "status": _a25_status
        })
        # Add suction analog log entry
        _message_log.append({
            "timestamp": timestamp,
            "arbitration_id": 0x204,
            "data": [(_suction_adc >> 8) & 0xFF, _suction_adc & 0xFF],
            "type": "suction_analog",
            "value": _suction_adc
        })
        # Add PA0 analog log entry
        _message_log.append({
            "timestamp": timestamp,
            "arbitration_id": 0x205,
            "data": [(_pa0_adc >> 8) & 0xFF, _pa0_adc & 0xFF],
            "type": "pa0_analog",
            "value": _pa0_adc
        })
        if len(_message_log) > _max_log_entries:
            _message_log.pop(0)
        # Call distance callbacks
        for callback in _distance_callbacks:
            try:
                callback(_distance_cm)
            except Exception as e:
                print(f"[DEBUG] Simulated distance callback error: {e}")
        # Call A25 callbacks
        for callback in _a25_callbacks:
            try:
                callback(_a25_distance, _a25_last_valid_raw_data, _a25_status)
            except Exception as e:
                print(f"[DEBUG] Simulated A25 callback error: {e}")
        # Call suction ADC callbacks
        for callback in _suction_adc_callbacks:
            try:
                callback(_suction_adc)
            except Exception as e:
                print(f"[DEBUG] Simulated suction ADC callback error: {e}")
        # Call PA0 ADC callbacks
        for callback in _pa0_adc_callbacks:
            try:
                callback(_pa0_adc)
            except Exception as e:
                print(f"[DEBUG] Simulated PA0 ADC callback error: {e}")
        # Send 2 random GPIO status updates
        for i in range(2):
            cmd = 1 + (_simulated_update_count + i) % 20
            state = (_simulated_update_count + i) % 2
            _gpio_status[cmd] = state
            _message_log.append({
                "timestamp": _get_timestamp_ms(),
                "arbitration_id": 0x202,
                "data": [cmd, state],
                "type": "gpio",
                "cmd": cmd,
                "state": state,
                "name": COMMAND_NAMES.get(cmd, f"CMD_0x{cmd:02X}"),
                "pin": STM32_PIN.get(cmd, "???")
            })
            if len(_message_log) > _max_log_entries:
                _message_log.pop(0)
            # Call GPIO callbacks for this cmd
            for callback in _gpio_status_callbacks:
                try:
                    callback(cmd, state)
                except Exception as e:
                    print(f"[DEBUG] Simulated GPIO callback error: {e}")
        print(f"[DEBUG] Simulated update #{_simulated_update_count}")

if sys.platform != "linux":
    test_time = _get_timestamp_ms()
    _message_log.append({
        "timestamp": test_time,
        "arbitration_id": 0x201,
        "data": [0, 50],
        "type": "distance",
        "value": 50
    })
    _message_log.append({
        "timestamp": test_time,
        "arbitration_id": 0x202,
        "data": [1, 1],
        "type": "gpio",
        "cmd": 1,
        "state": 1,
        "name": "SUCTION",
        "pin": STM32_PIN.get(1, "???")
    })
    _message_log.append({
        "timestamp": test_time,
        "arbitration_id": 0x202,
        "data": [2, 0],
        "type": "gpio",
        "cmd": 2,
        "state": 0,
        "name": "JET SPRAY",
        "pin": STM32_PIN.get(2, "???")
    })
    # Start simulated update thread
    sim_thread = threading.Thread(target=_simulated_update_loop, daemon=True)
    sim_thread.start()


def register_distance_callback(callback):
    """Register a callback for distance updates (called with distance_cm)."""
    _distance_callbacks.append(callback)


def register_gpio_status_callback(callback):
    """Register a callback for GPIO status updates (called with cmd, state)."""
    _gpio_status_callbacks.append(callback)


def register_send_success_callback(callback):
    """Register a callback when a CAN command is sent on the bus (cmd, state)."""
    _send_success_callbacks.append(callback)


def register_suction_adc_callback(callback):
    """Register a callback for suction analog updates (called with adc_value 0-4095)."""
    _suction_adc_callbacks.append(callback)


def register_pa0_adc_callback(callback):
    """Register a callback for PA0 analog updates (called with adc_value 0-4095)."""
    _pa0_adc_callbacks.append(callback)


def register_a25_callback(callback):
    """Register a callback for A25 sensor updates (called with distance, raw_data, status)."""
    _a25_callbacks.append(callback)


def get_current_distance():
    """Get the most recent distance reading (cm)."""
    return _distance_cm


def get_a25_distance():
    """Get the most recent A25 distance reading (cm)."""
    with _data_lock:
        return _a25_distance


def get_a25_raw_data():
    """Get the most recent valid A25 raw data bytes."""
    with _data_lock:
        return _a25_last_valid_raw_data.copy() if _a25_last_valid_raw_data else []


def get_a25_current_raw_data():
    """Get the most recent A25 raw data bytes (even invalid)."""
    with _data_lock:
        return _a25_raw_data.copy() if _a25_raw_data else []


def get_a25_status():
    """Get the A25 sensor status message."""
    with _data_lock:
        return _a25_status


def get_a25_debug_info():
    """Get detailed A25 debug information."""
    with _data_lock:
        return _a25_debug_info


def get_message_log():
    """Get the recent message log."""
    return _message_log.copy()

def get_gpio_state(cmd):
    """Get the current state of a specific GPIO command."""
    return _gpio_status.get(cmd, 0)


def get_suction_adc():
    """Get the most recent suction analog reading (0-4095)."""
    return _suction_adc


def get_pa0_adc():
    """Get the most recent PA0 analog reading (0-4095)."""
    return _pa0_adc


def add_error_log_entry(cmd: int, state: int, error_msg: str) -> None:
    """Add an error entry to the CAN message log from external code."""
    timestamp = _get_timestamp_ms()
    name = COMMAND_NAMES.get(cmd, f"CMD_0x{cmd:02X}")
    pin = STM32_PIN.get(cmd, "???")
    _message_log.append({
        "timestamp": timestamp,
        "arbitration_id": CAN_ID,
        "data": [cmd, state],
        "type": "gpio",
        "cmd": cmd,
        "state": state,
        "name": name,
        "pin": pin,
        "error": True,
        "error_msg": error_msg
    })
    if len(_message_log) > _max_log_entries:
        _message_log.pop(0)


def _reset_bus():
    """Reset the CAN bus on errors."""
    global _bus_send, _bus_recv
    with _bus_lock:
        for bus in (_bus_send, _bus_recv):
            if bus is not None:
                try:
                    bus.shutdown()
                except Exception:
                    pass
        _bus_send = None
        _bus_recv = None


def _open_can_bus(label: str, can_filters=None):
    print(f"[DEBUG] Trying to open CAN bus {CAN_INTERFACE} ({label})")
    kwargs = {
        "channel": CAN_INTERFACE,
        "interface": "socketcan",
        "receive_own_messages": False,
    }
    if can_filters is not None:
        kwargs["can_filters"] = can_filters
    bus = _can.interface.Bus(**kwargs)
    print(f"[DEBUG] CAN: bus opened on {CAN_INTERFACE} ({label})")
    return bus


def _get_send_bus():
    global _bus_send
    if not _CAN_AVAILABLE:
        return None
    if _bus_send is not None:
        return _bus_send
    with _bus_lock:
        if _bus_send is not None:
            return _bus_send
        try:
            _bus_send = _open_can_bus("send")
        except Exception as e:
            _handle_bus_open_error(e)
            _bus_send = None
    return _bus_send


def _get_recv_bus():
    global _bus_recv
    if not _CAN_AVAILABLE:
        return None
    if _bus_recv is not None:
        return _bus_recv
    with _bus_lock:
        if _bus_recv is not None:
            return _bus_recv
        try:
            _bus_recv = _open_can_bus("recv", can_filters=_RECV_CAN_FILTERS)
        except Exception as e:
            _handle_bus_open_error(e)
            _bus_recv = None
    return _bus_recv


def _handle_bus_open_error(e: Exception) -> None:
    error_msg = str(e).lower()
    if "network is down" in error_msg or "no such device" in error_msg:
        err_text = (
            f"CAN network is down (device {CAN_INTERFACE}) — "
            "please bring up the CAN interface first!"
        )
    else:
        err_text = f"Cannot open CAN bus {CAN_INTERFACE} — {e}"
    print(f"ERROR: {err_text}")
    show_error(err_text, severity="error")


def _get_bus():
    """Backward-compatible alias for send bus."""
    return _get_send_bus()

def _can_receiver():
    """Worker thread to receive CAN messages from STM32."""
    global _distance_cm
    global _gpio_status
    global _suction_adc
    global _pa0_adc
    global _a25_distance
    global _a25_raw_data
    global _a25_last_valid_raw_data
    global _a25_invalid_count
    global _a25_has_valid_data
    global _a25_status
    global _a25_debug_info

    print("[DEBUG] Starting CAN receiver thread")
    print(
        f"[DEBUG] Listening for CAN IDs: "
        f"distance={hex(CAN_ID_DISTANCE)}, "
        f"gpio_status={hex(CAN_ID_GPIO_STATUS)}, "
        f"a25_sensor={hex(CAN_ID_A25_SENSOR)}, "
        f"suction_analog={hex(CAN_ID_SUCTION_ANALOG)}, "
        f"pa0_analog={hex(CAN_ID_PA0_ANALOG)}"
    )

    msg_count = 0

    while _receiver_running:
        try:
            bus = _get_recv_bus()

            if bus is None:
                print("[DEBUG] CAN recv bus is None, waiting...")
                time.sleep(0.1)
                continue

            msg = bus.recv(timeout=0.1)

            if msg is None:
                continue

            msg_count += 1
            timestamp = _get_timestamp_ms()

            print(
                f"[DEBUG] Received CAN message #{msg_count}: "
                f"ID={hex(msg.arbitration_id)}, data={list(msg.data)}"
            )

            log_entry = {
                "timestamp": timestamp,
                "arbitration_id": msg.arbitration_id,
                "data": list(msg.data)
            }

            if msg.arbitration_id == CAN_ID_DISTANCE and len(msg.data) >= 2:
                _distance_cm = (msg.data[0] << 8) | msg.data[1]

                log_entry["type"] = "distance"
                log_entry["value"] = _distance_cm

                print(f"[DEBUG]  → This is a DISTANCE message: {_distance_cm} cm")

                for callback in _distance_callbacks:
                    try:
                        callback(_distance_cm)
                    except Exception as e:
                        print(f"[DEBUG] Distance callback error: {e}")

            elif msg.arbitration_id == CAN_ID_GPIO_STATUS and len(msg.data) >= 2:
                cmd = msg.data[0]
                state = msg.data[1]

                _gpio_status[cmd] = state

                log_entry["type"] = "gpio"
                log_entry["cmd"] = cmd
                log_entry["state"] = state
                log_entry["name"] = COMMAND_NAMES.get(cmd, f"CMD_0x{cmd:02X}")
                log_entry["pin"] = STM32_PIN.get(cmd, "???")

                print(
                    f"[DEBUG]  → This is a GPIO message: "
                    f"{log_entry['name']} ({log_entry['pin']}) "
                    f"{'ON' if state else 'OFF'}"
                )

                for callback in _gpio_status_callbacks:
                    try:
                        callback(cmd, state)
                    except Exception as e:
                        print(f"[DEBUG] GPIO status callback error: {e}")

            elif msg.arbitration_id == CAN_ID_A25_SENSOR and len(msg.data) >= 8:
                with _data_lock:
                    byte0 = msg.data[0]
                    byte1 = msg.data[1]
                    byte2 = msg.data[2]
                    byte3 = msg.data[3]

                    calculated_checksum = (byte0 + byte1 + byte2) & 0xFF

                    if byte0 == 0xFF and calculated_checksum == byte3:
                        _a25_raw_data = list(msg.data)
                        _a25_last_valid_raw_data = list(msg.data)
                        _a25_distance = (byte1 << 8) | byte2
                        _a25_has_valid_data = True
                        _a25_status = "Valid data"

                        log_entry["type"] = "a25"
                        log_entry["value"] = _a25_distance
                    else:
                        _a25_invalid_count += 1
                        log_entry["type"] = "a25_error"

                        if byte0 != 0xFF:
                            log_entry["error"] = "Invalid header"
                        else:
                            log_entry["error"] = "Invalid checksum"

                        if not _a25_has_valid_data:
                            _a25_status = "Waiting for A25 data..."

                    if _a25_has_valid_data:
                        last_valid_str = " ".join(
                            f"{b:02X}" for b in _a25_last_valid_raw_data[:4]
                        )
                        _a25_debug_info = (
                            f"Invalid ignored: {_a25_invalid_count} | "
                            f"Last valid raw: {last_valid_str}"
                        )
                    else:
                        _a25_debug_info = f"Invalid ignored: {_a25_invalid_count}"

                    print(f"[DEBUG] A25: {_a25_debug_info}")

                log_entry["raw_data"] = list(msg.data)
                log_entry["status"] = _a25_status

                for callback in _a25_callbacks:
                    try:
                        callback(_a25_distance, _a25_last_valid_raw_data, _a25_status)
                    except Exception as e:
                        print(f"[DEBUG] A25 callback error: {e}")

            elif msg.arbitration_id == CAN_ID_SUCTION_ANALOG and len(msg.data) >= 2:
                _suction_adc = (msg.data[0] << 8) | msg.data[1]

                log_entry["type"] = "suction_analog"
                log_entry["value"] = _suction_adc

                print(
                    f"[DEBUG]  → This is a SUCTION ANALOG message: "
                    f"{_suction_adc} (0-4095)"
                )

                for callback in _suction_adc_callbacks:
                    try:
                        callback(_suction_adc)
                    except Exception as e:
                        print(f"[DEBUG] Suction ADC callback error: {e}")

            elif msg.arbitration_id == CAN_ID_PA0_ANALOG and len(msg.data) >= 2:
                _pa0_adc = (msg.data[0] << 8) | msg.data[1]

                log_entry["type"] = "pa0_analog"
                log_entry["value"] = _pa0_adc

                print(
                    f"[DEBUG]  → This is a PA0 ANALOG message: "
                    f"{_pa0_adc} (0-4095)"
                )

                for callback in _pa0_adc_callbacks:
                    try:
                        callback(_pa0_adc)
                    except Exception as e:
                        print(f"[DEBUG] PA0 ADC callback error: {e}")

            else:
                print(
                    f"[DEBUG]  → Ignoring CAN message with ID: "
                    f"{hex(msg.arbitration_id)}"
                )

            _message_log.append(log_entry)

            if len(_message_log) > _max_log_entries:
                _message_log.pop(0)

        except _can.CanError as e:
            print(f"[DEBUG] CAN receiver error: {e}")
            _reset_bus()
            time.sleep(0.5)

        except Exception as e:
            print(f"[DEBUG] CAN receiver unexpected error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(0.1)

def _can_worker():
    """Worker thread to process CAN messages from the queue."""
    global _worker_running
    while _worker_running:
        try:
            # Wait for a message with a timeout to check _worker_running periodically
            msg_data = _msg_queue.get(timeout=0.1)
            cmd, state = msg_data
            name = COMMAND_NAMES.get(cmd, f"CMD_0x{cmd:02X}")
            pin = STM32_PIN.get(cmd, "???")
            label = "ON" if state else "OFF"

            bus = _get_send_bus()
            if bus is None:
                print(f"ERROR: CAN network is down, cannot send {name} {label}")
                # Add error log entry
                timestamp = _get_timestamp_ms()
                _message_log.append({
                    "timestamp": timestamp,
                    "arbitration_id": CAN_ID,
                    "data": [cmd, state],
                    "type": "gpio",
                    "cmd": cmd,
                    "state": state,
                    "name": name,
                    "pin": pin,
                    "error": True,
                    "error_msg": "CAN network is down"
                })
                if len(_message_log) > _max_log_entries:
                    _message_log.pop(0)
                _msg_queue.task_done()
                continue

            msg = _can.Message(
                arbitration_id=CAN_ID,
                data=[cmd, state],
                is_extended_id=False,
            )
            print(f"[DEBUG] Sending CAN msg: arbitration_id=0x{CAN_ID:03X}, data={msg.data}")
            
            success = False
            retry_count = 3
            for attempt in range(retry_count):
                try:
                    with _bus_lock:
                        bus.send(msg)
                    success = True
                    break
                except _can.CanError as e:
                    error_msg = str(e).lower()
                    if "no buffer space" in error_msg or "buffer full" in error_msg:
                        print(f"[DEBUG] CAN buffer full, waiting (attempt {attempt+1}/{retry_count})")
                        time.sleep(0.05 * (attempt + 1))  # Exponential backoff
                    else:
                        if "network is down" in error_msg:
                            err_text = f"CAN network is down while sending {name} {label}"
                        else:
                            err_text = f"Failed to send {name} {label} — {e}"
                        print(f"ERROR: {err_text}")
                        show_error(err_text, severity="error")
                        _reset_bus()
                        break
            
            if success:
                print(f"SUCCESS: {name} {label} {pin} (sent successfully)")
                for callback in _send_success_callbacks:
                    try:
                        callback(cmd, state)
                    except Exception as e:
                        print(f"[DEBUG] send_success callback error: {e}")
            else:
                # Add error log entry
                timestamp = _get_timestamp_ms()
                _message_log.append({
                    "timestamp": timestamp,
                    "arbitration_id": CAN_ID,
                    "data": [cmd, state],
                    "type": "gpio",
                    "cmd": cmd,
                    "state": state,
                    "name": name,
                    "pin": pin,
                    "error": True,
                    "error_msg": "Failed to send CAN message"
                })
                if len(_message_log) > _max_log_entries:
                    _message_log.pop(0)
            
        except queue.Empty:
            continue
        except Exception as e:
            print(f"[DEBUG] CAN worker error: {e}")
        finally:
            # Small delay to prevent buffer overflow
            time.sleep(0.05)  # Increased delay from 20ms to 50ms
            try:
                _msg_queue.task_done()
            except Exception:
                pass


def start_can_monitor():
    """Start the CAN receiver thread automatically (even if no messages are being sent)."""
    print("[DEBUG] start_can_monitor() called")
    _start_worker()


def _start_worker():
    """Start the CAN worker and receiver threads if they're not already running."""
    global _worker_thread, _worker_running, _receiver_thread, _receiver_running
    
    # Start sender worker
    if _worker_thread is None or not _worker_thread.is_alive():
        _worker_running = True
        _worker_thread = threading.Thread(target=_can_worker, daemon=True)
        _worker_thread.start()
    
    # Start receiver worker
    if _receiver_thread is None or not _receiver_thread.is_alive():
        _receiver_running = True
        _receiver_thread = threading.Thread(target=_can_receiver, daemon=True)
        _receiver_thread.start()


def can_send(cmd: int, state: int, force: bool = False) -> bool:
    """Send [cmd, state] on CAN ID 0x200 (queued). Returns True immediately."""
    global _last_cmd, _last_state
    print(f"[DEBUG] can_send() called: cmd=0x{cmd:02X}, state={state}, force={force}")
    if not _CAN_AVAILABLE:
        print(f"[DEBUG] CAN not available, simulating {COMMAND_NAMES.get(cmd, f'CMD_0x{cmd:02X}')} {'ON' if state else 'OFF'}")
        # Simulate a reply after a short delay for testing
        def simulate_reply():
            import time
            time.sleep(0.2)  # 200ms delay to simulate STM32 processing
            _gpio_status[cmd] = state
            timestamp = _get_timestamp_ms()
            _message_log.append({
                "timestamp": timestamp,
                "arbitration_id": 0x202,
                "data": [cmd, state],
                "type": "gpio",
                "cmd": cmd,
                "state": state,
                "name": COMMAND_NAMES.get(cmd, f"CMD_0x{cmd:02X}"),
                "pin": STM32_PIN.get(cmd, "???")
            })
            if len(_message_log) > _max_log_entries:
                _message_log.pop(0)
            for callback in _gpio_status_callbacks:
                try:
                    callback(cmd, state)
                except Exception as e:
                    print(f"[DEBUG] Simulated GPIO callback error: {e}")
        threading.Thread(target=simulate_reply, daemon=True).start()
        return False
    
    # Skip duplicate consecutive messages unless force is True
    if not force and _last_cmd == cmd and _last_state == state:
        print(f"[DEBUG] Skipping duplicate CAN msg: cmd=0x{cmd:02X}, state={state}")
        return True
    
    # Limit queue size to prevent memory issues and buffer overflow
    if _msg_queue.qsize() > 20:
        print(f"[DEBUG] CAN queue full, skipping msg: cmd=0x{cmd:02X}, state={state}")
        return False
    
    _start_worker()
    _msg_queue.put((cmd, state))
    _last_cmd = cmd
    _last_state = state
    return True


def set_suction_speed(percent: int) -> bool:
    """Set suction speed (0-100%) via CAN command 0x15."""
    if not _CAN_AVAILABLE:
        print(f"[DEBUG] CAN not available, simulating suction speed {percent}%")
        # Simulate a reply for testing
        def simulate_reply():
            import time
            time.sleep(0.2)
            timestamp = _get_timestamp_ms()
            _message_log.append({
                "timestamp": timestamp,
                "arbitration_id": 0x202,
                "data": [0x15, percent],
                "type": "gpio",
                "cmd": 0x15,
                "state": percent,
                "name": "SUCTION SPEED",
                "pin": "PA5"
            })
            if len(_message_log) > _max_log_entries:
                _message_log.pop(0)
            for callback in _gpio_status_callbacks:
                try:
                    callback(0x15, percent)
                except Exception as e:
                    print(f"[DEBUG] Simulated suction speed callback error: {e}")
        threading.Thread(target=simulate_reply, daemon=True).start()
        return False
    
    # Clamp percent to 0-100
    clamped_percent = max(0, min(100, percent))
    _start_worker()
    _msg_queue.put((0x15, clamped_percent))
    return True
