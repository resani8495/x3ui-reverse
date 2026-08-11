const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'panel.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      protocol TEXT NOT NULL,
      port INTEGER,
      enabled INTEGER DEFAULT 1,
      traffic_limit BIGINT DEFAULT 0,
      traffic_used BIGINT DEFAULT 0,
      traffic_up BIGINT DEFAULT 0,
      traffic_down BIGINT DEFAULT 0,
      expire_date DATETIME,
      max_connections INTEGER DEFAULT 2,
      current_connections INTEGER DEFAULT 0,
      
      -- Protocol specific settings
      security TEXT DEFAULT 'auto',
      network TEXT DEFAULT 'tcp',
      header_type TEXT DEFAULT 'none',
      tls INTEGER DEFAULT 0,
      sni TEXT,
      fingerprint TEXT DEFAULT 'chrome',
      alpn TEXT DEFAULT 'h2,http/1.1',
      
      -- Reality settings
      reality_enabled INTEGER DEFAULT 0,
      reality_public_key TEXT,
      reality_private_key TEXT,
      reality_short_id TEXT,
      reality_dest TEXT,
      reality_server_names TEXT,
      
      -- Shadowsocks settings
      ss_method TEXT DEFAULT 'chacha20-ietf-poly1305',
      ss_password TEXT,
      
      -- WireGuard settings
      wg_private_key TEXT,
      wg_public_key TEXT,
      wg_pre_shared_key TEXT,
      wg_address TEXT,
      wg_dns TEXT DEFAULT '1.1.1.1',
      
      -- Transport settings
      ws_path TEXT,
      ws_host TEXT,
      grpc_service_name TEXT,
      http_path TEXT,
      tcp_header_request TEXT,
      
      subscription_url TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS server_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS traffic_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      upload BIGINT DEFAULT 0,
      download BIGINT DEFAULT 0,
      date DATE DEFAULT (date('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      success INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inbounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT UNIQUE NOT NULL,
      protocol TEXT NOT NULL,
      port INTEGER NOT NULL,
      settings TEXT,
      stream_settings TEXT,
      enabled INTEGER DEFAULT 1,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_clients_uuid ON clients(uuid);
    CREATE INDEX IF NOT EXISTS idx_clients_protocol ON clients(protocol);
    CREATE INDEX IF NOT EXISTS idx_clients_enabled ON clients(enabled);
    CREATE INDEX IF NOT EXISTS idx_traffic_logs_date ON traffic_logs(date);
    CREATE INDEX IF NOT EXISTS idx_traffic_logs_client ON traffic_logs(client_id);
  `);

  // Create default admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 12);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'superadmin');
    console.log('✅ Default admin created: admin / admin123');
  }

  // Set default server config
  const defaults = {
    'server_address': process.env.SERVER_ADDRESS || '0.0.0.0',
    'server_domain': process.env.SERVER_DOMAIN || '',
    'panel_title': 'VPN Panel Pro',
    'telegram_bot': '',
    'telegram_admin': '',
    'default_traffic': '50', // GB
    'default_expire': '30', // Days
    'subscription_prefix': process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'
  };

  const upsert = db.prepare(`
    INSERT INTO server_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  for (const [key, value] of Object.entries(defaults)) {
    upsert.run(key, value);
  }

  console.log('✅ Database initialized');
}

module.exports = { db, initialize };
