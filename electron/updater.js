// Auto-update for the PC. Which server it asks depends on the edition file copied in at
// build time (src/edition.json, from config/aberta.json or config/clinica.json).
// No edition file (e.g. `npm start`) = updater off.
//
// Feed layout (same for GitHub Releases and the clinic VPS):
//   <feed>update.json      { version, notes, windows: { url, sha256, size }, android: { url, versionCode, sha256, size } }
//   <feed>update.json.sig  base64 ECDSA P-256 / SHA-256 signature of update.json (raw 64-byte r||s)
// When the edition has a publicKey, the signature is required; the file's SHA-256 is always checked.
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TIMEOUT = 6000;

function readEdition() {
  const file = process.env.DL_EDITION || path.join(__dirname, '..', 'src', 'edition.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function newer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

function verifySig(text, sigB64, publicKeyB64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify('sha256', Buffer.from(text, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sigB64.trim(), 'base64'));
  } catch (e) { return false; }
}

async function get(url, ms = TIMEOUT) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await net.fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

function createUpdater() {
  const edition = readEdition();
  let pending = null;

  /** null when there is nothing to do (no edition, offline, same version, bad signature). */
  async function check() {
    if (!edition || !edition.feed || process.platform !== 'win32' && !process.env.DL_EDITION) return null;
    try {
      const feed = edition.feed.endsWith('/') ? edition.feed : edition.feed + '/';
      const text = await get(feed + 'update.json');
      if (edition.publicKey) {
        const sig = await get(feed + 'update.json.sig');
        if (!verifySig(text, sig, edition.publicKey)) { console.error('update.json: assinatura inválida'); return null; }
      }
      const m = JSON.parse(text);
      const w = m.windows;
      if (!w || !w.url || !/^[0-9a-f]{64}$/i.test(w.sha256 || '') || !newer(m.version, app.getVersion())) return null;
      pending = { version: m.version, notes: String(m.notes || ''), url: new URL(w.url, feed).href, sha256: w.sha256.toLowerCase(), size: w.size || 0 };
      return { version: pending.version, notes: pending.notes, current: app.getVersion(), edition: edition.edition };
    } catch (e) {
      console.error('Atualização: não foi possível conferir:', e.message);
      return null;
    }
  }

  /** Downloads the installer, checks it, starts it silently and quits. Rejects on any problem. */
  async function install(onProgress) {
    if (!pending) throw new Error('nada para instalar');
    const file = path.join(app.getPath('temp'), `dedos-ligeiros-${pending.version}.exe`);
    const res = await net.fetch(pending.url, { cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || pending.size || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let got = 0, last = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        if (!out.write(value)) await new Promise(r => out.once('drain', r));
        got += value.length;
        const now = Date.now();
        if (now - last > 150) { last = now; onProgress(total ? got / total : 0); }
      }
    } finally { await new Promise(r => out.end(r)); }
    onProgress(1);
    if (hash.digest('hex') !== pending.sha256) { try { fs.unlinkSync(file); } catch (e) {} throw new Error('arquivo baixado não confere'); }
    if (process.env.DL_UPDATE_DRY) return { ok: true, file };
    // NSIS: /S = silent, --force-run = open the game again when done
    spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return { ok: true };
  }

  return { check, install, edition };
}

module.exports = { createUpdater, newer, verifySig, readEdition };
