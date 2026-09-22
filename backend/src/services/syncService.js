const { MongoClient } = require('mongodb');

const COLLECTIONS = [
  'hmi32_latest',
  'hmi32_history',
  'machineinfos',
  'productionrunlogs',
  'runtime_data',
];

let sourceClient = null;
let lastSyncAt = null;
let syncing = false;

const getSourceUri = () => process.env.SOURCE_MONGODB_URI || '';
const getSourceDbName = () => process.env.SOURCE_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME || 'gpsDB';

const upsertDocs = async (targetDb, collectionName, docs, keyField) => {
  if (!docs.length) return 0;

  const ops = docs.map((doc) => ({
    replaceOne: {
      filter: keyField ? { [keyField]: doc[keyField] } : { _id: doc._id },
      replacement: doc,
      upsert: true,
    },
  }));

  await targetDb.collection(collectionName).bulkWrite(ops, { ordered: false });
  return docs.length;
};

const syncNewerDocs = async (sourceDb, targetDb, collectionName, dateField) => {
  const latest = await targetDb
    .collection(collectionName)
    .find({})
    .sort({ [dateField]: -1 })
    .limit(1)
    .toArray();

  const since = latest[0]?.[dateField] || new Date(0);
  const docs = await sourceDb
    .collection(collectionName)
    .find({ [dateField]: { $gt: since } })
    .toArray();

  if (!docs.length) return 0;
  await targetDb.collection(collectionName).insertMany(docs, { ordered: false });
  return docs.length;
};

const syncHmi32Data = async (targetDb) => {
  const sourceUri = getSourceUri();
  if (!sourceUri || syncing) return null;

  syncing = true;
  try {
    if (!sourceClient) {
      sourceClient = new MongoClient(sourceUri);
      await sourceClient.connect();
    }

    const sourceDb = sourceClient.db(getSourceDbName());
    const stats = {};

    const latestDocs = await sourceDb.collection('hmi32_latest').find({}).toArray();
    stats.hmi32_latest = await upsertDocs(targetDb, 'hmi32_latest', latestDocs, 'machineId');

    stats.hmi32_history = await syncNewerDocs(sourceDb, targetDb, 'hmi32_history', 'updated_at');
    stats.productionrunlogs = await syncNewerDocs(sourceDb, targetDb, 'productionrunlogs', 'created_at');

    const machineDocs = await sourceDb.collection('machineinfos').find({}).toArray();
    stats.machineinfos = await upsertDocs(targetDb, 'machineinfos', machineDocs, 'machineId');

    const runtimeDocs = await sourceDb.collection('runtime_data').find({}).toArray();
    stats.runtime_data = await upsertDocs(targetDb, 'runtime_data', runtimeDocs, 'machineId');

    lastSyncAt = new Date();
    const copied = Object.values(stats).reduce((sum, n) => sum + n, 0);
    if (copied > 0) {
      console.log(`[sync] Updated collections:`, stats);
    }
    return stats;
  } finally {
    syncing = false;
  }
};

const startAutoSync = (getDatabase, intervalMs = 15000) => {
  const sourceUri = getSourceUri();
  if (!sourceUri) {
    console.log('[sync] SOURCE_MONGODB_URI not set — live sync disabled');
    return null;
  }

  console.log(`[sync] Auto-sync enabled every ${intervalMs / 1000}s from source DB`);

  const run = async () => {
    try {
      await syncHmi32Data(getDatabase());
    } catch (error) {
      console.error('[sync] Failed:', error.message);
    }
  };

  run();
  return setInterval(run, intervalMs);
};

module.exports = {
  syncHmi32Data,
  startAutoSync,
  COLLECTIONS,
};
