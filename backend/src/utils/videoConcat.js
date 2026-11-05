const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Working binary after startup probe (prefers /usr/bin/ffmpeg over broken PATH build). */
let workingFfmpegBin = null;

function resolveFfmpegCandidates() {
  const fromEnv = process.env.FFMPEG_PATH ? String(process.env.FFMPEG_PATH).trim() : '';
  return [...new Set([fromEnv, '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'].filter(Boolean))];
}

function probeFfmpegBinary(bin) {
  return new Promise((resolve) => {
    const p = spawn(bin, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let combined = '';
    p.stdout.on('data', (d) => {
      combined += d.toString();
    });
    p.stderr.on('data', (d) => {
      combined += d.toString();
    });
    p.on('error', () => resolve({ ok: false, bin, detail: 'spawn failed' }));
    p.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, bin, detail: combined.split('\n')[0] || bin });
      } else {
        resolve({ ok: false, bin, detail: combined.slice(-400) || `exit ${code}` });
      }
    });
  });
}

async function pickWorkingFfmpeg() {
  if (workingFfmpegBin) return workingFfmpegBin;
  for (const bin of resolveFfmpegCandidates()) {
    if (bin.includes('/') && !fs.existsSync(bin)) continue;
    const r = await probeFfmpegBinary(bin);
    if (r.ok) {
      workingFfmpegBin = bin;
      return bin;
    }
  }
  return null;
}

async function verifyFfmpegAtStartup() {
  const bin = await pickWorkingFfmpeg();
  if (bin) {
    const r = await probeFfmpegBinary(bin);
    console.log(`[ffmpeg] OK: ${r.detail || bin}`);
    return true;
  }
  console.warn(
    '[ffmpeg] Clip merge disabled — install/fix ffmpeg on server:\n' +
      '  sudo apt install -y ffmpeg liblapack3 libopenblas0\n' +
      '  export FFMPEG_PATH=/usr/bin/ffmpeg  (PM2 ecosystem env)\n' +
      '  See backend/scripts/install-ffmpeg-debian.sh'
  );
  return false;
}

function getFfmpegBinary() {
  return workingFfmpegBin || process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';
}

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const ffPath = getFfmpegBinary();
    const ff = spawn(ffPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
  const bin = await pickWorkingFfmpeg();
  if (!bin) {
    throw new Error(
      'ffmpeg unavailable (install: apt install ffmpeg liblapack3 — or set FFMPEG_PATH=/usr/bin/ffmpeg)'
    );
  }

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
  verifyFfmpegAtStartup,
  pickWorkingFfmpeg,
};
