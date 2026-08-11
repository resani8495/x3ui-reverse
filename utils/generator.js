const crypto = require('crypto');

const generateKeys = {
  ssPassword: () => {
    return crypto.randomBytes(16).toString('base64');
  },

  wireguard: () => {
    // Generate WireGuard-compatible keys using crypto
    const privateKey = crypto.randomBytes(32).toString('base64');
    const publicKey = crypto.randomBytes(32).toString('base64');
    const preSharedKey = crypto.randomBytes(32).toString('base64');
    
    return { privateKey, publicKey, preSharedKey };
  },

  realityKeys: () => {
    const privateKey = crypto.randomBytes(32).toString('base64url');
    const publicKey = crypto.randomBytes(32).toString('base64url');
    const shortId = crypto.randomBytes(4).toString('hex');
    
    return { privateKey, publicKey, shortId };
  },

  shortId: () => {
    return crypto.randomBytes(4).toString('hex');
  },

  randomPassword: (length = 16) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unlimited';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fa-IR');
}

function isExpired(client) {
  if (client.expire_date && new Date(client.expire_date) < new Date()) return true;
  if (client.traffic_limit > 0 && client.traffic_used >= client.traffic_limit) return true;
  return false;
}

module.exports = { generateKeys, formatBytes, formatDate, isExpired };
