const rawBase =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : '';

export const apiUrl = (path) => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${rawBase}${p}`;
};

export async function fetchApi(path) {
  const res = await fetch(apiUrl(path));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${path}`);
  }
  return data;
}
