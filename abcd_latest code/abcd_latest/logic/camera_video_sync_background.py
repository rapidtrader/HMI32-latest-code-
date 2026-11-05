"""Retry pending clips from data/camera_videos.json → server MongoDB."""
import os
import threading
import time

_started = False
_lock = threading.Lock()


def _interval_sec() -> float:
    try:
        return max(8.0, float(os.environ.get("CAMERA_VIDEO_SYNC_INTERVAL_SEC", "12")))
    except ValueError:
        return 5.0


def _tick():
    from logic.backend_clinet import get_backend_base
    from logic.camera_videos_store import list_clips, sync_pending_to_database

    if not get_backend_base():
        return
    pending = list_clips("pending")
    if not pending:
        return
    ok_n, fail_n = sync_pending_to_database(limit=2)
    if ok_n or fail_n:
        print(f"[CAMERA-VIDEO] Background sync: ok={ok_n} fail={fail_n}")


def _loop():
    while True:
        try:
            _tick()
        except Exception as exc:
            print(f"[CAMERA-VIDEO] Sync loop error: {exc}")
        time.sleep(_interval_sec())


def start_camera_video_sync_loop():
    global _started
    if os.environ.get("CAMERA_VIDEO_SYNC_DISABLED", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(
        target=_loop, daemon=True, name="camera-video-json-sync"
    ).start()
    print("[CAMERA-VIDEO] JSON → database sync loop started")
