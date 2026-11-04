"""
Enable Quectel GNSS: AT port (default /dev/ttyUSB2) → AT+QGPS=1.
NMEA read port defaults to /dev/ttyUSB1 @ 115200 via logic/gps.py env vars.
"""
import os
import time


def _at_port():
    return os.environ.get("GPS_AT_PORT", "/dev/ttyUSB2").strip()


def _at_baud():
    try:
        return int(os.environ.get("GPS_AT_BAUD", "115200"))
    except ValueError:
        return 115200


def enable_gps_modem(retries: int = 2) -> bool:
    if os.environ.get("GPS_AT_DISABLE", "").strip().lower() in ("1", "true", "yes"):
        return False
    try:
        import serial
    except ImportError:
        print("GPS modem: pyserial not installed")
        return False

    port = _at_port()
    if not port or not os.path.exists(port):
        print(f"GPS modem: AT port missing ({port})")
        return False

    cmd = os.environ.get("GPS_AT_ENABLE_CMD", "AT+QGPS=1").strip()
    if not cmd.endswith("\r"):
        cmd = cmd + "\r"

    for attempt in range(max(1, retries)):
        try:
            ser = serial.Serial(port, _at_baud(), timeout=2)
            ser.write(cmd.encode("ascii", errors="ignore"))
            time.sleep(0.3)
            lines = []
            for _ in range(8):
                line = ser.readline().decode("ascii", errors="replace").strip()
                if line:
                    lines.append(line)
            ser.close()
            print(f"GPS modem: sent {cmd.strip()!r} on {port}; reply: {lines[:3]}")
            return True
        except Exception as exc:
            print(f"GPS modem attempt {attempt + 1}: {exc}")
            time.sleep(0.5)
    return False
