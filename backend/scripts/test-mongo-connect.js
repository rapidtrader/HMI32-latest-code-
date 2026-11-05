#!/usr/bin/env node
/** node scripts/test-mongo-connect.js — run on VPS from backend folder */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { testConnection, mongoHostForLog } = require('../src/mongodb');

const uri = process.env.MONGODB_URI || '';
console.log('Host:', mongoHostForLog(uri));
console.log('DB:', process.env.MONGODB_DB_NAME || 'gpsDB');
console.log('NODE_OPTIONS:', process.env.NODE_OPTIONS || '(none)');

testConnection()
  .then(() => {
    console.log('OK — MongoDB reachable');
    process.exit(0);
  })
  .catch((e) => {
    console.error('FAIL —', e.message);
    process.exit(1);
  });
