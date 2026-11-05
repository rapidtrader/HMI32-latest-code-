const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Load once from backend/.env regardless of PM2 cwd quirks
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoConfig = {
  get uri() {
    return process.env.MONGODB_URI || 'mongodb://localhost:27017';
  },
  get database() {
    return process.env.MONGODB_DB_NAME || 'gpsDB';
  },
};

function mongoHostForLog(uri) {
  const s = String(uri || '');
  const m = s.match(/@([^/?]+)/);
  return m ? m[1] : s.slice(0, 40);
}

function buildClientOptions() {
  const opts = {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    retryWrites: true,
    maxPoolSize: 20,
  };
  if (String(mongoConfig.uri).startsWith('mongodb+srv://')) {
    opts.tls = true;
  }
  return opts;
}

let client;
let db;

const getClient = () => {
  if (!client) {
    client = new MongoClient(mongoConfig.uri, buildClientOptions());
  }
  return client;
};

const testConnection = async () => {
  const host = mongoHostForLog(mongoConfig.uri);
  console.log(`[db] Connecting to MongoDB (${host}) database=${mongoConfig.database}…`);
  try {
    await getClient().connect();
    await getClient().db(mongoConfig.database).command({ ping: 1 });
    console.log('MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('[db] MongoDB connection failed:', error.message);
    console.error(
      '[db] Fix: MongoDB Atlas → Network Access → allow this VPS public IP; ' +
        'verify MONGODB_URI in backend/.env (same cluster as gps-backend if shared)'
    );
    throw error;
  }
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
  db = getClient().db(mongoConfig.database);

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

  const cameraVideos = db.collection('camera_videos');
  await ensureIndex(cameraVideos, { machineId: 1, created_at: -1 });
  await ensureIndex(cameraVideos, { created_at: -1 });

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
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
    console.log('MongoDB connection closed');
  }
};

const toObjectId = (id) => new ObjectId(id);

module.exports = {
  testConnection,
  initializeDatabase,
  getDatabase,
  closeDatabase,
  toObjectId,
  ObjectId,
  mongoHostForLog,
};
