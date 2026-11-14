"""MDVR RTSP record helpers (copy then web-playable MP4)."""
import json
import os
import subprocess
import tempfile
from typing import List, Optional, Tuple


def _ffmpeg() -> str:
    return os.environ.get("MDVR_FFMPEG", "ffmpeg").strip() or "ffmpeg"


def _ffprobe() -> str:
    return os.environ.get("MDVR_FFPROBE", "ffprobe").strip() or "ffprobe"


def _stimeout() -> str:
    return os.environ.get("MDVR_RTSP_STIMEOUT_US", "10000000").strip()


def _transport() -> str:
    return os.environ.get("MDVR_RTSP_TRANSPORT", "tcp").strip() or "tcp"


def is_browser_playable(path: str, min_duration: float = 0.5) -> bool:
    """True when ffprobe sees a normal MP4 the browser can decode (H.264)."""
    codec, dur = probe_video(path)
    if not codec or dur < min_duration:
        return False
    return codec in ("h264", "avc1")


def probe_video(path: str) -> Tuple[Optional[str], float]:
    """Returns (codec_name, duration_sec)."""
    if not path or not os.path.isfile(path):
        return None, 0.0
    cmd = [
        _ffprobe(),
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
    ]
    try:
        r = subprocess.run(cmd + [path], capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return None, 0.0
        data = json.loads(r.stdout or "{}")
        streams = data.get("streams") or []
        codec = None
        if streams:
            codec = str(streams[0].get("codec_name") or "").strip().lower() or None
        dur = 0.0
        try:
            dur = float((data.get("format") or {}).get("duration") or 0)
        except (TypeError, ValueError):
            dur = 0.0
        return codec, dur
    except (json.JSONDecodeError, subprocess.TimeoutExpired, OSError):
        return None, 0.0


def record_rtsp_copy(url: str, out_path: str, duration_sec: float) -> Tuple[int, str, int]:
    """RTSP → MP4 remux (no re-encode). Returns (rc, stderr, size_bytes)."""
    dur = max(2, int(duration_sec))
    cmd = [
        _ffmpeg(),
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-rtsp_transport",
        _transport(),
        "-stimeout",
        _stimeout(),
        "-fflags",
        "+genpts",
        "-use_wallclock_as_timestamps",
        "1",
        "-i",
        url,
        "-t",
        str(dur),
        "-an",
        "-c:v",
        "copy",
        "-vsync",
        "passthrough",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        "-y",
        out_path,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=dur + 90)
    except subprocess.TimeoutExpired:
        return -1, "ffmpeg timeout", 0
    sz = os.path.getsize(out_path) if os.path.isfile(out_path) else 0
    err = (r.stderr or r.stdout or "").strip()
    return r.returncode, err, sz


def remux_mp4_for_web(src: str, dst: Optional[str] = None) -> Tuple[Optional[str], str]:
    """H.264 copy + fix timestamps + faststart (browser-friendly, full length)."""
    if not src or not os.path.isfile(src):
        return None, "missing input"
    if dst is None:
        fd, dst = tempfile.mkstemp(suffix="_mdvr_remux.mp4")
        os.close(fd)
    cmd = [
        _ffmpeg(),
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-fflags",
        "+genpts",
        "-i",
        src,
        "-map",
        "0:v:0?",
        "-an",
        "-c:v",
        "copy",
        "-vsync",
        "passthrough",
        "-avoid_negative_ts",
        "make_zero",
        "-max_muxing_queue_size",
        "1024",
        "-movflags",
        "+faststart",
        "-y",
        dst,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return None, "remux timeout"
    if r.returncode != 0 or not os.path.isfile(dst):
        return None, (r.stderr or "")[-800:]
    try:
        if os.path.getsize(dst) < 4096:
            return None, "remux output too small"
    except OSError:
        return None, "remux output missing"
    return dst, ""


def transcode_mp4_for_web(src: str, dst: Optional[str] = None) -> Tuple[Optional[str], str]:
    """Re-encode to H.264 yuv420p when copy/remux is not browser-safe."""
    if not src or not os.path.isfile(src):
        return None, "missing input"
    if dst is None:
        fd, dst = tempfile.mkstemp(suffix="_mdvr_web.mp4")
        os.close(fd)
    preset = os.environ.get("MDVR_SAVE_X264_PRESET", "veryfast")
    crf = os.environ.get("MDVR_SAVE_CRF", "23")
    cmd = [
        _ffmpeg(),
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-fflags",
        "+genpts",
        "-i",
        src,
        "-map",
        "0:v:0?",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-fps_mode",
        "passthrough",
        "-avoid_negative_ts",
        "make_zero",
        "-max_muxing_queue_size",
        "4096",
        "-movflags",
        "+faststart",
        "-y",
        dst,
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        return None, "transcode timeout"
    if r.returncode != 0 or not os.path.isfile(dst):
        return None, (r.stderr or "")[-800:]
    try:
        if os.path.getsize(dst) < 4096:
            return None, "transcode output too small"
    except OSError:
        return None, "transcode output missing"
    return dst, ""


def prepare_mdvr_upload_file(
    src: str, min_bytes: int = 12_000
) -> Tuple[Optional[str], float, List[str]]:
    """
    Pick best web-playable file. Returns (upload_path, duration_sec, temp_paths_to_delete).
    """
    temps: List[str] = []
    if not os.path.isfile(src):
        return None, 0.0, temps

    codec, dur = probe_video(src)
    dur = max(0.0, dur)

    if codec in ("h264", "avc1"):
        remuxed, err = remux_mp4_for_web(src)
        if remuxed:
            temps.append(remuxed)
            try:
                if os.path.getsize(remuxed) >= min_bytes:
                    _, rd = probe_video(remuxed)
                    return remuxed, rd or dur, temps
            except OSError:
                pass
        elif err:
            print(f"[MDVR] remux: {err[:160]}")

    web, err = transcode_mp4_for_web(src)
    if web:
        temps.append(web)
        try:
            if os.path.getsize(web) >= min_bytes:
                _, td = probe_video(web)
                return web, td or dur, temps
        except OSError:
            return web, dur, temps
    elif err:
        print(f"[MDVR] transcode: {err[:160]}")

    if is_browser_playable(src) and codec in ("h264", "avc1"):
        try:
            if os.path.getsize(src) >= min_bytes:
                return src, dur, temps
        except OSError:
            pass
    return None, dur, temps


def stream_index_candidates() -> List[str]:
    raw = os.environ.get("MDVR_STREAM_TRY", "1,0").strip()
    out = []
    for p in raw.replace(" ", "").split(","):
        if p in ("0", "1"):
            out.append(p)
    return out or ["1", "0"]
