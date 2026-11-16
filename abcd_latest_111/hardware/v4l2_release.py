"""Wait until V4L2 device is not held by another process."""
import os
import subprocess
import time


def wait_v4l2_device_idle(device: str, timeout: float = 12.0) -> bool:
    device = str(device or "").strip()
    if not device:
        return False
    deadline = time.time() + max(1.0, float(timeout))
    while time.time() < deadline:
        if _device_idle(device):
            time.sleep(0.4)
            if _device_idle(device):
                return True
        time.sleep(0.35)
    return False


def _device_idle(device: str) -> bool:
    if os.environ.get("CAMERA_V4L2_WAIT", "fuser").strip().lower() == "sleep":
        return True
    try:
        r = subprocess.run(
            ["fuser", device],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
        return r.returncode != 0
    except FileNotFoundError:
        return True
    except Exception:
        return False
