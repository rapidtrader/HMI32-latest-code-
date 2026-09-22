class SuctionSession {
  static collection = 'productionrunlogs';

  static async insert(doc) {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).insertOne({
      machine_id: doc.machineId || '',
      date: doc.date || null,
      start_time: doc.start || null,
      stop_time: doc.stop || null,
      total_running_time: Math.round(Number(doc.durationSec) || 0),
      total_running_time_formatted: doc.formatted || '00:00:00',
      synced: doc.synced || false,
      created_at: new Date(),
    });
  }

  static async findAll({ machineId, date, limit } = {}) {
    const db = require('../mongodb').getDatabase();
    const filter = {};
    if (machineId) filter.machine_id = machineId;
    if (date) filter.date = date;

    let cursor = db.collection(this.collection).find(filter).sort({ created_at: -1 });
    if (limit && Number.isFinite(limit) && limit > 0) {
      cursor = cursor.limit(limit);
    }
    return cursor.toArray();
  }

  static async ensureIndexes() {
    const db = require('../mongodb').getDatabase();
    const col = db.collection(this.collection);
    await col.createIndex({ machine_id: 1, created_at: -1 });
    await col.createIndex({ date: 1 });
    await col.createIndex({ created_at: -1 });
  }
}

module.exports = SuctionSession;
