const express = require('express');
const SweepingProject = require('../models/SweepingProject');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await SweepingProject.list({
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('GET /api/sweeping/projects:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/meta/statuses', (_req, res) => {
  return res.json({ success: true, data: SweepingProject.STATUSES });
});

router.get('/:id', async (req, res) => {
  try {
    const row = await SweepingProject.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    console.error('GET /api/sweeping/projects/:id:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await SweepingProject.create(req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('POST /api/sweeping/projects:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const data = await SweepingProject.update(req.params.id, req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('PUT /api/sweeping/projects:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await SweepingProject.remove(req.params.id);
    return res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('DELETE /api/sweeping/projects:', error.message);
    return res.status(status).json({ success: false, message: error.message });
  }
});

module.exports = router;