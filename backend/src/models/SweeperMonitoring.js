const { getDatabase } = require('../mongodb');
const { haversineKm } = require('../utils/geo');

const SWEEP_SPEED_KMH = Number(process.env.SWEEPER_SPEED_THRESHOLD_KMH) || 8;
const GPS_ONLINE_MS = 15 * 60 * 1000;
const MAX_GAP_SEC = 300;
const POINTS_LIMIT = 8000;

const round1 = (n) => Math.round(Number(n) * 10) / 10;

const parseDateRange = (from, to) => {
  const fromStr = String(from || '').trim();
  const toStr = String(to || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    const err = new Error('from and to must be YYYY-MM-DD');
    err.status = 400;
    throw err;
  }
  const start = new Date(`${fromStr}T00:00:00+05:30`);
  const end = new Date(`${toStr}T23:59:59.999+05:30`);
  if (end < start) {
    const err = new Error('to must be on or after from');
    err.status = 400;
    throw err;
  }
  return { start, end };
};

const analyzeTrack = (points, thresholdKmh) => {
  let sweepingSec = 0;
  let nonSweepingSec = 0;
  let sweepingKm = 0;
  let nonSweepingKm = 0;

  if (points.length < 2) {
    return { sweepingSec, nonSweepingSec, sweepingKm, nonSweepingKm };
  }

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const t0 = new Date(a.recorded_at).getTime();
    const t1 = new Date(b.recorded_at).getTime();
    const dt = (t1 - t0) / 1000;
    if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_GAP_SEC) continue;

    const speed = Number(b.speed ?? a.speed ?? 0);
    const lat1 = Number(a.latitude);
    const lon1 = Number(a.longitude);
    const lat2 = Number(b.latitude);
    const lon2 = Number(b.longitude);
    const dist = Number.isFinite(lat1) && Number.isFinite(lon1) && Number.isFinite(lat2) && Number.isFinite(lon2)
      ? haversineKm(lat1, lon1, lat2, lon2)
      : 0;

    if (speed < thresholdKmh) {
      sweepingSec += dt;
      sweepingKm += dist;
    } else {
      nonSweepingSec += dt;
      nonSweepingKm += dist;
    }
  }

  return {
    sweepingSec: Math.round(sweepingSec),
    nonSweepingSec: Math.round(nonSweepingSec),
    sweepingKm: round1(sweepingKm),
    nonSweepingKm: round1(nonSweepingKm),
  };
};

class SweeperMonitoring {
  static async listSweeperIds(category) {
    const db = getDatabase();
    const cat = String(category || 'Sweeper').trim();
    if (cat === 'All') {
      const [gpsIds, sweepIds] = await Promise.all([
        db.collection('gps_locations').distinct('deviceId'),
        db.collection('sweeping_machines').distinct('machineId'),
      ]);
      return [...new Set([...gpsIds, ...sweepIds].map((x) => String(x).trim()).filter(Boolean))].sort();
    }
    const machines = await db
      .collection('sweeping_machines')
      .find({ status: { $ne: 'Inactive' } })
      .project({ machineId: 1, machineName: 1, vehicleNumber: 1 })
      .toArray();
    if (machines.length) return machines.map((m) => m.machineId);
    return db.collection('gps_locations').distinct('deviceId');
  }

  static async report({ from, to, category, machineId }) {
    const { start, end } = parseDateRange(from, to);
    const db = getDatabase();
    const threshold = SWEEP_SPEED_KMH;

    const allIds = await SweeperMonitoring.listSweeperIds(category);
    const mid = String(machineId || '').trim();
    const ids = mid && mid !== 'all' ? [mid] : allIds;

    const meta = await db
      .collection('sweeping_machines')
      .find({ machineId: { $in: ids } })
      .project({ machineId: 1, machineName: 1, vehicleNumber: 1, status: 1 })
      .toArray();
    const metaById = new Map(meta.map((m) => [m.machineId, m]));

    const totals = {
      sweepingSec: 0,
      nonSweepingSec: 0,
      sweepingKm: 0,
      nonSweepingKm: 0,
    };

    const vehicles = [];
    let withData = 0;

    for (const deviceId of ids) {
      const points = await db
        .collection('gps_locations')
        .find({
          deviceId,
          recorded_at: { $gte: start, $lte: end },
        })
        .sort({ recorded_at: 1, created_at: 1 })
        .limit(POINTS_LIMIT)
        .project({ latitude: 1, longitude: 1, speed: 1, recorded_at: 1 })
        .toArray();

      const stats = analyzeTrack(points, threshold);
      const last = points.length ? points[points.length - 1] : null;
      const latest = await db.collection('gps_locations').findOne(
        { deviceId },
        { sort: { recorded_at: -1 }, projection: { recorded_at: 1 } },
      );
      const lastAt = latest?.recorded_at || last?.recorded_at || null;
      const gpsOnline = lastAt && Date.now() - new Date(lastAt).getTime() < GPS_ONLINE_MS;

      if (points.length > 0) withData += 1;

      totals.sweepingSec += stats.sweepingSec;
      totals.nonSweepingSec += stats.nonSweepingSec;
      totals.sweepingKm += stats.sweepingKm;
      totals.nonSweepingKm += stats.nonSweepingKm;

      const m = metaById.get(deviceId);
      vehicles.push({
        deviceId,
        machineName: m?.machineName || deviceId,
        vehiclePlateNo: m?.vehicleNumber || '',
        vehicleType: 'van',
        gpsOnline,
        gpsLastAt: lastAt,
        speedThresholdKmh: threshold,
        sweeping: stats,
        nonSweeping: {
          timeSec: stats.nonSweepingSec,
          km: stats.nonSweepingKm,
        },
        hasData: points.length > 0,
      });
    }

    totals.sweepingKm = round1(totals.sweepingKm);
    totals.nonSweepingKm = round1(totals.nonSweepingKm);

    return {
      from: String(from),
      to: String(to),
      category: category || 'Sweeper',
      speedThresholdKmh: threshold,
      lastUpdate: new Date().toISOString(),
      totals,
      fleetTotal: allIds.length,
      fleetWithData: withData,
      availableSweepers: allIds,
      vehicles: vehicles.sort((a, b) => a.deviceId.localeCompare(b.deviceId)),
    };
  }
}

module.exports = SweeperMonitoring;