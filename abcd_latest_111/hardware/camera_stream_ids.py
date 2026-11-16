"""Which UI camera tiles should open a v4l2 pipeline."""
import os


def parse_stream_ids():
    raw = os.environ.get("CAMERA_STREAM_IDS", "all").strip()
    if raw.lower() in ("all", "*", ""):
        return None
    out = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            pass
    return out or [1]


def default_camera_count() -> int:
    try:
        return max(1, min(8, int(os.environ.get("CAMERA_COUNT", "4"))))
    except ValueError:
        return 4


def active_stream_count() -> int:
    allowed = parse_stream_ids()
    if allowed is None:
        return default_camera_count()
    return max(1, len(allowed))


def stream_enabled(camera_id: int) -> bool:
    allowed = parse_stream_ids()
    if allowed is None:
        return True
    return int(camera_id) in allowed
