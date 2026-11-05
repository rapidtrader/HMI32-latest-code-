#!/usr/bin/env node
/** node scripts/test-mongo-connect.js [--gps] — test HMI .env or gps-backend .env URI */
const path = require('path');
const fs = require('fs');
const useGps = process.argv.includes('--gps');
const envPath = useGps
  ? '/var/www/gps-tracking/Backend/.env'
  : path.join(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
  console.error('Missing env file:', envPath);
  process.exit(1);
}

require('dotenv').config({ path: envPath, quiet: true, override: true });

// Re-load mongodb after env (clear cached client from prior import — fresh process only)
delete require.cache[require.resolve('../src/mongodb')];
const { testConnection, mongoHostForLog } = require('../src/mongodb');

const uri = process.env.MONGODB_URI || '';
console.log('Env file:', envPath);
console.log('Host:', mongoHostForLog(uri));
console.log('DB:', process.env.MONGODB_DB_NAME || 'gpsDB');
console.log('NODE_OPTIONS:', process.env.NODE_OPTIONS || '(none — try: NODE_OPTIONS=--dns-result-order=ipv4first)');

testConnection()
  .then(() => {
    console.log('OK — MongoDB reachable');
    process.exit(0);
  })
  .catch((e) => {
    console.error('FAIL —', e.message);
    process.exit(1);
  });
