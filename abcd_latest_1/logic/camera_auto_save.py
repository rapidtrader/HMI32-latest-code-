"""Background clip: continuous preview segments + upload queue."""
import os
import threading
import time
from datetime import datetime
from typing import Callable, List, Optional, Tuple

from logic.camera_video_upload import save_clip_to_json_index
from logic.camera_videos_store import sync_pending_to_database

_upload_slots = threading.Semaphore(
    max(1, min(4, int(os.environ.get("CAMERA_VIDEO_UPLOAD_CONCURRENCY", "2"))))
)

def kick_sync_background(limit: int = 16) -> None:
    def _run():
        try:
            ok_n, fail_n = sync_pending_to_database(limit=limit)
            if ok_n or fail_n:
                print(f"[CAMERA-VIDEO] Upload sync: ok={ok_n} fail={fail_n}")
        except Exception as exc:
            print(f"[CAMERA-VIDEO] Upload sync error: {exc}")

    threading.Thread(target=_run, daemon=True, name="cam-clip-sync").start()


def push_clip_to_server(
    file_path: str,
    camera_id: int,
    duration_sec: Optional[float] = None,
    title: Optional[str] = None,
) -> Tuple[bool, bool]:
    """
    Live save: POST clip to website immediately (no JSON queue if upload OK).
    On network fail → camera_videos.json for retry.
    Returns (uploaded_ok, queued_in_json).
    """
    from logic.backend_clinet import post_saved_video
    from logic.camera_video_upload import resolve_machine_id

    direct = os.environ.get("CAMERA_VIDEO_DIRECT_UPLOAD", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    delete_after = os.environ.get("CAMERA_VIDEO_DELETE_AFTER_UPLOAD", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )

    mid = resolve_machine_id()
    ch = f"CH{int(camera_id)}"
    stamp = title or f"{ch} clip"

    upload_timeout = int(os.environ.get("CAMERA_VIDEO_UPLOAD_TIMEOUT_SEC", "900"))

    if direct:
        with _upload_slots:
            ok, code, text = post_saved_video(
                file_path,
                machine_id=mid,
                title=stamp,
                camera_channel=ch,
                duration_sec=duration_sec,
                source="ahd",
                timeout=upload_timeout,
            )
        if ok:
            if delete_after:
                try:
                    os.remove(file_path)
                except OSError:
                    pass
            print(f"[SAVED-VIDEO] Archive upload OK ({ch}, {duration_sec}s)")
            return True, False
        print(f"[CAMERA-VIDEO] Direct upload failed ({code}): {text[:120]}")

    save_clip_to_json_index(
        file_path,
        int(camera_id),
        duration_sec=duration_sec,
        title=stamp,
    )
    return False, True


def _continuous_enabled() -> bool:
    return os.environ.get("CAMERA_AUTO_SAVE_CONTINUOUS", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def start_continuous_preview_upload(channel_ids: List[int]) -> Tuple[bool, str]:
    from hardware.preview_clip_record import start_rolling_capture

    if not _continuous_enabled():
        return False, "continuous mode off"
    sec = float(os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "1"))
    ok = start_rolling_capture(channel_ids, segment_sec=sec)
    if not ok:
        return False, "no live preview for rolling capture"
    return True, f"continuous {sec}s segments on CH{channel_ids}"


def stop_continuous_preview_upload() -> None:
    from hardware.preview_clip_record import stop_rolling_capture

    stop_rolling_capture()


def record_all_channels_from_preview(
    channel_ids: List[int],
    clip_sec: Optional[float] = None,
    title_for_channel: Optional[Callable[[int], str]] = None,
) -> Tuple[int, int, str]:
    """One-shot batch (legacy). Prefer start_continuous_preview_upload."""
    from hardware.preview_clip_record import (
        is_preview_live,
        start_batch_clip_capture,
        wait_batch_complete,
    )

    sec = clip_sec if clip_sec is not None else float(
        os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "1")
    )
    sec = max(3.0, float(sec))
    chs = [int(c) for c in channel_ids if is_preview_live(int(c))]
    if not chs:
        return 0, len(channel_ids), "no live preview tiles"

    recorders = start_batch_clip_capture(chs, sec)
    if not recorders:
        return 0, len(chs), "could not start preview capture"

    results = wait_batch_complete(recorders, sec)
    ok_n = 0
    fail_n = 0
    for cid in chs:
        path, duration, err = results.get(cid, (None, 0.0, "missing"))
        if not path:
            fail_n += 1
            continue
        title = title_for_channel(cid) if title_for_channel else None
        save_clip_to_json_index(path, cid, duration_sec=duration, title=title)
        ok_n += 1
    if ok_n:
        kick_sync_background(limit=2)
    return ok_n, fail_n, f"{ok_n}/{len(chs)} batch saved"


def record_save_and_sync(
    channel_id: int,
    clip_sec: Optional[float] = None,
    title: Optional[str] = None,
) -> Tuple[bool, int, str]:
    from hardware.camera_video_record import CameraVideoRecorder

    sec = clip_sec if clip_sec is not None else float(
        os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "1")
    )
    sec = max(3.0, float(sec))
    settle = float(os.environ.get("CAMERA_AUTO_SAVE_SETTLE_SEC", "0.2"))
    time.sleep(max(0.0, settle))

    rec = CameraVideoRecorder(int(channel_id))
    rec.start()
    time.sleep(sec)
    path, duration = rec.stop()

    save_clip_to_json_index(path, int(channel_id), duration_sec=duration, title=title)
    kick_sync_background(limit=2)
    return True, 201, f"CH{channel_id} → JSON"


def record_and_upload_clip(
    channel_id: int,
    clip_sec: Optional[float] = None,
    title: Optional[str] = None,
) -> Tuple[bool, int, str]:
    return record_save_and_sync(channel_id, clip_sec=clip_sec, title=title)
