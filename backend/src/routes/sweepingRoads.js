const express = require('express');
const SweepingRoad = require('../models/SweepingRoad');

const router = express.Router();

router.get('/filter-options', async (_req, res) => {
  try {
    const data = await SweepingRoad.filterOptions();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET filter-options:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/suggest-id', async (req, res) => {
  try {
    const projectId = String(req.query.projectId || '').trim();
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }
    const roadId = await SweepingRoad.suggestRoadId(projectId);
    return res.json({ success: true, data: { roadId } });
  } catch (error) {
    console.error('GET suggest-id:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await SweepingRoad.list({
      search: req.query.search,
      status: req.query.status,
      projectId: req.query.projectId,
      area: req.query.area,
      colony: req.query.colony,
      frequency: req.query.frequency,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('GET /api/sweeping/roads:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await SweepingRoad.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Road not found' });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/sweeping/roads/:id:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await SweepingRoad.create(req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST /api/sweeping/roads:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = await SweepingRoad.update(req.params.id, req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('PUT /api/sweeping/roads:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.post('/:id/deactivate', async (req, res) => {
  try {
    const data = await SweepingRoad.deactivate(req.params.id);
    return res.json({ success: true, data, message: 'Road deactivated' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST deactivate road:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;