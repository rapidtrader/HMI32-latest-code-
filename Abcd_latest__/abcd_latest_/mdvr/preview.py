"""FFmpeg → RGB frames for MDVR RTSP."""
import os
import subprocess
import threading
import time

from PyQt5.QtGui import QImage

from mdvr.probe import ensure_channel_probed
from mdvr.rtsp_urls import rtsp_url

PREVIEW_WIDTH = int(os.environ.get("MDVR_PREVIEW_WIDTH", os.environ.get("CAMERA_PREVIEW_WIDTH", "480")))
PREVIEW_HEIGHT = int(os.environ.get("MDVR_PREVIEW_HEIGHT", os.environ.get("CAMERA_PREVIEW_HEIGHT", "270")))
PREVIEW_MAX_FPS = int(os.environ.get("MDVR_PREVIEW_MAX_FPS", "10"))
FRAME_MIN_INTERVAL = max(
    0.05, float(os.environ.get("MDVR_FRAME_MIN_MS", os.environ.get("CAMERA_FRAME_MIN_MS", "150"))) / 1000.0
)
RTSP_TRANSPORT = os.environ.get("MDVR_RTSP_TRANSPORT", "tcp").strip() or "tcp"
FFMPEG_BIN = os.environ.get("MDVR_FFMPEG", "ffmpeg").strip() or "ffmpeg"
_START_STAGGER = max(0.0, float(os.environ.get("MDVR_START_STAGGER_SEC", "0.35")))
_RECONNECT_SEC = max(0.5, float(os.environ.get("MDVR_RECONNECT_SEC", "2.0")))
_RTSP_STIMEOUT_US = os.environ.get("MDVR_RTSP_STIMEOUT_US", "10000000")
def _ffmpeg_max_parallel() -> int:
    return max(1, int(os.environ.get("MDVR_FFMPEG_MAX_PARALLEL", "8")))


_FFMPEG_SLOT_TIMEOUT = max(5.0, float(os.environ.get("MDVR_FFMPEG_SLOT_TIMEOUT_SEC", "90")))

_START_LOCK = threading.Lock()
_last_start = 0.0
_PARALLEL_SEM = threading.Semaphore(_ffmpeg_max_parallel())


def _ffmpeg_cmd(url: str):
    cmd = [
        FFMPEG_BIN,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-rtsp_transport",
        RTSP_TRANSPORT,
    ]
    if _RTSP_STIMEOUT_US:
        cmd.extend(["-stimeout", str(_RTSP_STIMEOUT_US)])
    cmd.extend(
        [
            "-i",
            url,
            "-an",
            "-vf",
            f"fps={PREVIEW_MAX_FPS}",
            "-s",
            f"{PREVIEW_WIDTH}x{PREVIEW_HEIGHT}",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "pipe:1",
        ]
    )
    return cmd


class MdvrRtspPreviewThread(threading.Thread):
    def __init__(self, channel_id: int, notifier, on_error=None):
        super().__init__(daemon=True, name=f"mdvr-rtsp-{channel_id}")
        self.channel_id = int(channel_id)
        self.url = rtsp_url(self.channel_id)
        self._notifier = notifier
        self._on_error = on_error
        self._proc = None
        self._halt = threading.Event()
        self._last_emit = 0.0
        self._frame_bytes = PREVIEW_WIDTH * PREVIEW_HEIGHT * 3
        self._owns_sem = False

    def run(self):
        if not ensure_channel_probed(self.channel_id, self.url):
            self._report(f"CH{self.channel_id}: no MDVR video (probe failed)")
            return

        global _last_start
        with _START_LOCK:
            gap = _START_STAGGER - (time.time() - _last_start)
            if gap > 0:
                time.sleep(gap)
            _last_start = time.time()

        had_frames = False
        slot_timeouts = 0
        while not self._halt.is_set():
            result = self._capture_once()
            if result == "halted":
                break
            if result == "slot_timeout":
                slot_timeouts += 1
                if slot_timeouts <= 12:
                    time.sleep(min(2.0, 0.25 * slot_timeouts))
                    continue
                self._report(f"CH{self.channel_id}: ffmpeg slots busy (retry later)")
                time.sleep(_RECONNECT_SEC)
                slot_timeouts = 0
                continue
            if result is True:
                had_frames = True
                slot_timeouts = 0
            if self._halt.is_set():
                break
            if result is False and not had_frames:
                self._report(f"CH{self.channel_id}: stream failed ({self.url})")
                break
            if result is False and had_frames:
                self._report(f"CH{self.channel_id}: reconnecting…")
            time.sleep(_RECONNECT_SEC)

    def _report(self, msg: str):
        cb = self._on_error
        if not cb:
            print(f"[MDVR] {msg}")
            return
        try:
            cb(msg)
        except RuntimeError:
            print(f"[MDVR] {msg}")

    def _capture_once(self):
        if self._halt.is_set():
            return "halted"
        if not _PARALLEL_SEM.acquire(timeout=_FFMPEG_SLOT_TIMEOUT):
            print(
                f"[MDVR] CH{self.channel_id}: wait for ffmpeg slot "
                f"(max {_ffmpeg_max_parallel()} parallel)"
            )
            return "slot_timeout"
        self._owns_sem = True
        if self._halt.is_set():
            self._release_sem()
            return "halted"
        cmd = _ffmpeg_cmd(self.url)
        print(f"[MDVR] live CH{self.channel_id} {self.url}")
        try:
            self._proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
            )
        except OSError as exc:
            print(f"[MDVR] CH{self.channel_id} ffmpeg: {exc}")
            self._release_sem()
            return False

        got = False
        stride = PREVIEW_WIDTH * 3
        assert self._proc.stdout is not None
        try:
            while not self._halt.is_set():
                raw = self._read_exact(self._proc.stdout, self._frame_bytes)
                if raw is None:
                    break
                got = True
                now = time.time()
                if now - self._last_emit >= FRAME_MIN_INTERVAL:
                    self._last_emit = now
                    image = QImage(
                        raw,
                        PREVIEW_WIDTH,
                        PREVIEW_HEIGHT,
                        stride,
                        QImage.Format_RGB888,
                    ).copy()
                    self._notifier.frameReady.emit(self.channel_id, image)
        finally:
            proc = self._proc
            self._stop_proc()
            if not got and proc is not None and proc.stderr is not None:
                try:
                    err = proc.stderr.read(8192).decode("utf-8", errors="replace").strip()
                    if err:
                        print(f"[MDVR] CH{self.channel_id}: {err}")
                except OSError:
                    pass
            self._release_sem()
        return got

    def _read_exact(self, stream, nbytes: int):
        buf = bytearray()
        while len(buf) < nbytes and not self._halt.is_set():
            chunk = stream.read(nbytes - len(buf))
            if not chunk:
                return None
            buf.extend(chunk)
        return bytes(buf) if len(buf) == nbytes else None

    def _release_sem(self):
        if self._owns_sem:
            self._owns_sem = False
            _PARALLEL_SEM.release()

    def _stop_proc(self):
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
                proc.wait(timeout=1)
            except Exception:
                pass

    def request_stop(self):
        self._halt.set()
        self._on_error = None
        self._stop_proc()
        self._release_sem()
