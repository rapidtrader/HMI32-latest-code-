const { getDatabase } = require('../mongodb');

const COLLECTION = 'pi_data';

class PiData {
  static async ensureIndexes() {
    const col = getDatabase().collection(COLLECTION);
    const safe = async (fn) => {
      try {
        await fn();
      } catch (e) {
        console.warn('[PiData] index:', e.message);
      }
    };
    await safe(() => col.createIndex({ machineId: 1, type: 1, created_at: -1 }));
    await safe(() => col.createIndex({ created_at: -1 }));
  }

  static async insert({ machineId, type, payload }) {
    const mid = String(machineId || '').trim();
    if (!mid) {
      const err = new Error('machineId is required');
      err.status = 400;
      throw err;
    }
    if (!payload || typeof payload !== 'object') {
      const err = new Error('payload must be an object');
      err.status = 400;
      throw err;
    }
    const doc = {
      machineId: mid,
      type: type ? String(type).trim() : null,
      payload,
      created_at: new Date(),
    };
    const result = await getDatabase().collection(COLLECTION).insertOne(doc);
    return { id: String(result.insertedId), ...doc };
  }
}

module.exports = PiData;
