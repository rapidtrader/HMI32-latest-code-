"""Detect and recover broken GStreamer state on RK3588 (stuck gst-plugin-scanner)."""
import os
import subprocess
import time


def stuck_gst_plugin_scanners() -> int:
    try:
        r = subprocess.run(
            [
                "bash",
                "-c",
                "ps -eo stat,cmd 2>/dev/null | awk '/gst-plugin-scanner/ && $1 ~ /D/ { c++ } END { print c+0 }'",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return max(0, int((r.stdout or "0").strip() or "0"))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return 0


def gst_health_message(scanner_count: int) -> str:
    if scanner_count <= 0:
        return ""
    return (
        f"Local cameras locked ({scanner_count} stuck gst-plugin-scanner in kernel). "
        "Use sidebar → MDVR for network DVR. To fix AHD cameras: stop HMI (Ctrl+C), "
        "sudo reboot, then cd ~/hmi/abcd_latest_ && ./run_hmi.sh"
    )


def kill_orphan_gst_processes() -> None:
    """Safe cleanup — does not spawn new GStreamer (no gst-inspect)."""
    for pattern in (
        "gst-launch-1.0",
        "gst-inspect-1.0",
        "warm_gst_registry",
    ):
        subprocess.run(
            ["pkill", "-9", "-f", pattern],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    subprocess.run(
        ["pkill", "-9", "-f", "gst-plugin-scanner"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.4)


def recover_gst_environment(*, kill_launches: bool = True) -> bool:
    """Kill hung pipelines only. D-state scanners need reboot."""
    if kill_launches:
        kill_orphan_gst_processes()
    return stuck_gst_plugin_scanners() == 0
