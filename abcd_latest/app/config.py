import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
QML_DIR = os.path.join(BASE_DIR, "qml")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
MACHINE_INFO_FILE = os.path.join(DATA_DIR, "machine_info.json")
BACKEND_CONFIG_FILE = os.path.join(DATA_DIR, "backend.json")
MAIN_QML = os.path.join(QML_DIR, "main.qml")

APP_NAME = "DYNACLEAN EV Sweeper HMI"
SYNC_INTERVAL_MS = 15000
RUNTIME_SAVE_MS = 30000
SOCKET_IO_STATE_EMIT_MS = 5000


def _url_from_mapping(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    url = (
        data.get("backendBaseUrl")
        or data.get("backend_base_url")
        or data.get("url")
        or ""
    )
    url = str(url).strip().rstrip("/")
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
        return env_url.rstrip("/")

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


def get_socket_io_url() -> str:
    explicit = os.environ.get("SOCKET_IO_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return get_backend_base_url()

def get_socket_io_enabled():
    val = os.environ.get("SOCKET_IO_ENABLED", "1").strip().lower()
    return val in ("1", "true", "yes", "on")


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
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)


def log(msg: str) -> None:
    if DEBUG:
        print(msg)
