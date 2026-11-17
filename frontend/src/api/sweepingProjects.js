import { apiUrl } from './client';
import { parseSweepingJson } from './sweepingClient';

export async function fetchSweepingProjects({ search, status, page, limit } = {}) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (status && status !== 'all') q.set('status', status);
  if (page) q.set('page', String(page));
  if (limit) q.set('limit', String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return parseSweepingJson(await fetch(apiUrl(`/api/sweeping/projects${suffix}`)), {
    emptyList: true,
    emptyListDefaults: { page: page || 1, limit: limit || 10 },
  });
}

export async function createSweepingProject(body) {
  return parseSweepingJson(
    await fetch(apiUrl('/api/sweeping/projects'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSweepingProject(id, body) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/projects/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteSweepingProject(id) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/projects/${id}`), {
      method: 'DELETE',
    }),
  );
}