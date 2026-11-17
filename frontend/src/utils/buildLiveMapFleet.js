const FRESH_MS = 15 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const OVERSPEED_KMH = 40;
const HMI_ONLINE_MS = 5 * 60 * 1000;

const round1 = (n) => Math.round(Number(n) * 10) / 10;

export const classifyFleetStatus = (speed, ageMs, machineInactive) => {
  if (machineInactive) return 'INACTIVE';
  if (ageMs == null) return 'NEW';
  if (ageMs > STALE_MS) return 'UNREACHABLE';
  if (ageMs > FRESH_MS) return 'IDLE';
  if (Number(speed) > OVERSPEED_KMH) return 'OVERSPEED';
  if (Number(speed) > 3) return 'RUNNING';
  return 'STOPPED';
};

const signalPct = (sats, ageMs) => {
  if (sats != null && Number.isFinite(Number(sats))) {
    return Math.min(99, Math.max(10, Math.round((Number(sats) / 12) * 100)));
  }
  return ageMs != null && ageMs < FRESH_MS ? 75 : 33;
};

export function resolveMachineEnrich(deviceId, { sweep, info, hmi } = {}) {
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
    machineInactive: sweep?.status === 'Inactive',
  };
}

export function vehicleFromGps(gps, enrich = {}) {
  const lat = Number(gps?.latitude ?? gps?.lat);
  const lng = Number(gps?.longitude ?? gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const deviceId = String(gps.deviceId || enrich.machineId || '').trim();
  if (!deviceId) return null;

  const speed = round1(gps?.speed ?? 0);
  const lastUpdate = gps?.recorded_at || null;
  const ageMs = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() : null;
  const machineInactive = enrich.machineInactive || enrich.status === 'Inactive';
  const status = classifyFleetStatus(speed, ageMs, machineInactive);
  const sats = gps?.satellites;

  return {
    machineId: enrich.machineId || deviceId,
    deviceId,
    clientName: enrich.clientName || '',
    location: enrich.location || '',
    machineName: enrich.machineName || enrich.clientName || deviceId,
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

export function buildFleetStats(vehicles) {
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
  for (const v of vehicles) {
    stats.all += 1;
    const key = String(v.status || '').toLowerCase();
    if (stats[key] != null) stats[key] += 1;
  }
  return stats;
}

export function buildFleetPayload(vehicles, { dataSource = 'api' } = {}) {
  return {
    updatedAt: new Date().toISOString(),
    overspeedLimitKmh: OVERSPEED_KMH,
    stats: buildFleetStats(vehicles),
    vehicles,
    dataSource,
  };
}