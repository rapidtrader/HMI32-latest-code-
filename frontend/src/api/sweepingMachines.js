import { apiUrl } from './client';

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchSweepingMachines({ search, status, projectId, page, limit } = {}) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (status && status !== 'all') q.set('status', status);
  if (projectId && projectId !== 'all') q.set('projectId', projectId);
  if (page) q.set('page', String(page));
  if (limit) q.set('limit', String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return parseJson(await fetch(apiUrl(`/api/sweeping/machines${suffix}`)));
}

export async function fetchSweepingVehicleIds() {
  const data = await parseJson(await fetch(apiUrl('/api/sweeping/machines/vehicle-ids')));
  return Array.isArray(data.data) ? data.data : [];
}

export async function createSweepingMachine(body) {
  return parseJson(
    await fetch(apiUrl('/api/sweeping/machines'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSweepingMachine(id, body) {
  return parseJson(
    await fetch(apiUrl(`/api/sweeping/machines/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deactivateSweepingMachine(id) {
  return parseJson(
    await fetch(apiUrl(`/api/sweeping/machines/${id}/deactivate`), {
      method: 'POST',
    }),
  );
}