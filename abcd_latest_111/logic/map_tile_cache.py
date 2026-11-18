"""Download map tiles with a proper User-Agent (OSM blocks generic Qt clients → ACCESS BLOCKED)."""
import os
import threading
import time
import urllib.error
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_ROOT = os.path.join(BASE_DIR, "data", "map_tiles")

# Esri first (usually faster on fleet Wi‑Fi); OSM fallback. No API key.
TILE_TEMPLATE = os.environ.get(
    "MAP_TILE_URL",
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
)
TILE_FALLBACKS = [
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
]
USER_AGENT = os.environ.get(
    "MAP_TILE_USER_AGENT",
    "DynacleanHMI32/1.0 (fleet HMI; contact: piptrade11@gmail.com)",
)
TIMEOUT_SEC = float(os.environ.get("MAP_TILE_TIMEOUT_SEC", "6"))

_lock = threading.Lock()
_inflight = set()
_tile_hooks = []
_tile_hooks_lock = threading.Lock()


def register_tile_saved_hook(callback):
    if not callable(callback):
        return
    with _tile_hooks_lock:
        if callback not in _tile_hooks:
            _tile_hooks.append(callback)


def _notify_tile_saved(z: int, x: int, y: int) -> None:
    with _tile_hooks_lock:
        hooks = list(_tile_hooks)
    for cb in hooks:
        try:
            cb(int(z), int(x), int(y))
        except Exception:
            pass


def _tile_path(z: int, x: int, y: int) -> str:
    d = os.path.join(CACHE_ROOT, str(z), str(x))
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{y}.png")


def _looks_valid_png(data: bytes) -> bool:
    if len(data) < 800:
        return False
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    low = data[:8192].lower()
    for needle in (
        b"access blocked",
        b"api key",
        b"apikey",
        b"invalid key",
        b"unauthorized",
        b"<html",
        b"forbidden",
    ):
        if needle in low:
            return False
    return True


def _cached_tile_ok(path: str) -> bool:
    try:
        if not os.path.isfile(path) or os.path.getsize(path) <= 800:
            return False
        with open(path, "rb") as f:
            blob = f.read()
        return _looks_valid_png(blob)
    except OSError:
        return False


def _download(z: int, x: int, y: int, dest: str) -> bool:
    templates = [TILE_TEMPLATE] + list(TILE_FALLBACKS)
    seen = set()
    urls = []
    for t in templates:
        if t and t not in seen:
            seen.add(t)
            urls.append(t.format(z=z, x=x, y=y))
    data = None
    for url in urls:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "image/png,*/*"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as resp:
                chunk = resp.read()
            if _looks_valid_png(chunk):
                data = chunk
                break
        except (urllib.error.URLError, OSError, TimeoutError):
            continue
    if not data:
        return False
    tmp = dest + ".part"
    try:
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, dest)
        _notify_tile_saved(z, x, y)
    except OSError:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False
    return True


def ensure_tile(z: int, x: int, y: int, *, background: bool = True):
    """Return local path if tile exists or was fetched; queue background fetch if missing."""
    try:
        zi, xi, yi = int(z), int(x), int(y)
    except (TypeError, ValueError):
        return None
    if zi < 0 or zi > 20:
        return None

    path = _tile_path(zi, xi, yi)
    if os.path.isfile(path):
        if _cached_tile_ok(path):
            return path
        try:
            os.remove(path)
        except OSError:
            pass

    key = f"{zi}/{xi}/{yi}"
    with _lock:
        if key in _inflight:
            return path if os.path.isfile(path) else None
        _inflight.add(key)

    def work():
        try:
            _download(zi, xi, yi, path)
        finally:
            with _lock:
                _inflight.discard(key)

    if background:
        threading.Thread(target=work, daemon=True).start()
        return path if os.path.isfile(path) else None

    try:
        ok = _download(zi, xi, yi, path)
        with _lock:
            _inflight.discard(key)
        return path if ok else None
    except Exception:
        with _lock:
            _inflight.discard(key)
        return None


def queue_tile_fetch(z: int, x: int, y: int) -> None:
    """Non-blocking: fetch if missing (for image provider — never block Qt UI thread)."""
    ensure_tile(z, x, y, background=True)


def tile_ready_path(z: int, x: int, y: int):
    """Return cache path only when a valid tile is already on disk."""
    try:
        zi, xi, yi = int(z), int(x), int(y)
    except (TypeError, ValueError):
        return None
    path = _tile_path(zi, xi, yi)
    if _cached_tile_ok(path):
        return path
    return None


def _prefetch_worker(z: int, ordered_xy):
    for xi, yi in ordered_xy:
        ensure_tile(z, xi, yi, background=False)


def prefetch_tiles(z: int, tcx: int, tcy: int, radius: int = 1) -> None:
    """Download visible tiles off the UI thread; center tile first, then parallel workers."""
    cells = []
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            cells.append((tcx + dx, tcy + dy, abs(dx) + abs(dy)))
    cells.sort(key=lambda c: c[2])
    ordered = [(c[0], c[1]) for c in cells]

    def batch():
        # center first so the view fills quickly
        if ordered:
            ensure_tile(z, ordered[0][0], ordered[0][1], background=False)
        rest = ordered[1:]
        if not rest:
            return
        try:
            workers = int(os.environ.get("MAP_TILE_WORKERS", "4"))
            workers = max(1, min(workers, 6))
            chunk = max(1, len(rest) // workers)
            threads = []
            for i in range(0, len(rest), chunk):
                part = rest[i : i + chunk]
                t = threading.Thread(
                    target=_prefetch_worker,
                    args=(z, part),
                    daemon=True,
                )
                t.start()
                threads.append(t)
            for t in threads:
                t.join(timeout=90)
        except Exception:
            _prefetch_worker(z, rest)

    threading.Thread(target=batch, daemon=True).start()


def cache_age_seconds(z: int, x: int, y: int):
    path = _tile_path(int(z), int(x), int(y))
    if not os.path.isfile(path):
        return None
    try:
        return max(0.0, time.time() - os.path.getmtime(path))
    except OSError:
        return None