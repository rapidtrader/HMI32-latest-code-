const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const mongoConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  database: process.env.MONGODB_DB_NAME || 'gpsDB',
};

const client = new MongoClient(mongoConfig.uri);
let db;

const testConnection = async () => {
  await client.connect();
  console.log('MongoDB connected successfully');
  return true;
};

const ensureIndex = async (collection, spec, options = {}) => {
  try {
    await collection.createIndex(spec, options);
  } catch (error) {
    if (!/already exists|same name/i.test(error.message)) {
      throw error;
    }
  }
};

const initializeDatabase = async () => {
  db = client.db(mongoConfig.database);

  const hmi32Latest = db.collection('hmi32_latest');
  await ensureIndex(hmi32Latest, { machineId: 1 }, { unique: true });
  await ensureIndex(hmi32Latest, { updated_at: -1 });

  const hmi32History = db.collection('hmi32_history');
  await ensureIndex(hmi32History, { machineId: 1 });
  await ensureIndex(hmi32History, { updated_at: -1 });

  const machineInfos = db.collection('machineinfos');
  await ensureIndex(machineInfos, { machineId: 1 });

  const hmi32Users = db.collection('hmi32_users');
  await ensureIndex(hmi32Users, { username: 1 }, { unique: true });

  console.log('MongoDB initialized successfully');
  return db;
};

const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

const closeDatabase = async () => {
  await client.close();
  console.log('MongoDB connection closed');
};

const toObjectId = (id) => new ObjectId(id);

module.exports = {
  testConnection,
  initializeDatabase,
  getDatabase,
  closeDatabase,
  toObjectId,
  ObjectId,
};
