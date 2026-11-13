const express = require('express');
const multer = require('multer');
const SavedVideo = require('../models/SavedVideo');

const router = express.Router();

const streamMetaCache = new Map();
const STREAM_META_TTL_MS = 120_000;

async function resolveStreamMeta(videoId) {
  const id = String(videoId || '').trim();
  const hit = streamMetaCache.get(id);
  if (hit && hit.expires > Date.now()) return hit;

  const doc = await SavedVideo.findById(id);
  if (!doc) return null;

  const file = await SavedVideo.getGridFsFile(doc.gridFsId);
  if (!file) return null;

  const meta = {
    gridFsId: doc.gridFsId,
    size: file.length,
    contentType: doc.mimeType || file.contentType || 'video/mp4',
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

async function persistSavedUpload(file, body) {
  const doc = await SavedVideo.insertFromBuffer({
    buffer: file.buffer,
    filename: file.originalname || 'recording.mp4',
    mimeType: file.mimetype,
    machineId: body.machineId,
    title: body.title,
    cameraChannel: body.cameraChannel,
    durationSec: body.durationSec,
    source: body.source,
  });
  streamMetaCache.delete(String(doc._id));
  SavedVideo.notifyRealtime(doc);
  return doc;
}

router.post('/', upload.single('video'), async (req, res) => {
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
      message: 'Saved to archive — processing in background',
    });
    setImmediate(() => {
      persistSavedUpload(file, body).catch((error) => {
        if (error.code === 'VIDEO_TOO_SMALL') {
          console.warn(`POST /api/saved-videos: skipped small upload (${error.message})`);
          return;
        }
        console.error('POST /api/saved-videos:', error.message);
      });
    });
    return;
  } catch (error) {
    console.error('POST /api/saved-videos:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to accept video',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const source = String(req.query.source || '').trim() || undefined;
    const cameraChannel = String(req.query.cameraChannel || '').trim() || undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const skip = req.query.skip ? parseInt(String(req.query.skip), 10) : 0;
    const { rows, total, limit: lim, skip: sk } = await SavedVideo.list({
      machineId,
      source,
      cameraChannel,
      limit,
      skip,
    });
    return res.json({
      success: true,
      data: rows.map((r) => SavedVideo.serialize(r)),
      total,
      limit: lim,
      skip: sk,
    });
  } catch (error) {
    console.error('GET /api/saved-videos:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id/stream', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const meta = await resolveStreamMeta(id);
    if (!meta) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const doc = await SavedVideo.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const { getDatabase } = require('../mongodb');
    const { GridFSBucket } = require('mongodb');
    const bucket = new GridFSBucket(getDatabase(), { bucketName: 'saved_videos_fs' });

    const mime = meta.contentType || doc.mimeType || 'video/mp4';
    res.setHeader('Content-Type', mime.includes('video') ? mime : 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(meta.size));
    res.setHeader('Cache-Control', 'public, max-age=120');

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : meta.size - 1;
        if (start >= meta.size || end >= meta.size) {
          res.status(416).end();
          return;
        }
        const chunk = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${meta.size}`);
        res.setHeader('Content-Length', String(chunk));
        bucket
          .openDownloadStream(meta.gridFsId, { start, end: end + 1 })
          .on('error', () => res.end())
          .pipe(res);
        return;
      }
    }

    bucket.openDownloadStream(meta.gridFsId).on('error', () => res.end()).pipe(res);
  } catch (error) {
    console.error('GET /api/saved-videos/:id/stream:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
});

module.exports = router;
