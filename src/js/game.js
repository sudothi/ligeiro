/* Game flow: home -> game -> result.
   The professional drives the game with actions: correct, repeat, skip, back, pause.
   In step 1 the actions come from the keyboard and the on-screen bar; in step 2 the
   phone remote will call Game.action(...) over the local network. */
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

  const WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
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
  function speakNumber(num) {
    const digits = [...num].map(d => WORDS[+d]);
    Audio2.say(num.length === 1 ? digits[0] : `${num}. ${digits.join(', ')}`);
  }

  /* ---------- state ---------- */
  let rounds = [];   // [{num, status: null | 'ok' | 'skip'}]
  let idx = 0;
  let busy = false;
  let paused = false;
  let startedAt = 0;
  let screen = 'home';

  function show(id) {
    screen = id;
    ['home', 'game', 'result', 'rings'].forEach(s => ($(s).hidden = s !== id));
  }

  function start() {
    rounds = [];
    let last = '';
    for (let i = 0; i < cfg.rounds; i++) { last = makeNumber(cfg.digits, last); rounds.push({ num: last, status: null }); }
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
    card.innerHTML = [...cur.num].map(d => `<span class="dig" style="--dc:${DIGIT_COLOR(d)}">${d}</span>`).join('');
    card.classList.remove('enter', 'win', 'leave');
    if (anim) { void card.offsetWidth; card.classList.add(anim); }
    renderDots();
    gameMascot.set('happy');
    say(pick(PROMPT));
    if (anim === 'enter') { Audio2.sfx.appear(); setTimeout(() => speakNumber(cur.num), 250); }
  }

  function advance() {
    if (idx >= rounds.length - 1) { finish(); return; }
    const card = $('card');
    card.classList.remove('enter', 'win'); void card.offsetWidth; card.classList.add('leave');
    setTimeout(() => { idx++; busy = false; render('enter'); }, 280);
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
    $('stTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('resultTitle').textContent = stars === 3 ? 'Incrível!' : stars === 2 ? 'Muito bem!' : 'Bom treino!';
    $('stars').innerHTML = [1, 2, 3].map(i => starSvg(i <= stars, i)).join('');
    show('result');
    resultMascot.set('cheer', 4000);
    Audio2.sfx.finish();
    Confetti.burst(160, innerWidth / 2, innerHeight * 0.35);
    Audio2.say(stars === 3 ? 'Incrível! Parabéns!' : 'Muito bem! Parabéns!');
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
      renderDots();
      const card = $('card');
      card.classList.remove('enter', 'leave'); void card.offsetWidth; card.classList.add('win');
      gameMascot.set('cheer', 1400);
      const p = pick(PRAISE); say(p);
      Audio2.sfx.correct();
      Audio2.say(p, 1);
      const r = card.getBoundingClientRect();
      Confetti.burst(70, r.left + r.width / 2, r.top + r.height / 2);
      setTimeout(advance, 1300);
    },
    skip() {
      if (busy) return;
      busy = true; press('btnSkip');
      rounds[idx].status = 'skip';
      renderDots();
      gameMascot.set('oops', 700);
      say('Tudo bem, vamos para o próximo!');
      Audio2.sfx.skip();
      setTimeout(advance, 700);
    },
    repeat() {
      if (busy) return;
      press('btnRepeat');
      gameMascot.set('think', 1600);
      say('Olha de novo...');
      const card = $('card');
      card.classList.remove('enter', 'win', 'leave'); void card.offsetWidth; card.classList.add('enter');
      speakNumber(rounds[idx].num);
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
    }
  };

  function action(name) {
    if (screen !== 'game') return false;
    if (paused && name !== 'pause') return false;
    const fn = actions[name];
    if (!fn) return false;
    fn();
    return true;
  }

  document.addEventListener('keydown', e => {
    if (screen === 'home' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('btnStart').click(); return; }
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
  $('btnQuit').onclick = () => { paused = false; $('pause').hidden = true; finish(); };
  $('btnStart').onclick = () => { Audio2.sfx.click(); start(); };
  $('btnAgain').onclick = () => { Audio2.sfx.click(); start(); };
  $('btnHome').onclick = () => { Audio2.sfx.click(); show('home'); homeMascot.set('happy'); };
  $('btnRings').onclick = () => show('rings');
  $('btnRingsBack').onclick = () => show('home');
  $('btnPrint').onclick = () => window.print();

  /* ---------- home settings ---------- */
  function seg(el, values, key, label, onChange) {
    el.innerHTML = '';
    values.forEach(v => {
      const b = document.createElement('button');
      b.textContent = label ? label(v) : v;
      b.setAttribute('aria-pressed', cfg[key] === v);
      b.onclick = () => {
        cfg[key] = v; store.set(key, v);
        [...el.children].forEach(c => c.setAttribute('aria-pressed', c === b));
        if (onChange) onChange(v);
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

  window.Game = { action, get state() { return { screen, idx, paused, rounds: rounds.map(r => ({ ...r })) }; } };
})();
