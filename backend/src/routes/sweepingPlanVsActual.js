const express = require('express');
const SweepingPlanVsActual = require('../models/SweepingPlanVsActual');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const data = await SweepingPlanVsActual.report({
      projectId: req.query.projectId,
      planDate: req.query.planDate || req.query.date,
      machineId: req.query.machineId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('GET plan-vs-actual:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;