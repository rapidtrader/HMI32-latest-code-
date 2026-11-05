const rawBase =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : '';

export const apiUrl = (path) => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${rawBase}${p}`;
};

/** Shown in UI — where Camera Videos API calls go */
export function getApiBaseLabel() {
  if (rawBase) return rawBase;
  const proxy =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEV_PROXY_TARGET
      ? String(import.meta.env.VITE_DEV_PROXY_TARGET).replace(/\/$/, '')
      : 'http://127.0.0.1:4002';
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    return `${window.location.origin} → proxy → ${proxy}`;
  }
  return typeof window !== 'undefined' ? window.location.origin : '(relative)';
}

/** Pi HMI backend.json — same host as this site, or LAN PC :4002 (VITE_PI_BACKEND_URL). */
export function getPiBackendUrlHint() {
  const hint =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PI_BACKEND_URL
      ? String(import.meta.env.VITE_PI_BACKEND_URL).replace(/\/$/, '')
      : '';
  return hint;
}

/** True when Pi should point at a dev PC on port 4002 (firewall / no 127.0.0.1), not production HTTPS. */
export function isLocalPiBackendHint(hint = getPiBackendUrlHint()) {
  if (!hint) return false;
  try {
    const u = new URL(hint);
    if (u.port === '4002') return true;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return false;
  } catch {
    return hint.includes(':4002');
  }
}

export async function checkCameraVideosApi() {
  try {
    const res = await fetch(apiUrl('/api/camera-videos?limit=1'));
    if (res.status === 404) {
      return { ok: false, status: 404, message: 'Camera Videos API not on this server (deploy latest backend)' };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return { ok: false, status: res.status, message: data.message || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, count: Array.isArray(data.data) ? data.data.length : 0 };
  } catch (e) {
    return { ok: false, status: 0, message: e.message || 'Network error' };
  }
}

export async function compactCameraVideos(machineId, { force = false } = {}) {
  const q = new URLSearchParams();
  if (machineId) q.set('machineId', machineId);
  if (force) q.set('force', '1');
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await fetch(apiUrl(`/api/camera-videos/compact${suffix}`), { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Merge failed (deploy latest backend + ffmpeg on server)');
  }
  return data;
}

export async function fetchApi(path) {
  const res = await fetch(apiUrl(path));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${path}`);
  }
  return data;
}

export async function uploadCameraVideo(formData) {
  const res = await fetch(apiUrl('/api/camera-videos'), {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Video upload failed');
  }
  return data;
}

export async function deleteCameraVideo(id) {
  const res = await fetch(apiUrl(`/api/camera-videos/${id}`), { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Delete failed');
  }
  return data;
}
