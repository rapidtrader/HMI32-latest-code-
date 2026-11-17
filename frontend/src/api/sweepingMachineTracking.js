import { apiUrl } from './client';
import { parseSweepingJson } from './sweepingClient';

export async function fetchMachineTracking(projectId) {
  const q = new URLSearchParams({ projectId });
  const res = await fetch(apiUrl(`/api/sweeping/machine-tracking?${q}`));
  const data = await parseSweepingJson(res, {
    emptyList: true,
    emptyListDefaults: { data: { machines: [], summary: {} } },
  });
  return data.data;
}