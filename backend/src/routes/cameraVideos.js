const express = require('express');
const multer = require('multer');
const CameraVideo = require('../models/CameraVideo');
const { emitCameraVideoUpdate, emitCameraVideoSerialized, emitCameraVideoDeleted } = require('../realtime');

const router = express.Router();

const streamMetaCache = new Map();
const STREAM_META_TTL_MS = 120_000;

async function resolveStreamMeta(videoId) {
  const id = String(videoId || '').trim();
  const hit = streamMetaCache.get(id);
  if (hit && hit.expires > Date.now()) return hit;

  const doc = await CameraVideo.findById(id);
  if (!doc) return null;

  const file = await CameraVideo.getGridFsFile(doc.gridFsId);
  if (!file) return null;

  const meta = {
    gridFsId: doc.gridFsId,
    size: file.length,
    contentType: doc.mimeType || file.contentType || 'video/webm',
    expires: Date.now() + STREAM_META_TTL_MS,
  };
  streamMetaCache.set(id, meta);
  return meta;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      (file.mimetype && file.mimetype.startsWith('video/')) ||
      file.mimetype === 'application/octet-stream';
    if (ok) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  },
});

async function persistCameraUpload(file, body) {
  const t0 = Date.now();
  const doc = await CameraVideo.upsertFromBuffer({
    buffer: file.buffer,
    filename: file.originalname || 'recording.webm',
    mimeType: file.mimetype,
    machineId: body.machineId,
    title: body.title,
    cameraChannel: body.cameraChannel,
    durationSec: body.durationSec,
  });
  streamMetaCache.delete(String(doc._id));
  const ms = Date.now() - t0;
  const slowMs = Number(process.env.CAMERA_VIDEO_SLOW_POST_MS) || 15000;
  if (ms > slowMs) {
    console.warn(`[CameraVideo] slow save ${ms}ms ${doc.machineId}/${doc.cameraChannel}`);
  }
  emitCameraVideoUpdate(doc);
  return doc;
}

/** Pi default: instant 202 — Mongo/GridFS in background; website gets camera:video:update when ready. */
router.post('/save', upload.single('video'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'video file is required' });
    }
    const file = {
      buffer: Buffer.from(req.file.buffer),
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    };
    const body = { ...req.body };
    res.status(202).json({
      success: true,
      message: 'Video save accepted — processing in background',
    });
    setImmediate(() => {
      persistCameraUpload(file, body).catch((error) => {
        console.error('POST /api/camera-videos/save:', error.message);
      });
    });
    return;
  } catch (error) {
    console.error('POST /api/camera-videos/save:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to accept video',
    });
  }
});

router.post('/', upload.single('video'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ success: false, message: 'video file is required' });
    }
    const doc = await persistCameraUpload(req.file, req.body);
    return res.status(201).json({
      success: true,
      message: 'Video accepted',
      data: CameraVideo.serialize(doc),
    });
  } catch (error) {
    console.error('POST /api/camera-videos:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save video',
    });
  }
});

router.post('/compact', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || req.body?.machineId || '').trim() || undefined;
    const force = req.query.force === '1' || req.body?.force === true;
    const merged = await CameraVideo.compactSlots({ machineId, force });
    for (const row of merged) {
      emitCameraVideoSerialized(row);
    }
    return res.json({
      success: true,
      message: merged.length ? `Merged ${merged.length} channel slot(s)` : 'Nothing to merge',
      data: merged,
    });
  } catch (error) {
    console.error('POST /api/camera-videos/compact:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Compact failed',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const rows = await CameraVideo.findForDisplay({ machineId, limit });
    return res.json({
      success: true,
      data: rows.map((r) => CameraVideo.serialize(r)),
    });
  } catch (error) {
    console.error('GET /api/camera-videos:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to list videos',
      error: error.message,
    });
  }
});

router.get('/:id/stream', async (req, res) => {
  try {
    const meta = await resolveStreamMeta(req.params.id);
    if (!meta) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const pinnedGridFsId = meta.gridFsId;
    const size = meta.size;
    const contentType = meta.contentType;
    const cacheCtl =
      req.query.lock != null ? 'private, max-age=120' : 'no-store, max-age=0';
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
      if (Number.isNaN(start) || start >= size) {
        res.status(416).set('Content-Range', `bytes */${size}`);
        return res.end();
      }
      const chunkEnd = Math.min(end, size - 1);
      res.status(206);
      res.set({
        'Content-Range': `bytes ${start}-${chunkEnd}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkEnd - start + 1,
        'Content-Type': contentType,
        'Cache-Control': cacheCtl,
      });
      const stream = CameraVideo.openDownloadStream(pinnedGridFsId, {
        start,
        end: chunkEnd,
      });
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
      return;
    }

    res.set({
      'Content-Length': size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheCtl,
    });
    const stream = CameraVideo.openDownloadStream(pinnedGridFsId);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (error) {
    console.error('GET /api/camera-videos/:id/stream:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to stream video',
        error: error.message,
      });
    }
  }
});

router.delete('/:id', async (req, res) => {
  if (process.env.ALLOW_CAMERA_VIDEO_DELETE !== '1') {
    return res.status(403).json({
      success: false,
      message: 'Video delete is disabled on this server',
    });
  }
  try {
    const removed = await CameraVideo.deleteById(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    emitCameraVideoDeleted({ id: String(removed._id), machineId: removed.machineId });
    return res.json({ success: true, message: 'Video deleted' });
  } catch (error) {
    console.error('DELETE /api/camera-videos/:id:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete video',
      error: error.message,
    });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'Video too large (max 200 MB)' : err.message;
    return res.status(400).json({ success: false, message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
  }
  return next();
});

module.exports = router;
