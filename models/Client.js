const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { generateKeys } = require('../utils/generator');

class Client {
  static create(data) {
    const uuid = data.uuid || uuidv4();
    const subUrl = uuidv4().replace(/-/g, '').substring(0, 16);
    
    let extraFields = {};
    
    // Generate protocol-specific fields
    switch (data.protocol) {
      case 'shadowsocks':
        extraFields.ss_password = data.ss_password || generateKeys.ssPassword();
        extraFields.ss_method = data.ss_method || 'chacha20-ietf-poly1305';
        break;
      case 'wireguard':
        const wgKeys = generateKeys.wireguard();
        extraFields.wg_private_key = data.wg_private_key || wgKeys.privateKey;
        extraFields.wg_public_key = data.wg_public_key || wgKeys.publicKey;
        extraFields.wg_pre_shared_key = data.wg_pre_shared_key || wgKeys.preSharedKey;
        extraFields.wg_address = data.wg_address || '10.0.0.' + Math.floor(Math.random() * 254 + 1);
        extraFields.wg_dns = data.wg_dns || '1.1.1.1';
        break;
    }

    // Calculate expire date
    let expireDate = null;
    if (data.expire_days) {
      const date = new Date();
      date.setDate(date.getDate() + parseInt(data.expire_days));
      expireDate = date.toISOString();
    } else if (data.expire_date) {
      expireDate = data.expire_date;
    }

    const stmt = db.prepare(`
      INSERT INTO clients (
        uuid, name, email, protocol, port, enabled,
        traffic_limit, expire_date, max_connections,
        security, network, header_type, tls, sni, fingerprint, alpn,
        reality_enabled, reality_public_key, reality_private_key,
        reality_short_id, reality_dest, reality_server_names,
        ss_method, ss_password,
        wg_private_key, wg_public_key, wg_pre_shared_key, wg_address, wg_dns,
        ws_path, ws_host, grpc_service_name, http_path,
        subscription_url, note, created_by
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    const trafficLimit = (data.traffic_limit || 0) * 1024 * 1024 * 1024; // Convert GB to bytes

    const result = stmt.run(
      uuid,
      data.name,
      data.email || null,
      data.protocol || 'vless',
      data.port || 443,
      data.enabled !== undefined ? data.enabled : 1,
      trafficLimit,
      expireDate,
      data.max_connections || 2,
      data.security || 'auto',
      data.network || 'tcp',
      data.header_type || 'none',
      data.tls ? 1 : 0,
      data.sni || null,
      data.fingerprint || 'chrome',
      data.alpn || 'h2,http/1.1',
      data.reality_enabled ? 1 : 0,
      data.reality_public_key || null,
      data.reality_private_key || null,
      data.reality_short_id || null,
      data.reality_dest || null,
      data.reality_server_names || null,
      extraFields.ss_method || data.ss_method || null,
      extraFields.ss_password || data.ss_password || null,
      extraFields.wg_private_key || null,
      extraFields.wg_public_key || null,
      extraFields.wg_pre_shared_key || null,
      extraFields.wg_address || null,
      extraFields.wg_dns || null,
      data.ws_path || null,
      data.ws_host || null,
      data.grpc_service_name || null,
      data.http_path || null,
      subUrl,
      data.note || null,
      data.created_by || null
    );

    return this.getById(result.lastInsertRowid);
  }

  static getAll(filters = {}) {
    let query = 'SELECT * FROM clients WHERE 1=1';
    const params = [];

    if (filters.protocol) {
      query += ' AND protocol = ?';
      params.push(filters.protocol);
    }
    if (filters.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filters.enabled);
    }
    if (filters.search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR uuid LIKE ?)';
      const search = `%${filters.search}%`;
      params.push(search, search, search);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    return db.prepare(query).all(...params);
  }

  static getById(id) {
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  }

  static getByUuid(uuid) {
    return db.prepare('SELECT * FROM clients WHERE uuid = ?').get(uuid);
  }

  static getBySubscription(subUrl) {
    return db.prepare('SELECT * FROM clients WHERE subscription_url = ?').get(subUrl);
  }

  static update(id, data) {
    const fields = [];
    const values = [];

    const allowedFields = [
      'name', 'email', 'protocol', 'port', 'enabled',
      'traffic_limit', 'expire_date', 'max_connections',
      'security', 'network', 'header_type', 'tls', 'sni',
      'fingerprint', 'alpn', 'reality_enabled', 'reality_public_key',
      'reality_private_key', 'reality_short_id', 'reality_dest',
      'reality_server_names', 'ss_method', 'ss_password',
      'wg_private_key', 'wg_public_key', 'wg_pre_shared_key',
      'wg_address', 'wg_dns', 'ws_path', 'ws_host',
      'grpc_service_name', 'http_path', 'note'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === 'traffic_limit') {
          fields.push(`${field} = ?`);
          values.push(data[field] * 1024 * 1024 * 1024);
        } else {
          fields.push(`${field} = ?`);
          values.push(data[field]);
        }
      }
    }

    if (fields.length === 0) return this.getById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static delete(id) {
    return db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  }

  static toggleEnable(id) {
    db.prepare('UPDATE clients SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    return this.getById(id);
  }

  static resetTraffic(id) {
    db.prepare('UPDATE clients SET traffic_used = 0, traffic_up = 0, traffic_down = 0 WHERE id = ?').run(id);
    return this.getById(id);
  }

  static updateTraffic(id, upload, download) {
    db.prepare(`
      UPDATE clients SET 
        traffic_up = traffic_up + ?,
        traffic_down = traffic_down + ?,
        traffic_used = traffic_used + ? + ?
      WHERE id = ?
    `).run(upload, download, upload, download, id);
  }

  static getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM clients').get();
    const active = db.prepare('SELECT COUNT(*) as count FROM clients WHERE enabled = 1').get();
    const expired = db.prepare(`
      SELECT COUNT(*) as count FROM clients 
      WHERE expire_date IS NOT NULL AND expire_date < datetime('now')
    `).get();
    const trafficExceeded = db.prepare(`
      SELECT COUNT(*) as count FROM clients 
      WHERE traffic_limit > 0 AND traffic_used >= traffic_limit
    `).get();
    const totalTraffic = db.prepare('SELECT COALESCE(SUM(traffic_used), 0) as total FROM clients').get();
    
    const byProtocol = db.prepare(`
      SELECT protocol, COUNT(*) as count FROM clients GROUP BY protocol
    `).all();

    return {
      total: total.count,
      active: active.count,
      expired: expired.count,
      trafficExceeded: trafficExceeded.count,
      totalTraffic: totalTraffic.total,
      byProtocol
    };
  }

  static getExpired() {
    return db.prepare(`
      SELECT * FROM clients 
      WHERE (expire_date IS NOT NULL AND expire_date < datetime('now'))
      OR (traffic_limit > 0 AND traffic_used >= traffic_limit)
    `).all();
  }
}

module.exports = Client;
