import { apiUrl } from './client';

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchDailyPlan(projectId, planDate) {
  const q = new URLSearchParams({ projectId, planDate });
  return parseJson(await fetch(apiUrl(`/api/sweeping/daily-plans?${q}`)));
}

export async function generateDailyPlan(projectId, planDate) {
  return parseJson(
    await fetch(apiUrl('/api/sweeping/daily-plans/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, planDate }),
    }),
  );
}

export async function cancelMachineDailyPlan(planId, machineId) {
  return parseJson(
    await fetch(apiUrl(`/api/sweeping/daily-plans/${planId}/machines/${encodeURIComponent(machineId)}/cancel`), {
      method: 'POST',
    }),
  );
}