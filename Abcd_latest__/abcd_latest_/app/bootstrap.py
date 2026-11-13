import os
import sys

from PyQt5.QtCore import Qt, QTimer, QUrl
from PyQt5.QtQml import QQmlApplicationEngine, qmlRegisterType
from PyQt5.QtWidgets import QApplication

from app.bridge import MachineBridge
from app.camera_service import CameraController
from app.gps_controller import GpsController
from app.gstreamer_video_item import GStreamerVideoItem
from app.can_setup import setup_can_bus
from app.config import (
    APP_NAME,
    MAIN_QML,
    QML_DIR,
    apply_backend_json_runtime_env,
    ensure_backend_url_configured,
    ensure_paths,
    set_global_controller,
)
from app.controller import AppController
from app.mdvr_controller import MdvrController
from app.mdvr_video_item import MdvrVideoItem

apply_backend_json_runtime_env()

_hmi_root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
_gst_wrapper = os.path.join(_hmi_root, "..", "video-capture-code", "gst-plugin-scanner-wrapper.sh")
if os.path.isfile(_gst_wrapper):
    os.environ.setdefault("GST_PLUGIN_SCANNER", os.path.abspath(_gst_wrapper))
os.environ.setdefault("GST_REGISTRY_UPDATE", "no")
_gomp = "/lib/aarch64-linux-gnu/libgomp.so.1"
if os.path.isfile(_gomp) and _gomp not in os.environ.get("LD_PRELOAD", "").split(":"):
    os.environ["LD_PRELOAD"] = f"{_gomp}:{os.environ['LD_PRELOAD']}" if os.environ.get("LD_PRELOAD") else _gomp

os.environ.setdefault("MDVR_HOST", "192.168.31.156")
os.environ.setdefault("MDVR_CHANNEL_COUNT", "8")
os.environ.setdefault("MDVR_PROBE", "0")
os.environ.setdefault("MDVR_TRY_ALL_PORTS", "1")
os.environ.setdefault("MDVR_STREAM_INDEX", "1")
# This DVR: av0 empty — UI CHn maps to stream/av{n}_1 (not av{n-1})
os.environ.setdefault("MDVR_AV_OFFSET", "1")
os.environ.setdefault("MDVR_FFMPEG_MAX_PARALLEL", "8")
os.environ.setdefault("MDVR_FFMPEG_SLOT_TIMEOUT_SEC", "90")
os.environ.setdefault("MDVR_START_STAGGER_SEC", "0.6")
os.environ.setdefault("MDVR_PROBE_TIMEOUT_SEC", "18")
os.environ.setdefault("MDVR_PROBE_PARALLEL", "0")
os.environ.setdefault("MDVR_CONNECT_TIMEOUT_SEC", "4")
os.environ.setdefault("CAMERA_AUTO_START", "1")
os.environ.setdefault("MDVR_AUTO_START", "1")
os.environ.setdefault("CAMERA_BACKGROUND_PREVIEW", "1")
os.environ.setdefault("CAMERA_AUTO_START_DELAY_MS", "2500")
os.environ.setdefault("MDVR_AUTO_START_DELAY_MS", "4000")

