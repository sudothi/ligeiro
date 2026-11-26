/* Children ("alunos") and their rounds, kept only on this device (LGPD).
   One small JSON file, written through window.storageBridge (Electron: userData file,
   Android: app files dir) or localStorage as a fallback. Compact format:
     k: [[id, name, key]]                         children; key = name without accents/case
     r: [[kid, minute, digits, nameSecs, "num,flag,repeats,secs,marks;..."]]
        flag 1 = certo, 2 = pulado; marks = bitmask of digit positions the professor marked wrong
     m: [[kid, "YYYY-MM", digits, nums, ok, skip, rep, secs, appearances[10], hard[10]]]
        monthly summaries that replace rounds older than KEEP_DAYS
   About 120 bytes per round of 10 numbers. */
(function () {
  const KEEP_DAYS = 730;
  let data = { v: 1, pin: null, n: 1, k: [], r: [], m: [] };
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
          if (d && d.v === 1 && Array.isArray(d.k) && Array.isArray(d.r)) data = Object.assign({ pin: null, n: 1, m: [] }, d);
        } catch (e) { /* unreadable file: start empty, keep the old file until the next save */ }
      }
      compact();
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
  function kidById(id) { return data.k.find(k => k[0] === id) || null; }
  function findOrCreate(name) {
    const nm = cleanName(name);
    const key = keyOf(nm);
    if (!key) return null;
    let kid = data.k.find(k => k[2] === key);
    let isNew = false;
    if (!kid) { kid = [data.n++, nm, key]; data.k.push(kid); isNew = true; saveSoon(); }
    return { id: kid[0], name: kid[1], isNew };
  }

  /* ---------- rounds ---------- */
  function addRound(kidId, digits, nameSecs, numbers) {
    if (!kidById(kidId) || !numbers.length) return;
    const enc = numbers.map(n => [n.num, n.status === 'ok' ? 1 : 2, n.repeats || 0, Math.min(999, Math.round(n.secs || 0)), n.marks || 0].join(',')).join(';');
    data.r.push([kidId, nowMin(), digits, Math.round(nameSecs || 0), enc]);
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
    const other = data.k.find(k => k[2] === key && k[0] !== id);
    if (other) return { ok: false, error: `Já existe "${other[1]}". Use "Juntar" para unir as duas fichas.` };
    kid[1] = nm; kid[2] = key; saveSoon();
    return { ok: true };
  }
  function merge(fromId, intoId) {
    if (fromId === intoId || !kidById(fromId) || !kidById(intoId)) return { ok: false, error: 'Escolha outra criança.' };
    for (const r of data.r) if (r[0] === fromId) r[0] = intoId;
    for (const s of data.m) if (s[0] === fromId) s[0] = intoId;
    data.k = data.k.filter(k => k[0] !== fromId);
    saveSoon();
    return { ok: true };
  }
  function remove(id) {
    data.k = data.k.filter(k => k[0] !== id);
    data.r = data.r.filter(r => r[0] !== id);
    data.m = data.m.filter(s => s[0] !== id);
    saveNow();
    return { ok: true };
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
    hasPin, setPin, checkPin, clearPin,
    _data: () => data
  };
  window.addEventListener('load', () => { load(); });
})();
