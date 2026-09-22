const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server: SocketIOServer } = require('socket.io');
require('dotenv').config();

const { testConnection, initializeDatabase } = require('./mongodb');
const Hmi32Latest = require('./models/Hmi32Latest');
const SuctionSession = require('./models/SuctionSession');
const RuntimeData = require('./models/RuntimeData');
const { registerUser, loginUser, verifyToken, isSignupAllowed } = require('./services/authService');
const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 4002;

const corsOrigins = [
  // Production domain
  'https://hmi.dynacleanindustries.com',
  'http://hmi.dynacleanindustries.com',
  // Local dev
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:4002',
];

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

const io = new SocketIOServer(httpServer, {
  cors: { origin: corsOrigins, credentials: true },
  transports: ['polling', 'websocket'],
});

const normalizeGps = (gps) => {
  if (!gps || typeof gps !== 'object') return gps;
  const lat = gps.lat ?? gps.latitude;
  const lng = gps.lng ?? gps.longitude;
  return {
    ...gps,
    ...(lat != null ? { lat, latitude: lat } : {}),
    ...(lng != null ? { lng, longitude: lng } : {}),
  };
};

/** Flatten legacy nested socket payloads for frontend/API consumers. */
const normalizeLatestRow = (row) => {
  if (!row) return row;
  const out = { ...row };
  const nested = row.state;
  if (nested && typeof nested === 'object' && nested.states && typeof nested.states === 'object') {
    out.state = nested.states;
    out.adc = row.adc || nested.adc || {};
    out.distance = row.distance || nested.distance || {};
    out.runtime = row.runtime || nested.runtime || {};
  }
  if (row.gps) {
    out.gps = normalizeGps(row.gps);
  }
  return out;
};

const machineInfoResponse = (doc) => {
  if (!doc) return null;
  return {
    machineId: doc.machineId,
    clientName: doc.clientName || '',
    location: doc.location || '',
    vehiclePlateNo: doc.vehiclePlateNo || '',
    password: doc.password || '',
    updated_at: doc.updated_at,
    created_at: doc.created_at,
  };
};

const handleMachineEvent = async (event, payload) => {
  if (!payload || typeof payload !== 'object') return;
  const machineId = String(payload.machineId || '').trim();
  if (!machineId) return;

  const baseUpdate = {
    lastEvent: event,
    lastPayload: payload,
    lastTsEpoch:
      Number.isFinite(payload.tsEpoch) && payload.tsEpoch > 0 ? payload.tsEpoch : Date.now(),
  };

  if (event === 'machine:state') {
    await Hmi32Latest.upsertByMachineId(machineId, {
      ...baseUpdate,
      state: payload.states || {},
      adc: payload.adc || {},
      distance: payload.distance || {},
      runtime: payload.runtime || {},
    });
    if (payload.runtime) {
      await RuntimeData.upsertByMachineId(machineId, payload.runtime).catch(() => {});
    }
    return;
  }

  if (event === 'machine:gps') {
    await Hmi32Latest.upsertByMachineId(machineId, {
      ...baseUpdate,
      gps: normalizeGps(payload),
    });
    return;
  }

  if (event === 'machine:a25') {
    await Hmi32Latest.upsertByMachineId(machineId, { ...baseUpdate, a25: payload });
    return;
  }

  if (event === 'machine:suction:start') {
    await SuctionSession.insert({
      machineId,
      date: payload.date || null,
      start: payload.start || null,
      stop: null,
      durationSec: 0,
      formatted: '00:00:00',
      synced: false,
    });
    return;
  }

  if (event === 'machine:suction:stop') {
    const db = require('./mongodb').getDatabase();
    const openSession = await db.collection('productionrunlogs').findOne(
      { machine_id: machineId, stop_time: null },
      { sort: { created_at: -1 } }
    );
    if (openSession) {
      await db.collection('productionrunlogs').updateOne(
        { _id: openSession._id },
        {
          $set: {
            stop_time: payload.stop || null,
            total_running_time: Math.round(Number(payload.durationSec) || 0),
            total_running_time_formatted: payload.formatted || '00:00:00',
            synced: true,
          },
        }
      );
    } else {
      await SuctionSession.insert({
        machineId,
        date: payload.date || null,
        start: payload.start || null,
        stop: payload.stop || null,
        durationSec: Number(payload.durationSec) || 0,
        formatted: payload.formatted || '00:00:00',
        synced: true,
      });
    }
    return;
  }

  if (event === 'machine:runtime') {
    await RuntimeData.upsertByMachineId(machineId, payload).catch(() => {});
  }
};

