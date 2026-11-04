"""Background clip: record → camera_videos.json → sync to server database."""
import os
import time
from typing import Optional, Tuple

from hardware.camera_video_record import CameraVideoRecorder
from logic.camera_video_upload import save_clip_to_json_index
from logic.camera_videos_store import sync_pending_to_database


def record_save_and_sync(
    channel_id: int,
    clip_sec: Optional[float] = None,
    title: Optional[str] = None,
) -> Tuple[bool, int, str]:
    """
    Runs in a worker thread. May fail if v4l2 busy (live preview on same channel).
    """
    sec = clip_sec if clip_sec is not None else float(
        os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "20")
    )
    sec = max(8.0, float(sec))
    settle = float(os.environ.get("CAMERA_AUTO_SAVE_SETTLE_SEC", "0.3"))
    time.sleep(max(0.0, settle))

    rec = CameraVideoRecorder(int(channel_id))
    rec.start()
    time.sleep(sec)
    path, duration = rec.stop()

    save_clip_to_json_index(path, int(channel_id), duration_sec=duration, title=title)
    ok_n, fail_n = sync_pending_to_database(limit=5)
    if ok_n > 0:
        return True, 201, f"JSON → database ({ok_n} clip(s))"
    if fail_n > 0:
        return False, 0, "upload failed — see data/camera_videos.json uploadError"
    return False, 0, "no pending sync (backend URL?)"


def record_and_upload_clip(
    channel_id: int,
    clip_sec: Optional[float] = None,
    title: Optional[str] = None,
) -> Tuple[bool, int, str]:
    return record_save_and_sync(channel_id, clip_sec=clip_sec, title=title)
