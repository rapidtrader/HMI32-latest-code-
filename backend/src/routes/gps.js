const express = require('express');
const GpsLocation = require('../models/GpsLocation');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const row = await GpsLocation.insertPoint(req.body || {});
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST /api/gps:', error.message);
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to save GPS',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || req.query.machineId || '').trim() || undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const skip = req.query.skip ? parseInt(String(req.query.skip), 10) : 0;
    const from = req.query.from || undefined;
    const to = req.query.to || undefined;
    const result = await GpsLocation.list({ deviceId, limit, skip, from, to });
    return res.json({
      success: true,
      data: result.rows,
      total: result.total,
      limit: result.limit,
      skip: result.skip,
    });
  } catch (error) {
    console.error('GET /api/gps:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/devices', async (_req, res) => {
  try {
    const ids = await GpsLocation.distinctDeviceIds();
    ids.sort();
    return res.json({ success: true, data: ids });
  } catch (error) {
    console.error('GET /api/gps/devices:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/latest/:deviceId', async (req, res) => {
  try {
    const row = await GpsLocation.findLatest(req.params.deviceId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'No GPS for this device' });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/gps/latest:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
