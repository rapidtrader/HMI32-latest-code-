const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');
const { normalizeGpsPoints, pathLengthKm } = require('../utils/geo');

const COLLECTION = 'sweeping_roads';
const STATUSES = ['Active', 'Inactive'];
const FREQUENCIES = ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class SweepingRoad {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    try {
      await col.createIndex({ roadId: 1 }, { unique: true });
      await col.createIndex({ assignedProjectId: 1, created_at: -1 });
      await col.createIndex({ areaName: 1 });
      await col.createIndex({ colonyName: 1 });
      await col.createIndex({ frequency: 1 });
      await col.createIndex({ status: 1 });
    } catch (e) {
      console.warn('[SweepingRoad] index:', e.message);
    }
  }

  static normalizeStatus(status) {
    const s = String(status || 'Active').trim();
    return STATUSES.includes(s) ? s : 'Active';
  }

  static normalizeFrequency(freq) {
    const f = String(freq || 'Daily').trim();
    return FREQUENCIES.includes(f) ? f : 'Daily';
  }

  static serialize(doc) {
    if (!doc) return null;
    const gpsPoints = normalizeGpsPoints(doc.gpsPoints);
    return {
      id: String(doc._id),
      roadId: doc.roadId,
      roadName: doc.roadName,
      assignedProjectId: doc.assignedProjectId || '',
      assignedProjectName: doc.assignedProjectName || '',
      areaName: doc.areaName || '',
      colonyName: doc.colonyName || '',
      lengthKm: doc.lengthKm ?? pathLengthKm(gpsPoints),
      frequency: doc.frequency || 'Daily',
      assignedMachineId: doc.assignedMachineId || '',
      status: doc.status,
      gpsPoints,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  static async suggestRoadId(projectId) {
    const pid = String(projectId || '').trim();
    if (!pid) return '';
    const col = getDatabase().collection(COLLECTION);
    const prefix = `${pid}-RD-`;
    const rx = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, 'i');
    const docs = await col
      .find({ roadId: { $regex: `^${escapeRegex(prefix)}` } })
      .project({ roadId: 1 })
      .toArray();
    let max = 0;
    for (const d of docs) {
      const m = String(d.roadId || '').match(rx);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return `${pid}-RD-${String(max + 1).padStart(3, '0')}`;
  }

  static async filterOptions() {
    const col = getDatabase().collection(COLLECTION);
    const [areas, colonies] = await Promise.all([
      col.distinct('areaName'),
      col.distinct('colonyName'),
    ]);
    const clean = (list) =>
      list
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return {
      areas: clean(areas),
      colonies: clean(colonies),
      frequencies: FREQUENCIES,
    };
  }

  static async list({
    search,
    status,
    projectId,
    area,
    colony,
    frequency,
    page = 1,
    limit = 20,
  } = {}) {
    const col = getDatabase().collection(COLLECTION);
    const filter = {};
    const q = String(search || '').trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [
        { roadId: rx },
        { roadName: rx },
        { areaName: rx },
        { colonyName: rx },
      ];
    }
    const st = String(status || '').trim();
    if (st && st !== 'all') filter.status = st;
    const pid = String(projectId || '').trim();
    if (pid && pid !== 'all') filter.assignedProjectId = pid;
    const ar = String(area || '').trim();
    if (ar && ar !== 'all') filter.areaName = ar;
    const co = String(colony || '').trim();
    if (co && co !== 'all') filter.colonyName = co;
    const fr = String(frequency || '').trim();
    if (fr && fr !== 'all') filter.frequency = fr;

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      col.find(filter).sort({ created_at: -1 }).skip(skip).limit(safeLimit).toArray(),
      col.countDocuments(filter),
    ]);

    return {
      rows: rows.map(SweepingRoad.serialize),
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
    return SweepingRoad.serialize(doc);
  }

  static async create(body) {
    const roadName = String(body.roadName || '').trim();
    const assignedProjectId = String(body.assignedProjectId || '').trim();
    const areaName = String(body.areaName || '').trim();
    const colonyName = String(body.colonyName || '').trim();

    if (!roadName || !assignedProjectId || !areaName || !colonyName) {
      const err = new Error('roadName, project, areaName and colonyName are required');
      err.status = 400;
      throw err;
    }

    const gpsPoints = normalizeGpsPoints(body.gpsPoints);
    if (gpsPoints.length < 2) {
      const err = new Error('At least 2 GPS points are required');
      err.status = 400;
      throw err;
    }

    const col = getDatabase().collection(COLLECTION);
    let roadId = String(body.roadId || '').trim();
    if (!roadId) roadId = await SweepingRoad.suggestRoadId(assignedProjectId);

    const existing = await col.findOne({ roadId });
    if (existing) {
      const err = new Error('Road ID already exists');
      err.status = 409;
      throw err;
    }

    const lengthKm = pathLengthKm(gpsPoints);
    const now = new Date();
    const doc = {
      roadId,
      roadName,
      assignedProjectId,
      assignedProjectName: String(body.assignedProjectName || '').trim(),
      areaName,
      colonyName,
      lengthKm,
      frequency: SweepingRoad.normalizeFrequency(body.frequency),
      assignedMachineId: String(body.assignedMachineId || '').trim(),
      status: SweepingRoad.normalizeStatus(body.status),
      gpsPoints,
      created_at: now,
      updated_at: now,
    };
    const result = await col.insertOne(doc);
    return SweepingRoad.serialize({ ...doc, _id: result.insertedId });
  }

  static async update(id, body) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      const err = new Error('Invalid road id');
      err.status = 400;
      throw err;
    }

    const current = await col.findOne({ _id: oid });
    if (!current) {
      const err = new Error('Road not found');
      err.status = 404;
      throw err;
    }

    const update = { updated_at: new Date() };

    if (body.roadName !== undefined) {
      const roadName = String(body.roadName || '').trim();
      if (!roadName) {
        const err = new Error('roadName cannot be empty');
        err.status = 400;
        throw err;
      }
      update.roadName = roadName;
    }

    if (body.areaName !== undefined) {
      update.areaName = String(body.areaName || '').trim();
    }
    if (body.colonyName !== undefined) {
      update.colonyName = String(body.colonyName || '').trim();
    }
    if (body.assignedProjectId !== undefined) {
      update.assignedProjectId = String(body.assignedProjectId || '').trim();
    }
    if (body.assignedProjectName !== undefined) {
      update.assignedProjectName = String(body.assignedProjectName || '').trim();
    }
    if (body.frequency !== undefined) {
      update.frequency = SweepingRoad.normalizeFrequency(body.frequency);
    }
    if (body.assignedMachineId !== undefined) {
      update.assignedMachineId = String(body.assignedMachineId || '').trim();
    }
    if (body.status !== undefined) {
      update.status = SweepingRoad.normalizeStatus(body.status);
    }

    let gpsPoints = current.gpsPoints;
    if (body.gpsPoints !== undefined) {
      gpsPoints = normalizeGpsPoints(body.gpsPoints);
      if (gpsPoints.length < 2) {
        const err = new Error('At least 2 GPS points are required');
        err.status = 400;
        throw err;
      }
      update.gpsPoints = gpsPoints;
      update.lengthKm = pathLengthKm(gpsPoints);
    }

    await col.updateOne({ _id: oid }, { $set: update });
    const doc = await col.findOne({ _id: oid });
    return SweepingRoad.serialize(doc);
  }

  static async deactivate(id) {
    return SweepingRoad.update(id, { status: 'Inactive' });
  }
}

SweepingRoad.STATUSES = STATUSES;
SweepingRoad.FREQUENCIES = FREQUENCIES;

module.exports = SweepingRoad;