"""V4L2 signal probe before preview pipelines (background thread, no UI block)."""
import os
import subprocess
import threading
from typing import Dict, List

from hardware.camera_capture import resolve_video_device
from hardware.camera_stream_ids import default_camera_count, parse_stream_ids, stream_enabled

_PROBE_LOCK = threading.Lock()
_probe_results: Dict[int, bool] = {}
_probes_finished = False

_MIN_JPEG_BYTES = int(os.environ.get("CAMERA_PROBE_MIN_JPEG", "8000"))
_PROBE_TIMEOUT_SEC = int(os.environ.get("CAMERA_PROBE_TIMEOUT_SEC", "8"))


def _probe_enabled() -> bool:
    return os.environ.get("CAMERA_PROBE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _apply_probe_gst_env() -> None:
    from hardware.gstreamer_appsink_preview import _apply_gst_runtime_env

    _apply_gst_runtime_env()


def _enabled_channel_ids() -> List[int]:
    allowed = parse_stream_ids()
    if allowed is None:
        return list(range(1, default_camera_count() + 1))
    return sorted(set(int(x) for x in allowed))


def reset_probe_session() -> None:
    global _probes_finished
    with _PROBE_LOCK:
        _probe_results.clear()
        _probes_finished = False


def _probe_caps() -> str:
    from hardware.camera_stream_ids import active_stream_count

    n = active_stream_count()
    if n <= 1:
        w = os.environ.get("CAMERA_SRC_WIDTH", "1920")
        h = os.environ.get("CAMERA_SRC_HEIGHT", "1080")
        fps = os.environ.get("CAMERA_FPS", "20")
    else:
        w = os.environ.get("CAMERA_MULTI_SRC_WIDTH", "1280")
        h = os.environ.get("CAMERA_MULTI_SRC_HEIGHT", "720")
        fps = os.environ.get("CAMERA_MULTI_FPS", "15")
    fmt = os.environ.get("CAMERA_PIXEL_FORMAT", "NV12")
    return f"video/x-raw,format={fmt},width={w},height={h},framerate={fps}/1"


def _probe_device(device: str) -> bool:
    _apply_probe_gst_env()
    out = f"/tmp/hmi_cam_probe_{device.replace('/', '_')}.jpg"
    try:
        os.remove(out)
    except OSError:
        pass
    caps = _probe_caps()
    io = os.environ.get("CAMERA_V4L2_IO_MODE", "4").strip()
    src = ["v4l2src", f"device={device}"]
    if io and io.lower() not in ("0", "none", "off"):
        src.append(f"io-mode={io}")
    src.extend(
        ["num-buffers=1", "!", caps, "!", "videoconvert", "!", "jpegenc", "!", "filesink", f"location={out}"]
    )
    try:
        r = subprocess.run(
            ["timeout", str(_PROBE_TIMEOUT_SEC), "gst-launch-1.0", "-q"] + src,
            env=os.environ.copy(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        print(f"[CAMERA] probe {device}: spawn failed — will try pipeline")
        return True
    try:
        size = os.path.getsize(out)
    except OSError:
        size = 0
    if size >= _MIN_JPEG_BYTES:
        print(f"[CAMERA] probe {device}: OK jpeg={size}")
        return True
    if size > 0:
        print(f"[CAMERA] probe {device}: weak jpeg={size} — skip (no camera on BNC)")
        return False
    print(f"[CAMERA] probe {device}: no signal (rc={r.returncode}) — skip snow/static")
    return False


def run_all_probes_sync() -> None:
    """Run on a worker thread before isActive=true (main thread stays free)."""
    global _probes_finished
    if not _probe_enabled():
        with _PROBE_LOCK:
            _probes_finished = True
        return
    results: Dict[int, bool] = {}
    for cid in _enabled_channel_ids():
        dev = resolve_video_device(cid)
        results[cid] = _probe_device(dev)
    with _PROBE_LOCK:
        _probe_results.clear()
        _probe_results.update(results)
        _probes_finished = True
    print(f"[CAMERA] probe session done: {results}")


def channel_probe_ok(camera_id: int) -> bool:
    """After Start all: False = empty BNC (do not open v4l2 — avoids snow/static)."""
    if not _probe_enabled():
        return True
    if not stream_enabled(camera_id):
        return False
    with _PROBE_LOCK:
        if not _probes_finished:
            return True
        return bool(_probe_results.get(int(camera_id), False))


def ensure_channel_probed(camera_id: int, device: str) -> bool:
    if not _probe_enabled():
        return True
    if not stream_enabled(camera_id):
        return False
    with _PROBE_LOCK:
        if _probes_finished:
            ok = bool(_probe_results.get(int(camera_id), False))
            if not ok:
                print(f"[CAMERA] CH{camera_id} skipped (no signal on {device})")
            return ok
    return True
