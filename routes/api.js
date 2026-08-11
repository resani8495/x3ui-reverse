const express = require('express');
const QRCode = require('qrcode');
const { verifyToken } = require('../middleware/auth');
const Client = require('../models/Client');
const ProtocolService = require('../services/protocols');
const TrafficService = require('../services/traffic');
const { generateKeys, formatBytes } = require('../utils/generator');
const { db } = require('../config/database');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// ===== Dashboard Stats =====
router.get('/stats', (req, res) => {
  try {
    const stats = Client.getStats();
    const trafficStats = TrafficService.getTotalStats();
    
    res.json({
      clients: stats,
      traffic: {
        ...trafficStats,
        total_up_formatted: formatBytes(trafficStats.total_up),
        total_down_formatted: formatBytes(trafficStats.total_down),
        total_used_formatted: formatBytes(trafficStats.total_used)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Clients CRUD =====

// List all clients
router.get('/clients', (req, res) => {
  try {
    const { protocol, enabled, search, limit, offset } = req.query;
    const clients = Client.getAll({ 
      protocol, 
      enabled: enabled !== undefined ? parseInt(enabled) : undefined,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    const enriched = clients.map(client => ({
      ...client,
      traffic_used_formatted: formatBytes(client.traffic_used),
      traffic_limit_formatted: client.traffic_limit > 0 ? formatBytes(client.traffic_limit) : 'Unlimited',
      traffic_up_formatted: formatBytes(client.traffic_up),
      traffic_down_formatted: formatBytes(client.traffic_down),
      traffic_percentage: client.traffic_limit > 0 
        ? Math.round((client.traffic_used / client.traffic_limit) * 100) 
        : 0,
      is_expired: client.expire_date && new Date(client.expire_date) < new Date(),
      is_traffic_exceeded: client.traffic_limit > 0 && client.traffic_used >= client.traffic_limit,
      link: ProtocolService.generateLink(client),
      days_left: client.expire_date 
        ? Math.max(0, Math.ceil((new Date(client.expire_date) - new Date()) / (1000 * 60 * 60 * 24)))
        : null
    }));

    res.json({ success: true, clients: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single client
router.get('/clients/:id', (req, res) => {
  try {
    const client = Client.getById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    client.link = ProtocolService.generateLink(client);
    client.traffic_used_formatted = formatBytes(client.traffic_used);
    client.traffic_limit_formatted = client.traffic_limit > 0 ? formatBytes(client.traffic_limit) : 'Unlimited';

    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create client
router.post('/clients', (req, res) => {
  try {
    const data = { ...req.body, created_by: req.user.id };
    const client = Client.create(data);
    client.link = ProtocolService.generateLink(client);

    res.status(201).json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update client
router.put('/clients/:id', (req, res) => {
  try {
    const client = Client.update(req.params.id, req.body);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    client.link = ProtocolService.generateLink(client);
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete client
router.delete('/clients/:id', (req, res) => {
  try {
    Client.delete(req.params.id);
    res.json({ success: true, message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle client enable/disable
router.post('/clients/:id/toggle', (req, res) => {
  try {
    const client = Client.toggleEnable(req.params.id);
    res.json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset client traffic
router.post('/clients/:id/reset-traffic', (req, res) => {
  try {
    const client = Client.resetTraffic(req.params.id);
    res.json({ success: true, client, message: 'Traffic reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get client QR code
router.get('/clients/:id/qrcode', async (req, res) => {
  try {
    const client = Client.getById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const link = ProtocolService.generateLink(client);
    const qrDataUrl = await QRCode.toDataURL(link, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.json({ success: true, qrcode: qrDataUrl, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get client connection link
router.get('/clients/:id/link', (req, res) => {
  try {
    const client = Client.getById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const link = ProtocolService.generateLink(client);
    res.json({ success: true, link, protocol: client.protocol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk operations
router.post('/clients/bulk/delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    const stmt = db.prepare('DELETE FROM clients WHERE id = ?');
    const deleteMany = db.transaction((ids) => {
      for (const id of ids) stmt.run(id);
    });
    deleteMany(ids);

    res.json({ success: true, message: `${ids.length} clients deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/bulk/toggle', (req, res) => {
  try {
    const { ids, enabled } = req.body;
    const stmt = db.prepare('UPDATE clients SET enabled = ? WHERE id = ?');
    const updateMany = db.transaction((ids) => {
      for (const id of ids) stmt.run(enabled ? 1 : 0, id);
    });
    updateMany(ids);

    res.json({ success: true, message: `${ids.length} clients updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Key Generation =====
router.get('/generate/reality-keys', (req, res) => {
  const keys = generateKeys.realityKeys();
  res.json({ success: true, keys });
});

router.get('/generate/wireguard-keys', (req, res) => {
  const keys = generateKeys.wireguard();
  res.json({ success: true, keys });
});

router.get('/generate/ss-password', (req, res) => {
  const password = generateKeys.ssPassword();
  res.json({ success: true, password });
});

// ===== Server Config =====
router.get('/config', (req, res) => {
  try {
    const configs = db.prepare('SELECT key, value FROM server_config').all();
    const config = {};
    configs.forEach(c => config[c.key] = c.value);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', (req, res) => {
  try {
    const updates = req.body;
    const stmt = db.prepare(`
      INSERT INTO server_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, value, value);
    }

    res.json({ success: true, message: 'Config updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Online Users =====
router.get('/online', (req, res) => {
  try {
    const online = db.prepare(`
      SELECT id, name, protocol, current_connections 
      FROM clients WHERE current_connections > 0 AND enabled = 1
    `).all();
    res.json({ success: true, online, count: online.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Login Logs =====
router.get('/logs/login', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT l.*, u.username 
      FROM login_logs l 
      LEFT JOIN users u ON l.user_id = u.id 
      ORDER BY l.created_at DESC 
      LIMIT 50
    `).all();
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Export/Import =====
router.get('/export', (req, res) => {
  try {
    const clients = Client.getAll();
    const config = db.prepare('SELECT key, value FROM server_config').all();
    
    res.json({
      success: true,
      data: {
        version: '2.0',
        exported_at: new Date().toISOString(),
        clients,
        config
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', (req, res) => {
  try {
    const { clients } = req.body;
    if (!clients || !Array.isArray(clients)) {
      return res.status(400).json({ error: 'Invalid import data' });
    }

    let imported = 0;
    for (const client of clients) {
      try {
        Client.create(client);
        imported++;
      } catch (e) {
        // Skip duplicates
      }
    }

    res.json({ success: true, message: `${imported} clients imported` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
