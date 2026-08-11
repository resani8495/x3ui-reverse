const { db } = require('../config/database');

class TrafficService {
  static monthlyReset() {
    db.prepare(`
      INSERT INTO traffic_logs (client_id, upload, download, date)
      SELECT id, traffic_up, traffic_down, date('now')
      FROM clients WHERE traffic_used > 0
    `).run();
    
    console.log('Monthly traffic data archived');
  }

  static checkExpired() {
    // Disable expired clients
    const expired = db.prepare(`
      UPDATE clients SET enabled = 0
      WHERE enabled = 1 AND (
        (expire_date IS NOT NULL AND expire_date < datetime('now'))
        OR (traffic_limit > 0 AND traffic_used >= traffic_limit)
      )
    `).run();

    if (expired.changes > 0) {
      console.log(`Disabled ${expired.changes} expired clients`);
    }
  }

  static getTrafficHistory(clientId, days = 30) {
    return db.prepare(`
      SELECT date, upload, download, (upload + download) as total
      FROM traffic_logs
      WHERE client_id = ? AND date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `).all(clientId, days);
  }

  static getDailyTraffic() {
    return db.prepare(`
      SELECT date, SUM(upload) as upload, SUM(download) as download
      FROM traffic_logs
      WHERE date >= date('now', '-30 days')
      GROUP BY date
      ORDER BY date ASC
    `).all();
  }

  static getTotalStats() {
    return db.prepare(`
      SELECT 
        COALESCE(SUM(traffic_up), 0) as total_up,
        COALESCE(SUM(traffic_down), 0) as total_down,
        COALESCE(SUM(traffic_used), 0) as total_used
      FROM clients
    `).get();
  }
}

module.exports = TrafficService;
