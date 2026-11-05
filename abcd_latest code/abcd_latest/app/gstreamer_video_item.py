"""
QML camera tile: GStreamer appsink → RGB frames via QQuickPaintedItem (Qt Quick 2).
"""
import os
import threading
import time
from typing import Optional

from PyQt5.QtCore import QTimer, pyqtProperty, pyqtSignal, pyqtSlot, Qt
from PyQt5.QtGui import QImage, QPainter
from PyQt5.QtQuick import QQuickPaintedItem

from hardware.camera_capture import resolve_video_device
from hardware.gstreamer_appsink_preview import AppsinkPreviewPipeline, PreviewFrameNotifier

_MIN_SIZE = 48
_STOP_JOIN_SEC = float(os.environ.get("CAMERA_STOP_JOIN_SEC", "3.0"))
_UI_FPS_MS = max(33, int(1000 / max(5, int(os.environ.get("CAMERA_UI_MAX_FPS", "12")))))
_TILE_STAGGER_MS = max(
    400, int(float(os.environ.get("CAMERA_TILE_STAGGER_SEC", "2.5")) * 1000)
)


class GStreamerVideoItem(QQuickPaintedItem):
    _camera_id_changed = pyqtSignal()
    _active_changed = pyqtSignal()
    statusChanged = pyqtSignal(str, arguments=["message"])

    def __init__(self, parent=None):
        super().__init__(parent)
        self._camera_id = 0
        self._active = False
        self._pipeline = None
        self._frame = None
        self._pending_frame = None
        self._logged_first_frame = False
        self._notifier = PreviewFrameNotifier()
        self._notifier.frameReady.connect(
            self._on_frame, Qt.QueuedConnection
        )
        self._ui_timer = QTimer(self)
        self._ui_timer.setInterval(_UI_FPS_MS)
        self._ui_timer.timeout.connect(self._flush_pending_frame)
        self.setRenderTarget(QQuickPaintedItem.Image)
        self.setFillColor(Qt.black)
        self.setClip(True)

        self.widthChanged.connect(self.update)
        self.heightChanged.connect(self.update)
        self.visibleChanged.connect(self._on_visible_changed)

    def stop_pipeline_sync(self, timeout: Optional[float] = None) -> bool:
        wait = float(timeout if timeout is not None else _STOP_JOIN_SEC)
        if self._pipeline is None:
            return True
        t = self._pipeline
        self._pipeline = None
        self._ui_timer.stop()
        t.request_stop()
        if t.is_alive():
            t.join(timeout=wait)
        return not t.is_alive()

    def _emit(self, msg: str):
        print(f"[CAMERA] {msg}")
        self.statusChanged.emit(msg)

    @pyqtProperty(int, notify=_camera_id_changed)
    def cameraId(self):
        return self._camera_id

    @cameraId.setter
    def cameraId(self, value: int):
        value = int(value)
        if self._camera_id != value:
            self._camera_id = value
            self._logged_first_frame = False
            self._camera_id_changed.emit()
            self._frame = None
            self._pending_frame = None
            self.update()
            from app.gstreamer_preview_registry import register_preview_item

            register_preview_item(self._camera_id, self)
            self._restart_pipeline()

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
                self._logged_first_frame = False
                # Stagger thread start so cam1→cam4 order matches serial v4l2 open
                delay = 80 + max(0, self._camera_id - 1) * _TILE_STAGGER_MS
                QTimer.singleShot(delay, self._maybe_start)
            else:
                self._ui_timer.stop()
                self._stop_pipeline()
                self._frame = None
                self._pending_frame = None
                self.update()

    @pyqtSlot(result=str)
    def devicePath(self):
        return resolve_video_device(self._camera_id)

    def _on_frame(self, camera_id: int, image: QImage):
        if camera_id != self._camera_id or not self._active:
            return
        if image is None or image.isNull():
            return
        self._pending_frame = image
        if not self._logged_first_frame:
            self._logged_first_frame = True
            print(
                f"[CAMERA] cam{camera_id} first frame "
                f"{image.width()}x{image.height()}"
            )
        try:
            from app.gstreamer_preview_registry import feed_clip_frame

            feed_clip_frame(camera_id, image)
        except Exception as exc:
            print(f"[CAMERA-VIDEO] feed_clip_frame CH{camera_id}: {exc}")
        if not self._ui_timer.isActive():
            self._ui_timer.start()

    def _flush_pending_frame(self):
        if not self._active:
            self._ui_timer.stop()
            return
        if self._pending_frame is None or self._pending_frame.isNull():
            return
        self._frame = self._pending_frame
        self.update()

    def paint(self, painter: QPainter):
        rect = self.contentsBoundingRect()
        if self._frame is not None and not self._frame.isNull():
            painter.drawImage(rect, self._frame)
        else:
            painter.fillRect(rect, Qt.black)

    def itemChange(self, change, value):
        if change == QQuickPaintedItem.ItemSceneChange and value is None:
            self._ui_timer.stop()
            self._stop_pipeline()
        return super().itemChange(change, value)

    def _geometry_ready(self) -> bool:
        return self.width() >= _MIN_SIZE and self.height() >= _MIN_SIZE

    def _on_visible_changed(self):
        if not self.isVisible() or not self._active:
            self._ui_timer.stop()
            self._stop_pipeline()
        else:
            QTimer.singleShot(80, self._maybe_start)

    def _stop_pipeline(self):
        if self._pipeline is not None:
            t = self._pipeline
            self._pipeline = None
            t.request_stop()

            def _join_worker():
                if t.is_alive():
                    t.join(timeout=_STOP_JOIN_SEC)

            threading.Thread(
                target=_join_worker, daemon=True, name=f"gst-join-{self._camera_id}"
            ).start()

    def _restart_pipeline(self):
        self._stop_pipeline()
        QTimer.singleShot(100, self._maybe_start)

    def _maybe_start(self):
        if not self._active or not self.isVisible() or not self._geometry_ready():
            return
        if self._pipeline is not None:
            return
        self._pipeline = AppsinkPreviewPipeline(
            self._camera_id,
            self._notifier,
            on_error=self._emit,
        )
        self._pipeline.start()
        from app.gstreamer_preview_registry import register_preview_item

        register_preview_item(self._camera_id, self)
        self._emit(f"Live cam{self._camera_id} {self.devicePath()}")

    def __del__(self):
        try:
            from app.gstreamer_preview_registry import unregister_preview_item

            unregister_preview_item(self._camera_id, self)
            self._stop_pipeline()
        except Exception:
            pass
