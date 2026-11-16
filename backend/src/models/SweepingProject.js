const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');

const COLLECTION = 'sweeping_projects';
const STATUSES = ['Active', 'Inactive', 'Completed'];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class SweepingProject {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    try {
      await col.createIndex({ projectId: 1 }, { unique: true });
      await col.createIndex({ created_at: -1 });
      await col.createIndex({ status: 1, created_at: -1 });
    } catch (e) {
      console.warn('[SweepingProject] index:', e.message);
    }
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      projectId: doc.projectId,
      projectName: doc.projectName,
      status: doc.status,
      speedLimitKmh: doc.speedLimitKmh,
      completionPct: doc.completionPct,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  static normalizeStatus(status) {
    const s = String(status || 'Active').trim();
    return STATUSES.includes(s) ? s : 'Active';
  }

  static async list({ search, status, page = 1, limit = 20 } = {}) {
    const col = getDatabase().collection(COLLECTION);
    const filter = {};
    const q = String(search || '').trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ projectId: rx }, { projectName: rx }];
    }
    const st = String(status || '').trim();
    if (st && st !== 'all') {
      filter.status = st;
    }
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      col.find(filter).sort({ created_at: -1 }).skip(skip).limit(safeLimit).toArray(),
      col.countDocuments(filter),
    ]);

    return {
      rows: rows.map(SweepingProject.serialize),
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
    return SweepingProject.serialize(doc);
  }

  static async create(body) {
    const projectId = String(body.projectId || '').trim();
    const projectName = String(body.projectName || '').trim();
    if (!projectId || !projectName) {
      const err = new Error('projectId and projectName are required');
      err.status = 400;
      throw err;
    }

    const col = getDatabase().collection(COLLECTION);
    const existing = await col.findOne({ projectId });
    if (existing) {
      const err = new Error('Project ID already exists');
      err.status = 409;
      throw err;
    }

    const now = new Date();
    const speedLimitKmh = Math.max(0, Number(body.speedLimitKmh) || 0);
    let completionPct = Number(body.completionPct);
    if (!Number.isFinite(completionPct)) completionPct = 0;
    completionPct = Math.min(100, Math.max(0, completionPct));

    const doc = {
      projectId,
      projectName,
      status: SweepingProject.normalizeStatus(body.status),
      speedLimitKmh,
      completionPct,
      created_at: now,
      updated_at: now,
    };
    const result = await col.insertOne(doc);
    return SweepingProject.serialize({ ...doc, _id: result.insertedId });
  }

  static async update(id, body) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      const err = new Error('Invalid project id');
      err.status = 400;
      throw err;
    }

    const current = await col.findOne({ _id: oid });
    if (!current) {
      const err = new Error('Project not found');
      err.status = 404;
      throw err;
    }

    const update = { updated_at: new Date() };

    if (body.projectId !== undefined) {
      const projectId = String(body.projectId || '').trim();
      if (!projectId) {
        const err = new Error('projectId cannot be empty');
        err.status = 400;
        throw err;
      }
      if (projectId !== current.projectId) {
        const clash = await col.findOne({ projectId, _id: { $ne: oid } });
        if (clash) {
          const err = new Error('Project ID already exists');
          err.status = 409;
          throw err;
        }
      }
      update.projectId = projectId;
    }

    if (body.projectName !== undefined) {
      const projectName = String(body.projectName || '').trim();
      if (!projectName) {
        const err = new Error('projectName cannot be empty');
        err.status = 400;
        throw err;
      }
      update.projectName = projectName;
    }

    if (body.status !== undefined) {
      update.status = SweepingProject.normalizeStatus(body.status);
    }

    if (body.speedLimitKmh !== undefined) {
      update.speedLimitKmh = Math.max(0, Number(body.speedLimitKmh) || 0);
    }

    if (body.completionPct !== undefined) {
      let completionPct = Number(body.completionPct);
      if (!Number.isFinite(completionPct)) completionPct = 0;
      update.completionPct = Math.min(100, Math.max(0, completionPct));
    }

    await col.updateOne({ _id: oid }, { $set: update });
    const doc = await col.findOne({ _id: oid });
    return SweepingProject.serialize(doc);
  }

  static async remove(id) {
    const col = getDatabase().collection(COLLECTION);
    let oid;
    try {
      oid = new ObjectId(id);
    } catch {
      const err = new Error('Invalid project id');
      err.status = 400;
      throw err;
    }
    const result = await col.deleteOne({ _id: oid });
    if (result.deletedCount === 0) {
      const err = new Error('Project not found');
      err.status = 404;
      throw err;
    }
    return { deleted: true };
  }
}

SweepingProject.STATUSES = STATUSES;

module.exports = SweepingProject;