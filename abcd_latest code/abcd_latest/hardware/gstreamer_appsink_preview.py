"""
Inline camera preview: supplier-style v4l2 NV12 → scaled RGB → appsink → Qt paint.
Avoids xv/ximagesink overlay (black under Qt Quick software renderer).
"""
import os
import threading
import time

from PyQt5.QtCore import QObject, pyqtSignal
from PyQt5.QtGui import QImage

from hardware.camera_capture import resolve_video_device
from hardware.camera_stream_ids import active_stream_count

_GST_INIT_LOCK = threading.Lock()
_GST_INITIALIZED = False

VIDEO_WIDTH = int(os.environ.get("CAMERA_SRC_WIDTH", "1920"))
VIDEO_HEIGHT = int(os.environ.get("CAMERA_SRC_HEIGHT", "1080"))
VIDEO_FPS = int(os.environ.get("CAMERA_FPS", "20"))
PIXEL_FORMAT = os.environ.get("CAMERA_PIXEL_FORMAT", "NV12").strip() or "NV12"
PREVIEW_WIDTH = int(os.environ.get("CAMERA_PREVIEW_WIDTH", "480"))
PREVIEW_HEIGHT = int(os.environ.get("CAMERA_PREVIEW_HEIGHT", "270"))
PREVIEW_MAX_FPS = int(os.environ.get("CAMERA_PREVIEW_MAX_FPS", "10"))
_FRAME_MIN_INTERVAL = max(
    0.05, float(os.environ.get("CAMERA_FRAME_MIN_MS", "150")) / 1000.0
)
PLAYING_WAIT_SEC = float(os.environ.get("CAMERA_PLAYING_WAIT_SEC", "8"))

_VIDEO_CAPTURE_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "video-capture-code")
)


class PreviewFrameNotifier(QObject):
    """Cross-thread delivery to the Qt GUI thread."""

    frameReady = pyqtSignal(int, QImage)


def _apply_gst_runtime_env() -> None:
    scanner = os.path.join(_VIDEO_CAPTURE_ROOT, "gst-plugin-scanner-wrapper.sh")
    if os.path.isfile(scanner) and os.access(scanner, os.X_OK):
        os.environ["GST_PLUGIN_SCANNER"] = scanner
    os.environ.setdefault("GST_REGISTRY_UPDATE", "no")
    gomp = "/lib/aarch64-linux-gnu/libgomp.so.1"
    if os.path.isfile(gomp):
        prev = os.environ.get("LD_PRELOAD", "")
        if gomp not in prev.split(":"):
            os.environ["LD_PRELOAD"] = f"{gomp}:{prev}" if prev else gomp


_PREVIEW_START_LOCK = threading.Lock()
_START_STAGGER_SEC = max(
    0.0, float(os.environ.get("CAMERA_START_STAGGER_SEC", "0.8"))
)
_last_pipeline_start = 0.0
_POST_PLAYING_GAP_SEC = max(
    0.0, float(os.environ.get("CAMERA_POST_PLAYING_GAP_SEC", "1.0"))
)
_PLAY_RETRY_GAP_SEC = max(
    0.2, float(os.environ.get("CAMERA_PLAY_RETRY_GAP_SEC", "1.0"))
)


def _wait_playing(pipeline, timeout_sec: float = 12.0) -> bool:
    from gi.repository import Gst

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        ret, state, pending = pipeline.get_state(Gst.SECOND)
        if ret == Gst.StateChangeReturn.FAILURE:
            return False
        if state == Gst.State.PLAYING and pending == Gst.State.VOID_PENDING:
            return True
        time.sleep(0.05)
    ret, state, pending = pipeline.get_state(0)
    print(
        f"[CAMERA] wait PLAYING: state={state.value_nick} "
        f"pending={pending.value_nick if pending else 'none'}"
    )
    return state == Gst.State.PLAYING


