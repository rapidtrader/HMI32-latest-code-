"""QML tile: one MDVR channel (FFmpeg RTSP → painted frame)."""
import os
import threading

from PyQt5.QtCore import QObject, QTimer, pyqtProperty, pyqtSignal, Qt

try:
    from PyQt5 import sip as _sip
except ImportError:
    try:
        import sip as _sip  # type: ignore
    except ImportError:
        _sip = None


def _qobject_alive(obj) -> bool:
    if _sip is None:
        return True
    try:
        return not _sip.isdeleted(obj)
    except (AttributeError, TypeError):
        return True
from PyQt5.QtGui import QImage, QPainter
from PyQt5.QtQuick import QQuickPaintedItem

from mdvr.preview import MdvrRtspPreviewThread
from mdvr.rtsp_urls import rtsp_url

_MIN_SIZE = 48
_STOP_JOIN = float(os.environ.get("MDVR_STOP_JOIN_SEC", "3.0"))


def _background_preview_enabled() -> bool:
    return os.environ.get("CAMERA_BACKGROUND_PREVIEW", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
_UI_MS = max(33, int(1000 / max(5, int(os.environ.get("MDVR_UI_MAX_FPS", "8")))))
_TILE_STAGGER_MS = max(200, int(float(os.environ.get("MDVR_TILE_STAGGER_SEC", "0.35")) * 1000))


class MdvrFrameNotifier(QObject):
    frameReady = pyqtSignal(int, QImage)


class MdvrVideoItem(QQuickPaintedItem):
    _channel_changed = pyqtSignal()
    _active_changed = pyqtSignal()
    statusChanged = pyqtSignal(str, arguments=["message"])
    _status_from_thread = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._channel_id = 1
        self._active = False
        self._thread = None
        self._frame = None
        self._pending = None
        self._first_logged = False
        self._notifier = MdvrFrameNotifier()
        self._notifier.frameReady.connect(self._on_frame, Qt.QueuedConnection)
        self._status_from_thread.connect(self._emit_status, Qt.QueuedConnection)
        self._ui_timer = QTimer(self)
        self._ui_timer.setInterval(_UI_MS)
        self._ui_timer.timeout.connect(self._flush)
        self.setRenderTarget(QQuickPaintedItem.Image)
        self.setFillColor(Qt.black)
        self.setClip(True)
        self.widthChanged.connect(self.update)
        self.heightChanged.connect(self.update)
        self.visibleChanged.connect(self._on_visible)

    @pyqtProperty(int, notify=_channel_changed)
    def channelId(self):
        return self._channel_id

    @channelId.setter
    def channelId(self, value: int):
        value = int(value)
        if self._channel_id != value:
            self._channel_id = value
            self._channel_changed.emit()
            self._frame = None
            self._pending = None
            self._first_logged = False
            self._restart()

    @pyqtProperty(bool, notify=_active_changed)
    def active(self):
        return self._active

    @active.setter
    def active(self, value: bool):
        value = bool(value)
        if self._active != value:
            self._active = value
            self._active_changed.emit()
            if value:
                delay = 80 + max(0, self._channel_id - 1) * _TILE_STAGGER_MS
                QTimer.singleShot(delay, self._maybe_start)
            else:
                self._ui_timer.stop()
                self._stop()
                self._frame = None
                self._pending = None
                self.update()

    def _emit_status(self, msg: str):
        print(f"[MDVR] {msg}")
        if not _qobject_alive(self):
            return
        try:
            self.statusChanged.emit(msg)
        except RuntimeError:
            pass

    def _emit(self, msg: str):
        """Safe from FFmpeg worker threads."""
        print(f"[MDVR] {msg}")
        if not _qobject_alive(self):
            return
        try:
            self._status_from_thread.emit(msg)
        except RuntimeError:
            pass

    def _on_frame(self, channel_id: int, image: QImage):
        if not _qobject_alive(self):
            return
        if channel_id != self._channel_id or not self._active:
            return
        if image is None or image.isNull():
            return
        self._pending = image
        if not self._first_logged:
            self._first_logged = True
            print(f"[MDVR] CH{channel_id} first frame {image.width()}x{image.height()}")
        if self.isVisible() and not self._ui_timer.isActive():
            self._ui_timer.start()

    def _flush(self):
        if not self._active:
            self._ui_timer.stop()
            return
        if self._pending is None or self._pending.isNull():
            return
        self._frame = self._pending
        self.update()

    def paint(self, painter: QPainter):
        rect = self.contentsBoundingRect()
        if self._frame is not None and not self._frame.isNull():
            painter.drawImage(rect, self._frame)
        else:
            painter.fillRect(rect, Qt.black)

    def _geometry_ok(self):
        return self.width() >= _MIN_SIZE and self.height() >= _MIN_SIZE

    def _on_visible(self):
        if not self._active:
            self._ui_timer.stop()
            self._stop()
            return
        if not self.isVisible():
            self._ui_timer.stop()
            if not _background_preview_enabled():
                self._stop()
            return
        QTimer.singleShot(80, self._maybe_start)

    def _stop(self):
        if self._thread is not None:
            t = self._thread
            self._thread = None
            t.request_stop()
            t._on_error = None

            def join():
                if t.is_alive():
                    t.join(timeout=_STOP_JOIN)

            threading.Thread(target=join, daemon=True, name=f"mdvr-join-{self._channel_id}").start()

    def _restart(self):
        self._stop()
        QTimer.singleShot(100, self._maybe_start)

    def _maybe_start(self):
        if not self._active or not self._geometry_ok():
            return
        if not self.isVisible() and not _background_preview_enabled():
            return
        if self._thread is not None:
            return
        self._thread = MdvrRtspPreviewThread(
            self._channel_id,
            self._notifier,
            on_error=self._emit,
        )
        self._thread.start()
        self._emit(f"CH{self._channel_id} {rtsp_url(self._channel_id)}")

    def itemChange(self, change, value):
        if change == QQuickPaintedItem.ItemSceneChange and value is None:
            self._ui_timer.stop()
            self._stop()
        return super().itemChange(change, value)
