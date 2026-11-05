const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('ffmpeg timeout'));
    }, timeoutMs);
    ff.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg not installed on server (apt install ffmpeg)'));
      } else {
        reject(err);
      }
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.slice(-800) || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Concatenate video files (same codec) into one file. Uses stream copy first, then re-mux.
 */
async function concatVideoFiles(inputPaths, outputPath) {
  const existing = inputPaths.filter((p) => p && fs.existsSync(p) && fs.statSync(p).size > 0);
  if (existing.length === 0) {
    throw new Error('no input files to concat');
  }
  if (existing.length === 1) {
    const one = existing[0];
    if (path.extname(outputPath).toLowerCase() === '.mp4') {
      await runFfmpeg(['-y', '-i', one, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    } else {
      fs.copyFileSync(one, outputPath);
    }
    return;
  }

  const listPath = path.join(path.dirname(outputPath), `concat_${Date.now()}.txt`);
  const listBody = existing
    .map((p) => {
      const norm = path.resolve(p).replace(/\\/g, '/');
      return `file '${norm.replace(/'/g, "'\\''")}'`;
    })
    .join('\n');
  fs.writeFileSync(listPath, listBody, 'utf8');

  try {
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  } catch (copyErr) {
    await runFfmpeg(
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      180000
    ).catch(() => {
      throw copyErr;
    });
  } finally {
    try {
      fs.unlinkSync(listPath);
    } catch {
      /* ignore */
    }
  }
}

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hmi32-vid-'));
  try {
    return await fn(dir);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Per-key mutex so two uploads for same channel do not corrupt merge. */
const channelLocks = new Map();

async function withChannelLock(key, fn) {
  const k = String(key);
  while (channelLocks.get(k)) {
    await sleep(50);
  }
  channelLocks.set(k, true);
  try {
    return await fn();
  } finally {
    channelLocks.delete(k);
  }
}

module.exports = {
  concatVideoFiles,
  withTempDir,
  withChannelLock,
};
