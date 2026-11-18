"""Serve cached map tiles to QML via image://hmi-map/z/x/y (file:// often fails on Pi)."""
import os
import threading

from PyQt5.QtCore import QSize
from PyQt5.QtGui import QImage, QPainter, QColor, QFont
from PyQt5.QtQuick import QQuickImageProvider

_MEM_LOCK = threading.Lock()
_MEM_CACHE = {}
_MEM_MAX = int(os.environ.get("MAP_TILE_MEM_CACHE", "64"))


def _image_result(img: QImage):
    """PyQt5 QQuickImageProvider must return (QImage, QSize), not QImage alone."""
    if img is None or img.isNull():
        img = _placeholder()
    sz = QSize(img.width(), img.height())
    return img, sz


def _placeholder() -> QImage:
    img = QImage(256, 256, QImage.Format_RGB32)
    img.fill(QColor("#243447"))
    p = QPainter(img)
    p.setPen(QColor("#3d5a73"))
    step = 32
    for i in range(0, 256, step):
        p.drawLine(i, 0, i, 256)
        p.drawLine(0, i, 256, i)
    p.end()
    return img


def _cached_image(cache_key: str, path: str) -> QImage:
    with _MEM_LOCK:
        hit = _MEM_CACHE.get(cache_key)
        if hit is not None and not hit.isNull():
            return hit
    img = QImage(path)
    if img.isNull():
        return img
    with _MEM_LOCK:
        if len(_MEM_CACHE) > _MEM_MAX:
            _MEM_CACHE.clear()
        _MEM_CACHE[cache_key] = img
    return img


class MapTileImageProvider(QQuickImageProvider):
    def __init__(self):
        super().__init__(QQuickImageProvider.Image)

    # Older PyQt5 / Qt 5.12 on RK3588 calls with (id, size) only — no requestedSize.
    def requestImage(self, id, size=None, requestedSize=None):  # noqa: ARG002
        raw = str(id or "").strip()
        if "?" in raw:
            raw = raw.split("?", 1)[0]
        if "#" in raw:
            raw = raw.split("#", 1)[0]
        try:
            parts = raw.split("/")
            if len(parts) != 3:
                return _image_result(_placeholder())
            z, x, y = int(parts[0]), int(parts[1]), int(parts[2])
        except (TypeError, ValueError):
            return _image_result(_placeholder())

        cache_key = f"{z}/{x}/{y}"
        try:
            from logic.map_tile_cache import queue_tile_fetch, tile_ready_path

            path = tile_ready_path(z, x, y)
            if not path:
                queue_tile_fetch(z, x, y)
                return _image_result(_placeholder())
            img = _cached_image(cache_key, path)
            if not img.isNull():
                return _image_result(img)
            queue_tile_fetch(z, x, y)
        except Exception as exc:
            print(f"[MAP] tile {id}: {exc}")

        return _image_result(_placeholder())