const fs = require('fs');
const os = require('os');
const path = require('path');
const { ObjectId } = require('mongodb');
const { getDatabase } = require('../mongodb');
const { concatVideoFiles, withTempDir, withChannelLock } = require('../utils/videoConcat');

const COLLECTION = 'camera_videos';
const PENDING_COLLECTION = 'camera_video_pending';
const BUCKET_NAME = 'camera_videos_fs';
const compactCooldownMs = 90 * 1000;
const compactCooldown = new Map();
const mergeDebounceMs = Math.max(
  200,
  Number(process.env.CAMERA_VIDEO_MERGE_DEBOUNCE_MS) || 450
);
const mergeBatchSize = Math.min(
  32,
  Math.max(1, Number(process.env.CAMERA_VIDEO_MERGE_BATCH) || 10)
);
const faststartMaxBytes =
  Math.max(5, Number(process.env.CAMERA_VIDEO_FASTSTART_MAX_MB) || 32) * 1024 * 1024;
const rollingCacheDir =
  process.env.CAMERA_VIDEO_CACHE_DIR || path.join(os.tmpdir(), 'hmi32-roll-cache');
const rollingCacheMeta = new Map();
const gridFsDeleteTimers = new Map();
const gridFsDeleteDelayMs = Math.max(
  60_000,
  Number(process.env.CAMERA_VIDEO_GRIDFS_DELETE_DELAY_MS) || 180_000
);
const mergeDebounceTimers = new Map();
const mergeRunning = new Set();

const getBucket = () => {
  const { GridFSBucket } = require('mongodb');
  return new GridFSBucket(getDatabase(), { bucketName: BUCKET_NAME });
};

class CameraVideo {
  static collection = COLLECTION;

  static async ensureIndexes() {
    const db = getDatabase();
    const col = db.collection(COLLECTION);
    const safe = async (fn) => {
      try {
        await fn();
      } catch (e) {
        console.warn('[CameraVideo] index:', e.message);
      }
    };
    await safe(() => col.createIndex({ machineId: 1, created_at: -1 }));
    await safe(() => col.createIndex({ created_at: -1 }));
    await safe(() =>
      col.createIndex(
        { machineId: 1, cameraChannel: 1 },
        {
          unique: true,
          partialFilterExpression: { cameraChannel: { $type: 'string' } },
        }
      )
    );
    await safe(() => col.createIndex({ gridFsId: 1 }, { unique: true }));
    const pend = db.collection(PENDING_COLLECTION);
    await safe(() => pend.createIndex({ machineId: 1, cameraChannel: 1, created_at: 1 }));
  }

  static rollingCacheKey(machineId, channel) {
    const mid = String(machineId || '').trim();
    const ch = this.normalizeChannel(channel);
    return `${mid}|${ch}`;
  }

  static ensureRollingCacheDir() {
    fs.mkdirSync(rollingCacheDir, { recursive: true });
  }

  static async materializeRollingMain(cacheKey, gridFsId) {
    const id = String(gridFsId);
    const hit = rollingCacheMeta.get(cacheKey);
    if (hit && hit.gridFsId === id && fs.existsSync(hit.filePath)) {
      return hit.filePath;
    }
    this.ensureRollingCacheDir();
    const safe = cacheKey.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const cachePath = path.join(rollingCacheDir, `${safe}.mp4`);
    await this.downloadGridFsToFile(gridFsId, cachePath);
    rollingCacheMeta.set(cacheKey, { gridFsId: id, filePath: cachePath });
    return cachePath;
  }

  static rememberRollingMain(cacheKey, gridFsId, mergedPath) {
    this.ensureRollingCacheDir();
    const safe = cacheKey.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const cachePath = path.join(rollingCacheDir, `${safe}.mp4`);
    if (path.resolve(mergedPath) !== path.resolve(cachePath)) {
      fs.copyFileSync(mergedPath, cachePath);
    }
    rollingCacheMeta.set(cacheKey, { gridFsId: String(gridFsId), filePath: cachePath });
  }

