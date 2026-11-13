#!/usr/bin/env python3
"""Local data/video_clips → POST /api/saved-videos (Mongo). Does not touch HMI UI."""
import os
import re
import sys

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

_MIN = max(12_000, int(os.environ.get("CAMERA_CLIP_MIN_UPLOAD_BYTES", "12000")))
_CH = re.compile(r"ch(\d+)", re.I)


def _register_new_on_disk():
    from logic.camera_videos_store import load_store, register_clip

    clip_dir = os.path.join(_ROOT, "data", "video_clips")
    if not os.path.isdir(clip_dir):
        print(f"No folder: {clip_dir}")
        return 0
    indexed = {
        os.path.abspath(str(r.get("localFile") or ""))
        for r in load_store().get("clips") or []
        if r.get("localFile")
    }
    n = 0
    for name in sorted(os.listdir(clip_dir)):
        if not name.lower().endswith((".mp4", ".webm", ".mkv")):
            continue
        path = os.path.abspath(os.path.join(clip_dir, name))
        if path in indexed:
            continue
        try:
            if os.path.getsize(path) < _MIN:
                continue
        except OSError:
            continue
        m = _CH.search(name)
        cam = int(m.group(1)) if m else 0
        register_clip(path, cam, title=name)
        n += 1
    return n


def main() -> int:
    from logic.backend_clinet import get_backend_base
    from logic.camera_videos_store import ensure_store_file, sync_pending_to_database

    if not get_backend_base():
        print("Set backendBaseUrl in data/backend.json")
        return 1

    ensure_store_file()
    reg = _register_new_on_disk()
    clip_dir = os.path.join(_ROOT, "data", "video_clips")
    ok_on_disk = skip_on_disk = 0
    if os.path.isdir(clip_dir):
        for name in os.listdir(clip_dir):
            if not name.lower().endswith((".mp4", ".webm", ".mkv")):
                continue
            path = os.path.join(clip_dir, name)
            try:
                sz = os.path.getsize(path)
            except OSError:
                continue
            if sz >= _MIN:
                ok_on_disk += 1
            else:
                skip_on_disk += 1
    if ok_on_disk:
        print(f"On disk: {ok_on_disk} file(s) >= {_MIN} B (ready)")
    if skip_on_disk:
        print(
            f"On disk: {skip_on_disk} tiny file(s) < {_MIN} B — not playable; "
            "use longer cameraClipSec (e.g. 60) in data/backend.json and record with HMI cameras ON"
        )
    up = fail = 0
    for _ in range(80):
        ok, bad = sync_pending_to_database(limit=6)
        up += ok
        fail += bad
        if ok == 0:
            break

    print(f"registered={reg} uploaded={up} failed={fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
