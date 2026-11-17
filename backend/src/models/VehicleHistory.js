const { getDatabase } = require('../mongodb');
const { haversineKm } = require('../utils/geo');

const MAX_POINTS = 10000;

const parseDateRange = (from, to) => {
  const fromStr = String(from || '').trim();
  const toStr = String(to || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    const err = new Error('from and to must be YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  return {
    start: new Date(`${fromStr}T00:00:00+05:30`),
    end: new Date(`${toStr}T23:59:59.999+05:30`),
  };
};

const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

const rowStatus = (speed, payload) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const ig = raw.ignition ?? raw.ignition_on ?? raw.acc ?? raw.ACC;
  if (ig === true || ig === 1 || String(ig).toUpperCase() === 'ON') return 'Ignition on';
  if (ig === false || ig === 0 || String(ig).toUpperCase() === 'OFF') return 'Ignition off';
  const s = Number(speed);
  if (!Number.isFinite(s)) return 'Idle';
  if (s > 3) return 'Ignition on';
  if (s > 0.5) return 'Idle';
  return 'Ignition off';
};

const readFuel = (payload) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const f = raw.fuel ?? raw.fuel_level ?? raw.fuelLevel;
  const n = Number(f);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
};

class VehicleHistory {
  static async getHistory({ deviceId, from, to }) {
    const did = String(deviceId || '').trim();
    if (!did) {
      const err = new Error('deviceId is required');
      err.status = 400;
      throw err;
    }
    const { start, end } = parseDateRange(from, to);

    const rows = await getDatabase()
      .collection('gps_locations')
      .find({
        deviceId: did,
        recorded_at: { $gte: start, $lte: end },
      })
      .sort({ recorded_at: 1, created_at: 1 })
      .limit(MAX_POINTS)
      .toArray();

    const points = [];
    let prev = null;

    for (const r of rows) {
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      const speed = round6(r.speed ?? 0);
      let distanceKm = 0;
      if (prev && Number.isFinite(lat) && Number.isFinite(lng)) {
        distanceKm = haversineKm(prev.lat, prev.lng, lat, lng);
      }
      const payload = r.payload || r.raw || {};
      points.push({
        id: String(r._id),
        recorded_at: r.recorded_at,
        latitude: lat,
        longitude: lng,
        speed,
        distanceKm: Math.round(distanceKm * 100) / 100,
        status: rowStatus(speed, payload),
        fuel: readFuel(payload),
      });
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        prev = { lat, lng };
      }
    }

    return {
      deviceId: did,
      from: String(from),
      to: String(to),
      syncedAt: new Date().toISOString(),
      total: points.length,
      truncated: rows.length >= MAX_POINTS,
      points,
    };
  }

  static async listVehicles() {
    const db = getDatabase();
    const [gpsIds, sweepIds] = await Promise.all([
      db.collection('gps_locations').distinct('deviceId'),
      db.collection('sweeping_machines').distinct('machineId'),
    ]);
    return [...new Set([...gpsIds, ...sweepIds].map((x) => String(x).trim()).filter(Boolean))].sort();
  }
}

module.exports = VehicleHistory;