import subprocess
import sys

from app.config import log
from hardware.can_sender import start_can_monitor


def setup_can_bus() -> None:
    """Bring up can0 on Linux (125 kbit/s). No-op on Windows."""
    if sys.platform != "linux":
        log("CAN setup: skipped (not Linux)")
        # Even on Windows, start the monitor (will just use no-op)
        start_can_monitor()
        return

    steps = [
        ["sudo", "ip", "link", "set", "can0", "down"],
        ["sudo", "ip", "link", "set", "can0", "type", "can", "bitrate", "125000"],
        ["sudo", "ip", "link", "set", "can0", "up"],
    ]
    for cmd in steps:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            log(f"CAN: {' '.join(cmd)} -> {r.returncode}")
        except Exception as exc:
            log(f"CAN: {' '.join(cmd)} failed: {exc}")
    
    # Start the CAN receiver thread automatically
    start_can_monitor()
