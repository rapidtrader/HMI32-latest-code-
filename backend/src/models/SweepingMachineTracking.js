const { getDatabase } = require('../mongodb');
const GpsLocation = require('./GpsLocation');

const MACHINE_COL = 'sweeping_machines';
const HMI_COL = 'hmi32_latest';

const GPS_LIVE_MS = 3 * 60 * 1000;
const GPS_REPORT_MS = 15 * 60 * 1000;

const pickCoord = (gps, hmiGps) => {
  const lat = Number(gps?.latitude ?? gps?.lat ?? hmiGps?.lat ?? hmiGps?.latitude);
  const lng = Number(gps?.longitude ?? gps?.lng ?? hmiGps?.lng ?? hmiGps?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const readIgnition = (gps, hmi, speed) => {
  const raw = gps?.payload || gps?.raw || {};
  const ig = raw.ignition ?? raw.ignition_on ?? raw.acc ?? raw.ACC;
  if (ig === true || ig === 1 || String(ig).toUpperCase() === 'ON') return 'ON';
  if (ig === false || ig === 0 || String(ig).toUpperCase() === 'OFF') return 'OFF';
  const spd = Number(speed);
  if (Number.isFinite(spd)) {
    if (spd > 2) return 'ON';
    if (gps) return 'OFF';
  }
  const st = hmi?.state;
  if (st && (st.suction === true || st.suction === 1)) return 'ON';
  return 'Unknown';
};

const readSweeping = (hmi) => {
  const st = hmi?.state || {};
  const on = st.sweeping === true || st.sweeping === 1;
  return on ? 'Sweeping' : 'Not Sweeping';
};

const gpsAgeMs = (gps, hmi) => {
  const t = gps?.recorded_at || gps?.recordedAt || hmi?.updated_at || hmi?.lastTsEpoch;
  if (!t) return null;
  const ms = typeof t === 'number' ? t : new Date(t).getTime();
  return Number.isFinite(ms) ? Date.now() - ms : null;
};

class SweepingMachineTracking {
  static async latestGpsByDeviceIds(ids) {
    if (!ids.length) return new Map();
    const col = getDatabase().collection('gps_locations');
    const rows = await col
      .aggregate([
        { $match: { deviceId: { $in: ids } } },
        { $sort: { recorded_at: -1, created_at: -1 } },
        {
          $group: {
            _id: '$deviceId',
            doc: { $first: '$$ROOT' },
          },
        },
      ])
      .toArray();
    const map = new Map();
    for (const r of rows) {
      map.set(r._id, {
        ...GpsLocation.serialize(r.doc),
        payload: r.doc.payload || r.doc.raw || {},
      });
    }
    return map;
  }

  static buildRow(machine, hmi, gps) {
    const hmiGps = hmi?.gps;
    const coords = pickCoord(gps, hmiGps);
    const speed = Number(gps?.speed ?? hmiGps?.speed ?? 0) || 0;
    const age = gpsAgeMs(gps, hmi);
    let gpsStatus = 'Offline';
    if (age != null) {
      if (age <= GPS_LIVE_MS) gpsStatus = 'Live';
      else if (age <= GPS_REPORT_MS) gpsStatus = 'Stale';
    } else if (coords) gpsStatus = 'Stale';

    const ignition = readIgnition(gps, hmi, speed);
    const sweeping = readSweeping(hmi);
    const lastUpdate = gps?.recorded_at || hmi?.updated_at || null;

    return {
      machineId: machine.machineId,
      machineName: machine.machineName,
      vehicleNumber: machine.vehicleNumber || '',
      assignedProjectId: machine.assignedProjectId,
      gpsStatus,
      gpsReporting: gpsStatus === 'Live' || gpsStatus === 'Stale',
      speedKmh: Math.round(speed * 10) / 10,
      ignition,
      sweeping,
      lastUpdate,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      address: '',
    };
  }

  static computeStats(rows) {
    const total = rows.length;
    const gpsReporting = rows.filter((r) => r.gpsReporting).length;
    const ignitionOn = rows.filter((r) => r.ignition === 'ON').length;
    const ignitionOff = rows.filter((r) => r.ignition === 'OFF').length;
    const ignitionUnknown = rows.filter((r) => r.ignition === 'Unknown').length;
    return { total, gpsReporting, ignitionOn, ignitionOff, ignitionUnknown };
  }

  static async trackByProject(projectId) {
    const pid = String(projectId || '').trim();
    if (!pid) {
      const err = new Error('projectId is required');
      err.status = 400;
      throw err;
    }

    const db = getDatabase();
    const machines = await db
      .collection(MACHINE_COL)
      .find({ assignedProjectId: pid, status: 'Active' })
      .sort({ machineId: 1 })
      .toArray();

    const ids = machines.map((m) => m.machineId);
    const [hmiRows, gpsMap] = await Promise.all([
      db.collection(HMI_COL).find({ machineId: { $in: ids } }).toArray(),
      SweepingMachineTracking.latestGpsByDeviceIds(ids),
    ]);

    const hmiById = new Map(hmiRows.map((r) => [r.machineId, r]));
    const rows = machines.map((m) =>
      SweepingMachineTracking.buildRow(m, hmiById.get(m.machineId), gpsMap.get(m.machineId)),
    );

    return {
      assignedProjectId: pid,
      updatedAt: new Date().toISOString(),
      stats: SweepingMachineTracking.computeStats(rows),
      machines: rows,
    };
  }
}

module.exports = SweepingMachineTracking;