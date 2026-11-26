// Local server for Mode 1: the professional's phone opens a page served by this app
// (same Wi-Fi, no internet) and sends actions to the game over a WebSocket.
// The room code travels in the QR/URL and is checked on every connection.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const dgram = require('dgram');

const ROOT = path.join(__dirname, '..');
const REMOTE_DIR = path.join(ROOT, 'remote');
const SRC_DIR = path.join(ROOT, 'src');
const PORTS = [8787, 8788, 8789, 8790, 8791];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon'
};
const ACTIONS = ['correct', 'repeat', 'skip', 'back', 'pause', 'quit', 'start', 'home', 'again', 'newKid',
  'type', 'erase', 'nameSet', 'nameDone', 'namePick', 'nameSkip', 'mark'];
const METHODS = ['list', 'stats', 'rename', 'merge', 'remove', 'report', 'csv', 'resetPin'];
// files of the game the phone page may load (report charts and the Alunos panel)
const SHARED_JS = ['/js/report.js', '/js/alunos-ui.js'];
const cleanArg = a => (typeof a === 'number' && isFinite(a)) ? a : (typeof a === 'string' ? a.slice(0, 40) : undefined);
const CONFIG_KEYS = ['digits', 'rounds', 'voice', 'sound'];
// The Android professor app finds games by room code alone: every second the game sends
// "DEDOSLIGEIROS 1 <port>" to the Wi-Fi broadcast address (no code inside); the app tries
// the code on each game it hears. Same format as android/.../Beacon.java.
const BEACON_PORT = 8786;

function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || !a.netmask) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      out.add(ip.map((b, i) => (b | (~mask[i] & 255))).join('.'));
    }
  }
  return [...out];
}

function newCode() {
  // 4 digits, no leading zero, easy to read aloud
  return String(1000 + Math.floor(Math.random() * 9000));
}

/* Pick the address the phone can reach: a private IPv4 on a real adapter.
   Virtual adapters (Hyper-V, WSL, VirtualBox, VMware, VPNs) are skipped when possible. */
function lanAddresses() {
  const virt = /(vEthernet|virtual|vmware|vbox|hyper-v|wsl|docker|loopback|tailscale|zerotier|hamachi|vpn|tap|tun)/i;
  const priv = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      out.push({ name, ip: a.address, score: (priv(a.address) ? 2 : 0) + (virt.test(name) ? 0 : 1) + (/^192\.168\./.test(a.address) ? 0.5 : 0) });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

function createServer({ onAction, onConfig, onClients, onRequest }) {
  let nextClient = 1;
  const byId = new Map();
  let code = newCode();
  let state = null;
  let port = null;
  const clients = new Set();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = null;
    if (url.pathname === '/' || url.pathname === '/index.html') file = path.join(REMOTE_DIR, 'index.html');
    else if (url.pathname.startsWith('/fonts/') || url.pathname === '/css/fonts.css' || SHARED_JS.includes(url.pathname)) file = safeJoin(SRC_DIR, url.pathname);
    else file = safeJoin(REMOTE_DIR, url.pathname);
    if (!file) { res.writeHead(400); res.end(); return; }
    serveFile(res, file);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      if (url.searchParams.get('code') !== code) {
        ws.send(JSON.stringify({ t: 'denied' }));
        ws.close(4001, 'codigo');
        return;
      }
      clients.add(ws);
      ws.cid = nextClient++;
      byId.set(ws.cid, ws);
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.send(JSON.stringify({ t: 'hello' }));
      if (state) ws.send(JSON.stringify({ t: 'state', state }));
      onClients(clients.size);
      ws.on('message', raw => {
        let m;
        try { m = JSON.parse(raw); } catch (e) { return; }
        if (m.t === 'action' && ACTIONS.includes(m.name)) onAction(m.name, cleanArg(m.arg));
        else if (m.t === 'req' && METHODS.includes(m.m) && Number.isInteger(m.id)) {
          const args = Array.isArray(m.a) ? m.a.slice(0, 3).map(cleanArg) : [];
          if (onRequest) onRequest(ws.cid, m.id, m.m, args);
        }
        else if (m.t === 'config' && CONFIG_KEYS.includes(m.key)) onConfig(m.key, m.v);
        else if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
      });
      ws.on('close', () => { clients.delete(ws); byId.delete(ws.cid); onClients(clients.size); });
    });
  });

  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('error', () => {});
  udp.bind(0, () => { try { udp.setBroadcast(true); } catch (e) {} });
  const beacon = setInterval(() => {
    if (!port) return;
    const msg = Buffer.from(`DEDOSLIGEIROS 1 ${port}`);
    for (const addr of broadcastAddresses()) udp.send(msg, BEACON_PORT, addr, () => {});
  }, 1000);

  // drop phones that vanished without closing (Wi-Fi dropped, screen locked)
  const beat = setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    }
  }, 10000);

  function listen(i = 0) {
    return new Promise((resolve, reject) => {
      if (i >= PORTS.length) { reject(new Error('Nenhuma porta livre')); return; }
      server.once('error', err => {
        if (err.code === 'EADDRINUSE') resolve(listen(i + 1));
        else reject(err);
      });
      server.listen(PORTS[i], '0.0.0.0', () => { port = PORTS[i]; resolve(port); });
    });
  }

  async function info() {
    const addrs = lanAddresses();
    const ip = addrs[0] ? addrs[0].ip : null;
    const url = ip && port ? `http://${ip}:${port}/?c=${code}` : null;
    const qr = url ? await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#2a1f4f', light: '#ffffff' } }) : null;
    return { code, port, ip, url, qr, others: addrs.slice(1).map(a => a.ip), clients: clients.size };
  }

  function broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === 1) ws.send(s);
  }

  return {
    listen,
    info,
    setState(s) { state = s; broadcast({ t: 'state', state }); },
    reply(cid, id, payload) {
      const ws = byId.get(cid);
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(Object.assign({ t: 'res', id }, payload)));
    },
    newCode() {
      code = newCode();
      for (const ws of clients) { try { ws.send(JSON.stringify({ t: 'denied' })); ws.close(4001, 'codigo'); } catch (e) {} }
      clients.clear();
      onClients(0);
    },
    close() { clearInterval(beat); clearInterval(beacon); try { udp.close(); } catch (e) {} wss.close(); server.close(); }
  };
}

module.exports = { createServer, lanAddresses, BEACON_PORT };
