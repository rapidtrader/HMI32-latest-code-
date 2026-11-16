const express = require('express');
const SweepingDailyPlan = require('../models/SweepingDailyPlan');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const projectId = String(req.query.projectId || '').trim();
    const planDate = String(req.query.planDate || req.query.date || '').trim();
    if (!projectId || !planDate) {
      return res.status(400).json({
        success: false,
        message: 'projectId and planDate are required',
      });
    }
    const data = await SweepingDailyPlan.findByProjectAndDate(projectId, planDate);
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('GET daily-plans:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { projectId, planDate } = req.body || {};
    const data = await SweepingDailyPlan.generate({ projectId, planDate });
    return res.json({ success: true, data, message: 'Daily sweeping plan generated successfully' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST generate:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    await SweepingDailyPlan.cancelPlan(req.params.id);
    return res.json({ success: true, message: 'Plan cancelled' });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/:id/machines/:machineId/cancel', async (req, res) => {
  try {
    const data = await SweepingDailyPlan.cancelMachinePlan(req.params.id, req.params.machineId);
    return res.json({ success: true, data, message: 'Machine plan cancelled' });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;