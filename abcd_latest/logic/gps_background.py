"""
Background GPS: har N second (default 1) fix read → data/gps_latest.json save → production API push.

Disable: GPS_SYNC_DISABLED=1
Interval: GPS_SYNC_INTERVAL_SEC=2 (default; lower = more CPU on Pi)
"""
import json
import os
import tempfile
import threading
import time
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GPS_LATEST_JSON = os.path.join(BASE_DIR, "data", "gps_latest.json")

def _interval_sec():
    try:
        return max(0.5, float(os.environ.get("GPS_SYNC_INTERVAL_SEC", "2")))
    except ValueError:
        return 1.0


def _atomic_write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(obj, indent=2)
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix="gps_", suffix=".json", dir=d, text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _one_tick():
    from logic.gps import get_gps_data, get_machine_id
    from logic.backend_clinet import push_gps_reading

    recorded_at = datetime.utcnow().isoformat() + "Z"
    row = {
        "recorded_at": recorded_at,
        "fix_valid": False,
        "latitude": None,
        "longitude": None,
        "timestamp": None,
        "machine_id": get_machine_id(),
        "backend": None,
    }

    data = get_gps_data()
    if data:
        row["fix_valid"] = True
        row["latitude"] = data.get("latitude")
        row["longitude"] = data.get("longitude")
        row["timestamp"] = data.get("timestamp")
        try:
            sync = push_gps_reading(
                get_machine_id(),
                data,
                post_api_gps=True,
                post_pi_data_doc=True,
                timeout=15,
            )
            row["backend"] = sync
        except Exception as e:
            row["backend"] = {"error": str(e)[:300]}
    else:
        row["backend"] = None

    _atomic_write_json(GPS_LATEST_JSON, row)


def _loop():
    while True:
        try:
            _one_tick()
        except Exception as e:
            try:
                err_row = {
                    "recorded_at": datetime.utcnow().isoformat() + "Z",
                    "fix_valid": False,
                    "error": str(e)[:500],
                    "latitude": None,
                    "longitude": None,
                }
                _atomic_write_json(GPS_LATEST_JSON, err_row)
            except Exception:
                pass
            # if _gps_print_terminal:
            #     _gps_print_terminal("bg_loop", f"GPS background: {e}")
            # else:
            #     print("GPS background:", e)
        time.sleep(_interval_sec())


def start_gps_sync_background():
    """Daemon thread — HMI start par call karo."""
    v = os.environ.get("GPS_SYNC_DISABLED", "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return
    t = threading.Thread(target=_loop, daemon=True, name="gps-sync")
    t.start()
