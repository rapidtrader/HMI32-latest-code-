import { apiUrl } from './client';

export async function fetchSweeperMonitoringReport({ from, to, category, machineId }) {
  const q = new URLSearchParams({ from, to });
  if (category) q.set('category', category);
  if (machineId && machineId !== 'all') q.set('machineId', machineId);
  const res = await fetch(apiUrl(`/api/sweeper-monitoring/report?${q}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Failed to load sweeper monitoring');
  }
  return data.data;
}