# Runtime fixes for RK356x
os.environ.setdefault("GPS_SERIAL_PORT", "/dev/ttyUSB1")
os.environ.setdefault("GPS_AT_PORT", "/dev/ttyUSB3")
os.environ.setdefault("GPS_GNSS_CONFIG", "3")
os.environ.setdefault("GPS_AT_LOC_POLL_SEC", "10")
os.environ.setdefault("GPS_BAUD", "115200")
# All tiles stream by default; limit with CAMERA_STREAM_IDS=2 when testing one BNC
os.environ.setdefault("CAMERA_STREAM_IDS", "all")
# Probe spawns gst-launch (can freeze RK if plugin-scanner stuck). MDVR uses separate page.
os.environ.setdefault("CAMERA_PROBE", "0")
os.environ.setdefault("CAMERA_PROBE_TIMEOUT_SEC", "5")
os.environ.setdefault("CAMERA_START_STAGGER_SEC", "3.0")
os.environ.setdefault("CAMERA_POST_PLAYING_GAP_SEC", "3.0")
os.environ.setdefault("CAMERA_TILE_STAGGER_SEC", "3.0")
os.environ.setdefault("CAMERA_PREVIEW_MAX_FPS", "10")
os.environ.setdefault("CAMERA_UI_MAX_FPS", "6")
os.environ.setdefault("CAMERA_FRAME_MIN_MS", "180")
# Continuous all-channel clips → JSON → server (backend.json cameraAutoSave overrides)
os.environ.setdefault("CAMERA_AUTO_SAVE", "0")
os.environ.setdefault("CAMERA_AUTO_SAVE_START_DELAY_SEC", "15")
os.environ.setdefault("CAMERA_AUTO_SAVE_MIN_LIVE_SEC", "8")
os.environ.setdefault("CAMERA_AUTO_SAVE_CLIP_SEC", "600")
# Gap between one-shot batches only (continuous mode ignores this)
os.environ.setdefault("CAMERA_AUTO_SAVE_GAP_SEC", "0")
os.environ.setdefault("CAMERA_AUTO_SAVE_SETTLE_SEC", "0.2")
os.environ.setdefault("CAMERA_AUTO_SAVE_ROTATE", "1")
os.environ.setdefault("CAMERA_AUTO_SAVE_CHANNEL", "1")
os.environ.setdefault("CAMERA_AUTO_SAVE_PARALLEL", "1")
os.environ.setdefault("CAMERA_AUTO_SAVE_CONTINUOUS", "1")
os.environ.setdefault("CAMERA_PREVIEW_CLIP_FPS", "8")
os.environ.setdefault("CAMERA_VIDEO_SYNC_INTERVAL_SEC", "5")
os.environ.setdefault("CAMERA_VIDEO_DIRECT_UPLOAD", "1")
os.environ.setdefault("CAMERA_VIDEO_UPLOAD_TIMEOUT_SEC", "900")
os.environ.setdefault("CAMERA_VIDEO_UPLOAD_CONCURRENCY", "1")
os.environ.setdefault("CAMERA_VIDEO_DELETE_AFTER_UPLOAD", "1")
# Include every enabled tile even if probe was flaky (was skipping CH2/CH3)
os.environ.setdefault("CAMERA_AUTO_SAVE_REQUIRE_PROBE", "0")
os.environ.setdefault("CAMERA_VIDEO_CODEC", "auto")
os.environ.setdefault("CAMERA_VIDEO_PREVIEW_RELEASE_SEC", "1.2")
os.environ.setdefault("CAMERA_VIDEO_SYNC_INTERVAL_SEC", "15")
os.environ["QT_QPA_PLATFORM"] = "xcb"
os.environ["QT_XCB_GL_INTEGRATION"] = "none"
os.environ["QT_OPENGL"] = "software"
os.environ["QT_QUICK_BACKEND"] = "software"
os.environ["LIBGL_ALWAYS_SOFTWARE"] = "1"
os.environ["QT_QUICK_CONTROLS_STYLE"] = "Basic"
os.environ["QT_DEBUG_PLUGINS"] = "0"


def _env_enabled(name: str, default: str = "1") -> bool:
    return os.environ.get(name, default).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _schedule_camera_mdvr_auto_start(camera_controller, mdvr_controller) -> None:
    """Start BNC + MDVR previews after UI is up (no manual Start buttons)."""

    def start_bnc():
        if not _env_enabled("CAMERA_AUTO_START", "1"):
            return
        if camera_controller.gstBlocked:
            print("[CAMERA] auto-start skipped — GStreamer blocked (reboot if needed)")
            return
        if camera_controller.isActive or camera_controller.isBusy:
            return
        print("[CAMERA] auto-start BNC previews")
        camera_controller.launchVendorDemo()

    def start_mdvr():
        if not _env_enabled("MDVR_AUTO_START", "1"):
            return
        if mdvr_controller.isActive or mdvr_controller.isBusy:
            return
        print("[MDVR] auto-start RTSP previews")
        mdvr_controller.startAll()

    try:
        bnc_ms = max(500, int(float(os.environ.get("CAMERA_AUTO_START_DELAY_MS", "2500"))))
        mdvr_ms = max(500, int(float(os.environ.get("MDVR_AUTO_START_DELAY_MS", "4000"))))
    except (TypeError, ValueError):
        bnc_ms, mdvr_ms = 2500, 4000

    QTimer.singleShot(bnc_ms, start_bnc)
    QTimer.singleShot(mdvr_ms, start_mdvr)


