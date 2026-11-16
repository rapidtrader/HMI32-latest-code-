const express = require('express');
const SweepingMachineTracking = require('../models/SweepingMachineTracking');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const projectId = String(req.query.projectId || '').trim();
    const data = await SweepingMachineTracking.trackByProject(projectId);
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('GET machine-tracking:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;