/* Children ("alunos") and their rounds, kept only on this device (LGPD).
   One small JSON file, written through window.storageBridge (Electron: userData file,
   Android: app files dir) or localStorage as a fallback. Compact format:
     k: [[id, name, key]]                         children; key = name without accents/case
     r: [[kid, minute, digits, nameSecs, "num,flag,repeats,secs,marks;..."]]
        flag 1 = certo, 2 = pulado; marks = bitmask of digit positions the professor marked wrong
     m: [[kid, "YYYY-MM", digits, nums, ok, skip, rep, secs, appearances[10], hard[10]]]
        monthly summaries that replace rounds older than KEEP_DAYS
   About 120 bytes per round of 10 numbers.
   Clinic edition (PC with window.syncBridge, paired once): every change is also an "op" in the
   outbox o:[...]; sync() sends it to the clinic server and gets back everyone's kids and rounds,
   which replace k and r (server ids). Ops not yet sent are replayed on top. Kids are matched across
   PCs by key (name without accents), so "Ana" on two PCs is one child. */
(function () {
  const KEEP_DAYS = 730;
  let data = { v: 1, pin: null, n: 1, k: [], r: [], m: [], dev: null, seq: 0, o: [], synced: 0 };
  const remap = {};          // old kid id -> new kid id after a sync (the game may hold an old one)
  let syncOn = false;        // this PC is paired with the clinic server
  let syncing = null, syncTimer = null, lastSync = { ok: null, at: null, error: null, pending: 0 };
  let loaded = null;
  let saveTimer = null;

  const keyOf = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const cleanName = s => String(s || '').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const nowMin = () => Math.floor(Date.now() / 60000);

  function bridge() { return window.storageBridge || null; }

  function load() {
    if (loaded) return loaded;
    loaded = (async () => {
      let text = null;
      try {
        const b = bridge();
        text = b ? await b.load() : localStorage.getItem('dl_alunos');
      } catch (e) { text = null; }
      if (text) {
        try {
          const d = JSON.parse(text);
          if (d && d.v === 1 && Array.isArray(d.k) && Array.isArray(d.r)) data = Object.assign({ pin: null, n: 1, m: [], dev: null, seq: 0, o: [], synced: 0 }, d);
        } catch (e) { /* unreadable file: start empty, keep the old file until the next save */ }
      }
      if (!data.dev) data.dev = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      if (!data.synced) compact();   // with the clinic server, the server keeps every round
      try { const st = window.syncBridge ? await window.syncBridge.status() : null; syncOn = !!(st && st.paired); } catch (e) {}
      if (!syncOn) data.o = [];
      setTimeout(() => sync(), 1500);
      setInterval(() => sync(), 5 * 60000);
      return data;
    })();
    return loaded;
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    const text = JSON.stringify(data);
    try {
      const b = bridge();
      if (b) await b.save(text); else localStorage.setItem('dl_alunos', text);
    } catch (e) { console.error('Não foi possível salvar os alunos', e); }
  }

  /* ---------- children ---------- */
  function resolve(id) { let n = 0; while (remap[id] !== undefined && n++ < 20) id = remap[id]; return id; }
  function kidById(id) { id = resolve(id); return data.k.find(k => k[0] === id) || null; }
  const kidByKey = key => data.k.find(k => k[2] === key) || null;
  const newId = () => data.synced ? -(data.n++) : data.n++;   // negative = made here, not on the server yet

  /* ---------- changes, as ops (applied here now, and on the server when synced) ---------- */
  function apply(op) {
    if (op.t === 'kid' || op.t === 'round') {
      let kid = kidByKey(op.key);
      if (!kid) { kid = [newId(), op.name, op.key]; data.k.push(kid); }
      if (op.t === 'round') data.r.push([kid[0], op.minute, op.digits, op.nameSecs, op.items]);
    } else if (op.t === 'rename') {
      const kid = kidByKey(op.key), to = keyOf(op.name);
      if (!kid || !to) return;
      const other = kidByKey(to);
      if (other && other !== kid) mergeIds(kid[0], other[0]); else { kid[1] = op.name; kid[2] = to; }
    } else if (op.t === 'merge') {
      const a = kidByKey(op.from), b = kidByKey(op.into);
      if (a && b && a !== b) mergeIds(a[0], b[0]);
    } else if (op.t === 'remove') {
      const kid = kidByKey(op.key);
      if (kid) { const id = kid[0]; data.k = data.k.filter(k => k[0] !== id); data.r = data.r.filter(r => r[0] !== id); data.m = data.m.filter(x => x[0] !== id); }
    }
  }
  function mergeIds(fromId, intoId) {
    for (const r of data.r) if (r[0] === fromId) r[0] = intoId;
    for (const x of data.m) if (x[0] === fromId) x[0] = intoId;
    data.k = data.k.filter(k => k[0] !== fromId);
    remap[fromId] = intoId;
  }
  function change(op) {
    apply(op);
    if (syncOn) { op.id = `${data.dev}:${++data.seq}`; data.o.push(op); syncSoon(); }
  }

  function findOrCreate(name) {
    const nm = cleanName(name);
    const key = keyOf(nm);
    if (!key) return null;
    let isNew = false;
    if (!kidByKey(key)) { change({ t: 'kid', key, name: nm }); isNew = true; saveSoon(); }
    const kid = kidByKey(key);
    return { id: kid[0], name: kid[1], isNew };
  }

  /* ---------- rounds ---------- */
  function addRound(kidId, digits, nameSecs, numbers) {
    const kid = kidById(kidId);
    if (!kid || !numbers.length) return;
    const enc = numbers.map(n => [n.num, n.status === 'ok' ? 1 : 2, n.repeats || 0, Math.min(999, Math.round(n.secs || 0)), n.marks || 0].join(',')).join(';');
    change({ t: 'round', key: kid[2], name: kid[1], minute: nowMin(), digits, nameSecs: Math.round(nameSecs || 0), items: enc });
    saveSoon();
  }

  function decode(r) {
    return {
      kid: r[0], t: r[1] * 60000, digits: r[2], nameSecs: r[3],
      nums: r[4] ? r[4].split(';').map(s => {
        const [num, flag, rep, secs, marks] = s.split(',');
        return { num, ok: flag === '1', rep: +rep, secs: +secs, marks: +marks };
      }) : []
    };
  }

  /* A number counts as "difícil" when it was skipped, repeated or had a digit marked wrong.
     Digits blamed: the marked positions if any, else every digit of a skipped/repeated number. */
  function hardDigits(n) {
    const ds = [...n.num];
    if (n.marks) return ds.filter((_, i) => n.marks & (1 << i));
    return !n.ok || n.rep > 0 ? ds : [];
  }
  const isHard = n => !n.ok || n.rep > 0 || n.marks > 0;

  /* Rounds older than KEEP_DAYS become one line per child, month and level. */
  function compact() {
    const limit = nowMin() - KEEP_DAYS * 1440;
    const old = data.r.filter(r => r[1] < limit);
    if (!old.length) return;
    data.r = data.r.filter(r => r[1] >= limit);
    for (const raw of old) {
      const r = decode(raw);
      const ym = new Date(r.t).toISOString().slice(0, 7);
      let s = data.m.find(x => x[0] === r.kid && x[1] === ym && x[2] === r.digits);
      if (!s) { s = [r.kid, ym, r.digits, 0, 0, 0, 0, 0, Array(10).fill(0), Array(10).fill(0)]; data.m.push(s); }
      for (const n of r.nums) {
        s[3]++; if (n.ok) s[4]++; else s[5]++; if (n.rep) s[6]++; s[7] += n.secs;
        for (const d of n.num) s[8][+d]++;
        for (const d of hardDigits(n)) s[9][+d]++;
      }
    }
    saveSoon();
  }

  /* ---------- statistics ---------- */
  function periodStart(period) {
    if (!period || period === 'all') return 0;
    return Date.now() - (+period) * 86400000;
  }

  function stats(kidId, period) {
    const kid = kidById(kidId);
    if (!kid) return null;
    kidId = kid[0];
    const from = periodStart(period);
    const rounds = data.r.filter(r => r[0] === kidId && r[1] * 60000 >= from).map(decode);
    const sums = data.m.filter(s => s[0] === kidId && (!from || new Date(s[1] + '-28').getTime() >= from));

    const level = {}; for (let l = 1; l <= 4; l++) level[l] = { n: 0, ok: 0, skip: 0, rep: 0, hard: 0, secs: 0 };
    const digit = Array.from({ length: 10 }, () => ({ n: 0, hard: 0 }));
    const pos = { first: 0, middle: 0, last: 0, marked: 0 };
    const numHard = {};
    const sessions = {};
    let n = 0, ok = 0, skip = 0, rep = 0, secs = 0;

    for (const r of rounds) {
      const L = level[r.digits] || (level[r.digits] = { n: 0, ok: 0, skip: 0, rep: 0, hard: 0, secs: 0 });
      const day = new Date(r.t); day.setHours(0, 0, 0, 0);
      const dk = day.getTime();
      const S = sessions[dk] || (sessions[dk] = { t: dk, n: 0, ok: 0, name: [], rounds: 0 });
      S.rounds++; if (r.nameSecs > 0) S.name.push(r.nameSecs);
      for (const x of r.nums) {
        n++; L.n++; S.n++; secs += x.secs; L.secs += x.secs;
        if (x.ok) { ok++; L.ok++; S.ok++; } else { skip++; L.skip++; }
        if (x.rep) { rep++; L.rep++; }
        if (isHard(x)) { L.hard++; numHard[x.num] = (numHard[x.num] || 0) + (x.ok ? 1 : 2) + x.rep; }
        for (const d of x.num) digit[+d].n++;
        for (const d of hardDigits(x)) digit[+d].hard++;
        if (x.marks && x.num.length > 1) {
          for (let i = 0; i < x.num.length; i++) {
            if (!(x.marks & (1 << i))) continue;
            pos.marked++;
            if (i === 0) pos.first++; else if (i === x.num.length - 1) pos.last++; else pos.middle++;
          }
        }
      }
    }
    for (const s of sums) {
      const L = level[s[2]] || (level[s[2]] = { n: 0, ok: 0, skip: 0, rep: 0, hard: 0, secs: 0 });
      L.n += s[3]; L.ok += s[4]; L.skip += s[5]; L.rep += s[6]; L.secs += s[7]; L.hard += s[5] + s[6];
      n += s[3]; ok += s[4]; skip += s[5]; rep += s[6]; secs += s[7];
      for (let d = 0; d < 10; d++) { digit[d].n += s[8][d]; digit[d].hard += s[9][d]; }
    }

    const hardest = Object.entries(numHard).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([num, score]) => ({ num, score }));
    const evolution = Object.values(sessions).sort((a, b) => a.t - b.t).map(s => ({
      t: s.t, acc: s.n ? Math.round((100 * s.ok) / s.n) : 0, n: s.n, rounds: s.rounds,
      name: s.name.length ? Math.round(s.name.reduce((a, b) => a + b, 0) / s.name.length) : null
    }));
    const lastT = rounds.length ? rounds[rounds.length - 1].t : null;
    return {
      id: kid[0], name: kid[1], period: period || 'all', from: from || null,
      rounds: rounds.length + sums.length, numbers: n, ok, skip, rep,
      acc: n ? Math.round((100 * ok) / n) : null, avgSecs: n ? Math.round((10 * secs) / n) / 10 : null,
      level, digit, pos, hardest, evolution, last: lastT
    };
  }

  function list() {
    return data.k.map(k => {
      const rs = data.r.filter(r => r[0] === k[0]);
      let n = 0, ok = 0;
      for (const r of rs) for (const x of decode(r).nums) { n++; if (x.ok) ok++; }
      for (const s of data.m) if (s[0] === k[0]) { n += s[3]; ok += s[4]; }
      const last = rs.length ? rs[rs.length - 1][1] * 60000 : null;
      return { id: k[0], name: k[1], rounds: rs.length, acc: n ? Math.round((100 * ok) / n) : null, last };
    }).sort((a, b) => (b.last || 0) - (a.last || 0) || a.name.localeCompare(b.name));
  }

  function rename(id, name) {
    const kid = kidById(id);
    const nm = cleanName(name);
    const key = keyOf(nm);
    if (!kid || !key) return { ok: false, error: 'Nome vazio.' };
    const other = data.k.find(k => k[2] === key && k !== kid);
    if (other) return { ok: false, error: `Já existe "${other[1]}". Use "Juntar" para unir as duas fichas.` };
    change({ t: 'rename', key: kid[2], name: nm }); saveSoon();
    return { ok: true };
  }
  function merge(fromId, intoId) {
    const a = kidById(fromId), b = kidById(intoId);
    if (!a || !b || a === b) return { ok: false, error: 'Escolha outra criança.' };
    change({ t: 'merge', from: a[2], into: b[2] });
    saveSoon();
    return { ok: true };
  }
  function remove(id) {
    const kid = kidById(id);
    if (kid) change({ t: 'remove', key: kid[2] });
    saveNow();
    return { ok: true };
  }

  /* ---------- clinic server ---------- */
  function syncSoon() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 2000); }

  /* First sync of a PC that already has children: send everything it has as ops. */
  function seedOps() {
    const ops = [];
    const h = str => { let x = 5381; for (let i = 0; i < str.length; i++) x = (x * 33 + str.charCodeAt(i)) >>> 0; return x.toString(36); };
    for (const k of data.k) ops.push({ id: `${data.dev}:k${h(k[2])}`, t: 'kid', key: k[2], name: k[1] });
    const seen = {};
    for (const r of data.r) {
      const k = data.k.find(x => x[0] === r[0]);
      if (!k) continue;
      let id = `${data.dev}:r${r[1]}-${h(k[2] + r[4])}`;
      seen[id] = (seen[id] || 0) + 1;            // two equal rounds in the same minute stay two
      if (seen[id] > 1) id += '-' + seen[id];
      ops.push({ id, t: 'round', key: k[2], name: k[1], minute: r[1], digits: r[2], nameSecs: r[3], items: r[4] });
    }
    return ops;
  }

  function sync() {
    const b = window.syncBridge;
    if (!b || !syncOn || syncing) return syncing || Promise.resolve(lastSync);
    syncing = (async () => {
      await load();
      if (!data.synced) data.o = seedOps();   // first time: everything this PC has (already includes pending changes)
      const sending = data.o.slice(0, 500);
      const r = await b.sync(sending).catch(e => ({ ok: false, offline: true, error: String(e) }));
      if (r && r.ok && r.data && Array.isArray(r.data.k) && Array.isArray(r.data.r)) {
        const sent = new Set(sending.map(o => o.id));
        data.o = data.o.filter(o => !sent.has(o.id));
        const oldKeys = new Map(data.k.map(k => [k[0], k[2]]));
        data.synced = r.data.at || Date.now();
        data.k = r.data.k; data.r = r.data.r;
        const byKey = new Map(data.k.map(k => [k[2], k[0]]));
        for (const [oldId, key] of oldKeys) { const nid = byKey.get(key); if (nid !== undefined && nid !== oldId) remap[oldId] = nid; }
        for (const x of data.m) x[0] = resolve(x[0]);
        for (const op of data.o) apply(op);   // changes made while this sync was on its way
        lastSync = { ok: true, at: Date.now(), error: null, pending: data.o.length };
        saveSoon();
        if (data.o.length) syncSoon();
      } else {
        if (r && r.unpaired) syncOn = false;
        lastSync = { ok: false, at: lastSync.at, error: r && (r.unpaired ? 'unpaired' : r.error || 'offline'), pending: data.o.length };
        if (r && !r.unpaired && data.o.length) saveSoon();
      }
      return lastSync;
    })().finally(() => { syncing = null; });
    return syncing;
  }

  function csv() {
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const lines = ['crianca;data;hora;algarismos;numero;resultado;repeticoes;segundos;algarismos_marcados;segundos_para_digitar_nome'];
    for (const raw of data.r) {
      const r = decode(raw);
      const kid = kidById(r.kid); if (!kid) continue;
      const d = new Date(r.t);
      const date = d.toLocaleDateString('pt-BR'), time = d.toTimeString().slice(0, 5);
      for (const x of r.nums) {
        const marked = [...x.num].filter((_, i) => x.marks & (1 << i)).join(' ');
        lines.push([q(kid[1]), date, time, r.digits, q(x.num), x.ok ? 'certo' : 'pulado', x.rep, x.secs, q(marked), r.nameSecs].join(';'));
      }
    }
    return '﻿' + lines.join('\r\n');
  }

  /* ---------- PIN for the "Alunos" screen on the game device ---------- */
  function hasPin() { return !!data.pin; }
  function setPin(p) { if (/^\d{4}$/.test(p)) { data.pin = p; saveNow(); return true; } return false; }
  function checkPin(p) { return !!data.pin && data.pin === p; }
  function clearPin() { data.pin = null; saveNow(); }

  window.Students = {
    load, saveNow, keyOf, cleanName,
    findOrCreate, kidById: id => { const k = kidById(id); return k ? { id: k[0], name: k[1] } : null; },
    addRound, stats, list, rename, merge, remove, csv,
    /* after pairing this PC: send what it has and start syncing */
    startSync: () => { syncOn = true; data.synced = 0; data.o = []; return sync(); },
    stopSync: () => { syncOn = false; data.o = []; data.synced = 0; saveNow(); },
    sync, syncInfo: () => Object.assign({}, lastSync, { pending: data.o.length, synced: data.synced }), resolve,
    hasPin, setPin, checkPin, clearPin,
    _data: () => data
  };
  window.addEventListener('load', () => { load(); });
})();
