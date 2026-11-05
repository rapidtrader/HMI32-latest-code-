#!/usr/bin/env node
/** Remove duplicate camera_videos rows (same machineId + cameraChannel). */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const { testConnection, initializeDatabase } = require('../src/mongodb');
const CameraVideo = require('../src/models/CameraVideo');

(async () => {
  await testConnection();
  await initializeDatabase();
  const n = await CameraVideo.dedupeAllChannelSlots();
  console.log(`Removed ${n} duplicate channel document(s).`);
  await CameraVideo.ensureIndexes();
  console.log('Indexes ensured.');
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
