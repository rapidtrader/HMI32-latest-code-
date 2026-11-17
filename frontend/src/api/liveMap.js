import { apiUrl, fetchApi } from './client';
import {
  buildFleetPayload,
  resolveMachineEnrich,
  vehicleFromGps,
} from '../utils/buildLiveMapFleet';

/** Build fleet from GPS latest + machine info when /api/live-map/fleet is not deployed yet. */
async function fetchLiveMapFleetFromGps() {
  const devicesPayload = await fetchApi('/api/gps/devices');
  const ids = [...new Set((devicesPayload.data || []).map((x) => String(x).trim()).filter(Boolean))].sort();

  const [latestRows, machineInfos, hmiLatest] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(apiUrl(`/api/gps/latest/${encodeURIComponent(id)}`));
          if (!res.ok) return null;
          const body = await res.json().catch(() => ({}));
          return body.data || null;
        } catch {
          return null;
        }
      }),
    ),
    fetchApi('/api/hmi32/machine-info').catch(() => ({ data: [] })),
    fetchApi('/api/hmi32/latest').catch(() => ({ data: [] })),
  ]);

  const infoById = new Map((machineInfos.data || []).map((d) => [d.machineId, d]));
  const hmiList = Array.isArray(hmiLatest.data)
    ? hmiLatest.data
  : hmiLatest.data
    ? [hmiLatest.data]
    : [];
  const hmiById = new Map(hmiList.map((h) => [h.machineId, h]));

  const vehicles = [];
  ids.forEach((deviceId, i) => {
    const gps = latestRows[i];
    if (!gps) return;
    const enrich = resolveMachineEnrich(deviceId, {
      info: infoById.get(deviceId),
      hmi: hmiById.get(deviceId),
    });
    const row = vehicleFromGps(gps, enrich);
    if (row) vehicles.push(row);
  });

  return buildFleetPayload(vehicles, { dataSource: 'gps-fallback' });
}

export async function fetchLiveMapFleet() {
  const res = await fetch(apiUrl('/api/live-map/fleet'));
  const data = await res.json().catch(() => ({}));

  if (res.ok && data.success !== false && data.data?.vehicles) {
    return { ...data.data, dataSource: 'live-map-api' };
  }

  if (res.status === 404 || res.status === 501) {
    return fetchLiveMapFleetFromGps();
  }

  if (!res.ok || data.success === false) {
    try {
      return await fetchLiveMapFleetFromGps();
    } catch (fallbackErr) {
      throw new Error(data.message || fallbackErr.message || 'Failed to load fleet');
    }
  }

  return data.data || (await fetchLiveMapFleetFromGps());
}