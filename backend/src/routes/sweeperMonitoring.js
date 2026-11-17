const express = require('express');
const SweeperMonitoring = require('../models/SweeperMonitoring');

const router = express.Router();

router.get('/report', async (req, res) => {
  try {
    const data = await SweeperMonitoring.report({
      from: req.query.from,
      to: req.query.to,
      category: req.query.category,
      machineId: req.query.machineId || req.query.sweeperId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('GET sweeper-monitoring:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;