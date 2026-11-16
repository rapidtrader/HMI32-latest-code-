#!/usr/bin/env python3
"""Smoke test: POST a tiny clip to /api/camera-videos (run on Pi or PC with backend URL set)."""
import os
import sys
import tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from logic.backend_clinet import get_backend_base, post_camera_video
from logic.machine_identity import read_or_create_machine_id


def main():
    base = get_backend_base()
    if not base:
        print("Set data/backend.json backendBaseUrl or BACKEND_BASE_URL")
        return 1
    mid = read_or_create_machine_id()
    fd, path = tempfile.mkstemp(suffix=".webm")
    os.close(fd)
    with open(path, "wb") as f:
        f.write(b"\x1a\x45\xdf\xa3" + b"\x00" * 512)
    ok, code, text = post_camera_video(
        path,
        machine_id=mid,
        title="API smoke test",
        camera_channel="CH1",
        duration_sec=1,
    )
    try:
        os.remove(path)
    except OSError:
        pass
    print(f"base={base} machineId={mid} ok={ok} status={code}")
    print(text[:500])
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
