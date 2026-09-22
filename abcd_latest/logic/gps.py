import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime

try:
    import pynmea2
    import serial
except ImportError:
    pynmea2 = None
    serial = None

_GPS_DEBUG = os.environ.get("GPS_DEBUG", "0").strip() == "1"
_GPS_TERM_LAST = {}


def _gps_term_interval_sec():
    try:
        return max(1.0, float(os.environ.get("GPS_TERMINAL_WARN_INTERVAL_SEC", "3600")))
    except ValueError:
        return 60.0


def _gps_print_terminal(key: str, message: str) -> None:
    now = time.monotonic()
    interval = _gps_term_interval_sec()
    last = _GPS_TERM_LAST.get(key)
    if last is not None and (now - last) < interval:
        return
    _GPS_TERM_LAST[key] = now
    print(message)


def _gps_serial_port():
    env = os.environ.get("GPS_SERIAL_PORT", "").strip()
    if env:
        return env
    if os.name == "nt":
        return ""
    return "/dev/serial0"


def _gps_baud():
    try:
        return int(os.environ.get("GPS_BAUD", "38400"))
    except ValueError:
        return 38400


def _is_position_sentence(line):
    return len(line) >= 6 and line.startswith("$") and line[3:6] in ("GGA", "RMC")


def get_gps_data():
    if serial is None or pynmea2 is None:
        _gps_print_terminal("no_deps", "GPS: install pyserial and pynmea2")
        return None

    port = _gps_serial_port()
    if not port:
        _gps_print_terminal(
            "no_port",
            "GPS: set GPS_SERIAL_PORT (e.g. COM4 on Windows, /dev/serial0 on Pi)",
        )
        return None
    try:
        ser = serial.Serial(port, _gps_baud(), timeout=2)
        for _ in range(20):
            line = ser.readline().decode("ascii", errors="replace").strip()
            if _is_position_sentence(line):
                try:
                    msg = pynmea2.parse(line)
                    lat, lon = msg.latitude, msg.longitude
                    if lat is not None and lon is not None:
                        return {
                            "latitude": lat,
                            "longitude": lon,
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                        }
                except Exception:
                    pass
        ser.close()
    except Exception as e:
        _gps_print_terminal("serial_read", f"GPS Error: {e}")
    return None


def get_machine_id():
    try:
        from logic.machine_logic import _get_machine_id

        m = _get_machine_id()
        if m:
            return str(m).strip()
    except Exception:
        pass
    return os.environ.get("MACHINE_ID", "").strip() or "unknown"
