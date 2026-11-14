"""
GStreamer v4l2 → xvimagesink (same pipeline as video-capture-code/mainwindow.cpp setupGStreamerDev).
"""
import os
import threading
import time

from hardware.camera_capture import resolve_video_device

_GST_INIT_LOCK = threading.Lock()
_GST_INITIALIZED = False

VIDEO_WIDTH = int(os.environ.get("CAMERA_SRC_WIDTH", "1920"))
VIDEO_HEIGHT = int(os.environ.get("CAMERA_SRC_HEIGHT", "1080"))
VIDEO_FPS = int(os.environ.get("CAMERA_FPS", "20"))
PIXEL_FORMAT = os.environ.get("CAMERA_PIXEL_FORMAT", "NV12").strip() or "NV12"

_VIDEO_CAPTURE_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "video-capture-code")
)


def _apply_gst_runtime_env() -> None:
    """Match video-capture-code child env (scanner, libgomp) before Gst.init."""
    scanner = os.path.join(_VIDEO_CAPTURE_ROOT, "gst-plugin-scanner-wrapper.sh")
    if os.path.isfile(scanner) and os.access(scanner, os.X_OK):
        os.environ["GST_PLUGIN_SCANNER"] = scanner
    os.environ.setdefault("GST_REGISTRY_UPDATE", "no")
    gomp = "/lib/aarch64-linux-gnu/libgomp.so.1"
    if os.path.isfile(gomp):
        prev = os.environ.get("LD_PRELOAD", "")
        if gomp not in prev.split(":"):
            os.environ["LD_PRELOAD"] = f"{gomp}:{prev}" if prev else gomp


def ensure_gst_init() -> bool:
    global _GST_INITIALIZED
    with _GST_INIT_LOCK:
        if _GST_INITIALIZED:
            return True
        try:
            _apply_gst_runtime_env()
            import gi

            gi.require_version("Gst", "1.0")
            gi.require_version("GstVideo", "1.0")
            from gi.repository import Gst

            Gst.init(None)
            _GST_INITIALIZED = True
            print("[CAMERA] GStreamer initialized")
            return True
        except Exception as exc:
            print(f"[CAMERA] GStreamer init failed: {exc}")
            return False


class XvImageSinkPipeline(threading.Thread):
    """xvimagesink bound to a Qt WId (vendor demo style)."""

    def __init__(self, camera_id: int, window_id: int, on_error=None):
        super().__init__(daemon=True, name=f"gst-xv-{camera_id}")
        self.camera_id = camera_id
        self.device = resolve_video_device(camera_id)
        self.window_id = int(window_id)
        self._on_error = on_error
        self._pipeline = None
        self._stop = threading.Event()

    def _build_launch(self) -> str:
        caps = (
            f"video/x-raw,format={PIXEL_FORMAT},width={VIDEO_WIDTH},height={VIDEO_HEIGHT},"
            f"framerate={VIDEO_FPS}/1"
        )
        return (
            f"v4l2src device={self.device} io-mode=4 ! capsfilter caps={caps} ! "
            "videoconvert ! xvimagesink name=sink sync=false"
        )

    def run(self):
        if not ensure_gst_init():
            return
        try:
            from gi.repository import Gst, GstVideo

            launch = self._build_launch()
            print(f"[CAMERA] Pipeline cam{self.camera_id} {self.device} winId={self.window_id}")
            pipeline = Gst.parse_launch(launch)
            self._pipeline = pipeline
            sink = pipeline.get_by_name("sink")
            if sink is None:
                print(f"[CAMERA] cam{self.camera_id}: xvimagesink missing")
                return

            GstVideo.VideoOverlay.set_window_handle(sink, self.window_id)

            ret = pipeline.set_state(Gst.State.PLAYING)
            if ret == Gst.StateChangeReturn.FAILURE:
                print(f"[CAMERA] cam{self.camera_id}: PLAYING failed")
                return

            bus = pipeline.get_bus()
            while not self._stop.is_set():
                msg = bus.timed_pop_filtered(
                    200 * Gst.MSECOND,
                    Gst.MessageType.ERROR | Gst.MessageType.EOS,
                )
                if msg is not None:
                    if msg.type == Gst.MessageType.ERROR:
                        err, _debug = msg.parse_error()
                        msg_text = err.message
                        print(f"[CAMERA] cam{self.camera_id} error: {msg_text}")
                        if self._on_error:
                            self._on_error(
                                f"CH{self.camera_id} ({self.device}): {msg_text}"
                            )
                        break
                    if msg.type == Gst.MessageType.EOS:
                        break
        except Exception as exc:
            print(f"[CAMERA] cam{self.camera_id} pipeline error: {exc}")
        finally:
            self._teardown()

    def _teardown(self):
        if self._pipeline is not None:
            try:
                from gi.repository import Gst

                self._pipeline.set_state(Gst.State.NULL)
            except Exception:
                pass
            self._pipeline = None

    def request_stop(self):
        self._stop.set()
        self._teardown()
