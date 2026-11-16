const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');
const { haversineKm, pathLengthKm, normalizeGpsPoints } = require('../utils/geo');
const SweepingDailyPlan = require('./SweepingDailyPlan');

const ROAD_COL = 'sweeping_roads';
const GPS_COL = 'gps_locations';

const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

const dayRangeIst = (planDate) => {
  const start = new Date(`${planDate}T00:00:00+05:30`);
  const end = new Date(`${planDate}T23:59:59.999+05:30`);
  return { start, end };
};

const downsample = (points, max = 400) => {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter((_, i) => i % step === 0);
};

const roadCoverage = (roadPoints, actualPoints) => {
  if (!roadPoints.length) return { pct: 0, status: 'Missed' };
  if (!actualPoints.length) return { pct: 0, status: 'Missed' };
  const hitRadiusKm = 0.08;
  let hits = 0;
  for (const rp of roadPoints) {
    const near = actualPoints.some(
      (ap) => haversineKm(rp.lat, rp.lng, ap.lat, ap.lng) <= hitRadiusKm,
    );
    if (near) hits += 1;
  }
  const pct = Math.round((hits / roadPoints.length) * 100);
  let status = 'Missed';
  if (pct >= 50) status = 'Completed';
  else if (pct > 0) status = 'Partial';
  return { pct, status };
};

class SweepingPlanVsActual {
  static async loadActualTrack(machineId, planDate) {
    const { start, end } = dayRangeIst(planDate);
    const col = getDatabase().collection(GPS_COL);
    const rows = await col
      .find({
        deviceId: String(machineId).trim(),
        recorded_at: { $gte: start, $lte: end },
      })
      .sort({ recorded_at: 1, created_at: 1 })
      .limit(5000)
      .project({ latitude: 1, longitude: 1, recorded_at: 1, speed: 1 })
      .toArray();

    return rows
      .map((r) => ({
        lat: r.latitude,
        lng: r.longitude,
        recorded_at: r.recorded_at,
        speed: r.speed,
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  static async report({ projectId, planDate, machineId }) {
    const pid = String(projectId || '').trim();
    const date = String(planDate || '').trim();
    if (!pid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const err = new Error('projectId and planDate (YYYY-MM-DD) are required');
      err.status = 400;
      throw err;
    }

    const plan = await SweepingDailyPlan.findByProjectAndDate(pid, date);
    if (!plan) {
      return {
        hasPlan: false,
        assignedProjectId: pid,
        planDate: date,
        message: 'No daily plan found for this project and date. Generate a daily plan first.',
        summary: null,
        machines: [],
      };
    }

    let machineBlocks = plan.machines || [];
    const midFilter = String(machineId || '').trim();
    if (midFilter && midFilter !== 'all') {
      machineBlocks = machineBlocks.filter((m) => m.machineId === midFilter);
    }

    const db = getDatabase();
    const roadIds = [
      ...new Set(
        machineBlocks.flatMap((m) => (m.roads || []).map((r) => r.roadRefId).filter(Boolean)),
      ),
    ];
    const roadOids = roadIds
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const roadDocs = roadOids.length
      ? await db
          .collection(ROAD_COL)
          .find({ _id: { $in: roadOids } })
          .project({ gpsPoints: 1, roadId: 1 })
          .toArray()
      : [];
    const roadGeom = new Map(roadDocs.map((d) => [String(d._id), normalizeGpsPoints(d.gpsPoints)]));

    const machinesOut = [];
    let roadsPlanned = 0;
    let roadsCompleted = 0;
    let roadsPartial = 0;
    let roadsMissed = 0;
    let plannedKm = 0;
    let actualKm = 0;

    for (const block of machineBlocks) {
      const actualFull = await SweepingPlanVsActual.loadActualTrack(block.machineId, date);
      const actualKmMachine = pathLengthKm(
        actualFull.map((p) => ({ lat: p.lat, lng: p.lng })),
      );
      const plannedKmMachine = round3(block.assignedKm || 0);
      plannedKm += plannedKmMachine;
      actualKm += actualKmMachine;

      const plannedRoads = [];
      const plannedPolylines = [];

      for (const r of block.roads || []) {
        roadsPlanned += 1;
        const geom = roadGeom.get(r.roadRefId) || [];
        if (geom.length > 1) plannedPolylines.push(geom);
        const { pct, status } = roadCoverage(
          geom,
          actualFull.map((p) => ({ lat: p.lat, lng: p.lng })),
        );
        if (status === 'Completed') roadsCompleted += 1;
        else if (status === 'Partial') roadsPartial += 1;
        else roadsMissed += 1;

        plannedRoads.push({
          roadId: r.roadId,
          roadName: r.roadName,
          areaName: r.areaName,
          colonyName: r.colonyName,
          plannedKm: r.plannedKm,
          status,
          coveragePct: pct,
        });
      }

      machinesOut.push({
        machineId: block.machineId,
        machineName: block.machineName,
        vehicleNumber: block.vehicleNumber,
        plannedKm: plannedKmMachine,
        actualKm: actualKmMachine,
        varianceKm: round3(actualKmMachine - plannedKmMachine),
        plannedRoads,
        plannedPolylines,
        actualTrack: downsample(actualFull),
      });
    }

    return {
      hasPlan: true,
      assignedProjectId: pid,
      assignedProjectName: plan.assignedProjectName,
      planDate: date,
      summary: {
        plannedKm: round3(plannedKm),
        actualKm: round3(actualKm),
        varianceKm: round3(actualKm - plannedKm),
        roadsPlanned,
        roadsCompleted,
        roadsPartial,
        roadsMissed,
      },
      machines: machinesOut,
    };
  }
}

module.exports = SweepingPlanVsActual;