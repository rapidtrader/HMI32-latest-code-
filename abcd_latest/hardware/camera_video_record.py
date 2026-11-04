"""
GStreamer v4l2 → file clip (gst-launch). Stop with SIGINT (-e → proper EOS).
RK3588: mpph264enc or vp8enc (no x264enc on many images).
"""
import os
import signal
import subprocess
import time
from typing import List, Optional, Tuple

from hardware.camera_capture import resolve_video_device

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIP_DIR = os.path.join(BASE_DIR, "data", "video_clips")

_GST_ELEMENT_CACHE = {}


def _gst_has_element(name: str) -> bool:
    if name in _GST_ELEMENT_CACHE:
        return _GST_ELEMENT_CACHE[name]
    try:
        r = subprocess.run(
            ["gst-inspect-1.0", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8,
        )
        ok = r.returncode == 0
    except Exception:
        ok = False
    _GST_ELEMENT_CACHE[name] = ok
    return ok


def _codec() -> str:
    return os.environ.get("CAMERA_VIDEO_CODEC", "auto").strip().lower()


def _record_size() -> Tuple[int, int, int]:
    w = int(os.environ.get("CAMERA_RECORD_WIDTH", "640"))
    h = int(os.environ.get("CAMERA_RECORD_HEIGHT", "360"))
    fps = int(os.environ.get("CAMERA_RECORD_FPS", "15"))
    return w, h, fps


def _pick_profile() -> Tuple[str, str]:
    """Returns (profile_key, file_extension)."""
    want = _codec()
    if want == "webm":
        if _gst_has_element("vp8enc"):
            return "webm", "webm"
        raise RuntimeError("vp8enc missing — install gstreamer1.0-plugins-good")

    if want == "mp4":
        if _gst_has_element("mpph264enc"):
            return "mpph264", "mp4"
        if _gst_has_element("openh264enc"):
            return "openh264", "mp4"
        if _gst_has_element("x264enc"):
            return "x264", "mp4"

    # auto
    if _gst_has_element("mpph264enc"):
        return "mpph264", "mp4"
    if _gst_has_element("vp8enc"):
        return "webm", "webm"
    if _gst_has_element("openh264enc"):
        return "openh264", "mp4"
    if _gst_has_element("x264enc"):
        return "x264", "mp4"
    raise RuntimeError(
        "No video encoder (need mpph264enc or vp8enc). "
        "Try: export CAMERA_VIDEO_CODEC=webm"
    )


def _v4l2src_parts(device: str) -> List[str]:
    io = os.environ.get("CAMERA_V4L2_IO_MODE", "4").strip()
    parts = ["gst-launch-1.0", "-e", "v4l2src", f"device={device}"]
    if io and io.lower() not in ("0", "none", "off"):
        parts.append(f"io-mode={io}")
    return parts


def build_record_pipeline(device: str, output_path: str) -> list:
    """gst-launch argv list ending in filesink."""
    profile, _ext = _pick_profile()
    w, h, fps = _record_size()
    parts = _v4l2src_parts(device)
    caps = f"video/x-raw,format=NV12,width={w},height={h},framerate={fps}/1"
    parts += ["!", "capsfilter", f"caps={caps}", "!", "videoconvert"]

    if profile == "webm":
        parts += [
            "!",
            "vp8enc",
            "deadline=1",
            "target-bitrate=800000",
            "!",
            "webmmux",
            "!",
            "filesink",
            f"location={output_path}",
        ]
    elif profile == "mpph264":
        parts += [
            "!",
            "video/x-raw,format=NV12",
            "!",
            "mpph264enc",
            "!",
            "h264parse",
            "!",
            "mp4mux",
            "faststart=true",
            "!",
            "filesink",
            f"location={output_path}",
        ]
    elif profile == "openh264":
        parts += [
            "!",
            "openh264enc",
            "bitrate=800000",
            "!",
            "h264parse",
            "!",
            "mp4mux",
            "faststart=true",
            "!",
            "filesink",
            f"location={output_path}",
        ]
    else:
        parts += [
            "!",
            "x264enc",
            "speed-preset=ultrafast",
            "tune=zerolatency",
            "!",
            "mp4mux",
            "faststart=true",
            "!",
            "filesink",
            f"location={output_path}",
        ]

    if not getattr(build_record_pipeline, "_logged_profile", None):
        build_record_pipeline._logged_profile = profile  # type: ignore
        print(f"[CAMERA-VIDEO] Record encoder profile: {profile}")
    return parts


def clip_extension() -> str:
    _, ext = _pick_profile()
    return ext


class CameraVideoRecorder:
    """One clip at a time per instance."""

    def __init__(self, camera_id: int):
        self.camera_id = int(camera_id)
        self.device = resolve_video_device(self.camera_id)
        self._proc: Optional[subprocess.Popen] = None
        self._output_path: Optional[str] = None
        self._started_at: Optional[float] = None

    @property
    def output_path(self) -> Optional[str]:
        return self._output_path

    def is_running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self) -> str:
        if self.is_running():
            raise RuntimeError("Recording already in progress")
        os.makedirs(CLIP_DIR, exist_ok=True)
        ext = clip_extension()
        name = f"ch{self.camera_id}_{int(time.time())}.{ext}"
        path = os.path.join(CLIP_DIR, name)
        cmd = build_record_pipeline(self.device, path)
        self._proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        self._output_path = path
        self._started_at = time.time()
        print(f"[CAMERA-VIDEO] Recording CH{self.camera_id} → {path}")
        return path

    def stop(self, wait_sec: float = 45.0) -> Tuple[str, float]:
        if not self._proc or not self._output_path:
            raise RuntimeError("Not recording")
        proc = self._proc
        path = self._output_path
        started = self._started_at or time.time()
        self._proc = None
        self._output_path = None
        self._started_at = None

        try:
            if proc.poll() is None:
                os.killpg(os.getpgid(proc.pid), signal.SIGINT)
        except ProcessLookupError:
            pass
        except Exception as exc:
            print(f"[CAMERA-VIDEO] SIGINT failed: {exc}")
            try:
                proc.terminate()
            except Exception:
                pass

        try:
            proc.wait(timeout=wait_sec)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                proc.kill()
            proc.wait(timeout=5)

        err = ""
        if proc.stderr:
            err = proc.stderr.read(4096).decode("utf-8", errors="replace").strip()
        duration = max(0.0, time.time() - started)

        if not os.path.isfile(path) or os.path.getsize(path) < 512:
            hint = err or "empty file"
            raise RuntimeError(f"Recording failed ({hint})")

        print(f"[CAMERA-VIDEO] Saved {path} ({duration:.1f}s)")
        return path, duration
