"""Throttled JPEG frames → Socket.IO (website live preview, separate from clip upload)."""
import base64
import os
import threading
import time
from typing import Dict, Optional, Tuple

_lock = threading.Lock()
_last_sent: Dict[Tuple[str, int], float] = {}


def _enabled() -> bool:
    if os.environ.get("CAMERA_LIVE_SOCKET", "1").strip().lower() in (
        "0",
        "false",
        "no",
        "off",
    ):
        return False
    try:
        from logic.socket_client import is_available

        return is_available()
    except Exception:
        return False


def _max_fps() -> float:
    try:
        return max(0.5, float(os.environ.get("CAMERA_LIVE_SOCKET_FPS", "4")))
    except ValueError:
        return 4.0


def _jpeg_quality() -> int:
    try:
        return max(35, min(92, int(os.environ.get("CAMERA_LIVE_JPEG_QUALITY", "72"))))
    except ValueError:
        return 72


def _max_width() -> int:
    try:
        return max(160, min(1280, int(os.environ.get("CAMERA_LIVE_MAX_WIDTH", "640"))))
    except ValueError:
        return 640


def _qimage_to_jpeg_b64(image) -> Optional[str]:
    if image is None or image.isNull():
        return None
    try:
        from PyQt5.QtCore import QBuffer, QByteArray, QIODevice, Qt
        from PyQt5.QtGui import QImage
    except Exception:
        return None

    img = image
    if not isinstance(img, QImage):
        return None
    mw = _max_width()
    if img.width() > mw:
        h = max(1, int(img.height() * mw / max(1, img.width())))
        img = img.scaled(mw, h, Qt.KeepAspectRatio, Qt.SmoothTransformation)

    ba = QByteArray()
    buf = QBuffer(ba)
    if not buf.open(QIODevice.WriteOnly):
        return None
    if not img.save(buf, "JPEG", _jpeg_quality()):
        return None
    raw = bytes(ba.data())
    if len(raw) < 200:
        return None
    return base64.standard_b64encode(raw).decode("ascii")


def push_preview_frame(source: str, channel: int, image) -> None:
    """
    source: 'ahd' | 'mdvr'
    channel: camera index (AHD 0..) or MDVR channel id (1..)
    """
    if not _enabled():
        return
    src = str(source or "ahd").strip().lower() or "ahd"
    ch = int(channel)
    key = (src, ch)
    min_interval = 1.0 / _max_fps()
    now = time.monotonic()
    with _lock:
        prev = _last_sent.get(key, 0.0)
        if now - prev < min_interval:
            return
        _last_sent[key] = now

    jpeg_b64 = _qimage_to_jpeg_b64(image)
    if not jpeg_b64:
        return

    try:
        from logic.socket_client import emit_camera_frame

        emit_camera_frame(
            source=src,
            channel=ch,
            jpeg_b64=jpeg_b64,
            width=image.width() if hasattr(image, "width") else None,
            height=image.height() if hasattr(image, "height") else None,
        )
    except Exception as exc:
        print(f"[CAMERA-LIVE] socket emit {src} ch{ch}: {exc}")
