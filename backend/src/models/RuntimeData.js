class RuntimeData {
  static collection = 'runtime_data';

  static async upsertByMachineId(machineId, data) {
    const db = require('../mongodb').getDatabase();

    let daily = {};
    if (Array.isArray(data.daily)) {
      for (const [d, s] of data.daily) {
        if (d) daily[String(d)] = Number(s) || 0;
      }
    } else if (data.daily && typeof data.daily === 'object') {
      daily = data.daily;
    }

    return db.collection(this.collection).updateOne(
      { machineId },
      {
        $set: {
          machineId,
          suction_total_seconds: Number(data.suctionSec) || 0,
          suction_total_hours: Number(data.suctionHours) || 0,
          daily_seconds: daily,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );
  }

  static async findByMachineId(machineId) {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).findOne({ machineId });
  }

  static async findAll() {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).find({}).sort({ updated_at: -1 }).toArray();
  }

  static async ensureIndexes() {
    const db = require('../mongodb').getDatabase();
    await db.collection(this.collection).createIndex({ machineId: 1 }, { unique: true });
  }
}

module.exports = RuntimeData;
