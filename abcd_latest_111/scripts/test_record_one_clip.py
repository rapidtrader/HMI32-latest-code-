#!/usr/bin/env python3
"""Test clip record + JSON index (no Qt). Run from abcd_latest on Pi with cameras idle."""
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

os.environ.setdefault("CAMERA_VIDEO_CODEC", "auto")


def main():
    ch = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    sec = float(sys.argv[2]) if len(sys.argv) > 2 else 8.0
    from logic.camera_auto_save import record_save_and_sync

    print(f"Recording CH{ch} for {sec}s (close HMI or Stop all first if busy)...")
    ok, code, msg = record_save_and_sync(ch, clip_sec=sec, title=f"test CH{ch}")
    print("OK" if ok else "FAIL", code, msg)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