def _bring_pipeline_playing(pipeline, camera_id: int, device: str) -> bool:
    """Set PLAYING and wait; one retry after NULL (RK rkcif often busy in parallel)."""
    from gi.repository import Gst

    for attempt in (1, 2):
        ret = pipeline.set_state(Gst.State.PLAYING)
        if ret == Gst.StateChangeReturn.FAILURE:
            print(f"[CAMERA] cam{camera_id}: PLAYING failed (attempt {attempt})")
            if attempt == 1:
                pipeline.set_state(Gst.State.NULL)
                time.sleep(_PLAY_RETRY_GAP_SEC)
                continue
            return False
        if _wait_playing(pipeline, PLAYING_WAIT_SEC):
            return True
        print(
            f"[CAMERA] cam{camera_id}: never reached PLAYING "
            f"(attempt {attempt}, {device})"
        )
        if attempt == 1:
            pipeline.set_state(Gst.State.NULL)
            time.sleep(_PLAY_RETRY_GAP_SEC)
            continue
    return False


def ensure_gst_init() -> bool:
    global _GST_INITIALIZED
    with _GST_INIT_LOCK:
        if _GST_INITIALIZED:
            return True
        try:
            _apply_gst_runtime_env()
            import gi

            gi.require_version("Gst", "1.0")
            gi.require_version("GstApp", "1.0")
            from gi.repository import Gst

            Gst.init(None)
            _GST_INITIALIZED = True
            print("[CAMERA] GStreamer initialized (appsink preview)")
            return True
        except Exception as exc:
            print(f"[CAMERA] GStreamer init failed: {exc}")
            return False


