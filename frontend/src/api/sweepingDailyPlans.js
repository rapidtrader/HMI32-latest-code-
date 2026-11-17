import { apiUrl } from './client';
import { parseSweepingJson } from './sweepingClient';

export async function fetchDailyPlan(projectId, planDate) {
  const q = new URLSearchParams({ projectId, planDate });
  return parseSweepingJson(await fetch(apiUrl(`/api/sweeping/daily-plans?${q}`)), {
    emptyList: true,
    emptyListDefaults: { data: null, rows: [], machines: [], plan: null },
  });
}

export async function generateDailyPlan(projectId, planDate) {
  return parseSweepingJson(
    await fetch(apiUrl('/api/sweeping/daily-plans/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, planDate }),
    }),
  );
}

export async function cancelMachineDailyPlan(planId, machineId) {
  return parseSweepingJson(
    await fetch(apiUrl(`/api/sweeping/daily-plans/${planId}/machines/${encodeURIComponent(machineId)}/cancel`), {
      method: 'POST',
    }),
  );
}