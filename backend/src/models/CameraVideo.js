const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');
const { concatVideoFiles, withTempDir, withChannelLock } = require('../utils/videoConcat');

const COLLECTION = 'camera_videos';
const BUCKET_NAME = 'camera_videos_fs';
const compactCooldownMs = 90 * 1000;
const compactCooldown = new Map();

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
    await col.createIndex(
      { machineId: 1, cameraChannel: 1 },
      {
        unique: true,
        partialFilterExpression: { cameraChannel: { $type: 'string' } },
      }
    );
    await col.createIndex({ gridFsId: 1 }, { unique: true });
  }

  static normalizeChannel(raw) {
    const s = String(raw ?? '').trim().toUpperCase();
    if (!s) return null;
    const m = s.match(/^CH?(\d+)$/);
    if (m) return `CH${m[1]}`;
    if (s.startsWith('CH')) return s;
    return s;
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
      updated_at: doc.updated_at || doc.created_at,
    };
  }

  static downloadGridFsToFile(gridFsId, destPath) {
    const bucket = getBucket();
    return new Promise((resolve, reject) => {
      const stream = bucket.openDownloadStream(new ObjectId(String(gridFsId)));
      const out = fs.createWriteStream(destPath);
      stream.pipe(out);
      out.on('finish', resolve);
      stream.on('error', reject);
      out.on('error', reject);
    });
  }

  static uploadFileToGridFs(filePath, safeName, mimeType, metadata) {
    const bucket = getBucket();
    const sizeBytes = fs.statSync(filePath).size;
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(safeName, {
        contentType: mimeType || 'video/mp4',
        metadata,
      });
      fs.createReadStream(filePath)
        .pipe(uploadStream)
        .on('error', reject);
      uploadStream.on('finish', () => resolve({ gridFsId: uploadStream.id, sizeBytes }));
      uploadStream.on('error', reject);
    });
  }

  static async removeDuplicateChannelDocs(col, bucket, machineId, channel) {
    const rows = await col
      .find({ machineId, cameraChannel: channel })
      .sort({ updated_at: -1, created_at: -1 })
      .toArray();
    if (rows.length <= 1) return rows[0] || null;
    const keep = rows[0];
    for (const dup of rows.slice(1)) {
      try {
        await bucket.delete(dup.gridFsId);
      } catch {
        /* missing file */
      }
      await col.deleteOne({ _id: dup._id });
    }
    return keep;
  }

  static async upsertFromBuffer({
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
    const safeName = String(filename || 'recording.mp4').replace(/[^\w.\-]+/g, '_');
    const mid = String(machineId || 'unknown').trim() || 'unknown';
    let ch = this.normalizeChannel(cameraChannel);
    if (!ch && title) {
      const m = String(title).match(/\bCH?\s*(\d+)\b/i);
      if (m) ch = `CH${m[1]}`;
    }
    const col = db.collection(COLLECTION);
    const segDur = Number.isFinite(Number(durationSec)) ? Number(durationSec) : null;
    const mime = mimeType || 'video/mp4';
    const displayTitle = ch || String(title || safeName).trim() || safeName;

    const uploadBufferOnly = async () => {
      const tmp = await withTempDir(async (dir) => {
        const p = path.join(dir, safeName);
        fs.writeFileSync(p, buffer);
        return this.uploadFileToGridFs(p, safeName, mime, {
          machineId: mid,
          title: displayTitle,
          cameraChannel: ch,
        });
      });
      return tmp;
    };

    if (!ch) {
      const { gridFsId, sizeBytes } = await uploadBufferOnly();
      const meta = {
        machineId: mid,
        title: displayTitle,
        cameraChannel: null,
        filename: safeName,
        mimeType: mime,
        sizeBytes,
        durationSec: segDur,
        gridFsId,
        created_at: now,
        updated_at: now,
      };
      const result = await col.insertOne(meta);
      return { ...meta, _id: result.insertedId };
    }

    return withChannelLock(`${mid}|${ch}`, async () => {
      let existing = await this.removeDuplicateChannelDocs(col, bucket, mid, ch);

      if (!existing) {
        const { gridFsId, sizeBytes } = await uploadBufferOnly();
        const meta = {
          machineId: mid,
          title: displayTitle,
          cameraChannel: ch,
          filename: safeName,
          mimeType: mime,
          sizeBytes,
          durationSec: segDur,
          gridFsId,
          created_at: now,
          updated_at: now,
        };
        const result = await col.insertOne(meta);
        return { ...meta, _id: result.insertedId };
      }

      const prevDur = Number(existing.durationSec) || 0;
      const addDur = segDur != null ? segDur : 10;
      const totalDur = prevDur + addDur;

      const merged = await withTempDir(async (dir) => {
        const oldPath = path.join(dir, 'existing.mp4');
        const segPath = path.join(dir, 'segment.mp4');
        const outPath = path.join(dir, 'merged.mp4');
        await this.downloadGridFsToFile(existing.gridFsId, oldPath);
        fs.writeFileSync(segPath, buffer);
        await concatVideoFiles([oldPath, segPath], outPath);
        return this.uploadFileToGridFs(outPath, `${ch}_rolling.mp4`, mime, {
          machineId: mid,
          title: displayTitle,
          cameraChannel: ch,
        });
      });

      try {
        await bucket.delete(existing.gridFsId);
      } catch {
        /* old file may be missing */
      }

      const metaFields = {
        title: displayTitle,
        cameraChannel: ch,
        filename: `${ch}_rolling.mp4`,
        mimeType: mime,
        sizeBytes: merged.sizeBytes,
        durationSec: totalDur,
        gridFsId: merged.gridFsId,
        updated_at: now,
      };

      await col.updateOne({ _id: existing._id }, { $set: metaFields });
      return col.findOne({ _id: existing._id });
    });
  }

  /** @deprecated use upsertFromBuffer — kept for tests */
  static async uploadFromBuffer(opts) {
    return this.upsertFromBuffer(opts);
  }

  static async findAll({ machineId, limit = 50 } = {}) {
    const db = getDatabase();
    const filter = {};
    if (machineId) filter.machineId = String(machineId).trim();
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return db
      .collection(COLLECTION)
      .find(filter)
      .sort({ updated_at: -1, created_at: -1 })
      .limit(cap)
      .toArray();
  }

  static inferChannel(doc) {
    const ch = this.normalizeChannel(doc?.cameraChannel);
    if (ch) return ch;
    const t = String(doc?.title || doc?.filename || '');
    const m = t.match(/\bCH?\s*(\d+)\b/i);
    if (m) return `CH${m[1]}`;
    return null;
  }

  /** Prefer merged rolling file / longest recording over newest tiny segment. */
  static slotScore(row) {
    const size = Number(row?.sizeBytes) || 0;
    const dur = Number(row?.durationSec) || 0;
    const rolling = String(row?.filename || '').includes('_rolling') ? 1 : 0;
    const t = new Date(row?.updated_at || row?.created_at || 0).getTime();
    return rolling * 1e15 + size * 1e6 + dur * 1e3 + t;
  }

  static pickBestRow(prev, row) {
    if (!prev) return row;
    return this.slotScore(row) >= this.slotScore(prev) ? row : prev;
  }

  /** One row per machine + camera channel (best recording wins). */
  static pickLatestPerChannel(rows) {
    const byKey = new Map();
    for (const row of rows || []) {
      const ch = this.inferChannel(row);
      const key = ch ? `${row.machineId}|${ch}` : String(row._id);
      byKey.set(key, this.pickBestRow(byKey.get(key), row));
    }
    const out = [...byKey.values()];
    out.sort((a, b) => {
      const na = parseInt(String(this.inferChannel(a) || '').replace(/\D/g, ''), 10) || 999;
      const nb = parseInt(String(this.inferChannel(b) || '').replace(/\D/g, ''), 10) || 999;
      const ma = String(a.machineId || '').localeCompare(String(b.machineId || ''));
      if (ma !== 0) return ma;
      return na - nb;
    });
    return out;
  }

  static async findAllRaw({ machineId, limit = 500 } = {}) {
    const db = getDatabase();
    const filter = {};
    if (machineId) filter.machineId = String(machineId).trim();
    const cap = Math.min(Math.max(Number(limit) || 500, 1), 500);
    return db.collection(COLLECTION).find(filter).sort({ created_at: 1 }).limit(cap).toArray();
  }

  static groupRowsByChannel(rows) {
    const groups = new Map();
    for (const row of rows || []) {
      const ch = this.inferChannel(row);
      if (!ch) continue;
      const mid = String(row.machineId || '').trim() || 'unknown';
      const key = `${mid}|${ch}`;
      if (!groups.has(key)) groups.set(key, { machineId: mid, channel: ch, rows: [] });
      groups.get(key).rows.push(row);
    }
    return groups;
  }

  static async mergeChannelSegments(machineId, channel, segments) {
    const mid = String(machineId || '').trim();
    const ch = this.normalizeChannel(channel);
    if (!mid || !ch || !segments?.length) return null;
    if (segments.length === 1 && String(segments[0].filename || '').includes('_rolling')) {
      return segments[0];
    }

    const db = getDatabase();
    const bucket = getBucket();
    const col = db.collection(COLLECTION);
    const lockKey = `${mid}|${ch}`;

    return withChannelLock(lockKey, async () => {
      const sorted = [...segments].sort(
        (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      );
      const keep = sorted[0];
      const now = new Date();

      const merged = await withTempDir(async (dir) => {
        const paths = [];
        for (let i = 0; i < sorted.length; i += 1) {
          const segPath = path.join(dir, `seg_${i}.mp4`);
          try {
            await this.downloadGridFsToFile(sorted[i].gridFsId, segPath);
            if (fs.statSync(segPath).size > 500) paths.push(segPath);
          } catch {
            /* skip missing */
          }
        }
        if (paths.length === 0) return null;
        const outPath = path.join(dir, `${ch}_rolling.mp4`);
        await concatVideoFiles(paths, outPath);
        const totalDur = sorted.reduce((acc, r) => acc + (Number(r.durationSec) || 10), 0);
        const uploaded = await this.uploadFileToGridFs(outPath, `${ch}_rolling.mp4`, 'video/mp4', {
          machineId: mid,
          title: ch,
          cameraChannel: ch,
        });
        return { ...uploaded, totalDur };
      });

      if (!merged) return keep;

      for (const seg of sorted) {
        if (String(seg._id) !== String(keep._id)) {
          try {
            await bucket.delete(seg.gridFsId);
          } catch {
            /* ignore */
          }
          await col.deleteOne({ _id: seg._id });
        }
      }
      try {
        await bucket.delete(keep.gridFsId);
      } catch {
        /* ignore */
      }

      const meta = {
        title: ch,
        cameraChannel: ch,
        filename: `${ch}_rolling.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: merged.sizeBytes,
        durationSec: merged.totalDur,
        gridFsId: merged.gridFsId,
        updated_at: now,
      };
      await col.updateOne({ _id: keep._id }, { $set: meta });
      return col.findOne({ _id: keep._id });
    });
  }

  static async compactSlots({ machineId, force = false } = {}) {
    const rows = await this.findAllRaw({ machineId, limit: 500 });
    const groups = this.groupRowsByChannel(rows);
    const merged = [];

    for (const [key, group] of groups) {
      if (group.rows.length <= 1) continue;
      const last = compactCooldown.get(key) || 0;
      if (!force && Date.now() - last < compactCooldownMs) continue;
      try {
        const doc = await this.mergeChannelSegments(group.machineId, group.channel, group.rows);
        if (doc) merged.push(this.serialize(doc));
        compactCooldown.set(key, Date.now());
      } catch (err) {
        console.warn(`[CameraVideo] compact ${key}:`, err.message);
      }
    }
    return merged;
  }

  static async findForDisplay({ machineId, limit = 50, autoCompact = true } = {}) {
    if (autoCompact) {
      await this.compactSlots({ machineId }).catch((e) => {
        console.warn('[CameraVideo] autoCompact:', e.message);
      });
    }
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const rows = await this.findAll({ machineId, limit: 200 });
    const grouped = this.pickLatestPerChannel(rows);
    return grouped.slice(0, machineId ? Math.min(cap, 8) : Math.min(grouped.length, cap));
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
