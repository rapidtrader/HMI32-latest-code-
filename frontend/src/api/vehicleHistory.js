import { apiUrl, fetchApi } from './client';

/** Production fallback when /api/vehicle-history is not deployed yet. */
async function fetchVehicleHistoryVehiclesFromGps() {
  const data = await fetchApi('/api/gps/devices');
  return (data.data || []).map((x) => String(x).trim()).filter(Boolean).sort();
}

export async function fetchVehicleHistoryVehicles() {
  const res = await fetch(apiUrl('/api/vehicle-history/vehicles'));
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success !== false) return data.data || [];
  if (res.status === 404 || res.status === 501) {
    return fetchVehicleHistoryVehiclesFromGps();
  }
  if (!res.ok || data.success === false) {
    try {
      return await fetchVehicleHistoryVehiclesFromGps();
    } catch {
      throw new Error(data.message || 'Failed to load vehicles');
    }
  }
  return data.data || [];
}

async function fetchVehicleHistoryFromGps({ deviceId, from, to }) {
  const did = String(deviceId || '').trim();
  const start = from ? new Date(`${from}T00:00:00+05:30`).toISOString() : undefined;
  const end = to ? new Date(`${to}T23:59:59.999+05:30`).toISOString() : undefined;
  const q = new URLSearchParams({ deviceId: did, limit: '5000', skip: '0' });
  if (start) q.set('from', start);
  if (end) q.set('to', end);
  const list = await fetchApi(`/api/gps?${q}`);
  const rows = Array.isArray(list.data) ? list.data : [];
  const points = [];
  let prev = null;
  for (const r of [...rows].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))) {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    let distanceKm = 0;
    if (prev && Number.isFinite(lat) && Number.isFinite(lng)) {
      const R = 6371;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(lat - prev.lat);
      const dLon = toRad(lng - prev.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(prev.lat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
      distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    const speed = Number(r.speed ?? 0);
    const payload = r.payload || r.raw || {};
    const ig = payload.ignition ?? payload.acc;
    let status = 'Idle';
    if (ig === true || ig === 1 || String(ig).toUpperCase() === 'ON') status = 'Ignition on';
    else if (ig === false || ig === 0 || String(ig).toUpperCase() === 'OFF') status = 'Ignition off';
    else if (speed > 3) status = 'Ignition on';
    else if (speed > 0.5) status = 'Idle';
    else status = 'Ignition off';
    points.push({
      id: r.id,
      recorded_at: r.recorded_at,
      latitude: lat,
      longitude: lng,
      speed: Math.round(speed * 10) / 10,
      distanceKm: Math.round(distanceKm * 100) / 100,
      status,
      fuel: 0,
    });
    if (Number.isFinite(lat) && Number.isFinite(lng)) prev = { lat, lng };
  }
  return {
    deviceId: did,
    from,
    to,
    syncedAt: new Date().toISOString(),
    total: points.length,
    truncated: rows.length >= 5000,
    points,
  };
}

export async function fetchVehicleHistory({ deviceId, from, to }) {
  const q = new URLSearchParams({ deviceId, from, to });
  const res = await fetch(apiUrl(`/api/vehicle-history?${q}`));
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success !== false && data.data) return data.data;
  if (res.status === 404 || res.status === 501) {
    return fetchVehicleHistoryFromGps({ deviceId, from, to });
  }
  if (!res.ok || data.success === false) {
    try {
      return await fetchVehicleHistoryFromGps({ deviceId, from, to });
    } catch {
      throw new Error(data.message || 'Failed to load history');
    }
  }
  return data.data;
}