class AppsinkPreviewPipeline(threading.Thread):
    """Pull RGB frames and emit QImage on the GUI thread."""

    def __init__(
        self,
        camera_id: int,
        notifier: PreviewFrameNotifier,
        on_error=None,
    ):
        super().__init__(daemon=True, name=f"gst-appsink-{camera_id}")
        self.camera_id = camera_id
        self.device = resolve_video_device(camera_id)
        self._notifier = notifier
        self._on_error = on_error
        self._pipeline = None
        self._appsink = None
        self._halt = threading.Event()
        self._last_frame_emit = 0.0

    def _v4l2src_fragment(self) -> str:
        io = os.environ.get("CAMERA_V4L2_IO_MODE", "4").strip()
        if io and io.lower() not in ("0", "none", "off"):
            return f"v4l2src device={self.device} io-mode={io}"
        return f"v4l2src device={self.device}"

    def _src_caps(self) -> tuple:
        """RK rkcif: multiple 1080p v4l2 opens hang; lower capture size when >1 tile streams."""
        n = active_stream_count()
        if n <= 1:
            return VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS
        if n >= 4:
            w = int(os.environ.get("CAMERA_MULTI4_SRC_WIDTH", "640"))
            h = int(os.environ.get("CAMERA_MULTI4_SRC_HEIGHT", "360"))
        else:
            w = int(os.environ.get("CAMERA_MULTI_SRC_WIDTH", "1280"))
            h = int(os.environ.get("CAMERA_MULTI_SRC_HEIGHT", "720"))
        fps = int(os.environ.get("CAMERA_MULTI_FPS", "15"))
        return w, h, fps

    def _build_launch(self) -> str:
        src_w, src_h, src_fps = self._src_caps()
        src_caps = (
            f"video/x-raw,format={PIXEL_FORMAT},width={src_w},height={src_h},"
            f"framerate={src_fps}/1"
        )
        return (
            f"{self._v4l2src_fragment()} ! {src_caps} ! "
            f"videorate drop-only=true max-rate={PREVIEW_MAX_FPS} ! "
            f"video/x-raw,framerate={PREVIEW_MAX_FPS}/1 ! "
            f"videoscale ! video/x-raw,width={PREVIEW_WIDTH},height={PREVIEW_HEIGHT} ! "
            "videoconvert ! video/x-raw,format=RGB ! "
            "queue max-size-buffers=2 leaky=downstream ! "
            "appsink name=sink emit-signals=true max-buffers=1 drop=true sync=false"
        )

    def _on_new_sample(self, appsink):
        from gi.repository import Gst

        if self._halt.is_set():
            return Gst.FlowReturn.EOS
        try:
            sample = appsink.emit("pull-sample")
            if sample is None:
                return Gst.FlowReturn.OK
            buffer = sample.get_buffer()
            caps = sample.get_caps().get_structure(0)
            width = caps.get_value("width")
            height = caps.get_value("height")
            ok, map_info = buffer.map(Gst.MapFlags.READ)
            if not ok:
                return Gst.FlowReturn.ERROR
            try:
                stride = width * 3
                need = height * stride
                raw = bytes(map_info.data[: map_info.size])
                if len(raw) < need:
                    return Gst.FlowReturn.ERROR
                image = QImage(raw, width, height, stride, QImage.Format_RGB888).copy()
            finally:
                buffer.unmap(map_info)
            now = time.time()
            if now - self._last_frame_emit >= _FRAME_MIN_INTERVAL:
                self._last_frame_emit = now
                self._notifier.frameReady.emit(self.camera_id, image)
            return Gst.FlowReturn.OK
        except Exception as exc:
            print(f"[CAMERA] cam{self.camera_id} sample error: {exc}")
            return Gst.FlowReturn.ERROR

    def run(self):
        if not ensure_gst_init():
            return
        try:
            from gi.repository import Gst

            launch = self._build_launch()
            global _last_pipeline_start
            pipeline = None
            ok = False

            from hardware.camera_probe import ensure_channel_probed

            if not ensure_channel_probed(self.camera_id, self.device):
                if self._on_error:
                    self._on_error(
                        f"CH{self.camera_id} ({self.device}): no camera signal on this BNC"
                    )
                return

            src_w, src_h, src_fps = self._src_caps()

            def _open_and_wait() -> bool:
                print(
                    f"[CAMERA] Appsink pipeline cam{self.camera_id} {self.device} "
                    f"({src_w}x{src_h}@{src_fps})"
                )
                nonlocal pipeline
                pipeline = Gst.parse_launch(launch)
                self._pipeline = pipeline
                appsink = pipeline.get_by_name("sink")
                self._appsink = appsink
                if appsink is None:
                    print(f"[CAMERA] cam{self.camera_id}: appsink missing")
                    return False
                appsink.connect("new-sample", self._on_new_sample)
                return _bring_pipeline_playing(
                    pipeline, self.camera_id, self.device
                )

            with _PREVIEW_START_LOCK:
                gap = _START_STAGGER_SEC - (time.time() - _last_pipeline_start)
                if gap > 0:
                    time.sleep(gap)
                ok = _open_and_wait()
                _last_pipeline_start = time.time()
                if ok and _POST_PLAYING_GAP_SEC > 0:
                    time.sleep(_POST_PLAYING_GAP_SEC)

            if not ok:
                if self._on_error:
                    self._on_error(
                        f"CH{self.camera_id} ({self.device}): no signal or busy "
                        "(camera on this BNC? try CAMERA_STREAM_IDS="
                        f"{self.camera_id} only)"
                    )
                return

            bus = pipeline.get_bus()
            while not self._halt.is_set():
                msg = bus.timed_pop_filtered(
                    200 * Gst.MSECOND,
                    Gst.MessageType.ERROR | Gst.MessageType.EOS,
                )
                if msg is not None:
                    if msg.type == Gst.MessageType.ERROR:
                        err, debug = msg.parse_error()
                        msg_text = err.message
                        print(
                            f"[CAMERA] cam{self.camera_id} error: {msg_text} "
                            f"({debug})"
                        )
                        if self._on_error:
                            self._on_error(
                                f"CH{self.camera_id} ({self.device}): {msg_text}"
                            )
                        break
                    if msg.type == Gst.MessageType.EOS:
                        break
        except Exception as exc:
            print(f"[CAMERA] cam{self.camera_id} pipeline error: {exc}")
            if self._on_error:
                self._on_error(f"CH{self.camera_id}: {exc}")
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
            self._appsink = None

    def request_stop(self):
        self._halt.set()
        self._teardown()
