"""
Stable machine ID for this device: Raspberry Pi CPU serial when available, else random.
Persists to data/machine_info.json (creates minimal JSON if missing).
"""
import json
import os
import uuid

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MACHINE_INFO_FILE = os.path.join(BASE_DIR, "data", "machine_info.json")


def _read_cpu_serial():
    """Linux /proc/cpuinfo Serial line (Raspberry Pi). Empty if unavailable."""
    try:
        with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("Serial"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return ""


def generate_machine_id():
    """Unique ID string, stable on Pi across reboots when CPU serial exists."""
    s = _read_cpu_serial()
    if s and s != "0":
        tail = s[-10:] if len(s) >= 10 else s
        return f"pi-{tail}"
    return f"pi-{uuid.uuid4().hex[:12]}"


def read_or_create_machine_id():
    """
    Return machineId from machine_info.json, or generate, write file, and return.
    Does not overwrite an existing non-empty machineId.
    """
    os.makedirs(os.path.dirname(MACHINE_INFO_FILE), exist_ok=True)
    data = {}
    if os.path.exists(MACHINE_INFO_FILE):
        try:
            with open(MACHINE_INFO_FILE, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = {}
        except Exception:
            data = {}

    mid = (data.get("machineId") or data.get("machine_id") or "").strip()
    if mid:
        return mid

    mid = generate_machine_id()
    data["machineId"] = mid
    if "machine_id" in data:
        del data["machine_id"]
    try:
        with open(MACHINE_INFO_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
    return mid
