const express = require('express');
const SweepingMachine = require('../models/SweepingMachine');

const router = express.Router();

router.get('/vehicle-ids', async (_req, res) => {
  try {
    const data = await SweepingMachine.listVehicleIdOptions();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/sweeping/machines/vehicle-ids:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await SweepingMachine.list({
      search: req.query.search,
      status: req.query.status,
      projectId: req.query.projectId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('GET /api/sweeping/machines:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await SweepingMachine.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/sweeping/machines/:id:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await SweepingMachine.create(req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST /api/sweeping/machines:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = await SweepingMachine.update(req.params.id, req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('PUT /api/sweeping/machines:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/:id/deactivate', async (req, res) => {
  try {
    const data = await SweepingMachine.deactivate(req.params.id);
    return res.json({ success: true, data, message: 'Machine deactivated' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST deactivate:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;