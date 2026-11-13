"""MDVR LAN reachability (RTSP port)."""
import os
import socket
from typing import Optional, Tuple

from mdvr.rtsp_urls import mdvr_host


def rtsp_port() -> int:
    try:
        return max(1, min(65535, int(os.environ.get("MDVR_RTSP_PORT", "554"))))
    except ValueError:
        return 554


def _bind_source_ip() -> Optional[str]:
    bind = os.environ.get("MDVR_BIND_SOURCE", "").strip()
    if bind:
        return bind
    prefix = os.environ.get("MDVR_ROUTE_PREFIX", "192.168.31.").strip()
    try:
        import subprocess

        r = subprocess.run(
            ["bash", "-c", f"ip -4 -o addr show scope global | awk '$4 ~ /^{prefix}/ {{print $4}}' | head -1"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        cidr = (r.stdout or "").strip().split()[0] if r.stdout else ""
        if cidr and "/" in cidr:
            return cidr.split("/")[0]
    except OSError:
        pass
    return None


def check_mdvr_reachable(timeout_sec: float = 3.0) -> Tuple[bool, str]:
    host = mdvr_host()
    port = rtsp_port()
    try:
        timeout_sec = float(os.environ.get("MDVR_CONNECT_TIMEOUT_SEC", str(timeout_sec)))
    except ValueError:
        timeout_sec = 3.0
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout_sec)
    src = _bind_source_ip()
    if src:
        try:
            sock.bind((src, 0))
        except OSError:
            pass
    try:
        sock.connect((host, port))
        return True, ""
    except OSError as exc:
        return False, (
            f"Cannot reach MDVR at {host}:{port} ({exc}). "
            "Connect board Ethernet to MDVR LAN (usually 192.168.31.x). "
            "WiFi-only (192.168.1.x) cannot reach 192.168.31.156."
        )
    finally:
        try:
            sock.close()
        except OSError:
            pass


def local_ipv4_hint() -> str:
    """Short hint for status line (first non-loopback IPv4)."""
    try:
        import subprocess

        r = subprocess.run(
            ["bash", "-c", "ip -4 -o addr show scope global | awk '{print $4}' | head -3"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        lines = [x.strip() for x in (r.stdout or "").splitlines() if x.strip()]
        return ", ".join(lines) if lines else "no global IPv4"
    except OSError:
        return ""
