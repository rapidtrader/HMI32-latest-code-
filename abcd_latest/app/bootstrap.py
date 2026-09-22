import os
import sys

from PyQt5.QtCore import Qt, QUrl
from PyQt5.QtQml import QQmlApplicationEngine
from PyQt5.QtWidgets import QApplication

from app.bridge import MachineBridge
from app.can_setup import setup_can_bus
from app.config import (
    APP_NAME,
    MAIN_QML,
    QML_DIR,
    ensure_backend_url_configured,
    ensure_paths,
    set_global_controller,
)
from app.controller import AppController

# Runtime fixes for RK356x / no GPS serial
os.environ["GPS_SYNC_DISABLED"] = "1"
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
    else:
        print("[CONFIG] Backend URL missing — edit data/backend.json (backendBaseUrl)")
    from app.config import can_require_response
    print(f"[CONFIG] CAN 0x202 response required: {can_require_response()}")

    setup_can_bus()
    _configure_qt_env()

    QApplication.setAttribute(Qt.AA_SynthesizeMouseForUnhandledTouchEvents, True)
    QApplication.setAttribute(Qt.AA_SynthesizeTouchForUnhandledMouseEvents, False)


    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    engine = QQmlApplicationEngine()
    engine.addImportPath(QML_DIR)

    app_controller = AppController()
    set_global_controller(app_controller)
    machine_bridge = MachineBridge()

    engine.rootContext().setContextProperty("appController", app_controller)
    engine.rootContext().setContextProperty("machineBridge", machine_bridge)

    print("[DEBUG] Loading QML:", MAIN_QML)
    print("[DEBUG] QML import path:", QML_DIR)

    engine.load(QUrl.fromLocalFile(MAIN_QML))

    if not engine.rootObjects():
        print("[ERROR] QML rootObjects empty")
        for err in engine.errors():
            print("[QML ERROR]", err.toString())
        return 1

    return app.exec_()
