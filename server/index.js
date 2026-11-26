// Clinic server API: the clinic PCs send their students' rounds here and get back everyone's data.
// Runs behind Caddy/nginx (HTTPS) and listens only on 127.0.0.1. No secret lives in the code:
// each PC gets its own token by pairing once with a code from `node admin.js parear "Sala 1"`.
//   POST /api/parear  { code, nome }        -> { token, nome }
//   POST /api/sync    { ops: [...] }  (Authorization: Bearer <token>) -> { k, r, at }
//   GET  /api/saude                         -> { ok: true }
const http = require('http');
const zlib = require('zlib');
const path = require('path');
const { open } = require('./db');

const PORT = +process.env.DL_PORT || 8790;
const DB = process.env.DL_DB || path.join(__dirname, 'dados', 'alunos.sqlite');
require('fs').mkdirSync(path.dirname(DB), { recursive: true });
const db = open(DB);

const tries = new Map(); // pairing attempts per IP, against guessing codes
function tooMany(ip) {
  const t = Date.now(), list = (tries.get(ip) || []).filter(x => t - x < 15 * 60000);
  list.push(t); tries.set(ip, list);
  return list.length > 10;
}

function body(req, max = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(new Error('grande demais')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(req, res, code, obj) {
  let out = Buffer.from(JSON.stringify(obj));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (out.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { out = zlib.gzipSync(out); headers['Content-Encoding'] = 'gzip'; }
  res.writeHead(code, headers);
  res.end(out);
}

const server = http.createServer(async (req, res) => {
  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/api/saude') return send(req, res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/api/parear') {
      if (tooMany(ip)) return send(req, res, 429, { erro: 'Muitas tentativas. Espere 15 minutos.' });
      const b = await body(req, 4096);
      const r = db.pair(b.code, b.nome);
      if (!r) return send(req, res, 403, { erro: 'Código inválido ou vencido.' });
      console.log(`PC conectado: #${r.id} ${r.name}`);
      return send(req, res, 200, { token: r.token, nome: r.name });
    }
    if (req.method === 'POST' && url.pathname === '/api/sync') {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      const dev = db.device(m && m[1]);
      if (!dev) return send(req, res, 401, { erro: 'Este PC não está conectado à clínica.' });
      const b = await body(req);
      return send(req, res, 200, db.sync(dev, Array.isArray(b.ops) ? b.ops : []));
    }
    send(req, res, 404, { erro: 'não encontrado' });
  } catch (e) {
    console.error(e);
    send(req, res, 400, { erro: 'pedido inválido' });
  }
});

server.listen(PORT, process.env.DL_HOST || '127.0.0.1', () => console.log(`API dos alunos em ${process.env.DL_HOST || '127.0.0.1'}:${PORT}, banco ${DB}`));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { server.close(); db.close(); process.exit(0); });
