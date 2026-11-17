const express = require('express');
const LiveMapFleet = require('../models/LiveMapFleet');

const router = express.Router();

router.get('/fleet', async (_req, res) => {
  try {
    const data = await LiveMapFleet.getFleet();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/live-map/fleet:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;