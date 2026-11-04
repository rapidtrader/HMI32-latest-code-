import os
import sys

from PyQt5.QtCore import Qt, QUrl
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

apply_backend_json_runtime_env()

# Runtime fixes for RK356x
os.environ.setdefault("GPS_SERIAL_PORT", "/dev/ttyUSB1")
os.environ.setdefault("GPS_BAUD", "115200")
# All tiles stream by default; limit with CAMERA_STREAM_IDS=2 when testing one BNC
os.environ.setdefault("CAMERA_STREAM_IDS", "all")
os.environ.setdefault("CAMERA_PROBE", "1")
os.environ.setdefault("CAMERA_START_STAGGER_SEC", "3.0")
os.environ.setdefault("CAMERA_POST_PLAYING_GAP_SEC", "3.0")
os.environ.setdefault("CAMERA_TILE_STAGGER_SEC", "3.0")
os.environ.setdefault("CAMERA_PREVIEW_MAX_FPS", "10")
os.environ.setdefault("CAMERA_UI_MAX_FPS", "6")
os.environ.setdefault("CAMERA_FRAME_MIN_MS", "180")
# Off by default — enable after live view is stable: CAMERA_AUTO_SAVE=1
os.environ.setdefault("CAMERA_AUTO_SAVE", "0")
os.environ.setdefault("CAMERA_AUTO_SAVE_START_DELAY_SEC", "60")
os.environ.setdefault("CAMERA_AUTO_SAVE_MIN_LIVE_SEC", "50")
os.environ.setdefault("CAMERA_AUTO_SAVE_CLIP_SEC", "15")
os.environ.setdefault("CAMERA_AUTO_SAVE_GAP_SEC", "60")
os.environ.setdefault("CAMERA_AUTO_SAVE_SETTLE_SEC", "0.4")
os.environ.setdefault("CAMERA_AUTO_SAVE_ROTATE", "1")
os.environ.setdefault("CAMERA_AUTO_SAVE_CHANNEL", "1")
os.environ.setdefault("CAMERA_VIDEO_CODEC", "auto")
os.environ.setdefault("CAMERA_VIDEO_PREVIEW_RELEASE_SEC", "5.0")
os.environ["QT_QPA_PLATFORM"] = "xcb"
os.environ["QT_XCB_GL_INTEGRATION"] = "none"
os.environ["QT_OPENGL"] = "software"
os.environ["QT_QUICK_BACKEND"] = "software"
os.environ["LIBGL_ALWAYS_SOFTWARE"] = "1"
os.environ["QT_QUICK_CONTROLS_STYLE"] = "Basic"
os.environ["QT_DEBUG_PLUGINS"] = "0"


def _configure_qt_env():
    os.environ.setdefault("QT_QUICK_CONTROLS_STYLE", "Basic")
    os.environ.setdefault("QT_LOGGING_RULES", "qt.qpa.*=false")
    os.environ["QML_DISABLE_DISK_CACHE"] = "1"


def run():
    ensure_paths()
    backend_url = ensure_backend_url_configured()
    if backend_url:
        print(f"[CONFIG] Backend URL: {backend_url}")
        print(f"[CONFIG] API base: {backend_url}/api/")
        print(f"[CONFIG] Camera clips upload: POST {backend_url}/api/camera-videos")
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

    from logic.camera_video_sync_background import start_camera_video_sync_loop

    start_camera_video_sync_loop()

    QApplication.setAttribute(Qt.AA_SynthesizeMouseForUnhandledTouchEvents, True)
    QApplication.setAttribute(Qt.AA_SynthesizeTouchForUnhandledMouseEvents, False)


    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    qmlRegisterType(GStreamerVideoItem, "HmiCamera", 1, 0, "GStreamerVideo")

    engine = QQmlApplicationEngine()
    engine.addImportPath(QML_DIR)

    app_controller = AppController()
    set_global_controller(app_controller)
    machine_bridge = MachineBridge()
    camera_controller = CameraController()
    gps_controller = GpsController()

    def _on_quit():
        machine_bridge._cancel_all_command_timeouts()

    app.aboutToQuit.connect(_on_quit)

    engine.rootContext().setContextProperty("appController", app_controller)
    engine.rootContext().setContextProperty("machineBridge", machine_bridge)
    engine.rootContext().setContextProperty("cameraController", camera_controller)
    engine.rootContext().setContextProperty("gpsController", gps_controller)

    print("[DEBUG] Loading QML:", MAIN_QML)
    print("[DEBUG] QML import path:", QML_DIR)

    engine.load(QUrl.fromLocalFile(MAIN_QML))

    if not engine.rootObjects():
        print("[ERROR] QML rootObjects empty")
        for err in engine.errors():
            print("[QML ERROR]", err.toString())
        return 1

    return app.exec_()
