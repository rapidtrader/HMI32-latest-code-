"""Resolve MDVR RTSP URLs (pattern: stream/av{ch}_{substream})."""
import os


def default_channel_count() -> int:
    try:
        return max(1, min(16, int(os.environ.get("MDVR_CHANNEL_COUNT", "8"))))
    except ValueError:
        return 8


def mdvr_host() -> str:
    return os.environ.get("MDVR_HOST", "192.168.31.156").strip() or "192.168.31.156"


def stream_index() -> str:
    """0 = main (HQ), 1 = sub (faster)."""
    return os.environ.get("MDVR_STREAM_INDEX", "1").strip() or "1"


def rtsp_url(channel_id: int) -> str:
    """UI channel 1–N → stream/av{n}_substream (default offset maps CH1→av1)."""
    override = os.environ.get(f"MDVR_RTSP_{channel_id}", "").strip()
    if override:
        return override
    host = mdvr_host()
    port = os.environ.get("MDVR_RTSP_PORT", "554").strip() or "554"
    av_raw = os.environ.get(f"MDVR_AV_{channel_id}", "").strip()
    if av_raw:
        av_index = max(0, int(av_raw))
    else:
        offset = int(os.environ.get("MDVR_AV_OFFSET", "0"))
        av_index = max(0, int(channel_id) - 1 + offset)
    path_tmpl = os.environ.get("MDVR_RTSP_PATH", "stream/av{ch}_{st}")
    path = path_tmpl.format(ch=av_index, st=stream_index())
    user = os.environ.get("MDVR_USER", "").strip()
    pwd = os.environ.get("MDVR_PASSWORD", "").strip()
    if user and pwd:
        auth = f"{user}:{pwd}@"
    elif user:
        auth = f"{user}@"
    else:
        auth = ""
    return f"rtsp://{auth}{host}:{port}/{path}"


def parse_stream_ids():
    raw = os.environ.get("MDVR_STREAM_IDS", "all").strip().lower()
    if raw in ("", "all", "*"):
        return None
    out = []
    for part in raw.replace(",", " ").split():
        try:
            out.append(int(part))
        except ValueError:
            pass
    return sorted(set(out)) if out else None


def stream_enabled(channel_id: int) -> bool:
    allowed = parse_stream_ids()
    if allowed is None:
        return 1 <= int(channel_id) <= default_channel_count()
    return int(channel_id) in allowed
