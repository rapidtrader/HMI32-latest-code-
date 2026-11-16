import { apiUrl } from './client';

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchSweepingProjects({ search, status, page, limit } = {}) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (status && status !== 'all') q.set('status', status);
  if (page) q.set('page', String(page));
  if (limit) q.set('limit', String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return parseJson(await fetch(apiUrl(`/api/sweeping/projects${suffix}`)));
}

export async function createSweepingProject(body) {
  return parseJson(
    await fetch(apiUrl('/api/sweeping/projects'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSweepingProject(id, body) {
  return parseJson(
    await fetch(apiUrl(`/api/sweeping/projects/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteSweepingProject(id) {
  return parseJson(
    await fetch(apiUrl(`/api/sweeping/projects/${id}`), {
      method: 'DELETE',
    }),
  );
}