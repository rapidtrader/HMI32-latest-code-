"""Launch camera viewer: default gst-launch (supplier pipeline), optional yolov5Demo."""
import os

from PyQt5.QtCore import QProcessEnvironment

_HMI_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_CAPTURE_ROOT = os.path.join(os.path.dirname(_HMI_ROOT), "video-capture-code")
_VIDEO_CAPTURE_ROOT = VIDEO_CAPTURE_ROOT
_DEFAULT_BIN = os.path.join(_VIDEO_CAPTURE_ROOT, "build", "yolov5Demo")
_LAUNCHER = os.path.join(_VIDEO_CAPTURE_ROOT, "run_yolov5_demo.sh")
_GST_SINGLE_VIEWER = os.path.join(_VIDEO_CAPTURE_ROOT, "run_single_camera_viewer.sh")


def _prefer_gst_viewer() -> bool:
    v = os.environ.get("CAMERA_VIEWER", "gst").strip().lower()
    return v in ("gst", "gstreamer", "single", "1", "true", "yes")


def resolve_vendor_demo_binary() -> str:
    """Path shown in UI."""
    if _prefer_gst_viewer() and os.path.isfile(_GST_SINGLE_VIEWER):
        return _GST_SINGLE_VIEWER
    env = os.environ.get("CAMERA_DEMO_BIN", "").strip()
    if env and os.path.isfile(env):
        return env
    if os.path.isfile(_GST_SINGLE_VIEWER):
        return _GST_SINGLE_VIEWER
    if os.path.isfile(_LAUNCHER):
        return _LAUNCHER
    if os.path.isfile(_DEFAULT_BIN):
        return _DEFAULT_BIN
    return _LAUNCHER


def resolve_vendor_demo_executable() -> str:
    """Process to start (gst single cam avoids old 8-camera yolov5Demo crash)."""
    if _prefer_gst_viewer() and os.path.isfile(_GST_SINGLE_VIEWER):
        return _GST_SINGLE_VIEWER
    env = os.environ.get("CAMERA_DEMO_BIN", "").strip()
    if env and os.path.isfile(env) and not env.endswith(".sh"):
        return env
    if os.path.isfile(_GST_SINGLE_VIEWER):
        return _GST_SINGLE_VIEWER
    if os.path.isfile(_LAUNCHER) and os.access(_LAUNCHER, os.X_OK):
        return _LAUNCHER
    if os.path.isfile(_DEFAULT_BIN):
        return _DEFAULT_BIN
    return resolve_vendor_demo_binary()


def viewer_log_path() -> str:
    return os.environ.get("CAMERA_VIEWER_LOG", "/tmp/yolov5demo.log")


def vendor_demo_available() -> bool:
    if os.path.isfile(_GST_SINGLE_VIEWER):
        return True
    path = resolve_vendor_demo_binary()
    if not os.path.isfile(path):
        return False
    if path.endswith(".sh"):
        if path == _GST_SINGLE_VIEWER:
            return True
        return os.access(path, os.X_OK) and os.path.isfile(_DEFAULT_BIN)
    return os.access(path, os.X_OK)


def ensure_executable(path: str) -> bool:
    if not os.path.isfile(path):
        return False
    if os.access(path, os.X_OK):
        return True
    try:
        os.chmod(path, 0o755)
        return os.access(path, os.X_OK)
    except OSError:
        return os.path.isfile(path) and path.endswith(".sh")


_HMI_STRIP_ENV = (
    "LIBGL_ALWAYS_SOFTWARE",
    "QT_OPENGL",
    "QT_QUICK_BACKEND",
    "QT_XCB_GL_INTEGRATION",
    "QT_QUICK_CONTROLS_STYLE",
    "QML_DISABLE_DISK_CACHE",
)


def build_env() -> QProcessEnvironment:
    """Child must not inherit HMI software-GL flags (breaks xvimagesink → white screen)."""
    env = QProcessEnvironment.systemEnvironment()
    for key in _HMI_STRIP_ENV:
        if env.contains(key):
            env.remove(key)
    env.insert("HMI_CAMERA_CHILD", "1")
    env.insert("QT_QPA_PLATFORM", "xcb")
    disp = os.environ.get("DISPLAY", "")
    if disp:
        env.insert("DISPLAY", disp)
    gomp = "/lib/aarch64-linux-gnu/libgomp.so.1"
    if os.path.isfile(gomp):
        prev = env.value("LD_PRELOAD", "")
        if gomp not in prev.split(":"):
            env.insert("LD_PRELOAD", f"{gomp}:{prev}" if prev else gomp)
    scanner = os.path.join(_VIDEO_CAPTURE_ROOT, "gst-plugin-scanner-wrapper.sh")
    if os.path.isfile(scanner) and os.access(scanner, os.X_OK):
        env.insert("GST_PLUGIN_SCANNER", scanner)
    env.insert("GST_REGISTRY_UPDATE", "no")
    if not env.contains("DISPLAY"):
        env.insert("DISPLAY", ":0")
    xauth = os.environ.get("XAUTHORITY", "")
    if xauth:
        env.insert("XAUTHORITY", xauth)
    elif os.path.isfile(os.path.expanduser("~/.Xauthority")):
        env.insert("XAUTHORITY", os.path.expanduser("~/.Xauthority"))
    return env


def build_env_dict() -> dict:
    """For subprocess.Popen — detached viewer must not block HMI on stdout pipes."""
    qe = build_env()
    out = {k: v for k, v in os.environ.items() if k not in _HMI_STRIP_ENV}
    for key in qe.keys():
        out[key] = qe.value(key)
    return out
