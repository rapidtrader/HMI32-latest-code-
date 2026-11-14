#!/usr/bin/env python3
"""Local data/video_clips → POST /api/saved-videos (Mongo). Does not touch HMI UI."""
import argparse
import json
import os
import re
import sys

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

_MIN = max(12_000, int(os.environ.get("CAMERA_CLIP_MIN_UPLOAD_BYTES", "12000")))
_CH = re.compile(r"ch(\d+)", re.I)
_MDVR = re.compile(r"mdvr(\d+)", re.I)


def _register_new_on_disk():
    from logic.camera_videos_store import load_store, register_clip

    clip_dir = os.path.join(_ROOT, "data", "video_clips")
    mdvr_dir = os.path.join(clip_dir, "mdvr")
    scan_dirs = [clip_dir] if os.path.isdir(clip_dir) else []
    if os.path.isdir(mdvr_dir):
        scan_dirs.append(mdvr_dir)
    if not scan_dirs:
        print(f"No folder: {clip_dir}")
        return 0
    indexed = {
        os.path.abspath(str(r.get("localFile") or ""))
        for r in load_store().get("clips") or []
        if r.get("localFile")
    }
    n = 0
    for folder in scan_dirs:
        for name in sorted(os.listdir(folder)):
            if not name.lower().endswith((".mp4", ".webm", ".mkv")):
                continue
            path = os.path.abspath(os.path.join(folder, name))
            if path in indexed:
                continue
            try:
                if os.path.getsize(path) < _MIN:
                    continue
            except OSError:
                continue
            mm = _MDVR.search(name)
            if mm:
                cam = int(mm.group(1))
                register_clip(
                    path,
                    cam,
                    title=name,
                    source="mdvr",
                    camera_channel=f"MDVR{cam}",
                )
            else:
                m = _CH.search(name)
                cam = int(m.group(1)) if m else 0
                register_clip(path, cam, title=name)
            n += 1
    return n


def _scan_dirs():
    clip_dir = os.path.join(_ROOT, "data", "video_clips")
    mdvr_dir = os.path.join(clip_dir, "mdvr")
    out = []
    if os.path.isdir(clip_dir):
        out.append(clip_dir)
    if os.path.isdir(mdvr_dir):
        out.append(mdvr_dir)
    return out


def _disk_report() -> None:
    ok_n = tiny_n = 0
    largest = ("", 0)
    for folder in _scan_dirs():
        for name in os.listdir(folder):
            if not name.lower().endswith((".mp4", ".webm", ".mkv")):
                continue
            path = os.path.join(folder, name)
            try:
                sz = os.path.getsize(path)
            except OSError:
                continue
            if sz >= _MIN:
                ok_n += 1
            else:
                tiny_n += 1
            if sz > largest[1]:
                largest = (path, sz)

    cfg_path = os.path.join(_ROOT, "data", "backend.json")
    clip_sec = "?"
    if os.path.isfile(cfg_path):
        try:
            with open(cfg_path, encoding="utf-8") as f:
                clip_sec = json.load(f).get("cameraClipSec", "?")
        except (json.JSONDecodeError, OSError):
            pass

    print(f"backend.json cameraClipSec={clip_sec} (need HMI ON ~{clip_sec}s+ for new big clips)")
    if ok_n:
        print(f"On disk: {ok_n} file(s) >= {_MIN} B (ready to upload)")
    if tiny_n:
        print(
            f"On disk: {tiny_n} tiny file(s) < {_MIN} B — corrupt/empty, will NOT upload. "
            "Run: python3 main_pyqt5.py, wait for segments, then run this script again."
        )
    if largest[1]:
        print(f"Largest on disk: {largest[1]} B — {os.path.basename(largest[0])}")
    if ok_n == 0 and tiny_n:
        print("Tip: python3 scripts/sync_video_clips_to_db.py --prune-tiny  (delete junk <12KB)")


def _prune_tiny() -> int:
    removed = 0
    for folder in _scan_dirs():
        for name in os.listdir(folder):
            if not name.lower().endswith((".mp4", ".webm", ".mkv")):
                continue
            path = os.path.join(folder, name)
            try:
                if os.path.getsize(path) >= _MIN:
                    continue
                os.remove(path)
                removed += 1
            except OSError:
                pass
    print(f"Removed {removed} tiny clip file(s)")
    return removed


def main() -> int:
    print(
        "Note: cameraAutoSave is in data/backend.json (not a shell command). "
        "Run HMI first: python3 main_pyqt5.py"
    )
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prune-tiny",
        action="store_true",
        help="Delete local clips smaller than min upload size (default 12KB)",
    )
    args = parser.parse_args()
    if args.prune_tiny:
        _prune_tiny()
    from logic.backend_clinet import get_backend_base
    from logic.camera_videos_store import ensure_store_file, sync_pending_to_database

    if not get_backend_base():
        print("Set backendBaseUrl in data/backend.json")
        return 1

    ensure_store_file()
    _disk_report()
    reg = _register_new_on_disk()
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
