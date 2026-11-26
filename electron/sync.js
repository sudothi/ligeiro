// Sends this PC's students' changes to the clinic server and brings back everyone's data.
// Only in the clinic edition (src/edition.json has "api"). The PC's token comes from pairing once
// ("Conectar à clínica" with a code made on the server) and is kept encrypted by Windows (safeStorage).
const { app, net, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { readEdition } = require('./updater');

function createSync() {
  const ed = readEdition();
  const api = ed && ed.api ? ed.api.replace(/\/+$/, '') + '/' : null;
  const file = () => path.join(app.getPath('userData'), 'clinica.json');

  function readCfg() {
    try {
      const c = JSON.parse(fs.readFileSync(file(), 'utf8'));
      const token = c.enc ? safeStorage.decryptString(Buffer.from(c.token, 'base64')) : c.token;
      return { name: c.name, token, at: c.at || null };
    } catch (e) { return null; }
  }
  function writeCfg(name, token) {
    const enc = safeStorage.isEncryptionAvailable();
    const t = enc ? safeStorage.encryptString(token).toString('base64') : token;
    fs.writeFileSync(file(), JSON.stringify({ name, token: t, enc }), { mode: 0o600 });
  }

  async function post(pathname, payload, token, ms = 15000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await net.fetch(api + pathname, {
        method: 'POST', signal: ctl.signal, cache: 'no-store',
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: JSON.stringify(payload)
      });
      let data = null; try { data = await res.json(); } catch (e) {}
      return { status: res.status, data };
    } finally { clearTimeout(timer); }
  }

  return {
    status() { const c = readCfg(); return { enabled: !!api, paired: !!(c && c.token), name: c ? c.name : null }; },
    async pair(code, name) {
      if (!api) return { ok: false, error: 'Esta versão não tem servidor da clínica.' };
      try {
        const r = await post('parear', { code, nome: name });
        if (r.status !== 200 || !r.data || !r.data.token) return { ok: false, error: (r.data && r.data.erro) || 'Não deu certo (' + r.status + ').' };
        writeCfg(r.data.nome, r.data.token);
        return { ok: true, name: r.data.nome };
      } catch (e) { return { ok: false, error: 'Sem conexão com o servidor da clínica.' }; }
    },
    unpair() { try { fs.unlinkSync(file()); } catch (e) {} return { ok: true }; },
    /** { ok, data:{k,r,at} } | { ok:false, offline } | { ok:false, unpaired } */
    async sync(ops) {
      const c = readCfg();
      if (!api || !c || !c.token) return { ok: false, unpaired: true };
      try {
        const r = await post('sync', { ops: Array.isArray(ops) ? ops : [] }, c.token, 30000);
        if (r.status === 401) return { ok: false, unpaired: true, error: r.data && r.data.erro };
        if (r.status !== 200 || !r.data) return { ok: false, offline: true, error: 'HTTP ' + r.status };
        return { ok: true, data: r.data };
      } catch (e) { return { ok: false, offline: true, error: e.message }; }
    }
  };
}

module.exports = { createSync };
