const express = require('express');
const VehicleHistory = require('../models/VehicleHistory');

const router = express.Router();

router.get('/vehicles', async (_req, res) => {
  try {
    const data = await VehicleHistory.listVehicles();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const data = await VehicleHistory.getHistory({
      deviceId: req.query.deviceId || req.query.vehicleId,
      from: req.query.from,
      to: req.query.to,
    });
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('GET vehicle-history:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;