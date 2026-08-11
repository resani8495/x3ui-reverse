const { db } = require('../config/database');

class ProtocolService {
  
  static getServerAddress() {
    const config = db.prepare("SELECT value FROM server_config WHERE key = 'server_domain'").get();
    return config?.value || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.SERVER_ADDRESS || 'localhost';
  }

  // ========== VLESS ==========
  static generateVlessLink(client) {
    const address = this.getServerAddress();
    let params = new URLSearchParams();
    
    params.set('type', client.network || 'tcp');
    params.set('security', client.reality_enabled ? 'reality' : (client.tls ? 'tls' : 'none'));
    
    if (client.tls && !client.reality_enabled) {
      if (client.sni) params.set('sni', client.sni);
      if (client.fingerprint) params.set('fp', client.fingerprint);
      if (client.alpn) params.set('alpn', client.alpn);
    }

    // Reality settings
    if (client.reality_enabled) {
      if (client.reality_public_key) params.set('pbk', client.reality_public_key);
      if (client.reality_short_id) params.set('sid', client.reality_short_id);
      if (client.sni) params.set('sni', client.sni);
      if (client.fingerprint) params.set('fp', client.fingerprint);
      if (client.reality_server_names) params.set('serverName', client.reality_server_names);
    }

    // Transport settings
    switch (client.network) {
      case 'ws':
        if (client.ws_path) params.set('path', client.ws_path);
        if (client.ws_host) params.set('host', client.ws_host);
        break;
      case 'grpc':
        if (client.grpc_service_name) params.set('serviceName', client.grpc_service_name);
        params.set('mode', 'gun');
        break;
      case 'tcp':
        if (client.header_type && client.header_type !== 'none') {
          params.set('headerType', client.header_type);
        }
        break;
      case 'http':
      case 'h2':
        if (client.http_path) params.set('path', client.http_path);
        if (client.ws_host) params.set('host', client.ws_host);
        break;
    }

    params.set('encryption', 'none');
    const fragment = encodeURIComponent(client.name);
    
    return `vless://${client.uuid}@${address}:${client.port}?${params.toString()}#${fragment}`;
  }

  // ========== VMESS ==========
  static generateVmessLink(client) {
    const address = this.getServerAddress();
    
    const config = {
      v: '2',
      ps: client.name,
      add: address,
      port: client.port.toString(),
      id: client.uuid,
      aid: '0',
      scy: client.security || 'auto',
      net: client.network || 'tcp',
      type: client.header_type || 'none',
      host: client.ws_host || client.sni || '',
      path: client.ws_path || client.http_path || client.grpc_service_name || '',
      tls: client.tls ? 'tls' : '',
      sni: client.sni || '',
      alpn: client.alpn || '',
      fp: client.fingerprint || 'chrome'
    };

    const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
    return `vmess://${encoded}`;
  }

  // ========== TROJAN ==========
  static generateTrojanLink(client) {
    const address = this.getServerAddress();
    let params = new URLSearchParams();
    
    params.set('type', client.network || 'tcp');
    params.set('security', client.reality_enabled ? 'reality' : (client.tls ? 'tls' : 'none'));
    
    if (client.sni) params.set('sni', client.sni);
    if (client.fingerprint) params.set('fp', client.fingerprint);
    if (client.alpn) params.set('alpn', client.alpn);

    if (client.reality_enabled) {
      if (client.reality_public_key) params.set('pbk', client.reality_public_key);
      if (client.reality_short_id) params.set('sid', client.reality_short_id);
    }

    switch (client.network) {
      case 'ws':
        if (client.ws_path) params.set('path', client.ws_path);
        if (client.ws_host) params.set('host', client.ws_host);
        break;
      case 'grpc':
        if (client.grpc_service_name) params.set('serviceName', client.grpc_service_name);
        params.set('mode', 'gun');
        break;
    }

    const fragment = encodeURIComponent(client.name);
    return `trojan://${client.uuid}@${address}:${client.port}?${params.toString()}#${fragment}`;
  }

  // ========== SHADOWSOCKS ==========
  static generateShadowsocksLink(client) {
    const address = this.getServerAddress();
    const method = client.ss_method || 'chacha20-ietf-poly1305';
    const password = client.ss_password || client.uuid;
    
    const userInfo = Buffer.from(`${method}:${password}`).toString('base64');
    const fragment = encodeURIComponent(client.name);
    
    return `ss://${userInfo}@${address}:${client.port}#${fragment}`;
  }

  // ========== SHADOWSOCKS 2022 ==========
  static generateSS2022Link(client) {
    const address = this.getServerAddress();
    const method = client.ss_method || '2022-blake3-aes-128-gcm';
    const password = client.ss_password;
    
    let params = new URLSearchParams();
    params.set('type', client.network || 'tcp');
    
    const fragment = encodeURIComponent(client.name);
    const userInfo = Buffer.from(`${method}:${password}`).toString('base64');
    
    return `ss://${userInfo}@${address}:${client.port}?${params.toString()}#${fragment}`;
  }

  // ========== HYSTERIA2 ==========
  static generateHysteria2Link(client) {
    const address = this.getServerAddress();
    let params = new URLSearchParams();
    
    if (client.sni) params.set('sni', client.sni);
    params.set('insecure', client.tls ? '0' : '1');
    
    const fragment = encodeURIComponent(client.name);
    return `hysteria2://${client.uuid}@${address}:${client.port}?${params.toString()}#${fragment}`;
  }

  // ========== TUIC ==========
  static generateTuicLink(client) {
    const address = this.getServerAddress();
    let params = new URLSearchParams();
    
    params.set('congestion_control', 'bbr');
    params.set('alpn', client.alpn || 'h3');
    if (client.sni) params.set('sni', client.sni);
    params.set('udp_relay_mode', 'native');
    
    const fragment = encodeURIComponent(client.name);
    return `tuic://${client.uuid}:${client.ss_password || client.uuid}@${address}:${client.port}?${params.toString()}#${fragment}`;
  }

  // ========== WIREGUARD ==========
  static generateWireGuardConfig(client) {
    const address = this.getServerAddress();
    
    return `[Interface]
PrivateKey = ${client.wg_private_key}
Address = ${client.wg_address}/32
DNS = ${client.wg_dns || '1.1.1.1'}

[Peer]
PublicKey = ${client.wg_public_key}
PresharedKey = ${client.wg_pre_shared_key || ''}
Endpoint = ${address}:${client.port}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;
  }

  // Generate link based on protocol
  static generateLink(client) {
    switch (client.protocol) {
      case 'vless':
        return this.generateVlessLink(client);
      case 'vmess':
        return this.generateVmessLink(client);
      case 'trojan':
        return this.generateTrojanLink(client);
      case 'shadowsocks':
        return this.generateShadowsocksLink(client);
      case 'ss2022':
        return this.generateSS2022Link(client);
      case 'hysteria2':
        return this.generateHysteria2Link(client);
      case 'tuic':
        return this.generateTuicLink(client);
      case 'wireguard':
        return this.generateWireGuardConfig(client);
      default:
        return this.generateVlessLink(client);
    }
  }

  // Generate subscription content (base64 encoded links)
  static generateSubscription(clients) {
    const links = clients
      .filter(c => c.enabled && c.protocol !== 'wireguard')
      .map(c => this.generateLink(c));
    
    return Buffer.from(links.join('\n')).toString('base64');
  }
}

module.exports = ProtocolService;
