/* Game flow: home -> game -> result.
   The professional drives the game with actions: correct, repeat, skip, back, pause.
   Actions come from the keyboard, the on-screen bar, or the professional's phone
   (js/remote.js, over the local network). Every change is published through
   Game.onChange so the phone can mirror the game. */
(function () {
  const $ = id => document.getElementById(id);
  const DIGIT_COLOR = d => `var(--d${d})`;

  /* ---------- settings ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dl_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('dl_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const cfg = {
    digits: store.get('digits', 1),
    rounds: store.get('rounds', 10),
    voice: store.get('voice', true),
    sound: store.get('sound', true)
  };
  Audio2.opts.voice = cfg.voice;
  Audio2.opts.sound = cfg.sound;

  const PRAISE = ['Isso aí!', 'Muito bem!', 'Arrasou!', 'Que dedinhos rápidos!', 'Perfeito!', 'Uhuu!'];
  const PROMPT = ['Mostre com os dedos!', 'Qual dedinho primeiro?', 'Você consegue!', 'Vamos lá!'];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------- mascots ---------- */
  const homeMascot = Mascot.mount($('homeMascot'));
  const bubble = $('bubble');
  const gameMascotBox = $('gameMascot');
  const mascotHolder = document.createElement('div');
  gameMascotBox.appendChild(mascotHolder);
  const gameMascot = Mascot.mount(mascotHolder);
  const resultMascot = Mascot.mount($('resultMascot'));

  function say(text) {
    bubble.textContent = text;
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  }

  /* ---------- numbers ---------- */
  function makeNumber(n, avoid) {
    let s;
    do {
      s = '';
      for (let i = 0; i < n; i++) s += String(i === 0 && n > 1 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10));
    } while (s === avoid);
    return s;
  }

  /* ---------- state ---------- */
  let rounds = [];   // [{num, status: null | 'ok' | 'skip', repeats, marks, secs, shownAt}]
  let idx = 0;
  let busy = false;
  let paused = false;
  let startedAt = 0;
  let screen = 'home';
  let lastResult = null;
  let kid = null;          // {id, name} of the child playing, or null (name skipped)
  let nameText = '';
  let nameStartedAt = 0;
  let nameSecs = 0;        // time the child took to type the name for this game (0 = not typed)

  /* ---------- change listeners (phone remote) ---------- */
  const listeners = [];
  let emitQueued = false;
  function snapshot() {
    const cur = rounds[idx];
    return {
      screen, paused, busy,
      idx, total: rounds.length,
      num: screen === 'game' && cur ? cur.num : null,
      marks: screen === 'game' && cur ? cur.marks || 0 : 0,
      name: screen === 'name' ? nameText : null,
      kid: kid ? kid.name : null,
      next: screen === 'game' && rounds[idx + 1] ? rounds[idx + 1].num : null,
      statuses: rounds.map(r => r.status),
      cfg: { digits: cfg.digits, rounds: cfg.rounds, voice: cfg.voice, sound: cfg.sound },
      result: screen === 'result' ? lastResult : null
    };
  }
  function emit() {
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => { emitQueued = false; const s = snapshot(); listeners.forEach(fn => { try { fn(s); } catch (e) {} }); });
  }

  function show(id) {
    screen = id;
    ['home', 'name', 'game', 'result', 'rings', 'alunos'].forEach(s => { if ($(s)) $(s).hidden = s !== id; });
    emit();
  }

  function start() {
    rounds = [];
    let last = '';
    for (let i = 0; i < cfg.rounds; i++) { last = makeNumber(cfg.digits, last); rounds.push({ num: last, status: null, repeats: 0, marks: 0, secs: 0, shownAt: 0 }); }
    idx = 0; busy = false; paused = false; startedAt = Date.now();
    $('levelChip').textContent = cfg.digits === 1 ? '1 algarismo' : `${cfg.digits} algarismos`;
    $('pause').hidden = true;
    show('game');
    render('enter');
  }

  function renderDots() {
    $('dots').innerHTML = rounds.map((r, i) =>
      `<i class="${i === idx ? 'now' : r.status || ''}"></i>`).join('');
  }

  function render(anim) {
    const cur = rounds[idx];
    $('prevNum').textContent = idx > 0 ? rounds[idx - 1].num : '';
    $('nextNum').textContent = idx < rounds.length - 1 ? rounds[idx + 1].num : '';
    const card = $('card');
    card.classList.toggle('one', cur.num.length === 1);
    card.innerHTML = [...cur.num].map((d, i) => `<span class="dig${cur.marks & (1 << i) ? ' marked' : ''}" style="--dc:${DIGIT_COLOR(d)}">${d}</span>`).join('');
    card.classList.remove('enter', 'win', 'leave');
    if (anim) { void card.offsetWidth; card.classList.add(anim); }
    renderDots();
    emit();
    gameMascot.set('happy');
    say(pick(PROMPT));
    if (anim === 'enter') { cur.shownAt = Date.now(); Audio2.sfx.appear(); }
  }

  function advance() {
    if (idx >= rounds.length - 1) { finish(); return; }
    const card = $('card');
    card.classList.remove('enter', 'win'); void card.offsetWidth; card.classList.add('leave');
    setTimeout(() => { idx++; busy = false; render('enter'); }, 280);
    emit();
  }

  function finish() {
    busy = false;
    Audio2.hush();
    const ok = rounds.filter(r => r.status === 'ok').length;
    const skip = rounds.filter(r => r.status === 'skip').length;
    const secs = Math.round((Date.now() - startedAt) / 1000);
    const ratio = ok / rounds.length;
    const stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
    $('stOk').textContent = ok;
    $('stSkip').textContent = skip;
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('stTime').textContent = time;
    lastResult = { ok, skip, time, stars, total: rounds.length, kid: kid ? kid.name : null };
    if (kid && window.Students) {
      Students.addRound(kid.id, cfg.digits, nameSecs, rounds.filter(r => r.status).map(r => ({ num: r.num, status: r.status, repeats: r.repeats, secs: r.secs, marks: r.marks })));
      nameSecs = 0; // "Jogar de novo" keeps the child without typing again
    }
    $('resultTitle').textContent = stars === 3 ? 'Incrível!' : stars === 2 ? 'Muito bem!' : 'Bom treino!';
    $('stars').innerHTML = [1, 2, 3].map(i => starSvg(i <= stars, i)).join('');
    show('result');
    resultMascot.set('cheer', 4000);
    Audio2.sfx.finish();
    Confetti.burst(160, innerWidth / 2, innerHeight * 0.35);
    Audio2.speak(['parabens']);
  }

  function starSvg(on, i) {
    return `<svg viewBox="0 0 100 96" class="${on ? 'on' : ''}" style="animation-delay:${i * 0.18}s">
      <path d="M50 4l13.6 28.6 31.4 4-23 21.8 5.8 31.1L50 74.4 22.2 89.5 28 58.4 5 36.6l31.4-4z"
        fill="${on ? 'var(--yellow)' : 'rgba(255,255,255,.22)'}" stroke="${on ? 'var(--yellow-edge)' : 'none'}"
        stroke-width="5" stroke-linejoin="round"/></svg>`;
  }

  /* ---------- actions (keyboard, on-screen bar, later the phone) ---------- */
  function press(id) { const b = $(id); if (!b) return; b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 120); }

  const actions = {
    correct() {
      if (busy) return;
      busy = true; press('btnOk');
      rounds[idx].status = 'ok';
      rounds[idx].secs = rounds[idx].shownAt ? (Date.now() - rounds[idx].shownAt) / 1000 : 0;
      renderDots(); emit();
      const card = $('card');
      card.classList.remove('enter', 'leave'); void card.offsetWidth; card.classList.add('win');
      gameMascot.set('cheer', 1400);
      const pi = Math.floor(Math.random() * PRAISE.length);
      const p = PRAISE[pi]; say(p);
      Audio2.sfx.correct();
      Audio2.speak([`elogio-${pi + 1}`]);
      const r = card.getBoundingClientRect();
      Confetti.burst(70, r.left + r.width / 2, r.top + r.height / 2);
      setTimeout(advance, 1300);
    },
    skip() {
      if (busy) return;
      busy = true; press('btnSkip');
      rounds[idx].status = 'skip';
      rounds[idx].secs = rounds[idx].shownAt ? (Date.now() - rounds[idx].shownAt) / 1000 : 0;
      renderDots(); emit();
      gameMascot.set('oops', 700);
      say('Tudo bem, vamos para o próximo!');
      Audio2.speak(['proximo']);
      Audio2.sfx.skip();
      setTimeout(advance, 1500);
    },
    repeat() {
      if (busy) return;
      press('btnRepeat');
      rounds[idx].repeats = (rounds[idx].repeats || 0) + 1;
      gameMascot.set('think', 1600);
      say('Olha de novo...');
      const card = $('card');
      card.classList.remove('enter', 'win', 'leave'); void card.offsetWidth; card.classList.add('enter');
      Audio2.speak(['de-novo']);
    },
    back() {
      if (busy || idx === 0) return;
      press('btnBack');
      idx--;
      rounds[idx].status = null;
      render('enter');
    },
    pause() {
      if (screen !== 'game') return;
      paused = !paused;
      $('pause').hidden = !paused;
      if (paused) Audio2.hush();
      emit();
    },
    quit() {
      if (screen !== 'game') return;
      paused = false; $('pause').hidden = true; finish();
    },
    /* professor marks which digit position the child got wrong (optional, toggles) */
    mark(pos) {
      const cur = rounds[idx];
      pos = +pos;
      if (!cur || busy || !(pos >= 0 && pos < cur.num.length)) return;
      cur.marks = (cur.marks || 0) ^ (1 << pos);
      const el = $('card').children[pos];
      if (el) el.classList.toggle('marked', !!(cur.marks & (1 << pos)));
      emit();
    }
  };

  /* ---------- "Qual é o seu nome?" ---------- */
  const nameMascot = $('nameMascot') ? Mascot.mount($('nameMascot')) : null;
  const MAX_NAME = 16;
  function paintName() {
    const box = $('nameTyped');
    box.innerHTML = nameText
      ? [...nameText].map((c, i) => c === ' ' ? '<span class="sp"> </span>' : `<span style="--dc:${DIGIT_COLOR(i % 10)}">${c.replace(/[<>&]/g, '')}</span>`).join('')
      : '<span class="ph">_</span>';
    $('btnNameOk').disabled = !nameText.trim();
    emit();
  }
  function flashKey(ch) {
    const k = document.querySelector(`#kbd [data-k="${CSS.escape(ch)}"]`);
    if (k) { k.classList.add('pressed'); setTimeout(() => k.classList.remove('pressed'), 140); }
  }
  function showName() {
    nameText = ''; nameStartedAt = 0; nameSecs = 0; kid = null;
    paused = false; $('pause').hidden = true;
    show('name');
    paintName();
    if (nameMascot) nameMascot.set('happy');
  }
  const nameActions = {
    type(ch) {
      ch = String(ch || '');
      if (!/^[\p{L} ]$/u.test(ch) || nameText.length >= MAX_NAME) return;
      if (ch === ' ' && (!nameText || nameText.endsWith(' '))) return;
      if (!nameStartedAt) nameStartedAt = Date.now();
      nameText += ch.toUpperCase();
      flashKey(ch.toUpperCase());
      Audio2.sfx.click();
      paintName();
    },
    erase() { if (!nameText) return; nameText = nameText.slice(0, -1); flashKey('⌫'); paintName(); },
    nameSet(text) {
      nameText = Students.cleanName(text).toUpperCase().slice(0, MAX_NAME);
      paintName();
    },
    nameDone() {
      const clean = nameText.trim();
      if (!clean) { if (nameMascot) nameMascot.set('oops', 700); return; }
      nameSecs = nameStartedAt ? Math.round((Date.now() - nameStartedAt) / 1000) : 0;
      const k = window.Students ? Students.findOrCreate(clean) : null;
      kid = k ? { id: k.id, name: k.name } : null;
      greet(k && !k.isNew ? `Oi de novo, ${titleCase(k.name)}!` : `Oi, ${titleCase(clean)}!`);
    },
    namePick(id) {
      const k = window.Students && Students.kidById(+id);
      if (!k) return;
      kid = k; nameSecs = 0;
      greet(`Oi, ${titleCase(k.name)}!`);
    },
    nameSkip() { kid = null; nameSecs = 0; Audio2.hush(); start(); }
  };
  const titleCase = s => s.toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
  function greet(text) {
    Audio2.sfx.correct();
    if (nameMascot) nameMascot.set('cheer', 1200);
    $('nameAsk').textContent = text;
    setTimeout(() => { if (screen === 'name') { $('nameAsk').textContent = 'Qual é o seu nome?'; start(); } }, 1400);
  }

  /* on-screen keyboard, same letter order as a computer keyboard */
  (function buildKeyboard() {
    const rows = ['QWERTYUIOP', 'ASDFGHJKLÇ', 'ZXCVBNM'];
    $('kbd').innerHTML = rows.map((r, i) => `<div class="krow">${[...r].map(c => `<button class="key" data-k="${c}">${c}</button>`).join('')}${i === 2 ? '<button class="key wide" data-k="⌫" aria-label="Apagar">⌫</button>' : ''}</div>`).join('')
      + '<div class="krow"><button class="key space" data-k=" ">espaço</button></div>';
    $('kbd').addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      if (b.dataset.k === '⌫') nameActions.erase(); else nameActions.type(b.dataset.k);
    });
  })();
  $('btnNameOk').onclick = () => nameActions.nameDone();
  $('btnNameSkip').onclick = () => nameActions.nameSkip();
  $('btnNameBack').onclick = () => { Audio2.hush(); show('home'); homeMascot.set('happy'); };

  /* actions that work outside a round */
  const menuActions = {
    start() { if (screen === 'home' || screen === 'rings') { Audio2.sfx.click(); showName(); } else if (screen === 'result') { Audio2.sfx.click(); start(); } },
    again() { if (screen === 'result') { Audio2.sfx.click(); start(); } },
    newKid() { if (screen === 'result' || screen === 'home') { Audio2.sfx.click(); showName(); } },
    home() { if (screen !== 'game' || paused) { paused = false; $('pause').hidden = true; kid = null; Audio2.hush(); show('home'); homeMascot.set('happy'); } }
  };

  function action(name, arg) {
    if (menuActions[name]) { menuActions[name](arg); return true; }
    if (screen === 'name') { if (nameActions[name]) { nameActions[name](arg); return true; } return false; }
    if (screen !== 'game') return false;
    if (paused && name !== 'pause' && name !== 'quit') return false;
    const fn = actions[name];
    if (!fn) return false;
    fn(arg);
    return true;
  }

  document.addEventListener('keydown', e => {
    if (screen === 'home' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('btnStart').click(); return; }
    if (screen === 'name') {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') { e.preventDefault(); nameActions.nameDone(); }
      else if (e.key === 'Backspace') { e.preventDefault(); nameActions.erase(); }
      else if (e.key === 'Escape') { e.preventDefault(); $('btnNameBack').click(); }
      else if (e.key.length === 1) { e.preventDefault(); nameActions.type(e.key); }
      return;
    }
    if (screen !== 'game') return;
    const map = { ' ': 'correct', Enter: 'correct', r: 'repeat', R: 'repeat', ArrowRight: 'skip',
      ArrowLeft: 'back', Backspace: 'back', p: 'pause', P: 'pause', Escape: 'pause' };
    const a = map[e.key];
    if (a) { e.preventDefault(); action(a); }
  });

  $('btnOk').onclick = () => action('correct');
  $('btnSkip').onclick = () => action('skip');
  $('btnRepeat').onclick = () => action('repeat');
  $('btnBack').onclick = () => action('back');
  $('btnPause').onclick = () => action('pause');
  $('btnResume').onclick = () => action('pause');
  $('btnQuit').onclick = () => action('quit');
  $('btnStart').onclick = () => { Audio2.sfx.click(); showName(); };
  $('btnAgain').onclick = () => { Audio2.sfx.click(); start(); };
  $('btnHome').onclick = () => { Audio2.sfx.click(); kid = null; show('home'); homeMascot.set('happy'); };
  $('btnNewKid').onclick = () => { Audio2.sfx.click(); showName(); };
  $('btnRings').onclick = () => show('rings');
  $('btnRingsBack').onclick = () => show('home');
  $('btnPrint').onclick = () => window.print();

  /* ---------- home settings ---------- */
  const segs = {};
  const onSet = {};
  function setConfig(key, v) {
    if (!segs[key] || !segs[key].values.includes(v)) return false;
    cfg[key] = v; store.set(key, v);
    [...segs[key].el.children].forEach((c, i) => c.setAttribute('aria-pressed', segs[key].values[i] === v));
    if (onSet[key]) onSet[key](v);
    emit();
    return true;
  }
  function seg(el, values, key, label, onChange) {
    segs[key] = { el, values };
    onSet[key] = onChange;
    el.innerHTML = '';
    values.forEach(v => {
      const b = document.createElement('button');
      b.textContent = label ? label(v) : v;
      b.setAttribute('aria-pressed', cfg[key] === v);
      b.onclick = () => {
        setConfig(key, v);
        Audio2.sfx.click();
        homeMascot.set('cheer', 600);
      };
      el.appendChild(b);
    });
  }
  seg($('segDigits'), [1, 2, 3, 4], 'digits');
  seg($('segRounds'), [5, 10, 15], 'rounds');
  seg($('segVoice'), [true, false], 'voice', v => (v ? 'Ligada' : 'Desligada'), v => (Audio2.opts.voice = v));
  seg($('segSound'), [true, false], 'sound', v => (v ? 'Ligados' : 'Desligados'), v => (Audio2.opts.sound = v));

  /* printable rings: two full sets */
  $('sheet').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d =>
    `<div class="strip" style="--dc:${DIGIT_COLOR(d)}"><div class="face">${d}</div><div class="band"></div><small>cole aqui</small></div>`).join('');

  Audio2.preload(['elogio-1','elogio-2','elogio-3','elogio-4','elogio-5','elogio-6','proximo','parabens','de-novo']);

  window.Game = {
    action,
    show,
    get screen() { return screen; },
    setConfig,
    onChange(fn) { listeners.push(fn); fn(snapshot()); },
    get state() { return snapshot(); }
  };
})();
