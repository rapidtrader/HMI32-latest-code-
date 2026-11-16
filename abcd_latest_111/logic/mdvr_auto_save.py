"""MDVR RTSP → timed copy record → web MP4 → POST /api/saved-videos (source=mdvr)."""
import os
import threading
import time
from typing import Dict, List, Tuple

_lock = threading.Lock()
_running = False
_workers: Dict[int, threading.Thread] = {}


def _enabled() -> bool:
    return os.environ.get("MDVR_AUTO_SAVE", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _segment_sec() -> int:
    try:
        sec = float(os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "60"))
        return max(2, min(3600, int(round(sec))))
    except (TypeError, ValueError):
        return 60


def _clip_dir() -> str:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "data", "video_clips", "mdvr")
    os.makedirs(path, exist_ok=True)
    return path


def _min_bytes() -> int:
    try:
        custom = int(os.environ.get("MDVR_CLIP_MIN_UPLOAD_BYTES", "0"))
        if custom > 0:
            return max(4096, custom)
    except ValueError:
        pass
    try:
        return max(4096, int(os.environ.get("CAMERA_CLIP_MIN_UPLOAD_BYTES", "12000")))
    except ValueError:
        return 12000


def _transcode_on_upload() -> bool:
    return os.environ.get("MDVR_SAVE_TRANSCODE", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _channel_ids() -> List[int]:
    from mdvr.probe import channel_probe_ok
    from mdvr.rtsp_urls import default_channel_count, stream_enabled

    require_probe = os.environ.get("MDVR_SAVE_REQUIRE_PROBE", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    out: List[int] = []
    for cid in range(1, default_channel_count() + 1):
        if not stream_enabled(cid):
            continue
        if require_probe and not channel_probe_ok(cid):
            continue
        out.append(cid)
    return out


def _min_upload_bytes(duration_sec: float) -> int:
    """Reject tiny broken MP4s (ffmpeg segment copy used to upload ~256 KB / no moov)."""
    base = _min_bytes()
    floor = max(base, int(os.environ.get("MDVR_CLIP_MIN_RAW_BYTES", "80000")))
    scaled = max(floor, int(max(10.0, duration_sec) * 2500))
    return min(scaled, 5_000_000)


def _record_worker(channel_id: int) -> None:
    """One clip at a time per channel — same pipeline as scripts/test_mdvr_one_clip.py."""
    global _running
    from logic.camera_auto_save import push_clip_to_server
    from logic.mdvr_record import prepare_mdvr_upload_file, record_rtsp_copy
    from mdvr.rtsp_urls import rtsp_url

    seg = _segment_sec()
    out_dir = _clip_dir()
    url = rtsp_url(channel_id)
    seq = 0
    while _running:
        seq += 1
        raw = os.path.join(out_dir, f"mdvr{channel_id}_{seq:04d}.mp4")
        rc, err, sz = record_rtsp_copy(url, raw, float(seg))
        if not _running:
            break
        min_up = _min_upload_bytes(seg)
        cleanup: List[str] = []
        try:
            if sz < min_up:
                print(
                    f"[MDVR-SAVE] CH{channel_id} clip too small ({sz} B, need {min_up}); rc={rc}"
                )
                if err:
                    print(f"[MDVR-SAVE] ffmpeg: {err[-200:].replace(chr(10), ' ')}")
                continue

            upload_path = raw
            duration_sec = float(seg)
            if _transcode_on_upload():
                prepared, probed_dur, cleanup = prepare_mdvr_upload_file(raw, min_bytes=min_up)
                if not prepared:
                    print(f"[MDVR-SAVE] CH{channel_id} not web-playable, skipping upload")
                    continue
                upload_path = prepared
                if probed_dur > 1:
                    duration_sec = round(probed_dur, 1)

            dev = os.environ.get("MDVR_DEVICE_ID", "").strip()
            base = f"MDVR{channel_id} {os.path.basename(upload_path)}"
            title = f"{dev} {base}" if dev else base
            uploaded, _queued = push_clip_to_server(
                upload_path,
                channel_id,
                duration_sec=duration_sec,
                title=title,
                source="mdvr",
                channel_label=f"MDVR{channel_id}",
            )
            if uploaded and upload_path != raw and os.path.isfile(raw):
                try:
                    os.remove(raw)
                except OSError:
                    pass
        except Exception as exc:
            print(f"[MDVR-SAVE] CH{channel_id}: {exc}")
        finally:
            for tmp in cleanup:
                if tmp and tmp != raw and os.path.isfile(tmp):
                    try:
                        os.remove(tmp)
                    except OSError:
                        pass
        if _running:
            time.sleep(max(0.2, float(os.environ.get("MDVR_SAVE_GAP_SEC", "0.5"))))


def start_mdvr_archive_save() -> Tuple[bool, str]:
    """Start ffmpeg segment recorders for probed MDVR channels."""
    global _running
    if not _enabled():
        return False, "MDVR archive save disabled (cameraMdvrSave / MDVR_AUTO_SAVE)"
    from logic.backend_clinet import get_backend_base

    if not get_backend_base():
        return False, "backendBaseUrl missing"

    chs = _channel_ids()
    if not chs:
        return False, "no MDVR channels available (network / probe)"

    with _lock:
        if _running:
            return True, f"already running ({len(_workers)} ch)"
        _running = True
        sec = _segment_sec()
        started = 0
        for cid in chs:
            if cid in _workers:
                continue
            t = threading.Thread(
                target=_record_worker,
                args=(cid,),
                daemon=True,
                name=f"mdvr-save-rec-{cid}",
            )
            _workers[cid] = t
            t.start()
            started += 1
            time.sleep(max(0.2, float(os.environ.get("MDVR_SAVE_STAGGER_SEC", "0.5"))))

        if not started:
            _running = False
            return False, "could not start any MDVR channel recorder"
        print(f"[MDVR-SAVE] recording {started} ch, {sec}s clips (copy+remux) → /api/saved-videos")
        return True, f"{started} MDVR ch, {sec}s clips to archive"


def stop_mdvr_archive_save() -> None:
    global _running
    with _lock:
        _running = False
        threads = list(_workers.values())
        _workers.clear()
    for t in threads:
        t.join(timeout=5)
    print("[MDVR-SAVE] stopped")
