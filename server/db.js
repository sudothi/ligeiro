// Students database for the clinic server (SQLite, built into Node 22).
// Same shapes as src/js/students.js: kids [id, name, key], rounds [kid, minute, digits, nameSecs, items].
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const keyOf = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const now = () => Date.now();

function open(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
      created INTEGER NOT NULL, last_seen INTEGER, revoked INTEGER);
    CREATE TABLE IF NOT EXISTS pair_codes (code_hash TEXT PRIMARY KEY, name TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kids (id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rounds (op TEXT PRIMARY KEY, kid INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      minute INTEGER NOT NULL, digits INTEGER NOT NULL, name_secs INTEGER NOT NULL, items TEXT NOT NULL, device INTEGER);
    CREATE INDEX IF NOT EXISTS rounds_kid ON rounds(kid);
    CREATE TABLE IF NOT EXISTS applied (op TEXT PRIMARY KEY, at INTEGER NOT NULL);
  `);
  const q = {
    kidByKey: db.prepare('SELECT id, name, key FROM kids WHERE key = ?'),
    addKid: db.prepare('INSERT INTO kids (key, name) VALUES (?, ?)'),
    renameKid: db.prepare('UPDATE kids SET key = ?, name = ? WHERE id = ?'),
    delKid: db.prepare('DELETE FROM kids WHERE id = ?'),
    moveRounds: db.prepare('UPDATE rounds SET kid = ? WHERE kid = ?'),
    addRound: db.prepare('INSERT OR IGNORE INTO rounds (op, kid, minute, digits, name_secs, items, device) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    applied: db.prepare('SELECT 1 FROM applied WHERE op = ?'),
    markApplied: db.prepare('INSERT OR IGNORE INTO applied (op, at) VALUES (?, ?)'),
    allKids: db.prepare('SELECT id, name, key FROM kids ORDER BY id'),
    allRounds: db.prepare('SELECT kid, minute, digits, name_secs, items FROM rounds ORDER BY minute, op'),
    devByToken: db.prepare('SELECT id, name FROM devices WHERE token_hash = ? AND revoked IS NULL'),
    seen: db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?'),
    addDevice: db.prepare('INSERT INTO devices (name, token_hash, created) VALUES (?, ?, ?)'),
    addCode: db.prepare('INSERT INTO pair_codes (code_hash, name, expires) VALUES (?, ?, ?)'),
    takeCode: db.prepare('DELETE FROM pair_codes WHERE code_hash = ? AND expires > ? RETURNING name'),
    oldCodes: db.prepare('DELETE FROM pair_codes WHERE expires <= ?'),
    devices: db.prepare('SELECT id, name, created, last_seen, revoked FROM devices ORDER BY id'),
    revoke: db.prepare('UPDATE devices SET revoked = ? WHERE id = ? AND revoked IS NULL')
  };

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function kidFor(key, name) {
    const k = keyOf(key || name);
    if (!k) return null;
    const row = q.kidByKey.get(k);
    if (row) return row.id;
    return Number(q.addKid.run(k, cleanName(name) || k).lastInsertRowid);
  }

  /* One change sent by a PC. Every op has a unique id, so sending it twice does nothing. */
  function applyOp(op, device) {
    if (!op || typeof op.id !== 'string' || op.id.length > 80) return;
    if (op.t === 'round') {
      const kid = kidFor(op.key, op.name);
      if (!kid || typeof op.items !== 'string' || op.items.length > 4000) return;
      q.addRound.run(op.id, kid, op.minute | 0, op.digits | 0, op.nameSecs | 0, op.items, device);
      return;
    }
    if (q.applied.get(op.id)) return;
    q.markApplied.run(op.id, now());
    if (op.t === 'kid') kidFor(op.key, op.name);
    else if (op.t === 'rename') {
      const from = q.kidByKey.get(keyOf(op.key));
      const nm = cleanName(op.name), to = keyOf(nm);
      if (!from || !to) return;
      const other = q.kidByKey.get(to);
      if (other && other.id !== from.id) { q.moveRounds.run(other.id, from.id); q.delKid.run(from.id); }
      else q.renameKid.run(to, nm, from.id);
    } else if (op.t === 'merge') {
      const a = q.kidByKey.get(keyOf(op.from)), b = q.kidByKey.get(keyOf(op.into));
      if (!a || !b || a.id === b.id) return;
      q.moveRounds.run(b.id, a.id); q.delKid.run(a.id);
    } else if (op.t === 'remove') {
      const a = q.kidByKey.get(keyOf(op.key));
      if (a) q.delKid.run(a.id); // rounds go with it (ON DELETE CASCADE)
    }
  }

  return {
    sync(device, ops) {
      tx(() => { for (const op of (ops || []).slice(0, 500)) applyOp(op, device.id); q.seen.run(now(), device.id); });
      return {
        k: q.allKids.all().map(r => [r.id, r.name, r.key]),
        r: q.allRounds.all().map(r => [r.kid, r.minute, r.digits, r.name_secs, r.items]),
        at: now()
      };
    },
    device(token) { return token ? q.devByToken.get(sha(token)) || null : null; },
    newPairCode(name, minutes = 30) {
      q.oldCodes.run(now());
      const code = Array.from(crypto.randomBytes(8), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
      q.addCode.run(sha(code), String(name).slice(0, 40), now() + minutes * 60000);
      return code;
    },
    pair(code, pcName) {
      const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const row = c.length === 8 ? q.takeCode.get(sha(c), now()) : null;
      if (!row) return null;
      const token = crypto.randomBytes(32).toString('base64url');
      const name = String(pcName || '').trim().slice(0, 40) || row.name;
      const id = Number(q.addDevice.run(name, sha(token), now()).lastInsertRowid);
      return { token, id, name };
    },
    devices: () => q.devices.all(),
    revoke: id => q.revoke.run(now(), id).changes > 0,
    close: () => db.close()
  };
}

module.exports = { open, keyOf };
