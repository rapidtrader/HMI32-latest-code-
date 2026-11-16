const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');

const COLLECTION = 'sweeping_machines';
const STATUSES = ['Active', 'Inactive'];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

class SweepingMachine {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    try {
      await col.createIndex({ machineId: 1 }, { unique: true });
      await col.createIndex({ assignedProjectId: 1, created_at: -1 });
      await col.createIndex({ status: 1, created_at: -1 });
    } catch (e) {
      console.warn('[SweepingMachine] index:', e.message);
    }
  }

  static normalizeStatus(status) {
    const s = String(status || 'Active').trim();
    return STATUSES.includes(s) ? s : 'Active';
  }

  static normalizeTime(value, fallback = '08:00') {
    const t = String(value || '').trim();
    if (TIME_RE.test(t)) return t;
    return fallback;
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      machineId: doc.machineId,
      machineName: doc.machineName,
      vehicleNumber: doc.vehicleNumber,
      assignedProjectId: doc.assignedProjectId || '',
      assignedProjectName: doc.assignedProjectName || '',
      sweepingKmPerDay: doc.sweepingKmPerDay,
      workStartTime: doc.workStartTime,
      workEndTime: doc.workEndTime,
      status: doc.status,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  static async list({ search, status, projectId, page = 1, limit = 20 } = {}) {
    const col = getDatabase().collection(COLLECTION);
    const filter = {};
    const q = String(search || '').trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { machineId: rx },
        { machineName: rx },
        { vehicleNumber: rx },
      ];
    }
    const st = String(status || '').trim();
    if (st && st !== 'all') {
      filter.status = st;
    }
    const pid = String(projectId || '').trim();
    if (pid && pid !== 'all') {
      filter.assignedProjectId = pid;
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      col.find(filter).sort({ created_at: -1 }).skip(skip).limit(safeLimit).toArray(),
      col.countDocuments(filter),
    ]);

    return {
      rows: rows.map(SweepingMachine.serialize),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  static async findById(id) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      return null;
    }
    const doc = await col.findOne({ _id: oid });
    return SweepingMachine.serialize(doc);
  }

  static async create(body) {
    const machineId = String(body.machineId || '').trim();
    const machineName = String(body.machineName || '').trim();
    if (!machineId || !machineName) {
      const err = new Error('machineId and machineName are required');
      err.status = 400;
      throw err;
    }

    const col = getDatabase().collection(COLLECTION);
    const existing = await col.findOne({ machineId });
    if (existing) {
      const err = new Error('Machine ID already registered in sweeping fleet');
      err.status = 409;
      throw err;
    }

    const workStart = SweepingMachine.normalizeTime(body.workStartTime, '08:00');
    let workEnd = SweepingMachine.normalizeTime(body.workEndTime, '17:00');
    if (workEnd <= workStart) {
      const err = new Error('End time must be after start time');
      err.status = 400;
      throw err;
    }

    const now = new Date();
    const doc = {
      machineId,
      machineName,
      vehicleNumber: String(body.vehicleNumber || '').trim(),
      assignedProjectId: String(body.assignedProjectId || '').trim(),
      assignedProjectName: String(body.assignedProjectName || '').trim(),
      sweepingKmPerDay: Math.max(0, Number(body.sweepingKmPerDay) || 0),
      workStartTime: workStart,
      workEndTime: workEnd,
      status: SweepingMachine.normalizeStatus(body.status),
      created_at: now,
      updated_at: now,
    };
    const result = await col.insertOne(doc);
    return SweepingMachine.serialize({ ...doc, _id: result.insertedId });
  }

  static async update(id, body) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      const err = new Error('Invalid machine id');
      err.status = 400;
      throw err;
    }

    const current = await col.findOne({ _id: oid });
    if (!current) {
      const err = new Error('Machine not found');
      err.status = 404;
      throw err;
    }

    const update = { updated_at: new Date() };

    if (body.machineId !== undefined) {
      const machineId = String(body.machineId || '').trim();
      if (!machineId) {
        const err = new Error('machineId cannot be empty');
        err.status = 400;
        throw err;
      }
      if (machineId !== current.machineId) {
        const clash = await col.findOne({ machineId, _id: { $ne: oid } });
        if (clash) {
          const err = new Error('Machine ID already registered');
          err.status = 409;
          throw err;
        }
      }
      update.machineId = machineId;
    }

    if (body.machineName !== undefined) {
      const machineName = String(body.machineName || '').trim();
      if (!machineName) {
        const err = new Error('machineName cannot be empty');
        err.status = 400;
        throw err;
      }
      update.machineName = machineName;
    }

    if (body.vehicleNumber !== undefined) {
      update.vehicleNumber = String(body.vehicleNumber || '').trim();
    }
    if (body.assignedProjectId !== undefined) {
      update.assignedProjectId = String(body.assignedProjectId || '').trim();
    }
    if (body.assignedProjectName !== undefined) {
      update.assignedProjectName = String(body.assignedProjectName || '').trim();
    }
    if (body.sweepingKmPerDay !== undefined) {
      update.sweepingKmPerDay = Math.max(0, Number(body.sweepingKmPerDay) || 0);
    }
    if (body.workStartTime !== undefined) {
      update.workStartTime = SweepingMachine.normalizeTime(body.workStartTime);
    }
    if (body.workEndTime !== undefined) {
      update.workEndTime = SweepingMachine.normalizeTime(body.workEndTime);
    }
    if (body.status !== undefined) {
      update.status = SweepingMachine.normalizeStatus(body.status);
    }

    const start = update.workStartTime || current.workStartTime;
    const end = update.workEndTime || current.workEndTime;
    if (end <= start) {
      const err = new Error('End time must be after start time');
      err.status = 400;
      throw err;
    }

    await col.updateOne({ _id: oid }, { $set: update });
    const doc = await col.findOne({ _id: oid });
    return SweepingMachine.serialize(doc);
  }

  static async deactivate(id) {
    return SweepingMachine.update(id, { status: 'Inactive' });
  }

  static async listVehicleIdOptions() {
    const db = getDatabase();
    const [fromInfo, fromLatest] = await Promise.all([
      db.collection('machineinfos').distinct('machineId'),
      db.collection('hmi32_latest').distinct('machineId'),
    ]);
    const ids = new Set();
    for (const list of [fromInfo, fromLatest]) {
      for (const id of list) {
        const s = String(id || '').trim();
        if (s) ids.add(s);
      }
    }
    const sorted = [...ids].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const infos = await db
      .collection('machineinfos')
      .find({ machineId: { $in: sorted } })
      .project({ machineId: 1, vehiclePlateNo: 1, clientName: 1 })
      .toArray();
    const byId = new Map(infos.map((r) => [r.machineId, r]));

    return sorted.map((machineId) => {
      const info = byId.get(machineId) || {};
      return {
        machineId,
        vehiclePlateNo: info.vehiclePlateNo || '',
        clientName: info.clientName || '',
      };
    });
  }
}

SweepingMachine.STATUSES = STATUSES;

module.exports = SweepingMachine;