io.on('connection', (socket) => {
  socket.onAny((event, payload) => {
    if (typeof event !== 'string' || !event.startsWith('machine:')) return;
    handleMachineEvent(event, payload).catch(() => {});
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ success: true, service: 'hmi32-backend' });
});

app.get('/api/auth/signup-available', async (_req, res) => {
  try {
    const allowSignup = await isSignupAllowed();
    return res.json({ success: true, allowSignup });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to check signup availability',
      error: error.message,
    });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await registerUser(username, password);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    let status = 400;
    if (error.message === 'Username already exists') status = 409;
    if (error.message === 'Registration is closed') status = 403;
    return res.status(status).json({
      success: false,
      message: error.message,
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await loginUser(username, password);
    return res.json({
      success: true,
      message: 'Login successful',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    const status = error.message === 'Invalid username or password' ? 401 : 400;
    return res.status(status).json({
      success: false,
      message: error.message,
    });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
  return res.json({
    success: true,
    user: { id: payload.userId, username: payload.username },
  });
});

app.get('/api/hmi32/latest', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim();
    if (machineId) {
      const row = await Hmi32Latest.findByMachineId(machineId);
      return res.json({ success: true, data: normalizeLatestRow(row) });
    }
    const rows = await Hmi32Latest.findAll();
    return res.json({ success: true, data: rows.map(normalizeLatestRow) });
  } catch (error) {
    console.error('Error fetching HMI32 latest:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch HMI32 latest',
      error: error.message,
    });
  }
});

app.get('/api/hmi32/history', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const filter = machineId ? { machineId } : {};

    const docs = await db.collection('hmi32_history')
      .find({
        $and: [
          filter,
          {
            $or: [
              { updated_at: { $gte: sevenDaysAgo } },
              { source: 'hmi32_app' },
            ],
          },
        ],
      })
      .sort({ updated_at: -1 })
      .limit(Math.min(limit, 1000))
      .toArray();

    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('Error fetching HMI32 history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch HMI32 history',
      error: error.message,
    });
  }
});

app.post('/api/hmi32/history', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const { machineId, state, adc, distance, runtime, updated_at } = req.body;

    if (!machineId) {
      return res.status(400).json({ success: false, message: 'machineId is required' });
    }

    const now = new Date();
    const historyRecord = {
      machineId,
      state: state || {},
      adc: adc || {},
      distance: distance || {},
      runtime: runtime || {},
      updated_at: updated_at ? new Date(updated_at) : now,
      created_at: now,
      source: 'hmi32_app',
    };

    const historyResult = await db.collection('hmi32_history').insertOne(historyRecord);

    await Hmi32Latest.upsertByMachineId(machineId, {
      state,
      adc,
      distance,
      runtime,
      source: 'hmi32_app',
      lastEvent: 'machine:state',
    });

    return res.json({
      success: true,
      message: 'State saved to history and latest',
      data: historyRecord,
      id: historyResult.insertedId,
    });
  } catch (error) {
    console.error('Error saving HMI32 history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to save HMI32 history',
      error: error.message,
    });
  }
});

app.get('/api/hmi32/machine-info', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const filter = machineId ? { machineId } : {};
    const docs = await db.collection('machineinfos').find(filter).sort({ updated_at: -1 }).toArray();
    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('machine-info error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machine info',
      error: error.message,
    });
  }
});

app.post('/api/machines', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const { machineId, clientName, location, vehiclePlateNo, password } = req.body || {};
    const mid = String(machineId || '').trim();
    if (!mid) {
      return res.status(400).json({ success: false, error: 'machineId is required' });
    }

    const existing = await db.collection('machineinfos').findOne({ machineId: mid });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Machine already exists',
        message: 'machineId already exists',
      });
    }

    const now = new Date();
    const doc = {
      machineId: mid,
      clientName: String(clientName || '').trim(),
      location: String(location || '').trim(),
      vehiclePlateNo: String(vehiclePlateNo || '').trim(),
      password: String(password || ''),
      created_at: now,
      updated_at: now,
    };
    await db.collection('machineinfos').insertOne(doc);
    return res.status(201).json({ success: true, data: machineInfoResponse(doc) });
  } catch (error) {
    console.error('POST /api/machines error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to register machine',
      error: error.message,
    });
  }
});

