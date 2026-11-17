import { apiUrl } from './client';
import { parseSweepingJson } from './sweepingClient';

export async function fetchSweepingMachines({ search, status, projectId, page, limit } = {}) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (status && status !== 'all') q.set('status', status);
  if (projectId && projectId !== 'all') q.set('projectId', projectId);
  if (page) q.set('page', String(page));
  if (limit) q.set('limit', String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return parseSweepingJson(await fetch(apiUrl(`/api/sweeping/machines${suffix}`)), {
    emptyList: true,
    emptyListDefaults: { page: page || 1, limit: limit || 10 },
  });
}

export async function fetchSweepingVehicleIds() {
  const res = await fetch(apiUrl('/api/sweeping/machines/vehicle-ids'));
  const data = await parseSweepingJson(res, { emptyList: true, emptyListDefaults: { data: [] } });
  return Array.isArray(data.data) ? data.data : [];
}

export async function createSweepingMachine(body) {
  return parseSweepingJson(
    await fetch(apiUrl('/api/sweeping/machines'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSweepingMachine(id, body) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/machines/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteSweepingMachine(id) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/machines/${id}`), {
      method: 'DELETE',
    }),
  );
}

export async function deactivateSweepingMachine(id) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/machines/${id}/deactivate`), {
      method: 'POST',
    }),
  );
}