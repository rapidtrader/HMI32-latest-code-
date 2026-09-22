import os

from PyQt5.QtCore import QObject, QTimer, QUrl, pyqtProperty, pyqtSignal, pyqtSlot

from app import machine_info_store as store
from app.config import ASSETS_DIR, RUNTIME_SAVE_MS
from app.worker import run_background
from logic.machine_logic import save_runtime, sync_suction_sessions_to_api

try:
    from logic.gps_background import start_gps_sync_background as _start_gps_sync
except ImportError:
    _start_gps_sync = None


class AppController(QObject):
    pageChanged = pyqtSignal()
    fullscreenChanged = pyqtSignal(bool)
    logoutPasswordRequested = pyqtSignal()
    logoutPasswordVerified = pyqtSignal(bool)
    errorOccurred = pyqtSignal(str, str)  # (message, severity: "error" / "warning")
    clearError = pyqtSignal()

    def __init__(self):
        super().__init__()
        self._current_page = "FollowUpPage"
        self._is_fullscreen = True

        self._runtime_timer = QTimer(self)
        self._runtime_timer.timeout.connect(save_runtime)
        self._runtime_timer.start(RUNTIME_SAVE_MS)

        QTimer.singleShot(2000, lambda: run_background("sync_suction", sync_suction_sessions_to_api))
        QTimer.singleShot(1500, lambda: run_background("socket_init", self._init_socket))

        if _start_gps_sync:
            _start_gps_sync()

    def _init_socket(self):
        try:
            from logic.socket_client import init_socket_client
            ok = init_socket_client()
            if ok:
                print("[DEBUG] Socket.IO client init requested")
            else:
                print("[DEBUG] Socket.IO disabled or unavailable (install python-socketio + websocket-client)")
        except Exception as e:
            print(f"[DEBUG] Socket.IO init error: {e}")

    @pyqtSlot(str, str)
    def showError(self, message: str, severity: str = "error"):
        """Show error/warning popup in UI"""
        self.errorOccurred.emit(message, severity)

    @pyqtSlot()
    def clearErrors(self):
        """Clear all error popups"""
        self.clearError.emit()

    @pyqtProperty(str, notify=pageChanged)
    def currentPage(self):
        return self._current_page

    @pyqtSlot(str)
    def showPage(self, name):
        if self._current_page != name:
            self._current_page = name
            self.pageChanged.emit()

    @pyqtProperty(bool, notify=fullscreenChanged)
    def isFullscreen(self):
        return self._is_fullscreen

    @pyqtSlot()
    def logout(self):
        print("[DEBUG] logout() called!")
        if not store.has_password():
            print("[DEBUG] No password set, exiting directly")
            self._exit_windowed()
            return
        print("[DEBUG] Requesting password...")
        self.logoutPasswordRequested.emit()

    @pyqtSlot(str)
    def verifyLogoutPassword(self, entered):
        print(f"[DEBUG] verifyLogoutPassword called with entered: '{entered}'")
        valid = store.verify_password(entered)
        print(f"[DEBUG] verify_password returned: {valid}")
        self.logoutPasswordVerified.emit(valid)
        if valid:
            print("[DEBUG] Password correct, exiting to windowed mode")
            self._exit_windowed()

    def _exit_windowed(self):
        self._is_fullscreen = False
        self.fullscreenChanged.emit(False)

    @pyqtSlot()
    def loginFullscreen(self):
        self._is_fullscreen = True
        self.fullscreenChanged.emit(True)

    @pyqtProperty(str, constant=True)
    def assetsPath(self):
        return QUrl.fromLocalFile(ASSETS_DIR).toString()
