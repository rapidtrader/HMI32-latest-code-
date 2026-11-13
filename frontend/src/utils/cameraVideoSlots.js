/** Match backend CameraVideo.normalizeChannel + title fallback. */
export function inferCameraChannel(video) {
  const raw = String(video?.cameraChannel ?? '').trim().toUpperCase();
  if (raw) {
    const mdvr = raw.match(/^MDVR(\d+)$/);
    if (mdvr) return `MDVR${mdvr[1]}`;
    const m = raw.match(/^CH?(\d+)$/);
    if (m) return `CH${m[1]}`;
    if (raw.startsWith('CH')) return raw;
    if (raw.startsWith('MDVR')) return raw;
    return raw;
  }
  const t = String(video?.title || video?.filename || '');
  const mm = t.match(/\bMDVR?\s*(\d+)\b/i);
  if (mm) return `MDVR${mm[1]}`;
  const m = t.match(/\bCH?\s*(\d+)\b/i);
  if (m) return `CH${m[1]}`;
  return null;
}

export function channelSortKey(video) {
  const ch = inferCameraChannel(video);
  if (ch) {
    if (ch.startsWith('MDVR')) {
      const n = parseInt(ch.replace(/\D/g, ''), 10);
      if (Number.isFinite(n)) return 1000 + n;
    }
    const n = parseInt(ch.replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) return n;
  }
  return 999;
}

/** One tile per machine + channel — show longest merged recording, not just newest 10s. */
export function slotScore(video) {
  const size = Number(video?.sizeBytes) || 0;
  const dur = Number(video?.durationSec) || 0;
  const rolling = String(video?.filename || '').includes('_rolling') ? 1 : 0;
  const t = new Date(video?.updated_at || video?.created_at || 0).getTime();
  return rolling * 1e15 + size * 1e6 + dur * 1e3 + t;
}

function pickBestSlot(prev, v) {
  if (!prev) return v;
  return slotScore(v) >= slotScore(prev) ? v : prev;
}

export function dedupeCameraVideosForDisplay(videos) {
  const list = Array.isArray(videos) ? videos : [];
  const byKey = new Map();

  for (const v of list) {
    const mid = String(v?.machineId || '').trim() || 'unknown';
    const ch = inferCameraChannel(v);
    const key = ch ? `${mid}|${ch}` : `${mid}|id:${v?.id}`;
    const next = pickBestSlot(byKey.get(key), v);
    byKey.set(key, ch ? { ...next, cameraChannel: ch } : next);
  }

  const out = [...byKey.values()];

  return out.sort((a, b) => {
    const ma = String(a.machineId || '').localeCompare(String(b.machineId || ''));
    if (ma !== 0) return ma;
    return channelSortKey(a) - channelSortKey(b);
  });
}

/** Merge one socket/API video row into a cached list. */
export function mergeCameraVideoIntoList(videos, video) {
  if (!video?.id) return dedupeCameraVideosForDisplay(videos);
  const list = Array.isArray(videos) ? videos : [];
  const mid = String(video.machineId || '').trim() || 'unknown';
  const ch = inferCameraChannel(video);
  const key = ch ? `${mid}|${ch}` : `${mid}|id:${video.id}`;
  const byKey = new Map();
  for (const v of list) {
    const m = String(v?.machineId || '').trim() || 'unknown';
    const c = inferCameraChannel(v);
    const k = c ? `${m}|${c}` : `${m}|id:${v?.id}`;
    byKey.set(k, v);
  }
  const prev = byKey.get(key);
  byKey.set(key, pickBestSlot(prev, ch ? { ...video, cameraChannel: ch } : video));
  return dedupeCameraVideosForDisplay([...byKey.values()]);
}
