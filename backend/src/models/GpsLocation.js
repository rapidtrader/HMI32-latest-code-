const { getDatabase } = require('../mongodb');
const { writeSpool, removeSpool } = require('../utils/gpsSpool');
const { emitGpsLocation } = require('../realtime');

const COLLECTION = 'gps_locations';
const COORD_DECIMALS = 6;

function roundCoord(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const f = 10 ** COORD_DECIMALS;
  return Math.round(x * f) / f;
}

function isDuplicateOfLatest(latest, lat, lon) {
  if (!latest) return false;
  return sameCoordinates(latest.latitude, latest.longitude, lat, lon);
}

function sameCoordinates(lat1, lon1, lat2, lon2) {
  const a = roundCoord(lat1);
  const b = roundCoord(lon1);
  const c = roundCoord(lat2);
  const d = roundCoord(lon2);
  if (a == null || b == null || c == null || d == null) return false;
  return a === c && b === d;
}

class GpsLocation {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    const safe = async (fn) => {
      try {
        await fn();
      } catch (e) {
        console.warn('[GpsLocation] index:', e.message);
      }
    };
    await safe(() => col.createIndex({ deviceId: 1, recorded_at: -1 }));
    await safe(() => col.createIndex({ recorded_at: -1 }));
    await safe(() => col.createIndex({ created_at: -1 }));
  }

  static normalizeIncoming(body = {}) {
    const deviceId = String(body.deviceId || body.machineId || '').trim();
    const lat = Number(body.latitude ?? body.lat);
    const lon = Number(body.longitude ?? body.lng ?? body.lon);
    const speed = Number(body.speed ?? body.speed_kmh ?? 0);
    const altitude = Number(body.altitude ?? body.alt ?? 0);
    const satellites =
      body.satellites != null
        ? Number(body.satellites)
        : body.sats != null
          ? Number(body.sats)
          : null;
    const fixValid = body.fix_valid !== false && body.fixValid !== false;
    let recordedAt = body.recorded_at || body.timestamp || body.fixTime;
    if (recordedAt && typeof recordedAt === 'string') {
      const d = new Date(recordedAt);
      recordedAt = Number.isNaN(d.getTime()) ? new Date() : d;
    } else if (typeof recordedAt === 'number' && recordedAt > 1e12) {
      recordedAt = new Date(recordedAt);
    } else {
      recordedAt = new Date();
    }
    return {
      deviceId,
      latitude: lat,
      longitude: lon,
      speed: Number.isFinite(speed) ? speed : 0,
      altitude: Number.isFinite(altitude) ? altitude : 0,
      satellites: Number.isFinite(satellites) ? satellites : null,
      fixValid,
      recorded_at: recordedAt,
      source: String(body.source || 'pi').trim() || 'pi',
      raw: body,
    };
  }

  static serialize(doc) {
    if (!doc) return null;
    return {
      id: String(doc._id),
      deviceId: doc.deviceId,
      latitude: doc.latitude,
      longitude: doc.longitude,
      lat: doc.latitude,
      lng: doc.longitude,
      speed: doc.speed,
      altitude: doc.altitude,
      satellites: doc.satellites ?? null,
      fixValid: doc.fixValid !== false,
      recorded_at: doc.recorded_at,
      created_at: doc.created_at,
      source: doc.source || 'pi',
    };
  }

  static async insertPoint(body, { useSpool = true } = {}) {
    const norm = this.normalizeIncoming(body);
    if (!norm.deviceId) {
      const err = new Error('deviceId is required');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(norm.latitude) || !Number.isFinite(norm.longitude)) {
      const err = new Error('latitude and longitude are required');
      err.status = 400;
      throw err;
    }

    const prev = await this.findLatest(norm.deviceId);
    if (isDuplicateOfLatest(prev, norm.latitude, norm.longitude)) {
      return { skipped: true, duplicate: true, data: prev };
    }

    let spoolFile = null;
    if (useSpool) {
      spoolFile = writeSpool(norm);
    }
    const db = getDatabase();
    const now = new Date();
    const doc = {
      deviceId: norm.deviceId,
      latitude: norm.latitude,
      longitude: norm.longitude,
      speed: norm.speed,
      altitude: norm.altitude,
      satellites: norm.satellites,
      fixValid: norm.fixValid,
      recorded_at: norm.recorded_at,
      source: norm.source,
      payload: norm.raw && typeof norm.raw === 'object' ? norm.raw : {},
      created_at: now,
    };

    const result = await db.collection(COLLECTION).insertOne(doc);
    if (spoolFile) removeSpool(spoolFile);

    const row = { ...doc, _id: result.insertedId };
    const serialized = this.serialize(row);
    emitGpsLocation(serialized);
    return { skipped: false, duplicate: false, data: serialized };
  }

  static async findLatest(deviceId) {
    const did = String(deviceId || '').trim();
    if (!did) return null;
    const doc = await getDatabase()
      .collection(COLLECTION)
      .findOne({ deviceId: did }, { sort: { recorded_at: -1, created_at: -1 } });
    return this.serialize(doc);
  }

  static async list({ deviceId, limit = 100, skip = 0, from, to } = {}) {
    const q = {};
    if (deviceId) q.deviceId = String(deviceId).trim();
    if (from || to) {
      q.recorded_at = {};
      if (from) q.recorded_at.$gte = new Date(from);
      if (to) q.recorded_at.$lte = new Date(to);
    }
    const lim = Math.min(500, Math.max(1, Number(limit) || 100));
    const sk = Math.max(0, Number(skip) || 0);
    const col = getDatabase().collection(COLLECTION);
    const [rows, total] = await Promise.all([
      col.find(q).sort({ recorded_at: -1, created_at: -1 }).skip(sk).limit(lim).toArray(),
      col.countDocuments(q),
    ]);
    return { rows: rows.map((r) => this.serialize(r)), total, limit: lim, skip: sk };
  }

  static async distinctDeviceIds() {
    return getDatabase().collection(COLLECTION).distinct('deviceId');
  }

  static async replaySpoolQueue() {
    const { listSpoolFiles, readSpoolFile } = require('../utils/gpsSpool');
    const files = listSpoolFiles();
    let ok = 0;
    for (const file of files) {
      try {
        const wrapped = readSpoolFile(file);
        const payload = wrapped.payload || wrapped;
        const inserted = await this.insertPoint(payload, { useSpool: false });
        if (!inserted.skipped) ok += 1;
      } catch (e) {
        console.warn('[GpsLocation] spool replay skip:', file, e.message);
      }
    }
    if (ok) console.log(`[GpsLocation] replayed ${ok} spooled GPS row(s)`);
    return ok;
  }
}

GpsLocation.isDuplicateOfLatest = isDuplicateOfLatest;
GpsLocation.sameCoordinates = sameCoordinates;

module.exports = GpsLocation;
