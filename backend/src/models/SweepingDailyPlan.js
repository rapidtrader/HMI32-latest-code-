const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');

const COLLECTION = 'sweeping_daily_plans';
const MACHINE_COL = 'sweeping_machines';
const ROAD_COL = 'sweeping_roads';
const PROJECT_COL = 'sweeping_projects';

const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

const normalizePlanDate = (d) => {
  const s = String(d || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  const err = new Error('Invalid plan date (use YYYY-MM-DD)');
  err.status = 400;
  throw err;
};

class SweepingDailyPlan {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    try {
      await col.createIndex({ assignedProjectId: 1, planDate: 1 }, { unique: true });
      await col.createIndex({ planDate: -1 });
    } catch (e) {
      console.warn('[SweepingDailyPlan] index:', e.message);
    }
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      assignedProjectId: doc.assignedProjectId,
      assignedProjectName: doc.assignedProjectName,
      planDate: doc.planDate,
      status: doc.status || 'Planned',
      stats: doc.stats || {},
      machines: doc.machines || [],
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  static roadEligibleForDate(road, planDate) {
    const freq = String(road.frequency || 'Daily');
    if (freq === 'Daily') return true;
    if (freq === 'Weekly') {
      const day = new Date(`${planDate}T12:00:00Z`).getUTCDay();
      return day === 1;
    }
    if (freq === 'Bi-Weekly') {
      const day = new Date(`${planDate}T12:00:00Z`).getUTCDay();
      return day === 1;
    }
    if (freq === 'Monthly') {
      const d = new Date(`${planDate}T12:00:00Z`).getUTCDate();
      return d === 1;
    }
    return true;
  }

  static buildMachineState(machines) {
    return machines.map((m) => ({
      machineId: m.machineId,
      machineName: m.machineName,
      vehicleNumber: m.vehicleNumber || '',
      capacityKm: round3(m.sweepingKmPerDay || 0),
      assignedKm: 0,
      remainingKm: round3(m.sweepingKmPerDay || 0),
      withinCapacity: true,
      status: 'Planned',
      roads: [],
    }));
  }

  static recalcMachine(m) {
    const assignedKm = round3(m.roads.reduce((s, r) => s + (Number(r.plannedKm) || 0), 0));
    const capacityKm = round3(m.capacityKm);
    m.assignedKm = assignedKm;
    m.remainingKm = round3(Math.max(0, capacityKm - assignedKm));
    m.withinCapacity = assignedKm <= capacityKm + 0.0001;
    m.roads = m.roads.map((r, idx) => ({ ...r, seq: idx + 1 }));
    return m;
  }

  static buildStats(machines, unassignedCount) {
    const scheduledRoads = machines.reduce((s, m) => s + m.roads.length, 0);
    const totalPlannedKm = round3(machines.reduce((s, m) => s + m.assignedKm, 0));
    const machinesUsed = machines.filter((m) => m.roads.length > 0).length;
    const capacityWarnings = machines.filter((m) => !m.withinCapacity).length;
    return {
      scheduledRoads,
      totalPlannedKm,
      machinesUsed,
      capacityWarnings,
      unassignedRoads: unassignedCount,
    };
  }

  static async generate({ projectId, planDate }) {
    const pid = String(projectId || '').trim();
    const date = normalizePlanDate(planDate);
    if (!pid) {
      const err = new Error('projectId is required');
      err.status = 400;
      throw err;
    }

    const db = getDatabase();
    const project = await db.collection(PROJECT_COL).findOne({ projectId: pid });
    if (!project) {
      const err = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const [machines, roads] = await Promise.all([
      db
        .collection(MACHINE_COL)
        .find({ assignedProjectId: pid, status: 'Active' })
        .sort({ machineId: 1 })
        .toArray(),
      db
        .collection(ROAD_COL)
        .find({ assignedProjectId: pid, status: 'Active' })
        .sort({ roadId: 1 })
        .toArray(),
    ]);

    const eligibleRoads = roads.filter((r) => SweepingDailyPlan.roadEligibleForDate(r, date));
    const machineStates = SweepingDailyPlan.buildMachineState(machines);
    const byMachineId = new Map(machineStates.map((m) => [m.machineId, m]));
    const unassigned = [];

    const pushRoad = (machine, road) => {
      const km = round3(road.lengthKm || 0);
      machine.roads.push({
        roadRefId: String(road._id),
        roadId: road.roadId,
        roadName: road.roadName,
        areaName: road.areaName,
        colonyName: road.colonyName,
        plannedKm: km,
      });
      SweepingDailyPlan.recalcMachine(machine);
    };

    for (const road of eligibleRoads) {
      const mid = String(road.assignedMachineId || '').trim();
      if (mid && byMachineId.has(mid)) {
        pushRoad(byMachineId.get(mid), road);
      } else {
        unassigned.push(road);
      }
    }

    unassigned.sort((a, b) => (a.lengthKm || 0) - (b.lengthKm || 0));
    const stillUnassigned = [];

    for (const road of unassigned) {
      const km = round3(road.lengthKm || 0);
      let best = null;
      for (const m of machineStates) {
        if (m.remainingKm + 0.0001 < km) continue;
        if (!best || m.remainingKm > best.remainingKm) best = m;
      }
      if (best) {
        pushRoad(best, road);
      } else {
        let fallback = machineStates
          .slice()
          .sort((a, b) => b.remainingKm - a.remainingKm)[0];
        if (fallback) {
          pushRoad(fallback, road);
          if (!fallback.withinCapacity) {
            /* counted in stats */
          }
        } else {
          stillUnassigned.push(road);
        }
      }
    }

    const machinesOut = machineStates
      .filter((m) => m.roads.length > 0)
      .map(SweepingDailyPlan.recalcMachine);

    const stats = SweepingDailyPlan.buildStats(machinesOut, stillUnassigned.length);
    const now = new Date();
    const doc = {
      assignedProjectId: pid,
      assignedProjectName: project.projectName,
      planDate: date,
      status: 'Planned',
      stats,
      machines: machinesOut,
      created_at: now,
      updated_at: now,
    };

    const col = db.collection(COLLECTION);
    await col.updateOne(
      { assignedProjectId: pid, planDate: date },
      { $set: doc, $setOnInsert: { created_at: now } },
      { upsert: true },
    );

    const saved = await col.findOne({ assignedProjectId: pid, planDate: date });
    return SweepingDailyPlan.serialize(saved);
  }

  static async findByProjectAndDate(projectId, planDate) {
    const pid = String(projectId || '').trim();
    const date = normalizePlanDate(planDate);
    const doc = await getDatabase()
      .collection(COLLECTION)
      .findOne({ assignedProjectId: pid, planDate: date, status: { $ne: 'Cancelled' } });
    return SweepingDailyPlan.serialize(doc);
  }

  static async findById(id) {
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      return null;
    }
    const doc = await getDatabase().collection(COLLECTION).findOne({ _id: oid });
    return SweepingDailyPlan.serialize(doc);
  }

  static async cancelPlan(id) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      const err = new Error('Invalid plan id');
      err.status = 400;
      throw err;
    }
    const result = await col.updateOne(
      { _id: oid },
      { $set: { status: 'Cancelled', machines: [], stats: {}, updated_at: new Date() } },
    );
    if (result.matchedCount === 0) {
      const err = new Error('Plan not found');
      err.status = 404;
      throw err;
    }
    return { cancelled: true };
  }

  static async cancelMachinePlan(id, machineId) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      const err = new Error('Invalid plan id');
      err.status = 400;
      throw err;
    }
    const doc = await col.findOne({ _id: oid });
    if (!doc) {
      const err = new Error('Plan not found');
      err.status = 404;
      throw err;
    }
    const mid = String(machineId || '').trim();
    const machines = (doc.machines || []).filter((m) => m.machineId !== mid);
    machines.forEach(SweepingDailyPlan.recalcMachine);
    const stats = SweepingDailyPlan.buildStats(machines, doc.stats?.unassignedRoads || 0);
    await col.updateOne(
      { _id: oid },
      { $set: { machines, stats, updated_at: new Date() } },
    );
    return SweepingDailyPlan.serialize(await col.findOne({ _id: oid }));
  }
}

module.exports = SweepingDailyPlan;