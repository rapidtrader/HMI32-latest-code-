"""
Camera capture for abcd_latest (logic from video-capture-code / GStreamer v4l2src).

Uses gst-launch-1.0 subprocess → raw RGB frames (avoids PyGObject Gst.init hangs on some RK images).
"""
import os
import subprocess
import threading
from typing import Callable, Optional

VIDEO_WIDTH = int(os.environ.get("CAMERA_WIDTH", "640"))
VIDEO_HEIGHT = int(os.environ.get("CAMERA_HEIGHT", "360"))
VIDEO_FPS = int(os.environ.get("CAMERA_FPS", "25"))
SRC_WIDTH = int(os.environ.get("CAMERA_SRC_WIDTH", "1920"))
SRC_HEIGHT = int(os.environ.get("CAMERA_SRC_HEIGHT", "1080"))


def _use_yolov5_device_map() -> bool:
    return os.environ.get("CAMERA_YOLOV5_MAP", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def resolve_video_device(camera_id: int) -> str:
    """Map logical channel → V4L2 node.

    Priority: CAMERA_DEVICE_<id> env → data/camera_map.json → fallback.
    Fallback: CH1..CH3 → video1..3; CH4 → video3 (supplier has only video0–3).
    Optional CAMERA_YOLOV5_MAP=1: ids 4–7 → video11–14 (old demo).
    """
    override = os.environ.get(f"CAMERA_DEVICE_{camera_id}", "").strip()
    if override:
        return override
    from hardware.camera_device_map import load_channel_device_map

    mapped = load_channel_device_map().get(int(camera_id))
    if mapped:
        return mapped
    if _use_yolov5_device_map() and camera_id >= 4:
        dev_index = camera_id - 4 + 11
        return f"/dev/video{dev_index}"
    if camera_id in (1, 2, 3):
        return f"/dev/video{camera_id}"
    if camera_id == 4:
        return "/dev/video3"
    return f"/dev/video{camera_id}"


class CameraCaptureWorker(threading.Thread):
    """Reads fixed-size RGB frames from a GStreamer pipeline subprocess."""

    def __init__(
        self,
        camera_id: int,
        on_frame: Callable[[int, bytes, int, int], None],
        on_error: Optional[Callable[[int, str], None]] = None,
    ):
        super().__init__(daemon=True, name=f"cam-{camera_id}")
        self.camera_id = camera_id
        self.device = resolve_video_device(camera_id)
        self._on_frame = on_frame
        self._on_error = on_error
        self._proc = None
        self._stop_requested = False
        self._frame_bytes = VIDEO_WIDTH * VIDEO_HEIGHT * 3

    def _build_cmd(self):
        """Match video-capture-code: NV16 1920x1080 at sensor, scale to RGB preview."""
        use_nv16 = os.environ.get("CAMERA_NV16_CAPS", "0").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        parts = ["gst-launch-1.0", "-q", "v4l2src", f"device={self.device}"]
        if use_nv16:
            caps = (
                f"video/x-raw,format=NV16,width={SRC_WIDTH},height={SRC_HEIGHT},"
                f"framerate={VIDEO_FPS}/1"
            )
            parts += ["!", "capsfilter", f"caps={caps}"]
        parts += [
            "!",
            "videoconvert",
            "!",
            "videoscale",
            "!",
            "video/x-raw",
            f"format=RGB,width={VIDEO_WIDTH},height={VIDEO_HEIGHT},framerate={VIDEO_FPS}/1",
            "!",
            "fdsink",
            "fd=1",
            "sync=false",
        ]
        return parts

    def run(self):
        try:
            cmd = self._build_cmd()
            self._proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=self._frame_bytes * 2,
            )
            assert self._proc.stdout is not None
            while not self._stop_requested:
                data = self._proc.stdout.read(self._frame_bytes)
                if not data or len(data) < self._frame_bytes:
                    err = ""
                    proc = self._proc
                    if proc is not None and proc.stderr:
                        err = proc.stderr.read(4096).decode("utf-8", errors="replace")
                    if not self._stop_requested and self._on_error:
                        self._on_error(
                            self.camera_id,
                            err.strip() or "capture stream ended",
                        )
                    break
                self._on_frame(
                    self.camera_id, data, VIDEO_WIDTH, VIDEO_HEIGHT
                )
        except Exception as exc:
            if self._on_error:
                self._on_error(self.camera_id, str(exc))
        finally:
            self._terminate_proc()

    def _terminate_proc(self):
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def request_stop(self):
        self._stop_requested = True
        self._terminate_proc()
