/** Append-only video archive (Pi → POST /api/saved-videos). No replace / merge. */
const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');
const { emitSavedVideoNew } = require('../realtime');

const COLLECTION = 'saved_videos';
const BUCKET_NAME = 'saved_videos_fs';

const minBytes = () =>
  Math.max(4096, Number(process.env.SAVED_VIDEO_MIN_BYTES) || 12 * 1024);

const getBucket = () => {
  const { GridFSBucket } = require('mongodb');
  return new GridFSBucket(getDatabase(), { bucketName: BUCKET_NAME });
};

class SavedVideo {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    const safe = async (fn) => {
      try {
        await fn();
      } catch (e) {
        console.warn('[SavedVideo] index:', e.message);
      }
    };
    await safe(() => col.createIndex({ machineId: 1, created_at: -1 }));
    await safe(() => col.createIndex({ created_at: -1 }));
    await safe(() => col.createIndex({ source: 1, created_at: -1 }));
    await safe(() => col.createIndex({ gridFsId: 1 }, { unique: true }));
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      machineId: doc.machineId,
      title: doc.title,
      cameraChannel: doc.cameraChannel || null,
      source: doc.source || 'ahd',
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      durationSec: doc.durationSec ?? null,
      created_at: doc.created_at,
    };
  }

  static notifyRealtime(doc) {
    emitSavedVideoNew(doc);
  }

  static async insertFromBuffer({
    buffer,
    filename,
    mimeType,
    machineId,
    title,
    cameraChannel,
    durationSec,
    source,
  }) {
    const size = buffer?.length || 0;
    const minB = minBytes();
    if (size < minB) {
      const err = new Error(`video too small (${size} B, need ${minB})`);
      err.code = 'VIDEO_TOO_SMALL';
      throw err;
    }

    const db = getDatabase();
    const bucket = getBucket();
    const now = new Date();
    const safeName = String(filename || 'clip.mp4').replace(/[^\w.\-]+/g, '_');
    const mid = String(machineId || 'unknown').trim() || 'unknown';
    const mime = mimeType || 'video/mp4';
    const ch = cameraChannel ? String(cameraChannel).trim() : null;
    const src = String(source || 'ahd').trim().toLowerCase() || 'ahd';
    const segDur = Number.isFinite(Number(durationSec)) ? Number(durationSec) : null;
    const displayTitle = String(title || safeName).trim() || safeName;

    const gridFsId = new ObjectId();
    await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStreamWithId(gridFsId, safeName, {
        contentType: mime,
        metadata: { machineId: mid, source: src, cameraChannel: ch },
      });
      upload.on('error', reject);
      upload.on('finish', resolve);
      upload.end(buffer);
    });

    const meta = {
      machineId: mid,
      title: displayTitle,
      cameraChannel: ch,
      source: src,
      filename: safeName,
      mimeType: mime,
      sizeBytes: size,
      durationSec: segDur,
      gridFsId,
      created_at: now,
    };
    const result = await db.collection(COLLECTION).insertOne(meta);
    return { ...meta, _id: result.insertedId };
  }

  static async list({ machineId, source, limit = 100, skip = 0 } = {}) {
    const col = getDatabase().collection(COLLECTION);
    const minB = minBytes();
    const q = { sizeBytes: { $gte: minB } };
    if (machineId) q.machineId = String(machineId).trim();
    if (source) q.source = String(source).trim().toLowerCase();

    const lim = Math.min(200, Math.max(1, Number(limit) || 100));
    const sk = Math.max(0, Number(skip) || 0);
    const [rows, total] = await Promise.all([
      col.find(q).sort({ created_at: -1 }).skip(sk).limit(lim).toArray(),
      col.countDocuments(q),
    ]);
    return { rows, total, limit: lim, skip: sk };
  }

  static async findById(id) {
    try {
      return await getDatabase()
        .collection(COLLECTION)
        .findOne({ _id: new ObjectId(String(id)) });
    } catch {
      return null;
    }
  }

  static async getGridFsFile(gridFsId) {
    const bucket = getBucket();
    try {
      return await bucket.find({ _id: gridFsId }).next();
    } catch {
      return null;
    }
  }
}

module.exports = SavedVideo;
