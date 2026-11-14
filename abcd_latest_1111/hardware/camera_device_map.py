"""Load optional data/camera_map.json for CH1–CH4 → /dev/video*."""
import json
import os
from functools import lru_cache

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_MAP_PATH = os.path.join(_ROOT, "data", "camera_map.json")


@lru_cache(maxsize=1)
def load_channel_device_map() -> dict:
    if not os.path.isfile(_MAP_PATH):
        return {}
    try:
        with open(_MAP_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[CAMERA] camera_map.json unreadable: {exc}")
        return {}
    out = {}
    for key, val in raw.items():
        if str(key).startswith("_"):
            continue
        if not isinstance(val, str) or not val.startswith("/dev/video"):
            continue
        try:
            out[int(key)] = val.strip()
        except ValueError:
            continue
    return out
