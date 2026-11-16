#!/usr/bin/env python3
"""Record MDVR RTSP → web-playable MP4 → POST /api/saved-videos."""
import os
import sys
import tempfile

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

from app.config import apply_backend_json_runtime_env

apply_backend_json_runtime_env()


def _mdvr_defaults():
    os.environ.setdefault("MDVR_AV_OFFSET", "1")
    os.environ.setdefault("MDVR_STREAM_INDEX", "1")
    os.environ.setdefault("MDVR_RTSP_TRANSPORT", "tcp")
    os.environ.setdefault("MDVR_STREAM_TRY", "1,0")


def _test_duration() -> float:
    try:
        return max(10.0, float(os.environ.get("MDVR_TEST_SEC", os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "120"))))
    except (TypeError, ValueError):
        return 120.0


def main() -> int:
    _mdvr_defaults()
    from logic.backend_clinet import get_backend_base, post_saved_video
    from logic.camera_video_upload import resolve_machine_id
    from logic.mdvr_record import (
        prepare_mdvr_upload_file,
        probe_video,
        record_rtsp_copy,
        stream_index_candidates,
    )
    from mdvr.network import check_mdvr_reachable
    from mdvr.rtsp_urls import mdvr_host, rtsp_url

    if not get_backend_base():
        print("Set backendBaseUrl in data/backend.json")
        return 1

    ok, err = check_mdvr_reachable()
    print(f"MDVR host {mdvr_host()} reachable={ok}")
    if not ok:
        print(err)
        return 2

    ch = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    duration = _test_duration()
    min_raw = max(10_000, int(os.environ.get("MDVR_TEST_MIN_RAW_BYTES", "30000")))
    min_up = max(4096, int(os.environ.get("CAMERA_CLIP_MIN_UPLOAD_BYTES", "12000")))

    raw = os.path.join(tempfile.gettempdir(), f"mdvr_test_ch{ch}_raw.mp4")

    best_raw_sz = 0
    best_err = ""

    for st in stream_index_candidates():
        os.environ["MDVR_STREAM_INDEX"] = st
        url = rtsp_url(ch)
        print(f"Recording {int(duration)}s substream _{st}: {url}")
        if os.path.isfile(raw):
            try:
                os.remove(raw)
            except OSError:
                pass
        rc, ff_err, sz = record_rtsp_copy(url, raw, duration)
        print(f"  copy rc={rc} size={sz} B")
        if ff_err:
            print("  ffmpeg:", ff_err[-300:].replace("\n", " "))
        if sz > best_raw_sz:
            best_raw_sz = sz
            best_err = ff_err
        if sz >= min_raw:
            break

    if best_raw_sz < min_raw:
        print(f"No usable stream CH{ch} (best {best_raw_sz} B)")
        if best_err:
            print(best_err[-500:])
        return 4

    codec, raw_dur = probe_video(raw)
    print(f"Raw codec={codec} duration≈{raw_dur:.1f}s")

    up_path, up_dur, temps = prepare_mdvr_upload_file(raw, min_bytes=min_up)
    if not up_path:
        print("Could not build web-playable file")
        return 4

    up_sz = os.path.getsize(up_path)
    _, final_dur = probe_video(up_path)
    print(f"Upload file {up_path} size={up_sz} B duration≈{final_dur or up_dur:.1f}s")

    mid = resolve_machine_id()
    ok, code, text = post_saved_video(
        up_path,
        machine_id=mid,
        title=f"{os.environ.get('MDVR_DEVICE_ID') or 'mdvr'} MDVR{ch} test",
        camera_channel=f"MDVR{ch}",
        duration_sec=int(round(final_dur or up_dur or duration)),
        source="mdvr",
        timeout=600,
    )
    print(f"Upload ok={ok} code={code} {text[:120]}")

    for p in set(temps + [raw]):
        if p and os.path.isfile(p):
            try:
                os.remove(p)
            except OSError:
                pass
    return 0 if ok else 5


if __name__ == "__main__":
    raise SystemExit(main())
