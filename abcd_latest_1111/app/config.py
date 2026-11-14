import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
QML_DIR = os.path.join(BASE_DIR, "qml")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
MACHINE_INFO_FILE = os.path.join(DATA_DIR, "machine_info.json")
BACKEND_CONFIG_FILE = os.path.join(DATA_DIR, "backend.json")
VIDEO_CLIPS_DIR = os.path.join(DATA_DIR, "video_clips")
MAIN_QML = os.path.join(QML_DIR, "main.qml")

APP_NAME = "DYNACLEAN EV Sweeper HMI"
SYNC_INTERVAL_MS = 15000
RUNTIME_SAVE_MS = 30000
SOCKET_IO_STATE_EMIT_MS = 5000


def _normalize_backend_base(url: str) -> str:
    """Host only — paths add /api/... (accepts ...com or ...com/api)."""
    url = str(url or "").strip().rstrip("/")
    if url.lower().endswith("/api"):
        url = url[:-4].rstrip("/")
    return url


def _url_from_mapping(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    url = (
        data.get("backendBaseUrl")
        or data.get("backend_base_url")
        or data.get("url")
        or ""
    )
    url = _normalize_backend_base(url)
    if url and "REPLACE" not in url.upper():
        return url
    return ""


def _read_backend_config_data() -> dict:
    try:
        if os.path.exists(BACKEND_CONFIG_FILE):
            with open(BACKEND_CONFIG_FILE, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"[CONFIG] Failed to read {BACKEND_CONFIG_FILE}: {exc}")
    return {}


def _read_backend_config_file() -> str:
    return _url_from_mapping(_read_backend_config_data())


def _read_backend_from_machine_info() -> str:
    try:
        if os.path.exists(MACHINE_INFO_FILE):
            with open(MACHINE_INFO_FILE, encoding="utf-8") as f:
                return _url_from_mapping(json.load(f))
    except Exception:
        pass
    return ""


def ensure_backend_url_configured() -> str:
    """Create data/backend.json from example if missing; return resolved URL."""
    url = get_backend_base_url()
    if url:
        return url

    example = BACKEND_CONFIG_FILE + ".example"
    if not os.path.exists(BACKEND_CONFIG_FILE) and os.path.exists(example):
        try:
            os.makedirs(os.path.dirname(BACKEND_CONFIG_FILE), exist_ok=True)
            with open(example, encoding="utf-8") as src, open(
                BACKEND_CONFIG_FILE, "w", encoding="utf-8"
            ) as dst:
                dst.write(src.read())
            print(f"[CONFIG] Created {BACKEND_CONFIG_FILE} from example")
        except Exception as exc:
            print(f"[CONFIG] Could not create {BACKEND_CONFIG_FILE}: {exc}")

    return get_backend_base_url()


def get_backend_base_url() -> str:
    """
    Backend URL priority:
      1) BACKEND_BASE_URL env
      2) data/backend.json -> backendBaseUrl
      3) data/machine_info.json -> backendBaseUrl
      4) SOCKET_IO_URL env (legacy)
    """
    env_url = os.environ.get("BACKEND_BASE_URL", "").strip()
    if env_url:
        return _normalize_backend_base(env_url)

    file_url = _read_backend_config_file()
    if file_url:
        return file_url

    info_url = _read_backend_from_machine_info()
    if info_url:
        return info_url

    legacy = os.environ.get("SOCKET_IO_URL", "").strip()
    if legacy:
        return legacy.rstrip("/")

    return ""


def get_backend_candidate_urls() -> list:
    """Primary + backendFallbackUrls[] from data/backend.json (Tailscale then LAN, etc.)."""
    urls: list = []
    primary = get_backend_base_url()
    if primary:
        urls.append(primary)

    raw_list = _read_backend_config_data().get("backendFallbackUrls") or []
    if isinstance(raw_list, (list, tuple)):
        for raw in raw_list:
            u = _normalize_backend_base(str(raw))
            if u and u not in urls:
                urls.append(u)
    return urls


_resolved_backend_url: str = ""


def get_resolved_backend_base_url() -> str:
    """Cached URL after probe_backend_reachable() — else primary from config."""
    if _resolved_backend_url:
        return _resolved_backend_url
    return get_backend_base_url()


def get_socket_io_url() -> str:
    explicit = os.environ.get("SOCKET_IO_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    resolved = get_resolved_backend_base_url()
    if resolved:
        return resolved
    return get_backend_base_url()


def probe_backend_reachable(timeout: float = 4.0) -> str:
    """
    Try GET /api/health on each candidate; set global resolved URL for socket + uploads.
    Pi on MDVR LAN (192.168.31.x) often cannot reach PC WiFi (192.168.1.x) — use Tailscale first.
    """
    global _resolved_backend_url
    import urllib.error
    import urllib.request

    candidates = get_backend_candidate_urls()
    if not candidates:
        return ""

    to = max(1.0, float(timeout))
    for base in candidates:
        url = f"{base.rstrip('/')}/api/health"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=to) as resp:
                if resp.status in (200, 503):
                    _resolved_backend_url = base
                    if base != candidates[0]:
                        print(f"[CONFIG] Backend reachable via fallback: {base}")
                    return base
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            print(f"[CONFIG] Backend probe failed {base}: {exc}")

    _resolved_backend_url = candidates[0]
    return candidates[0]

def get_socket_io_enabled():
    val = os.environ.get("SOCKET_IO_ENABLED", "1").strip().lower()
    return val in ("1", "true", "yes", "on")


def apply_backend_json_runtime_env() -> None:
    """
    Optional keys in data/backend.json (no export needed on Pi):
      cameraAutoSave: true | false  → CAMERA_AUTO_SAVE=1|0
      cameraClipSec: number         → CAMERA_AUTO_SAVE_CLIP_SEC (min 1s archive segment)
      cameraMdvrSave: true | false  → MDVR_AUTO_SAVE=1|0 (RTSP segments to saved-videos)
      mdvrSaveWithoutProbe: true    → try RTSP record even when ffprobe failed
      mdvrAvOffset: 1               → CH1 = stream/av1_1 (this DVR; av0 invalid)
      mdvrUser / mdvrPassword       → RTSP auth if required
      mdvrId                        → device id (labels archive clips)
    """
    cfg = _read_backend_config_data()
    if "cameraAutoSave" in cfg:
        raw = cfg.get("cameraAutoSave")
        if isinstance(raw, bool):
            on = raw
        else:
            on = str(raw).strip().lower() in ("1", "true", "yes", "on")
        os.environ["CAMERA_AUTO_SAVE"] = "1" if on else "0"
    if "cameraClipSec" in cfg:
        try:
            sec = float(cfg.get("cameraClipSec"))
            sec = max(1.0, min(3600.0, sec))
            os.environ["CAMERA_AUTO_SAVE_CLIP_SEC"] = str(sec)
        except (TypeError, ValueError):
            pass
    if "cameraMdvrSave" in cfg:
        raw = cfg.get("cameraMdvrSave")
        if isinstance(raw, bool):
            on = raw
        else:
            on = str(raw).strip().lower() in ("1", "true", "yes", "on")
        os.environ["MDVR_AUTO_SAVE"] = "1" if on else "0"
    if "mdvrSaveWithoutProbe" in cfg:
        raw = cfg.get("mdvrSaveWithoutProbe")
        if isinstance(raw, bool):
            soft = raw
        else:
            soft = str(raw).strip().lower() in ("1", "true", "yes", "on")
        if soft:
            os.environ["MDVR_SAVE_REQUIRE_PROBE"] = "0"
            os.environ["MDVR_SAVE_WITHOUT_PROBE"] = "1"
    if "mdvrAvOffset" in cfg:
        try:
            os.environ["MDVR_AV_OFFSET"] = str(int(cfg.get("mdvrAvOffset")))
        except (TypeError, ValueError):
            pass
    midvr_id = str(cfg.get("mdvrId") or cfg.get("mdvr_id") or "").strip()
    if midvr_id:
        os.environ["MDVR_DEVICE_ID"] = midvr_id
    user = str(cfg.get("mdvrUser") or cfg.get("mdvr_user") or "").strip()
    pwd = str(cfg.get("mdvrPassword") or cfg.get("mdvr_password") or "").strip()
    if not user and midvr_id:
        user = midvr_id
    if user:
        os.environ["MDVR_USER"] = user
    if pwd:
        os.environ["MDVR_PASSWORD"] = pwd


def can_require_response() -> bool:
    """
    When False, UI turns GREEN after CAN send succeeds (no 0x202 wait).
    Set in data/backend.json: "canRequireResponse": false
    or env CAN_REQUIRE_RESPONSE=0
    """
    env = os.environ.get("CAN_REQUIRE_RESPONSE", "").strip().lower()
    if env:
        return env in ("1", "true", "yes", "on")
    cfg = _read_backend_config_data()
    if "canRequireResponse" in cfg:
        return bool(cfg.get("canRequireResponse"))
    return True

DEBUG = True  # os.environ.get("HMI_DEBUG", "").strip().lower() in ("1", "true", "yes")

# Global App Controller access
_app_controller = None


def set_global_controller(controller):
    global _app_controller
    _app_controller = controller


def get_global_controller():
    return _app_controller


def show_error(message: str, severity: str = "error"):
    global _app_controller
    try:
        from logic.socket_client import emit_error
        emit_error(message, severity)
    except Exception:
        pass
    if _app_controller:
        try:
            from PyQt5.QtCore import QMetaObject, Qt, Q_ARG
            QMetaObject.invokeMethod(
                _app_controller,
                "showError",
                Qt.QueuedConnection,
                Q_ARG(str, message),
                Q_ARG(str, severity)
            )
        except Exception as e:
            print(f"[ERROR] Failed to show error popup: {e}")


def ensure_paths():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(VIDEO_CLIPS_DIR, exist_ok=True)
    try:
        from logic.camera_videos_store import ensure_store_file

        ensure_store_file()
    except Exception as exc:
        print(f"[CONFIG] camera_videos.json init skipped: {exc}")
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)


def log(msg: str) -> None:
    if DEBUG:
        print(msg)
