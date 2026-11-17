import { apiUrl } from './client';
import { parseSweepingJson } from './sweepingClient';

export async function fetchSweepingRoads({
  search,
  status,
  projectId,
  area,
  colony,
  frequency,
  page,
  limit,
} = {}) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (status && status !== 'all') q.set('status', status);
  if (projectId && projectId !== 'all') q.set('projectId', projectId);
  if (area && area !== 'all') q.set('area', area);
  if (colony && colony !== 'all') q.set('colony', colony);
  if (frequency && frequency !== 'all') q.set('frequency', frequency);
  if (page) q.set('page', String(page));
  if (limit) q.set('limit', String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  return parseSweepingJson(await fetch(apiUrl(`/api/sweeping/roads${suffix}`)), {
    emptyList: true,
    emptyListDefaults: { page: page || 1, limit: limit || 10 },
  });
}

export async function fetchSweepingRoadFilterOptions() {
  const data = await parseSweepingJson(await fetch(apiUrl('/api/sweeping/roads/filter-options')), {
    emptyList: true,
    emptyListDefaults: { data: { areas: [], colonies: [], frequencies: [] } },
  });
  return data.data || { areas: [], colonies: [], frequencies: [] };
}

export async function suggestSweepingRoadId(projectId) {
  const q = new URLSearchParams({ projectId });
  const data = await parseSweepingJson(await fetch(apiUrl(`/api/sweeping/roads/suggest-id?${q}`)), {
    emptyList: true,
    emptyListDefaults: { data: { roadId: '' } },
  });
  return data.data?.roadId || '';
}

export async function createSweepingRoad(body) {
  return parseSweepingJson(
    await fetch(apiUrl('/api/sweeping/roads'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSweepingRoad(id, body) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/roads/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function deactivateSweepingRoad(id) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/roads/${id}/deactivate`), {
      method: 'POST',
    }),
  );
}