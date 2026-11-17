const { getDatabase } = require('../mongodb');
const GpsLocation = require('./GpsLocation');

const FRESH_MS = 15 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const OVERSPEED_KMH = Number(process.env.LIVE_MAP_OVERSPEED_KMH) || 40;

const classifyStatus = (speed, ageMs, machineInactive) => {
  if (machineInactive) return 'INACTIVE';
  if (ageMs == null) return 'NEW';
  if (ageMs > STALE_MS) return 'UNREACHABLE';
  if (ageMs > FRESH_MS) return 'IDLE';
  if (Number(speed) > OVERSPEED_KMH) return 'OVERSPEED';
  if (Number(speed) > 3) return 'RUNNING';
  return 'STOPPED';
};

const round1 = (n) => Math.round(Number(n) * 10) / 10;

const signalPct = (sats, ageMs) => {
  if (sats != null && Number.isFinite(Number(sats))) {
    return Math.min(99, Math.max(10, Math.round((Number(sats) / 12) * 100)));
  }
  return ageMs != null && ageMs < FRESH_MS ? 75 : 33;
};

const HMI_ONLINE_MS = 5 * 60 * 1000;

/** Identity from machineinfos (+ live HMI state), keyed by GPS deviceId / machineId. */
const resolveMachineEnrich = (deviceId, { sweep, info, hmi } = {}) => {
  const state = hmi?.state && typeof hmi.state === 'object' ? hmi.state : {};
  const clientName = String(info?.clientName || state.clientName || sweep?.machineName || '').trim();
  const location = String(info?.location || state.location || sweep?.assignedProjectName || '').trim();
  const vehiclePlateNo = String(info?.vehiclePlateNo || state.vehiclePlateNo || sweep?.vehicleNumber || '').trim();
  const hmiUpdatedAt = hmi?.updated_at || null;
  const hmiOnline = hmiUpdatedAt
    ? Date.now() - new Date(hmiUpdatedAt).getTime() < HMI_ONLINE_MS
    : false;

  return {
    machineId: deviceId,
    clientName,
    location,
    vehiclePlateNo,
    machineName: clientName || sweep?.machineName || deviceId,
    projectName: sweep?.assignedProjectName || location,
    vehicleType: sweep ? 'Sweeper' : 'HMI Unit',
    status: sweep?.status,
    hmiOnline,
    hmiLastEvent: hmi?.lastEvent ? String(hmi.lastEvent) : '',
    hmiUpdatedAt,
    machineInfoRegistered: Boolean(info),
  };
};

class LiveMapFleet {
  /** Same “latest per deviceId” as GET /api/gps/latest/:id (recorded_at, then created_at). */
  static async latestGpsMap() {
    const rows = await getDatabase()
      .collection('gps_locations')
      .aggregate([
        { $sort: { recorded_at: -1, created_at: -1 } },
        { $group: { _id: '$deviceId', doc: { $first: '$$ROOT' } } },
      ])
      .toArray();
    const map = new Map();
    for (const r of rows) {
      if (r._id) map.set(String(r._id), GpsLocation.serialize(r.doc));
    }
    return map;
  }

  static vehicleFromGps(gps, enrich = {}) {
    const lat = Number(gps?.latitude);
    const lng = Number(gps?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const speed = round1(gps?.speed ?? 0);
    const lastUpdate = gps?.recorded_at || null;
    const ageMs = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : null;
    const machineInactive = enrich.status === 'Inactive';
    const status = classifyStatus(speed, ageMs, machineInactive);
    const sats = gps?.satellites;

    return {
      machineId: enrich.machineId || gps.deviceId,
      deviceId: gps.deviceId,
      clientName: enrich.clientName || '',
      location: enrich.location || '',
      machineName: enrich.machineName || enrich.clientName || gps.deviceId,
      vehiclePlateNo: enrich.vehiclePlateNo || '',
      projectName: enrich.projectName || '',
      vehicleType: enrich.vehicleType || 'HMI Unit',
      hmiOnline: Boolean(enrich.hmiOnline),
      hmiLastEvent: enrich.hmiLastEvent || '',
      hmiUpdatedAt: enrich.hmiUpdatedAt || null,
      machineInfoRegistered: Boolean(enrich.machineInfoRegistered),
      latitude: lat,
      longitude: lng,
      speedKmh: speed,
      altitude: gps?.altitude ?? 0,
      distanceKm: 0,
      lastUpdate,
      status,
      signalPct: signalPct(sats, ageMs),
      satellites: sats ?? null,
      fixValid: gps?.fixValid !== false,
      source: gps?.source || 'pi',
      gpsId: gps?.id,
      machineInactive,
    };
  }

  static async getFleet() {
    const db = getDatabase();
    const [gpsMap, sweepMachines, machineInfos, hmiRows] = await Promise.all([
      LiveMapFleet.latestGpsMap(),
      db
        .collection('sweeping_machines')
        .find({})
        .project({
          machineId: 1,
          machineName: 1,
          vehicleNumber: 1,
          status: 1,
          assignedProjectName: 1,
        })
        .toArray(),
      db
        .collection('machineinfos')
        .find({})
        .project({ machineId: 1, clientName: 1, vehiclePlateNo: 1, location: 1 })
        .toArray(),
      db
        .collection('hmi32_latest')
        .find({})
        .project({ machineId: 1, state: 1, updated_at: 1, lastEvent: 1 })
        .toArray(),
    ]);

    const sweepById = new Map(sweepMachines.map((r) => [r.machineId, r]));
    const infoById = new Map(machineInfos.map((r) => [r.machineId, r]));
    const hmiById = new Map(hmiRows.map((r) => [r.machineId, r]));

    const vehicles = [];
    const stats = {
      all: 0,
      running: 0,
      stopped: 0,
      overspeed: 0,
      idle: 0,
      unreachable: 0,
      new: 0,
      inactive: 0,
    };

    const ids = [...gpsMap.keys()].filter(Boolean).sort();

    for (const deviceId of ids) {
      const gps = gpsMap.get(deviceId);
      if (!gps) continue;

      const sweep = sweepById.get(deviceId);
      const info = infoById.get(deviceId);
      const hmi = hmiById.get(deviceId);
      const enrich = resolveMachineEnrich(deviceId, { sweep, info, hmi });

      const row = LiveMapFleet.vehicleFromGps(gps, enrich);
      if (!row) continue;

      vehicles.push(row);
      stats.all += 1;
      const key = row.status.toLowerCase();
      if (stats[key] != null) stats[key] += 1;
    }

    return {
      updatedAt: new Date().toISOString(),
      overspeedLimitKmh: OVERSPEED_KMH,
      stats,
      vehicles,
    };
  }
}

module.exports = LiveMapFleet;