import { apiUrl } from './client';

export async function fetchPlanVsActual({ projectId, planDate, machineId }) {
  const q = new URLSearchParams({ projectId, planDate });
  if (machineId && machineId !== 'all') q.set('machineId', machineId);
  const res = await fetch(apiUrl(`/api/sweeping/plan-vs-actual?${q}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Failed to load plan vs actual report');
  }
  return data.data;
}