"""MDVR RTSP probe (ffprobe) before starting preview tiles."""
import os
import subprocess
import threading
from typing import Dict, List

from mdvr.rtsp_urls import default_channel_count, parse_stream_ids, rtsp_url, stream_enabled

_PROBE_LOCK = threading.Lock()
_results: Dict[int, bool] = {}
_finished = False
_TIMEOUT = int(os.environ.get("MDVR_PROBE_TIMEOUT_SEC", "18"))


def _probe_enabled() -> bool:
    return os.environ.get("MDVR_PROBE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _enabled_ids() -> List[int]:
    allowed = parse_stream_ids()
    if allowed is None:
        return list(range(1, default_channel_count() + 1))
    return sorted(set(int(x) for x in allowed))


def reset_probe_session() -> None:
    global _finished
    with _PROBE_LOCK:
        _results.clear()
        _finished = False


def _probe_soft_fail() -> bool:
    return os.environ.get("MDVR_PROBE_SOFT", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def probe_rtsp_url(url: str) -> bool:
    transport = os.environ.get("MDVR_RTSP_TRANSPORT", "tcp").strip() or "tcp"
    stimeout = os.environ.get("MDVR_RTSP_STIMEOUT_US", "10000000").strip()
    cmd = [
        "timeout",
        str(_TIMEOUT),
        "ffprobe",
        "-v",
        "error",
        "-rtsp_transport",
        transport,
    ]
    if stimeout:
        cmd.extend(["-stimeout", stimeout])
    cmd.extend(
        [
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "csv=p=0",
        url,
        ]
    )
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    except OSError:
        print(f"[MDVR] probe {url}: ffprobe missing — will try stream")
        return True
    if r.returncode == 0 and r.stdout.strip():
        print(f"[MDVR] probe {url}: OK {r.stdout.strip()}")
        return True
    if r.returncode == 124:
        print(f"[MDVR] probe {url}: timeout ({_TIMEOUT}s)")
    else:
        print(f"[MDVR] probe {url}: no video (rc={r.returncode})")
    if _probe_soft_fail():
        return True
    return False


def run_all_probes_sync() -> None:
    global _finished
    if not _probe_enabled():
        with _PROBE_LOCK:
            _finished = True
        return
    results: Dict[int, bool] = {}
    parallel = os.environ.get("MDVR_PROBE_PARALLEL", "0").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    ids = _enabled_ids()

    def probe_one(cid: int):
        results[cid] = probe_rtsp_url(rtsp_url(cid))

    if parallel and len(ids) > 1:
        threads = [threading.Thread(target=probe_one, args=(cid,), daemon=True) for cid in ids]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=_TIMEOUT + 2)
        for cid in ids:
            results.setdefault(cid, False)
    else:
        for cid in ids:
            probe_one(cid)

    with _PROBE_LOCK:
        _results.clear()
        _results.update(results)
        _finished = True
    print(f"[MDVR] probe done: {results}")


def any_channel_probe_ok() -> bool:
    with _PROBE_LOCK:
        return any(_results.values())


def channel_probe_ok(channel_id: int) -> bool:
    if not _probe_enabled():
        return True
    if not stream_enabled(channel_id):
        return False
    with _PROBE_LOCK:
        if not _finished:
            return True
        return bool(_results.get(int(channel_id), False))


def _try_stream_without_probe() -> bool:
    return os.environ.get("MDVR_TRY_ALL_PORTS", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def ensure_channel_probed(channel_id: int, url: str) -> bool:
    if not stream_enabled(channel_id):
        return False
    if not _probe_enabled() or _try_stream_without_probe():
        return True
    with _PROBE_LOCK:
        if _finished:
            ok = bool(_results.get(int(channel_id), False))
            if not ok:
                print(f"[MDVR] CH{channel_id} skipped (no stream on {url})")
            return ok
    return True
