"""Detect broken GStreamer state on RK3588 (stuck gst-plugin-scanner)."""
import subprocess


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
        f"GStreamer broken ({scanner_count} stuck gst-plugin-scanner). "
        "Reboot the board (sudo reboot), then once: "
        "video-capture-code/warm_gst_registry.sh — probe/camera until then will hang."
    )
