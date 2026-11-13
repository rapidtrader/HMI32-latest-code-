const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');

const COLLECTION = 'saved_videos';
const BUCKET_NAME = 'saved_videos_fs';

const getBucket = () => {
  const { GridFSBucket } = require('mongodb');
  return new GridFSBucket(getDatabase(), { bucketName: BUCKET_NAME });
};

class SavedVideo {
  static collection = COLLECTION;

  static async ensureIndexes() {
    const db = getDatabase();
    const col = db.collection(COLLECTION);
    await col.createIndex({ machineId: 1, created_at: -1 });
    await col.createIndex({ created_at: -1 });
    await col.createIndex({ cameraChannel: 1, created_at: -1 });
    await col.createIndex({ gridFsId: 1 }, { unique: true });
  }

  static normalizeChannel(channel) {
    const raw = String(channel || '').trim().toUpperCase();
    if (!raw) return null;
    const m = raw.match(/^CH?(\d+)$/);
    if (m) return `CH${m[1]}`;
    return raw;
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      machineId: doc.machineId || '',
      title: doc.title || '',
      cameraChannel: doc.cameraChannel ?? null,
      source: doc.source || 'ahd',
      filename: doc.filename || '',
      mimeType: doc.mimeType || 'video/mp4',
      sizeBytes: Number(doc.sizeBytes) || 0,
      durationSec: Number(doc.durationSec) || null,
      created_at: doc.created_at,
    };
  }

  static uploadBufferToGridFs(buffer, safeName, mimeType, metadata) {
    const bucket = getBucket();
    const sizeBytes = buffer.length;
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(safeName, {
        contentType: mimeType || 'video/mp4',
        metadata,
      });
      uploadStream.end(buffer);
      uploadStream.on('finish', () => resolve({ gridFsId: uploadStream.id, sizeBytes }));
      uploadStream.on('error', reject);
    });
  }

  /** Append-only archive — never overwrites or deletes existing rows. */
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
    const db = getDatabase();
    const now = new Date();
    const safeName = String(filename || 'recording.mp4').replace(/[^\w.\-]+/g, '_');
    const mid = String(machineId || 'unknown').trim() || 'unknown';
    const ch = this.normalizeChannel(cameraChannel);
    const mime = mimeType || 'video/mp4';
    const segDur = Number.isFinite(Number(durationSec)) ? Number(durationSec) : null;
    const src = String(source || 'ahd').trim().toLowerCase() || 'ahd';
    const displayTitle = String(title || '').trim() || ch || safeName;

    const { gridFsId, sizeBytes } = await this.uploadBufferToGridFs(buffer, safeName, mime, {
      machineId: mid,
      title: displayTitle,
      cameraChannel: ch,
      source: src,
    });

    const meta = {
      machineId: mid,
      title: displayTitle,
      cameraChannel: ch,
      source: src,
      filename: safeName,
      mimeType: mime,
      sizeBytes,
      durationSec: segDur,
      gridFsId,
      created_at: now,
    };
    const result = await db.collection(COLLECTION).insertOne(meta);
    return { ...meta, _id: result.insertedId };
  }

  static async findById(id) {
    const db = getDatabase();
    return db.collection(COLLECTION).findOne({ _id: new ObjectId(String(id)) });
  }

  static async list({ machineId, source, limit = 100, skip = 0 } = {}) {
    const db = getDatabase();
    const query = {};
    const mid = String(machineId || '').trim();
    if (mid) query.machineId = mid;
    const src = String(source || '').trim().toLowerCase();
    if (src) query.source = src;
    const lim = Math.min(500, Math.max(1, Number(limit) || 100));
    const sk = Math.max(0, Number(skip) || 0);
    const col = db.collection(COLLECTION);
    const [rows, total] = await Promise.all([
      col.find(query).sort({ created_at: -1 }).skip(sk).limit(lim).toArray(),
      col.countDocuments(query),
    ]);
    return { rows, total, limit: lim, skip: sk };
  }

  static async getGridFsFile(gridFsId) {
    const bucket = getBucket();
    const oid = new ObjectId(String(gridFsId));
    const files = await bucket.find({ _id: oid }).limit(1).toArray();
    return files[0] || null;
  }

  static openDownloadStream(gridFsId, range) {
    const bucket = getBucket();
    const opts = {};
    if (range && Number.isFinite(range.start)) {
      opts.start = range.start;
      if (Number.isFinite(range.end)) opts.end = range.end;
    }
    return bucket.openDownloadStream(new ObjectId(String(gridFsId)), opts);
  }

  static notifyRealtime(doc) {
    if (!doc) return;
    try {
      require('../realtime').emitSavedVideoNew(doc);
    } catch {
      /* socket not ready */
    }
  }
}

module.exports = SavedVideo;
