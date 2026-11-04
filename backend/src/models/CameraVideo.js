const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');

const COLLECTION = 'camera_videos';
const BUCKET_NAME = 'camera_videos_fs';

const getBucket = () => {
  const { GridFSBucket } = require('mongodb');
  return new GridFSBucket(getDatabase(), { bucketName: BUCKET_NAME });
};

class CameraVideo {
  static collection = COLLECTION;

  static async ensureIndexes() {
    const db = getDatabase();
    const col = db.collection(COLLECTION);
    await col.createIndex({ machineId: 1, created_at: -1 });
    await col.createIndex({ created_at: -1 });
    await col.createIndex({ gridFsId: 1 }, { unique: true });
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      machineId: doc.machineId || '',
      title: doc.title || '',
      cameraChannel: doc.cameraChannel ?? null,
      filename: doc.filename || '',
      mimeType: doc.mimeType || 'video/webm',
      sizeBytes: doc.sizeBytes || 0,
      durationSec: doc.durationSec ?? null,
      created_at: doc.created_at,
    };
  }

  static async uploadFromBuffer({
    buffer,
    filename,
    mimeType,
    machineId,
    title,
    cameraChannel,
    durationSec,
  }) {
    const db = getDatabase();
    const bucket = getBucket();
    const now = new Date();
    const safeName = String(filename || 'recording.webm').replace(/[^\w.\-]+/g, '_');
    const mid = String(machineId || 'unknown').trim() || 'unknown';

    const uploadStream = bucket.openUploadStream(safeName, {
      contentType: mimeType || 'video/webm',
      metadata: { machineId: mid, title: title || safeName },
    });

    await new Promise((resolve, reject) => {
      uploadStream.on('finish', resolve);
      uploadStream.on('error', reject);
      uploadStream.end(buffer);
    });

    const meta = {
      machineId: mid,
      title: String(title || safeName).trim() || safeName,
      cameraChannel:
        cameraChannel != null && String(cameraChannel).trim() !== ''
          ? String(cameraChannel).trim()
          : null,
      filename: safeName,
      mimeType: mimeType || 'video/webm',
      sizeBytes: buffer.length,
      durationSec: Number.isFinite(Number(durationSec)) ? Number(durationSec) : null,
      gridFsId: uploadStream.id,
      created_at: now,
    };

    const result = await db.collection(COLLECTION).insertOne(meta);
    return { ...meta, _id: result.insertedId };
  }

  static async findAll({ machineId, limit = 50 } = {}) {
    const db = getDatabase();
    const filter = {};
    if (machineId) filter.machineId = String(machineId).trim();
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return db
      .collection(COLLECTION)
      .find(filter)
      .sort({ created_at: -1 })
      .limit(cap)
      .toArray();
  }

  static async findById(id) {
    const db = getDatabase();
    let oid;
    try {
      oid = new ObjectId(String(id));
    } catch {
      return null;
    }
    return db.collection(COLLECTION).findOne({ _id: oid });
  }

  static async getGridFsFile(gridFsId) {
    const bucket = getBucket();
    let oid;
    try {
      oid = new ObjectId(String(gridFsId));
    } catch {
      return null;
    }
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

  static async deleteById(id) {
    const doc = await this.findById(id);
    if (!doc) return false;
    const bucket = getBucket();
    await bucket.delete(doc.gridFsId);
    const db = getDatabase();
    await db.collection(COLLECTION).deleteOne({ _id: doc._id });
    return true;
  }
}

module.exports = CameraVideo;
