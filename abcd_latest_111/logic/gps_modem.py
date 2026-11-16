"""
Quectel GNSS: enable on AT port (EC20F: use /dev/ttyUSB3, not MM-locked ttyUSB2).
NMEA on /dev/ttyUSB1 @ 115200 (logic/gps.py).
"""
import os
import threading
import time
from typing import Any, Dict, List, Optional

_at_lock = threading.Lock()
_last_qgpsloc_err = ""
_last_qgpsloc_log = 0.0


def _at_port() -> str:
    return os.environ.get("GPS_AT_PORT", "/dev/ttyUSB3").strip()


def _at_baud() -> int:
    try:
        return int(os.environ.get("GPS_AT_BAUD", "115200"))
    except ValueError:
        return 115200


def _gnss_config_value() -> str:
    return os.environ.get("GPS_GNSS_CONFIG", "3").strip()


def _at_exchange(commands: List[str], timeout: float = 2.0) -> List[str]:
    try:
        import serial
    except ImportError:
        return []

    port = _at_port()
    if not port or not os.path.exists(port):
        return []

    lines: List[str] = []
    with _at_lock:
        try:
            ser = serial.Serial(port, _at_baud(), timeout=timeout)
            try:
                for cmd in commands:
                    payload = cmd if cmd.endswith("\r") else cmd + "\r"
                    ser.reset_input_buffer()
                    ser.write(payload.encode("ascii", errors="ignore"))
                    time.sleep(0.35)
                    deadline = time.time() + 1.2
                    while time.time() < deadline:
                        line = ser.readline().decode("ascii", errors="replace").strip()
                        if line:
                            lines.append(line)
                        elif ser.in_waiting == 0:
                            time.sleep(0.05)
                        if len(lines) >= 20:
                            break
            finally:
                ser.close()
        except Exception as exc:
            print(f"GPS modem AT: {exc}")
    return lines


def enable_gps_modem(retries: int = 2) -> bool:
    if os.environ.get("GPS_AT_DISABLE", "").strip().lower() in ("1", "true", "yes"):
        return False

    port = _at_port()
    if not port or not os.path.exists(port):
        print(f"GPS modem: AT port missing ({port})")
        return False

    gnss = _gnss_config_value()
    probe = _at_exchange(["AT+QGPS?"])
    if any("+QGPS: 1" in ln for ln in probe):
        print(f"GPS modem: GNSS already on ({port})")
        if gnss and os.environ.get("GPS_GNSS_RECONFIG", "0").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        ):
            _at_exchange([f'AT+QGPSCFG="gnssconfig",{gnss}'])
        return True

    commands: List[str] = []
    if os.environ.get("GPS_GNSS_RESET_ON_START", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        commands.append("AT+QGPSEND")
    if gnss:
        commands.append(f'AT+QGPSCFG="gnssconfig",{gnss}')
    commands.append(os.environ.get("GPS_AT_ENABLE_CMD", "AT+QGPS=1").strip())

    for attempt in range(max(1, retries)):
        lines = _at_exchange(commands)
        if lines:
            print(f"GPS modem: init on {port}; reply: {lines[:5]}")
            if any("OK" in ln for ln in lines) or any("+QGPS:" in ln for ln in lines):
                return True
        time.sleep(0.5)
    return False


def query_quectel_fix() -> Optional[Dict[str, Any]]:
    """Read position via AT+QGPSLOC when NMEA has no fix yet."""
    global _last_qgpsloc_err, _last_qgpsloc_log
    lines = _at_exchange(["AT+QGPSLOC=2"], timeout=2.5)
    text = "\n".join(lines)
    if "+QGPSLOC:" not in text:
        if "CME ERROR" in text:
            err = next((ln for ln in lines if "CME ERROR" in ln), text).strip()[:80]
            now = time.time()
            if err != _last_qgpsloc_err or (now - _last_qgpsloc_log) > 120.0:
                _last_qgpsloc_err = err
                _last_qgpsloc_log = now
                print(f"[GPS] QGPSLOC pending: {err} (normal until NMEA fix)")
        return None

    payload = None
    for ln in lines:
        if ln.startswith("+QGPSLOC:"):
            payload = ln.split(":", 1)[1].strip()
            break
    if not payload:
        return None

    parts = [p.strip() for p in payload.split(",")]
    if len(parts) < 6:
        return None

    try:
        lat = float(parts[1])
        lon = float(parts[2])
        hdop = float(parts[3]) if parts[3] else None
        alt = float(parts[4]) if parts[4] else None
        fix_type = int(float(parts[5]))
        nsat = int(float(parts[10])) if len(parts) > 10 and parts[10] else 0
    except (ValueError, IndexError):
        return None

    if fix_type < 1 or abs(lat) < 0.0001 or abs(lon) < 0.0001:
        return None

    return {
        "latitude": lat,
        "longitude": lon,
        "timestamp": datetime_utc_iso(),
        "fix_valid": True,
        "altitude": alt,
        "satellites": nsat,
        "hdop": hdop,
        "source": "quectel-qgpsloc",
    }


def datetime_utc_iso() -> str:
    from datetime import datetime

    return datetime.utcnow().isoformat() + "Z"
