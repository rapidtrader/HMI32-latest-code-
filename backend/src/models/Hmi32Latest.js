class Hmi32Latest {
  static collection = 'hmi32_latest';

  static async upsertByMachineId(machineId, updateData) {
    const db = require('../mongodb').getDatabase();
    const collection = db.collection(this.collection);

    return collection.updateOne(
      { machineId },
      {
        $set: {
          ...updateData,
          machineId,
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
}

module.exports = Hmi32Latest;