def _configure_qt_env():
    os.environ.setdefault("QT_QUICK_CONTROLS_STYLE", "Basic")
    os.environ.setdefault("QT_LOGGING_RULES", "qt.qpa.*=false")
    os.environ["QML_DISABLE_DISK_CACHE"] = "1"


def run():
    ensure_paths()
    backend_url = ensure_backend_url_configured()
    try:
        from app.config import probe_backend_reachable

        probed = probe_backend_reachable()
        if probed:
            backend_url = probed
    except Exception as exc:
        print(f"[CONFIG] Backend probe skipped: {exc}")
    if backend_url:
        archive_path = os.environ.get("SAVED_VIDEO_UPLOAD_PATH", "/api/saved-videos").strip()
        if not archive_path.startswith("/"):
            archive_path = f"/{archive_path}"
        print(f"[CONFIG] Backend URL: {backend_url}")
        print(f"[CONFIG] API base: {backend_url}/api/")
        print(f"[CONFIG] Video archive (append-only): POST {backend_url}{archive_path}")
        try:
            from logic.camera_videos_store import STORE_PATH

            print(f"[CONFIG] Camera clips JSON (local first): {STORE_PATH}")
        except Exception:
            pass
    else:
        print("[CONFIG] Backend URL missing — edit data/backend.json (backendBaseUrl)")
    from app.config import can_require_response
    print(f"[CONFIG] CAN 0x202 response required: {can_require_response()}")
    auto = os.environ.get("CAMERA_AUTO_SAVE", "0").strip()
    print(
        f"[CONFIG] Camera auto-save: {'ON' if auto in ('1', 'true', 'yes', 'on') else 'OFF'} "
        f"(backend.json cameraAutoSave or export CAMERA_AUTO_SAVE=1)"
    )

    setup_can_bus()
    _configure_qt_env()

    try:
        from hardware.gst_health import kill_orphan_gst_processes, stuck_gst_plugin_scanners

        if stuck_gst_plugin_scanners() == 0:
            kill_orphan_gst_processes()
        elif stuck_gst_plugin_scanners() > 0:
            print(
                "[CAMERA] Stuck gst-plugin-scanner detected at startup — "
                "local Cameras disabled until reboot; MDVR page still works."
            )
    except Exception as exc:
        print(f"[CAMERA] gst startup check skipped: {exc}")

    from logic.camera_video_sync_background import start_camera_video_sync_loop

    start_camera_video_sync_loop()

    QApplication.setAttribute(Qt.AA_SynthesizeMouseForUnhandledTouchEvents, True)
    QApplication.setAttribute(Qt.AA_SynthesizeTouchForUnhandledMouseEvents, False)


    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    qmlRegisterType(GStreamerVideoItem, "HmiCamera", 1, 0, "GStreamerVideo")
    qmlRegisterType(MdvrVideoItem, "HmiMdvr", 1, 0, "MdvrVideo")

    engine = QQmlApplicationEngine()
    engine.addImportPath(QML_DIR)

    app_controller = AppController()
    set_global_controller(app_controller)
    machine_bridge = MachineBridge()
    camera_controller = CameraController()
    gps_controller = GpsController()
    mdvr_controller = MdvrController()

    def _on_quit():
        machine_bridge._cancel_all_command_timeouts()

    app.aboutToQuit.connect(_on_quit)

    engine.rootContext().setContextProperty("appController", app_controller)
    engine.rootContext().setContextProperty("machineBridge", machine_bridge)
    engine.rootContext().setContextProperty("cameraController", camera_controller)
    engine.rootContext().setContextProperty("gpsController", gps_controller)
    engine.rootContext().setContextProperty("mdvrController", mdvr_controller)

    print("[DEBUG] Loading QML:", MAIN_QML)
    print("[DEBUG] QML import path:", QML_DIR)

    engine.load(QUrl.fromLocalFile(MAIN_QML))

    if not engine.rootObjects():
        print("[ERROR] QML rootObjects empty")
        for err in engine.errors():
            print("[QML ERROR]", err.toString())
        return 1

    _schedule_camera_mdvr_auto_start(camera_controller, mdvr_controller)

    return app.exec_()
