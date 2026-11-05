const express = require('express');
const multer = require('multer');
const CameraVideo = require('../models/CameraVideo');

const router = express.Router();

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

router.post('/', upload.single('video'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ success: false, message: 'video file is required' });
    }

    const doc = await CameraVideo.upsertFromBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname || 'recording.webm',
      mimeType: req.file.mimetype,
      machineId: req.body.machineId,
      title: req.body.title,
      cameraChannel: req.body.cameraChannel,
      durationSec: req.body.durationSec,
    });

    return res.status(201).json({
      success: true,
      message: 'Video saved',
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
    const doc = await CameraVideo.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const file = await CameraVideo.getGridFsFile(doc.gridFsId);
    if (!file) {
      return res.status(404).json({ success: false, message: 'Video file not found' });
    }

    const size = file.length;
    const contentType = doc.mimeType || file.contentType || 'video/webm';
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
        'Cache-Control': 'no-store, max-age=0',
      });
      const stream = CameraVideo.openDownloadStream(doc.gridFsId, {
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
      'Cache-Control': 'no-store, max-age=0',
    });
    const stream = CameraVideo.openDownloadStream(doc.gridFsId);
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
  try {
    const removed = await CameraVideo.deleteById(req.params.id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
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
