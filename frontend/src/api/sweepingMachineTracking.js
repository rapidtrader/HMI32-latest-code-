import { apiUrl } from './client';

export async function fetchMachineTracking(projectId) {
  const q = new URLSearchParams({ projectId });
  const res = await fetch(apiUrl(`/api/sweeping/machine-tracking?${q}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || 'Failed to load machine tracking');
  }
  return data.data;
}