class User {
  static collection = 'hmi32_users';

  static async create({ username, passwordHash }) {
    const db = require('../mongodb').getDatabase();
    const now = new Date();
    const user = {
      username,
      password_hash: passwordHash,
      is_active: true,
      created_at: now,
      updated_at: now,
      last_login: null,
    };
    const result = await db.collection(this.collection).insertOne(user);
    return { ...user, _id: result.insertedId };
  }

  static async findByUsername(username) {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).findOne({ username });
  }

  static async findById(id) {
    const db = require('../mongodb').getDatabase();
    const { ObjectId } = require('../mongodb');
    return db.collection(this.collection).findOne({ _id: new ObjectId(id) });
  }

  static async updateLastLogin(username) {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).updateOne(
      { username },
      { $set: { last_login: new Date(), updated_at: new Date() } }
    );
  }

  static async countUsers() {
    const db = require('../mongodb').getDatabase();
    return db.collection(this.collection).countDocuments({});
  }
}

module.exports = User;
