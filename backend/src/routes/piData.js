const express = require('express');
const PiData = require('../models/PiData');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { machineId, type, payload } = req.body || {};
    const doc = await PiData.insert({ machineId, type, payload });
    return res.status(201).json({ success: true, data: { id: doc.id } });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST /api/pi-data:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;