app.put('/api/machines/machine/:id', async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const mid = String(req.params.id || '').trim();
    if (!mid) {
      return res.status(400).json({ success: false, error: 'machineId is required' });
    }

    const { clientName, location, vehiclePlateNo, password } = req.body || {};
    const update = {
      clientName: String(clientName || '').trim(),
      location: String(location || '').trim(),
      vehiclePlateNo: String(vehiclePlateNo || '').trim(),
      password: String(password || ''),
      updated_at: new Date(),
    };

    const result = await db.collection('machineinfos').findOneAndUpdate(
      { machineId: mid },
      { $set: update, $setOnInsert: { machineId: mid, created_at: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );

    return res.json({ success: true, data: machineInfoResponse(result) });
  } catch (error) {
    console.error('PUT /api/machines/machine/:id error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update machine',
      error: error.message,
    });
  }
});

const getMachineConfigHandler = async (req, res) => {
  try {
    const db = require('./mongodb').getDatabase();
    const mid = String(req.params.id || '').trim();
    if (!mid) {
      return res.status(400).json({ success: false, error: 'machineId is required' });
    }

    const doc = await db.collection('machineinfos').findOne({ machineId: mid });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Machine not found' });
    }

    return res.json({ success: true, data: machineInfoResponse(doc) });
  } catch (error) {
    console.error('GET machine config error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch machine config',
      error: error.message,
    });
  }
};

app.get('/api/machines/machine/:id/config', getMachineConfigHandler);
app.get('/api/machines/machine/:id', getMachineConfigHandler);

app.post('/api/production-run-log', async (req, res) => {
  try {
    const {
      machine_id,
      date,
      start_time,
      stop_time,
      total_running_time,
      total_running_time_formatted,
    } = req.body || {};

    if (!machine_id || !date || !start_time || !stop_time) {
      return res.status(400).json({
        success: false,
        message: 'machine_id, date, start_time and stop_time are required',
      });
    }

    const db = require('./mongodb').getDatabase();
    await db.collection('productionrunlogs').insertOne({
      machine_id: String(machine_id),
      date: String(date),
      start_time: String(start_time),
      stop_time: String(stop_time),
      total_running_time: Number(total_running_time) || 0,
      total_running_time_formatted: String(total_running_time_formatted || '00:00:00'),
      synced: true,
      created_at: new Date(),
    });

    return res.json({ success: true, message: 'Session saved' });
  } catch (error) {
    console.error('production-run-log error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to save session',
      error: error.message,
    });
  }
});

app.get('/api/hmi32/reports/sessions', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim() || undefined;
    const date = String(req.query.date || '').trim() || undefined;
    const limitRaw = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const sessions = await SuctionSession.findAll({ machineId, date, limit });
    return res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error reading suction sessions:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load sessions',
      error: error.message,
    });
  }
});

app.get('/api/hmi32/reports/runtime', async (req, res) => {
  try {
    const machineId = String(req.query.machineId || '').trim() || undefined;
    let rows;
    if (machineId) {
      const row = await RuntimeData.findByMachineId(machineId);
      rows = row ? [row] : [];
    } else {
      rows = await RuntimeData.findAll();
    }

    if (rows.length === 0) {
      return res.json({ success: true, data: { suction_total_seconds: 0, daily_seconds: {} } });
    }

    let totalSec = 0;
    const mergedDaily = {};
    for (const row of rows) {
      totalSec += Number(row.suction_total_seconds) || 0;
      const daily = row.daily_seconds || {};
      for (const [d, secs] of Object.entries(daily)) {
        mergedDaily[d] = (mergedDaily[d] || 0) + (Number(secs) || 0);
      }
    }

    return res.json({
      success: true,
      data: {
        suction_total_seconds: totalSec,
        daily_seconds: mergedDaily,
        machines: rows.map((r) => ({
          machineId: r.machineId,
          suction_total_seconds: r.suction_total_seconds,
          updated_at: r.updated_at,
        })),
      },
    });
  } catch (error) {
    console.error('Error reading runtime:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load runtime',
      error: error.message,
    });
  }
});

const startServer = async () => {
  try {
    await testConnection();
    await initializeDatabase();
    await SuctionSession.ensureIndexes().catch((e) => console.warn('SuctionSession index warn:', e.message));
    await RuntimeData.ensureIndexes().catch((e) => console.warn('RuntimeData index warn:', e.message));

    httpServer.listen(PORT, '0.0.0.0', () => {
      const dbName = process.env.MONGODB_DB_NAME || 'gpsDB';
      const os = require('os');
      const lanIps = Object.values(os.networkInterfaces())
        .flat()
        .filter((n) => n && n.family === 'IPv4' && !n.internal)
        .map((n) => n.address);

      console.log(`HMI32 backend running on http://localhost:${PORT}`);
      if (lanIps.length) {
        console.log('[network] Pi/backend.json should use one of these URLs:');
        lanIps.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
      }
      console.log(`[db] Saving directly to MONGODB_URI (database: ${dbName})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
