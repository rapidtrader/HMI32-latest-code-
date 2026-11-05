"""
Local index: data/camera_videos.json — clips register here first, then sync to server MongoDB.
"""
import json
import os
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE_PATH = os.path.join(BASE_DIR, "data", "camera_videos.json")

_LOCK = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: str, obj: Any) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    text = json.dumps(obj, indent=2, ensure_ascii=False)
    d = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix="camvid_", suffix=".json", dir=d, text=True)
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


def _empty_store() -> dict:
    return {"version": 1, "updated_at": _utc_now(), "clips": []}


def ensure_store_file() -> str:
    """Create empty data/camera_videos.json if missing (Pi index before DB upload)."""
    os.makedirs(os.path.dirname(STORE_PATH), exist_ok=True)
    if not os.path.isfile(STORE_PATH):
        save_store(_empty_store())
        print(f"[CONFIG] Camera clips JSON index: {STORE_PATH}")
    return STORE_PATH


def load_store() -> dict:
    with _LOCK:
        if not os.path.isfile(STORE_PATH):
            return _empty_store()
        try:
            with open(STORE_PATH, encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return _empty_store()
            data.setdefault("version", 1)
            data.setdefault("clips", [])
            if not isinstance(data["clips"], list):
                data["clips"] = []
            return data
        except Exception as exc:
            print(f"[CAMERA-VIDEO] JSON read failed: {exc}")
            return _empty_store()


def save_store(data: dict) -> None:
    with _LOCK:
        data = dict(data)
        data["updated_at"] = _utc_now()
        _atomic_write(STORE_PATH, data)


def _mime_for_path(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".webm":
        return "video/webm"
    if ext == ".mp4":
        return "video/mp4"
    return "application/octet-stream"


def register_clip(
    file_path: str,
    camera_id: int,
    duration_sec: Optional[float] = None,
    machine_id: Optional[str] = None,
    title: Optional[str] = None,
) -> dict:
    """Append clip metadata to camera_videos.json (uploadStatus=pending)."""
    path = os.path.abspath(str(file_path))
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    from logic.camera_video_upload import resolve_machine_id

    mid = resolve_machine_id(machine_id)
    ch = f"CH{int(camera_id)}"
    if not title:
        title = f"{ch} clip"

    entry = {
        "id": uuid.uuid4().hex[:16],
        "localFile": path,
        "filename": os.path.basename(path),
        "machineId": mid,
        "title": str(title).strip() or ch,
        "cameraChannel": ch,
        "durationSec": round(float(duration_sec), 2) if duration_sec is not None else None,
        "mimeType": _mime_for_path(path),
        "sizeBytes": os.path.getsize(path),
        "createdAt": _utc_now(),
        "uploadStatus": "pending",
        "serverId": None,
        "uploadError": None,
        "uploadedAt": None,
    }

    data = load_store()
    data["clips"].append(entry)
    cap = int(os.environ.get("CAMERA_VIDEOS_JSON_MAX", "500"))
    if len(data["clips"]) > cap:
        data["clips"] = data["clips"][-cap:]
    save_store(data)
    print(f"[CAMERA-VIDEO] Saved to JSON index: {entry['id']} → {STORE_PATH}")
    return entry


def list_clips(status: Optional[str] = None) -> List[dict]:
    rows = load_store().get("clips") or []
    if status:
        st = str(status).strip().lower()
        rows = [r for r in rows if str(r.get("uploadStatus", "")).lower() == st]
    return list(rows)


def update_clip(clip_id: str, **fields) -> Optional[dict]:
    data = load_store()
    found = None
    for row in data.get("clips") or []:
        if row.get("id") == clip_id:
            row.update(fields)
            found = row
            break
    if found:
        save_store(data)
    return found


def sync_pending_to_database(limit: Optional[int] = None) -> Tuple[int, int]:
    """
    Upload pending clips from JSON index to POST /api/camera-videos.
    Returns (uploaded_ok_count, failed_count).
    """
    from logic.backend_clinet import get_backend_base, post_camera_video

    if not get_backend_base():
        return 0, 0

    max_n = limit if limit is not None else int(os.environ.get("CAMERA_VIDEO_SYNC_BATCH", "3"))
    max_n = max(1, min(20, max_n))

    pending = list_clips("pending")
    ok_count = 0
    fail_count = 0

    for row in pending[:max_n]:
        clip_id = row.get("id")
        path = str(row.get("localFile") or "").strip()
        if not clip_id or not path or not os.path.isfile(path):
            update_clip(
                clip_id,
                uploadStatus="failed",
                uploadError="missing local file",
            )
            fail_count += 1
            continue

        ok, code, text = post_camera_video(
            path,
            machine_id=row.get("machineId"),
            title=row.get("title"),
            camera_channel=row.get("cameraChannel"),
            duration_sec=row.get("durationSec"),
        )
        if ok:
            server_id = None
            try:
                payload = json.loads(text)
                server_id = (payload.get("data") or {}).get("id")
            except Exception:
                pass
            update_clip(
                clip_id,
                uploadStatus="uploaded",
                serverId=server_id,
                uploadError=None,
                uploadedAt=_utc_now(),
            )
            ok_count += 1
            delete_after = os.environ.get("CAMERA_VIDEO_DELETE_AFTER_UPLOAD", "1").strip().lower()
            if delete_after not in ("0", "false", "no", "off"):
                try:
                    os.remove(path)
                except OSError:
                    pass
            print(f"[CAMERA-VIDEO] JSON → database OK ({clip_id} → server {server_id})")
        else:
            err = f"{code}: {text[:200]}"
            update_clip(clip_id, uploadStatus="pending", uploadError=err)
            fail_count += 1
            print(f"[CAMERA-VIDEO] JSON → database retry later: {err}")

        time.sleep(max(0.5, float(os.environ.get("CAMERA_VIDEO_SYNC_GAP_SEC", "1.5"))))

    return ok_count, fail_count
