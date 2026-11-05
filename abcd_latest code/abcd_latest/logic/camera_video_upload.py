"""
Clip flow: record → data/camera_videos.json → POST /api/camera-videos (Mongo).
"""
import os
from typing import Optional, Tuple

from logic.backend_clinet import post_camera_video
from logic.camera_videos_store import register_clip, sync_pending_to_database
from logic.machine_identity import read_or_create_machine_id


def resolve_machine_id(explicit: Optional[str] = None) -> str:
    mid = str(explicit or "").strip()
    if mid:
        return mid
    try:
        from app.machine_info_store import load_local

        info = load_local() or {}
        mid = (info.get("machineId") or info.get("machine_id") or "").strip()
        if mid:
            return mid
    except Exception:
        pass
    return read_or_create_machine_id()


def save_clip_to_json_index(
    file_path: str,
    camera_id: int,
    duration_sec: Optional[float] = None,
    machine_id: Optional[str] = None,
    title: Optional[str] = None,
) -> dict:
    return register_clip(
        file_path,
        camera_id,
        duration_sec=duration_sec,
        machine_id=machine_id,
        title=title,
    )


def upload_clip(
    file_path: str,
    camera_id: int,
    duration_sec: Optional[float] = None,
    machine_id: Optional[str] = None,
    title: Optional[str] = None,
) -> Tuple[bool, int, str]:
    """Register in JSON first, then sync this clip (and other pending) to server DB."""
    entry = save_clip_to_json_index(
        file_path,
        camera_id,
        duration_sec=duration_sec,
        machine_id=machine_id,
        title=title,
    )
    sync_pending_to_database(limit=5)
    from logic.camera_videos_store import load_store

    for row in load_store().get("clips") or []:
        if row.get("id") == entry.get("id"):
            if row.get("uploadStatus") == "uploaded":
                return True, 201, "uploaded via JSON index"
            err = row.get("uploadError") or "upload pending — will retry in background"
            return False, 0, str(err)
    return False, 0, "clip not found in JSON index"


def upload_clip_direct(
    file_path: str,
    camera_id: int,
    duration_sec: Optional[float] = None,
    machine_id: Optional[str] = None,
    title: Optional[str] = None,
) -> Tuple[bool, int, str]:
    """Legacy direct POST (bypass JSON index)."""
    mid = resolve_machine_id(machine_id)
    ch = f"CH{int(camera_id)}"
    if not title:
        title = f"{ch} clip"
    ok, code, text = post_camera_video(
        file_path,
        machine_id=mid,
        title=title,
        camera_channel=ch,
        duration_sec=duration_sec,
        timeout=int(os.environ.get("CAMERA_VIDEO_UPLOAD_TIMEOUT_SEC", "900")),
    )
    if ok:
        print(f"[CAMERA-VIDEO] Uploaded to backend ({mid}, {ch})")
        delete_after = os.environ.get("CAMERA_VIDEO_DELETE_AFTER_UPLOAD", "1").strip().lower()
        if delete_after not in ("0", "false", "no", "off"):
            try:
                os.remove(file_path)
            except OSError:
                pass
    else:
        hint = ""
        if code == 404:
            hint = " — server has no /api/camera-videos (deploy latest backend)"
        elif code == 0:
            hint = " — check network / backend URL"
        print(f"[CAMERA-VIDEO] Upload failed: {code} {text[:300]}{hint}")
    return ok, code or 0, text
