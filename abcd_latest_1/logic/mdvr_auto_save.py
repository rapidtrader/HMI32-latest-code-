"""MDVR RTSP → ffmpeg segments → POST /api/saved-videos (source=mdvr)."""
import glob
import os
import signal
import subprocess
import threading
import time
from typing import Dict, List, Optional, Set, Tuple

_lock = threading.Lock()
_running = False
_procs: Dict[int, subprocess.Popen] = {}
_watchers: Dict[int, threading.Thread] = {}
_uploaded: Dict[int, Set[str]] = {}


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
        return max(4096, int(os.environ.get("CAMERA_CLIP_MIN_UPLOAD_BYTES", "12000")))
    except ValueError:
        return 12000


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


def _ffmpeg_cmd(channel_id: int, out_tpl: str) -> List[str]:
    from mdvr.rtsp_urls import rtsp_url

    url = rtsp_url(channel_id)
    transport = os.environ.get("MDVR_RTSP_TRANSPORT", "tcp").strip() or "tcp"
    stimeout = os.environ.get("MDVR_RTSP_STIMEOUT_US", "10000000").strip()
    bin_ = os.environ.get("MDVR_FFMPEG", "ffmpeg").strip() or "ffmpeg"
    sec = _segment_sec()
    return [
        bin_,
        "-hide_banner",
        "-loglevel",
        "error",
        "-rtsp_transport",
        transport,
        "-stimeout",
        stimeout,
        "-i",
        url,
        "-an",
        "-c",
        "copy",
        "-f",
        "segment",
        "-segment_time",
        str(sec),
        "-reset_timestamps",
        "1",
        out_tpl,
    ]


def _file_stable(path: str) -> bool:
    min_b = _min_bytes()
    try:
        s1 = os.path.getsize(path)
        if s1 < min_b:
            return False
        time.sleep(0.6)
        s2 = os.path.getsize(path)
        return s1 == s2 and s2 >= min_b
    except OSError:
        return False


def _upload_worker(channel_id: int, pattern_glob: str) -> None:
    global _running
    seg = _segment_sec()
    seen = _uploaded.setdefault(channel_id, set())
    while _running and channel_id in _procs:
        for path in sorted(glob.glob(pattern_glob)):
            if path in seen:
                continue
            if not path.lower().endswith(".mp4"):
                continue
            if not _file_stable(path):
                continue
            seen.add(path)
            try:
                from logic.camera_auto_save import push_clip_to_server

                title = f"MDVR{channel_id} {os.path.basename(path)}"
                push_clip_to_server(
                    path,
                    channel_id,
                    duration_sec=float(seg),
                    title=title,
                    source="mdvr",
                    channel_label=f"MDVR{channel_id}",
                )
            except Exception as exc:
                print(f"[MDVR-SAVE] upload CH{channel_id}: {exc}")
        time.sleep(1.0)


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
            return True, f"already running ({len(_procs)} ch)"
        _running = True
        out_dir = _clip_dir()
        sec = _segment_sec()
        started = 0
        for cid in chs:
            if cid in _procs:
                continue
            tpl = os.path.join(out_dir, f"mdvr{cid}_%03d.mp4")
            glob_pat = os.path.join(out_dir, f"mdvr{cid}_*.mp4")
            try:
                proc = subprocess.Popen(
                    _ffmpeg_cmd(cid, tpl),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    start_new_session=True,
                )
            except OSError as exc:
                print(f"[MDVR-SAVE] ffmpeg CH{cid} failed: {exc}")
                continue
            _procs[cid] = proc
            t = threading.Thread(
                target=_upload_worker,
                args=(cid, glob_pat),
                daemon=True,
                name=f"mdvr-save-watch-{cid}",
            )
            _watchers[cid] = t
            t.start()
            started += 1
            time.sleep(max(0.2, float(os.environ.get("MDVR_SAVE_STAGGER_SEC", "0.5"))))

        if not started:
            _running = False
            return False, "ffmpeg could not start any MDVR channel"
        print(f"[MDVR-SAVE] recording {started} ch, {sec}s segments → /api/saved-videos")
        return True, f"{started} MDVR ch, {sec}s segments to archive"


def stop_mdvr_archive_save() -> None:
    global _running
    with _lock:
        _running = False
        for cid, proc in list(_procs.items()):
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (OSError, ProcessLookupError):
                try:
                    proc.terminate()
                except OSError:
                    pass
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (OSError, ProcessLookupError):
                    proc.kill()
            _procs.pop(cid, None)
        _watchers.clear()
        _uploaded.clear()
    print("[MDVR-SAVE] stopped")
