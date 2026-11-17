import { apiUrl } from './client';
import { parseSweepingJson } from './sweepingClient';

export async function fetchPlanVsActual({ projectId, planDate, machineId }) {
  const q = new URLSearchParams({ projectId, planDate });
  if (machineId && machineId !== 'all') q.set('machineId', machineId);
  const res = await fetch(apiUrl(`/api/sweeping/plan-vs-actual?${q}`));
  const data = await parseSweepingJson(res, {
    emptyList: true,
    emptyListDefaults: { data: { rows: [], totals: {} } },
  });
  return data.data;
}