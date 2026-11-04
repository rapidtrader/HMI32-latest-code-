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
  if (typeof window !== 'undefined' && window.location?.port === '5173') {
    return `${window.location.origin} → proxy → http://127.0.0.1:4002`;
  }
  return typeof window !== 'undefined' ? window.location.origin : '(relative)';
}

/** Pi HMI backend.json — LAN IP of the PC running Node (from VITE_PI_BACKEND_URL). */
export function getPiBackendUrlHint() {
  const hint =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PI_BACKEND_URL
      ? String(import.meta.env.VITE_PI_BACKEND_URL).replace(/\/$/, '')
      : '';
  return hint;
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
