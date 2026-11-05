const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Load backend/.env only if URI not already set (e.g. test script --gps).
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
}

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
  const cap = Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 15000;
  const opts = {
    serverSelectionTimeoutMS: cap,
    connectTimeoutMS: cap,
    retryWrites: true,
    maxPoolSize: 20,
    autoSelectFamily: false,
  };
  const uri = mongoConfig.uri;
  if (String(uri).startsWith('mongodb+srv://')) {
    opts.tls = true;
  }
  return opts;
}

let client;
let activeUri = null;

const getClient = () => {
  const uri = activeUri || mongoConfig.uri;
  if (!client || activeUri !== uri) {
    client = new MongoClient(uri, buildClientOptions());
    activeUri = uri;
  }
  return client;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const resetClient = () => {
  if (client) {
    client.close().catch(() => {});
  }
  client = undefined;
  activeUri = null;
};

function connectionUriCandidates() {
  const list = [mongoConfig.uri, process.env.MONGODB_URI_FALLBACK]
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  return [...new Set(list)];
}

const testConnection = async () => {
  const uris = connectionUriCandidates();
  let lastErr;
  for (const uri of uris) {
    activeUri = uri;
    resetClient();
    const host = mongoHostForLog(uri);
    console.log(`[db] Connecting to MongoDB (${host}) database=${mongoConfig.database}…`);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (attempt > 1) {
          resetClient();
          activeUri = uri;
          await sleep(1500);
          console.log(`[db] MongoDB retry ${attempt}/2…`);
        }
        await getClient().connect();
        await getClient().db(mongoConfig.database).command({ ping: 1 });
        console.log('MongoDB connected successfully');
        return true;
      } catch (error) {
        lastErr = error;
        console.error(`[db] attempt ${attempt}/2 failed (${host}):`, error.message);
      }
    }
  }
  console.error(
    '[db] Fix: bash scripts/sync-env-mongo-from-gps.sh ; Atlas Network Access for VPS IP; ' +
      'NODE_OPTIONS=--dns-result-order=ipv4first in PM2 ecosystem'
  );
  throw lastErr;
};

let db;

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