  static dropRollingCache(cacheKey) {
    const hit = rollingCacheMeta.get(cacheKey);
    if (hit) {
      try {
        fs.unlinkSync(hit.filePath);
      } catch {
        /* ignore */
      }
      rollingCacheMeta.delete(cacheKey);
    }
  }

  /** Keep old GridFS blobs during active HTTP streams (avoid ECONNRESET mid-play). */
  static scheduleGridFsDelete(gridFsId) {
    if (!gridFsId) return;
    const id = String(gridFsId);
    const prev = gridFsDeleteTimers.get(id);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      gridFsDeleteTimers.delete(id);
      try {
        getBucket()
          .delete(new ObjectId(id))
          .catch(() => {});
      } catch {
        /* invalid id */
      }
    }, gridFsDeleteDelayMs);
    gridFsDeleteTimers.set(id, timer);
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

  static scheduleBackgroundMerge(machineId, channel) {
    const mid = String(machineId || '').trim();
    const ch = this.normalizeChannel(channel);
    if (!mid || !ch) return;
    const key = `${mid}|${ch}`;
    if (mergeDebounceTimers.has(key)) clearTimeout(mergeDebounceTimers.get(key));
    mergeDebounceTimers.set(
      key,
      setTimeout(() => {
        mergeDebounceTimers.delete(key);
        this.runBackgroundMerge(mid, ch).catch((e) =>
          console.warn(`[CameraVideo] background merge ${key}:`, e.message)
        );
      }, mergeDebounceMs)
    );
  }

  static async runBackgroundMerge(machineId, channel) {
    const mid = String(machineId || '').trim();
    const ch = this.normalizeChannel(channel);
    const key = `${mid}|${ch}`;
    if (mergeRunning.has(key)) {
      this.scheduleBackgroundMerge(mid, ch);
      return;
    }
    mergeRunning.add(key);
    try {
      let loops = 0;
      while (loops < 24) {
        loops += 1;
        const doc = await withChannelLock(key, () => this.flushPendingSegments(mid, ch));
        if (doc) this.notifyRealtime(doc);
        const db = getDatabase();
        const left = await db.collection(PENDING_COLLECTION).countDocuments({
          machineId: mid,
          cameraChannel: ch,
        });
        if (!left) break;
      }
    } finally {
      mergeRunning.delete(key);
    }
  }

  static async flushPendingSegments(machineId, channel) {
    const db = getDatabase();
    const bucket = getBucket();
    const col = db.collection(COLLECTION);
    const pendCol = db.collection(PENDING_COLLECTION);
    const mid = String(machineId || '').trim();
    const ch = this.normalizeChannel(channel);
    const pending = await pendCol
      .find({ machineId: mid, cameraChannel: ch })
      .sort({ created_at: 1 })
      .toArray();
    if (!pending.length) return null;

    let existing = await col.findOne({ machineId: mid, cameraChannel: ch });
    const now = new Date();

    if (!existing) {
      const first = pending.shift();
      const meta = {
        machineId: mid,
        title: ch,
        cameraChannel: ch,
        filename: `${ch}_rolling.mp4`,
        mimeType: first.mimeType || 'video/mp4',
        sizeBytes: first.sizeBytes || 0,
        durationSec: first.durationSec,
        gridFsId: first.gridFsId,
        created_at: now,
        updated_at: now,
      };
      const ins = await col.insertOne(meta);
      existing = { ...meta, _id: ins.insertedId };
      await pendCol.deleteOne({ _id: first._id });
      this.notifyRealtime(existing);
    }

    if (!pending.length) return existing;

    const batch = pending.slice(0, mergeBatchSize);
    const addDur = batch.reduce((acc, p) => acc + (Number(p.durationSec) || 10), 0);
    const prevDur = Number(existing.durationSec) || 0;
    const cacheKey = this.rollingCacheKey(mid, ch);

    const merged = await withTempDir(async (dir) => {
      const paths = [];
      const mainPath = await this.materializeRollingMain(cacheKey, existing.gridFsId);
      if (fs.statSync(mainPath).size > 500) paths.push(mainPath);

      const segPaths = await Promise.all(
        batch.map(async (seg, i) => {
          const pth = path.join(dir, `pending_${i}.mp4`);
          await this.downloadGridFsToFile(seg.gridFsId, pth);
          return pth;
        })
      );
      for (const pth of segPaths) {
        if (fs.existsSync(pth) && fs.statSync(pth).size > 500) paths.push(pth);
      }
      if (paths.length === 0) return null;
      const outPath = path.join(dir, `${ch}_rolling.mp4`);
      const estBytes = paths.reduce((acc, p) => acc + fs.statSync(p).size, 0);
      await concatVideoFiles(paths, outPath, { faststart: estBytes <= faststartMaxBytes });
      const uploaded = await this.uploadFileToGridFs(outPath, `${ch}_rolling.mp4`, existing.mimeType || 'video/mp4', {
        machineId: mid,
        title: ch,
        cameraChannel: ch,
      });
      this.rememberRollingMain(cacheKey, uploaded.gridFsId, outPath);
      return uploaded;
    });

    if (!merged) return existing;

    const totalDur = this.estimateDurationSec(merged.sizeBytes, prevDur + addDur);

    try {
      this.scheduleGridFsDelete(existing.gridFsId);
    } catch {
      /* ignore */
    }
    for (const p of batch) {
      try {
        await bucket.delete(p.gridFsId);
      } catch {
        /* ignore */
      }
      await pendCol.deleteOne({ _id: p._id });
    }

    await col.updateOne(
      { _id: existing._id },
      {
        $set: {
          filename: `${ch}_rolling.mp4`,
          sizeBytes: merged.sizeBytes,
          durationSec: totalDur,
          gridFsId: merged.gridFsId,
          updated_at: now,
        },
      }
    );
    const updated = await col.findOne({ _id: existing._id });
    this.notifyRealtime(updated);
    return updated;
  }

  static normalizeChannel(raw) {
    const s = String(raw ?? '').trim().toUpperCase();
    if (!s) return null;
    const m = s.match(/^CH?(\d+)$/);
    if (m) return `CH${m[1]}`;
    if (s.startsWith('CH')) return s;
    return s;
  }

  static estimateDurationSec(sizeBytes, reportedSec) {
    const bytes = Number(sizeBytes) || 0;
    const reported = Number(reportedSec);
    if (bytes < 500) return Number.isFinite(reported) ? Math.min(reported, 15) : null;
    // Pi preview ~30–50 KB per 10s clip
    const fromSize = Math.max(5, Math.round(bytes / 3500));
    if (!Number.isFinite(reported) || reported <= 0) return fromSize;
    if (reported > fromSize * 4) return fromSize;
    return reported;
  }

  static serialize(doc) {
    if (!doc) return null;
    const sizeBytes = doc.sizeBytes || 0;
    return {
      id: String(doc._id),
      machineId: doc.machineId || '',
      title: doc.title || '',
      cameraChannel: doc.cameraChannel ?? null,
      filename: doc.filename || '',
      mimeType: doc.mimeType || 'video/webm',
      sizeBytes,
      durationSec: this.estimateDurationSec(sizeBytes, doc.durationSec),
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
        this.scheduleGridFsDelete(dup.gridFsId);
      } catch {
        /* missing file */
      }
      await col.deleteOne({ _id: dup._id });
    }
    return keep;
  }

  static async appendPendingSegment({
    buffer,
    safeName,
    mime,
    mid,
    ch,
    segDur,
    displayTitle,
    existing,
  }) {
    const db = getDatabase();
    const now = new Date();
    const uploaded = await this.uploadBufferToGridFs(buffer, safeName, mime, {
      machineId: mid,
      title: displayTitle,
      cameraChannel: ch,
      pending: true,
    });
    await db.collection(PENDING_COLLECTION).insertOne({
      machineId: mid,
      cameraChannel: ch,
      gridFsId: uploaded.gridFsId,
      sizeBytes: uploaded.sizeBytes,
      durationSec: segDur,
      mimeType: mime,
      created_at: now,
    });
    this.scheduleBackgroundMerge(mid, ch);
    return existing;
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

    const asyncMerge = process.env.CAMERA_VIDEO_ASYNC_MERGE !== '0';
    if (asyncMerge) {
      const existingFast = await col.findOne({ machineId: mid, cameraChannel: ch });
      if (existingFast) {
        return this.appendPendingSegment({
          buffer,
          safeName,
          mime,
          mid,
          ch,
          segDur,
          displayTitle,
          existing: existingFast,
        });
      }
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

      if (asyncMerge) {
        return this.appendPendingSegment({
          buffer,
          safeName,
          mime,
          mid,
          ch,
          segDur,
          displayTitle,
          existing,
        });
      }

      const prevDur = Number(existing.durationSec) || 0;
      const addDur = segDur != null ? segDur : 10;
      const reportedDur = prevDur + addDur;

      const replaceWithLatestSegment = async (reason) => {
        console.warn(`[CameraVideo] merge skip ${mid}/${ch}: ${reason}`);
        const { gridFsId, sizeBytes } = await uploadBufferOnly();
        try {
          this.scheduleGridFsDelete(existing.gridFsId);
        } catch {
          /* ignore */
        }
        const metaFields = {
          title: displayTitle,
          cameraChannel: ch,
          filename: safeName,
          mimeType: mime,
          sizeBytes,
          durationSec: segDur,
          gridFsId,
          updated_at: now,
        };
        await col.updateOne({ _id: existing._id }, { $set: metaFields });
        return col.findOne({ _id: existing._id });
      };

      try {
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
          this.scheduleGridFsDelete(existing.gridFsId);
        } catch {
          /* old file may be missing */
        }

        const metaFields = {
          title: displayTitle,
          cameraChannel: ch,
          filename: `${ch}_rolling.mp4`,
          mimeType: mime,
          sizeBytes: merged.sizeBytes,
          durationSec: this.estimateDurationSec(merged.sizeBytes, reportedDur),
          gridFsId: merged.gridFsId,
          updated_at: now,
        };

        await col.updateOne({ _id: existing._id }, { $set: metaFields });
        return col.findOne({ _id: existing._id });
      } catch (mergeErr) {
        return replaceWithLatestSegment(mergeErr.message || 'merge failed');
      }
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
            this.scheduleGridFsDelete(seg.gridFsId);
          } catch {
            /* ignore */
          }
          await col.deleteOne({ _id: seg._id });
        }
      }
      try {
        this.scheduleGridFsDelete(keep.gridFsId);
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
      const doc = await col.findOne({ _id: keep._id });
      this.notifyRealtime(doc);
      return doc;
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

  static async findForDisplay({ machineId, limit = 50, autoCompact = false } = {}) {
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
    if (!doc) return null;
    const bucket = getBucket();
    try {
      await bucket.delete(doc.gridFsId);
    } catch {
      /* missing gridfs */
    }
    const db = getDatabase();
    await db.collection(COLLECTION).deleteOne({ _id: doc._id });
    if (doc.cameraChannel) {
      this.dropRollingCache(this.rollingCacheKey(doc.machineId, doc.cameraChannel));
    }
    return doc;
  }

  static notifyRealtime(doc) {
    if (!doc) return;
    try {
      require('../realtime').emitCameraVideoUpdate(doc);
    } catch {
      /* socket not ready */
    }
  }
}

module.exports = CameraVideo;
