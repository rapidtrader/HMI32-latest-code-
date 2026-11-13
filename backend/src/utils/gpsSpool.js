/** Disk spool before Mongo persist — survives short DB outages. */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const SPOOL_DIR = path.resolve(__dirname, '../../data/gps_spool');

function ensureDir() {
  fs.mkdirSync(SPOOL_DIR, { recursive: true });
}

function writeSpool(payload) {
  ensureDir();
  const id = randomUUID();
  const file = path.join(SPOOL_DIR, `${Date.now()}_${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ id, writtenAt: new Date().toISOString(), payload }), 'utf8');
  return file;
}

function removeSpool(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* already gone */
  }
}

function listSpoolFiles() {
  ensureDir();
  return fs
    .readdirSync(SPOOL_DIR)
    .filter((n) => n.endsWith('.json'))
    .map((n) => path.join(SPOOL_DIR, n));
}

function readSpoolFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

module.exports = {
  SPOOL_DIR,
  writeSpool,
  removeSpool,
  listSpoolFiles,
  readSpoolFile,
};
