/**
 * Copy HMI32 collections from source MongoDB to target (current .env).
 *
 * Usage (from HMI32/backend):
 *   set SOURCE_MONGODB_URI=mongodb+srv://user:pass@old-cluster/gpsDB
 *   node scripts/migrate-hmi32-data.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

const TARGET_URI = process.env.MONGODB_URI;
const TARGET_DB = process.env.MONGODB_DB_NAME || 'gpsDB';
const SOURCE_URI = process.env.SOURCE_MONGODB_URI;
const SOURCE_DB = process.env.SOURCE_MONGODB_DB_NAME || TARGET_DB;

const COLLECTIONS = [
  'hmi32_latest',
  'hmi32_history',
  'machineinfos',
  'productionrunlogs',
  'runtime_data',
];

async function copyCollection(sourceDb, targetDb, name) {
  const docs = await sourceDb.collection(name).find({}).toArray();
  if (docs.length === 0) {
    console.log(`  ${name}: 0 docs (skipped)`);
    return 0;
  }

  await targetDb.collection(name).deleteMany({});
  await targetDb.collection(name).insertMany(docs);
  console.log(`  ${name}: ${docs.length} docs copied`);
  return docs.length;
}

async function run() {
  if (!TARGET_URI) {
    console.error('MONGODB_URI is required in .env');
    process.exit(1);
  }
  if (!SOURCE_URI) {
    console.error('SOURCE_MONGODB_URI is required (old database connection string)');
    process.exit(1);
  }

  const sourceClient = new MongoClient(SOURCE_URI);
  const targetClient = new MongoClient(TARGET_URI);

  try {
    await sourceClient.connect();
    await targetClient.connect();

    const sourceDb = sourceClient.db(SOURCE_DB);
    const targetDb = targetClient.db(TARGET_DB);

    console.log(`Source DB: ${SOURCE_DB}`);
    console.log(`Target DB: ${TARGET_DB}`);
    console.log('Copying collections...');

    let total = 0;
    for (const name of COLLECTIONS) {
      total += await copyCollection(sourceDb, targetDb, name);
    }

    console.log(`Done. Total documents copied: ${total}`);
  } finally {
    await sourceClient.close();
    await targetClient.close();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
