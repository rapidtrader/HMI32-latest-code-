"""Live preview tiles — sync stop before clip record (free v4l2)."""
import threading
import weakref
from typing import Iterable, Optional

_lock = threading.Lock()
_by_channel = {}


def register_preview_item(camera_id: int, item) -> None:
    with _lock:
        _by_channel[int(camera_id)] = weakref.ref(item)


def unregister_preview_item(camera_id: int, item) -> None:
    with _lock:
        cid = int(camera_id)
        ref = _by_channel.get(cid)
        if ref is not None and ref() is item:
            _by_channel.pop(cid, None)


def get_preview_item(camera_id: int):
    with _lock:
        ref = _by_channel.get(int(camera_id))
        return ref() if ref is not None else None


def feed_clip_frame(channel_id: int, image) -> None:
    from hardware.preview_clip_record import feed_clip_frame as _feed

    _feed(int(channel_id), image)


def request_stop_sync(camera_id: int, timeout: float = 6.0) -> bool:
    """Stop appsink pipeline and join (call from Qt main thread)."""
    with _lock:
        ref = _by_channel.get(int(camera_id))
        item = ref() if ref is not None else None
    if item is None:
        return False
    stop = getattr(item, "stop_pipeline_sync", None)
    if not callable(stop):
        return False
    return bool(stop(timeout=timeout))


def request_stop_all_sync(
    channel_ids: Iterable[int], timeout: float = 6.0
) -> int:
    """Stop every live preview pipeline; returns count stopped."""
    n = 0
    for cid in channel_ids:
        if request_stop_sync(int(cid), timeout=timeout):
            n += 1
    return n
