/* Webcam test screen: shows the hands, the number of each finger (1 to 10) and which
   finger the child bent. Everything runs on this computer: no image is saved or sent.
   The finger maths lives in fingers.js; this file is camera, drawing and screens. */
import { FilesetResolver, HandLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import {
  BONES, FINGERS, fingerNumber, fingerLabel, digitOf, toView, assignSides, fingersPointDown,
  BendMeter, FingerPicker
} from './fingers.js';

const $ = id => document.getElementById(id);
// same colours as the game and the paper rings (style.css --d0 … --d9)
const COLORS = ['#6c5ce7', '#e84393', '#ff7f11', '#e6a800', '#22b268', '#00a3d4', '#3867d6', '#b04ad6', '#e5502f', '#0f9b8e'];
const colorOf = n => COLORS[digitOf(n)];

/* ---------- settings (remembered on this PC) ---------- */
const KEY = 'dl.camera';
const opts = Object.assign({ deviceId: '', mirror: false, rotate: false, threshold: 0.5, holdMs: 300 },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) {} };

const meter = new BendMeter();
const picker = new FingerPicker({ threshold: opts.threshold, holdMs: opts.holdMs });

/* ---------- page parts ---------- */
const canvas = $('view');
const ctx = canvas.getContext('2d');
const video = document.createElement('video');
video.muted = true; video.playsInline = true;

(function buildBars() {
  let html = '';
  for (let n = 1; n <= 10; n++) html += `<b style="--dc:${colorOf(n)}" title="${fingerLabel(n)}">${n}</b><i style="--dc:${colorOf(n)}"><span id="bar${n}"></span><em id="th${n}"></em></i>`;
  $('bars').innerHTML = html;
})();
function paintThreshold() {
  for (let n = 1; n <= 10; n++) $('th' + n).style.left = `${picker.threshold * 100}%`;
}

function setStatus(text, warn) {
  const el = $('status');
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('warn', !!warn);
}

/* ---------- options panel ---------- */
$('optMirror').checked = opts.mirror;
$('optRotate').checked = opts.rotate;
$('optSens').value = String(1.05 - opts.threshold);
$('optHold').value = String(opts.holdMs);
function paintOpts() {
  $('outSens').textContent = Math.round((1.05 - picker.threshold) * 100) + '%';
  $('outHold').textContent = (picker.holdMs / 1000).toFixed(2).replace('.', ',') + ' s';
  paintThreshold();
}
$('optMirror').onchange = e => { opts.mirror = e.target.checked; saveOpts(); meter.reset(); };
$('optRotate').onchange = e => { opts.rotate = e.target.checked; saveOpts(); };
$('optSens').oninput = e => { picker.threshold = opts.threshold = +(1.05 - +e.target.value).toFixed(2); saveOpts(); paintOpts(); };
$('optHold').oninput = e => { picker.holdMs = opts.holdMs = +e.target.value; saveOpts(); paintOpts(); };
paintOpts();

/* ---------- a short beep when a finger is picked ---------- */
let actx = null;
function beep(freq = 660, ms = 120) {
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.15, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + ms / 1000);
    o.start(); o.stop(actx.currentTime + ms / 1000);
  } catch (e) {}
}

/* ---------- camera ---------- */
let stream = null;
async function openCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  const video0 = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: opts.deviceId ? Object.assign({ deviceId: { exact: opts.deviceId } }, video0) : video0, audio: false });
  } catch (e) {
    if (!opts.deviceId) throw e;
    opts.deviceId = ''; saveOpts();
    stream = await navigator.mediaDevices.getUserMedia({ video: video0, audio: false });
  }
  video.srcObject = stream;
  await video.play();
  const cur = stream.getVideoTracks()[0];
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  const curId = cur.getSettings().deviceId;
  $('selCam').innerHTML = devs.map((d, i) => `<option value="${d.deviceId}"${d.deviceId === curId ? ' selected' : ''}>${(d.label || 'Câmera ' + (i + 1)).replace(/[<>&"]/g, '')}</option>`).join('');
  meter.reset();
}
$('selCam').onchange = async e => {
  opts.deviceId = e.target.value; saveOpts();
  try { await openCamera(); } catch (err) { setStatus('Não consegui abrir essa câmera: ' + err.message, true); }
};

/* ---------- MediaPipe ---------- */
async function loadModel() {
  const base = new URL('vendor/mediapipe/', location.href).href.replace(/\/$/, '');
  const fileset = await FilesetResolver.forVisionTasks(base);
  const make = delegate => HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: base + '/hand_landmarker.task', delegate },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
  });
  try { return await make('GPU'); } catch (e) { console.warn('GPU indisponível, usando CPU', e); return make('CPU'); }
}

/* ---------- drawing ---------- */
function drawVideo(w, h) {
  ctx.save();
  if (opts.rotate) { ctx.translate(w, h); ctx.scale(-1, -1); }
  if (opts.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
}

function drawHand({ pts, side }, scores, target) {
  const palm = (Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y) + Math.hypot(pts[5].x - pts[17].x, pts[5].y - pts[17].y)) / 2;
  ctx.lineWidth = Math.max(2, palm * 0.04);
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath();
  for (const [a, b] of BONES) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, palm * 0.03), 0, 7); ctx.fill(); }

  const r = Math.max(12, palm * 0.17);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(r * 1.15)}px Fredoka, sans-serif`;
  for (let f = 0; f < 5; f++) {
    const n = fingerNumber(side, f);
    const tip = pts[FINGERS[f].joints[3]];
    const s = scores[n] || 0;
    const on = picker.active === n;
    const rr = on ? r * 1.35 : r;
    if (target === n) {
      ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = r * 0.35;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, rr + r * 0.45, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 0.55 + 0.45 * Math.min(1, s / picker.threshold);
    ctx.fillStyle = colorOf(n);
    ctx.beginPath(); ctx.arc(tip.x, tip.y, rr, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = on ? r * 0.25 : r * 0.12; ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(String(n), tip.x, tip.y + r * 0.05);
  }
}

function paintBars(scores) {
  for (let n = 1; n <= 10; n++) {
    const s = scores[n];
    const el = $('bar' + n);
    el.style.width = `${Math.round((s || 0) * 100)}%`;
    el.parentElement.previousElementSibling.classList.toggle('off', s == null);
  }
}

function showPicked(n) {
  const el = $('picked');
  el.textContent = n == null ? '–' : String(n);
  el.parentElement.style.setProperty('--dc', n == null ? 'var(--ink)' : colorOf(n));
  $('pickedName').textContent = n == null ? ' ' : fingerLabel(n) + (n === 10 ? ' (0 no jogo)' : '');
}

/* ---------- calibration ---------- */
let calibUntil = 0;
$('btnCalib').onclick = () => {
  meter.startCalibration();
  calibUntil = performance.now() + 2500;
  $('btnCalib').disabled = true;
};

/* ---------- guided test ---------- */
const test = { on: false, list: [], i: 0, log: [], askedAt: 0, waitOpen: false, feedbackUntil: 0 };
const TIMEOUT = 10000;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function startTest() {
  let list;
  do { list = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); }
  while (list.some((n, i) => i > 0 && list[i - 1] === n));
  Object.assign(test, { on: true, list, i: 0, log: [], waitOpen: picker.active != null });
  $('results').hidden = true;
  ask();
}
function ask() {
  test.askedAt = performance.now();
  test.feedbackUntil = 0;
  const n = test.list[test.i];
  const b = $('banner');
  b.className = 'cam-banner'; b.hidden = false;
  b.innerHTML = `<span class="n" style="--dc:${colorOf(n)}">${n}</span><span>Dobre o dedo ${n}<small>${fingerLabel(n)} · ${test.i + 1} de ${test.list.length}</small></span>` +
    `<button class="btn" id="btnTestSkip">Pular</button><button class="btn coral" id="btnTestStop">Parar</button>`;
  $('btnTestSkip').onclick = () => answer(null, 'pulou');
  $('btnTestStop').onclick = () => { test.on = false; $('banner').hidden = true; if (test.log.length) showResults(); };
}
function answer(got, why) {
  const n = test.list[test.i];
  const ms = Math.round(performance.now() - test.askedAt);
  test.log.push({ asked: n, got, ms, why: why || (got === n ? 'acertou' : 'outro dedo') });
  const b = $('banner');
  const ok = got === n;
  b.className = 'cam-banner ' + (ok ? 'ok' : 'bad');
  b.innerHTML = ok ? `<span>Isso! Dedo ${n}</span>`
    : got == null ? `<span>${why === 'pulou' ? 'Pulado' : 'Não vi o dedo ' + n}</span>`
      : `<span>Vi o dedo ${got}, era o ${n}</span>`;
  beep(ok ? 880 : 330, ok ? 120 : 220);
  test.i++;
  test.feedbackUntil = performance.now() + 900;
}
function nextOrFinish() {
  if (test.i >= test.list.length) { test.on = false; $('banner').hidden = true; showResults(); }
  else ask();
}
let testAfterCalib = false;
$('btnTest').onclick = () => {
  if (meter.calibrated) return startTest();
  testAfterCalib = true; // calibrate first, then start
  $('btnCalib').onclick();
};

function showResults() {
  const rows = [];
  let hit = 0;
  for (let n = 1; n <= 10; n++) {
    const items = test.log.filter(l => l.asked === n);
    if (!items.length) continue;
    const ok = items.filter(l => l.got === n);
    hit += ok.length;
    const wrong = items.filter(l => l.got != null && l.got !== n).map(l => l.got);
    const miss = items.filter(l => l.got == null).length;
    const t = ok.length ? (ok.reduce((s, l) => s + l.ms, 0) / ok.length / 1000).toFixed(1).replace('.', ',') + ' s' : '–';
    rows.push(`<tr><td class="num" style="color:${colorOf(n)}">${n}</td><td>${fingerLabel(n)}</td><td>${ok.length} de ${items.length}</td><td>${wrong.length ? wrong.join(', ') : '–'}</td><td>${miss || '–'}</td><td>${t}</td></tr>`);
  }
  const pct = Math.round(hit / test.log.length * 100);
  const el = $('results');
  el.hidden = false;
  el.innerHTML = `<h2>Resultado: ${hit} de ${test.log.length} (${pct}%)</h2>
    <p>Sensibilidade ${$('outSens').textContent}, tempo dobrado ${$('outHold').textContent}.</p>
    <table><thead><tr><th>Dedo</th><th></th><th>Acertos</th><th>Confundiu com</th><th>Não viu / pulou</th><th>Tempo médio</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <div class="row-actions"><button class="btn green" id="btnAgain">Fazer de novo</button>${window.pdfBridge ? '<button class="btn" id="btnCsv">Salvar planilha</button>' : ''}<button class="btn" id="btnClose">Fechar</button></div>`;
  $('btnAgain').onclick = startTest;
  $('btnClose').onclick = () => { el.hidden = true; };
  if ($('btnCsv')) $('btnCsv').onclick = () => {
    const lines = ['pedido;visto;resultado;ms'].concat(test.log.map(l => `${l.asked};${l.got ?? ''};${l.why};${l.ms}`));
    window.pdfBridge.saveText(lines.join('\n') + '\n', `teste-camera-${new Date().toISOString().slice(0, 10)}.csv`);
  };
}

/* ---------- main loop ---------- */
let landmarker = null, lastVideoTime = -1, frames = 0, fpsAt = performance.now();
function loop() {
  requestAnimationFrame(loop);
  if (!landmarker || video.readyState < 2) return;
  const now = performance.now();
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const w = video.videoWidth, h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const res = landmarker.detectForVideo(video, now);
  const hands = (res.landmarks || []).map(lm => toView(lm, w, h, opts));
  const sides = assignSides(hands);
  const scores = meter.update(sides);
  const picked = picker.update(scores, now);

  drawVideo(w, h);
  const target = test.on && test.feedbackUntil === 0 ? test.list[test.i] : null;
  for (const s of sides) drawHand(s, scores, target);
  paintBars(scores);

  if (picked != null) { showPicked(picked); if (!test.on) beep(); }
  else if (picker.active == null && $('picked').textContent !== '–' && !test.on) showPicked(null);

  /* calibration countdown */
  if (calibUntil) {
    const left = Math.ceil((calibUntil - now) / 1000);
    if (left > 0) setStatus(`Calibrando… deixe as mãos abertas e paradas (${left})`);
    else {
      const count = meter.finishCalibration();
      calibUntil = 0; $('btnCalib').disabled = false;
      setStatus(count >= 10 ? 'Calibrado! Agora dobre um dedo de cada vez.' : `Calibrei só ${count} dedos. Deixe as duas mãos inteiras na imagem e calibre de novo.`, count < 10);
      statusHoldUntil = now + 2500;
      if (testAfterCalib) { testAfterCalib = false; if (count >= 10) startTest(); }
    }
  } else if (now > statusHoldUntil) {
    setStatus(...statusFor(sides, hands));
  }

  /* guided test */
  if (test.on) {
    if (test.feedbackUntil) {
      if (now > test.feedbackUntil && picker.active == null) nextOrFinish();
    } else if (picked != null) answer(picked);
    else if (now - test.askedAt > TIMEOUT) answer(null, 'não viu');
  }

  frames++;
  if (now - fpsAt > 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (now - fpsAt))} quadros/s`; frames = 0; fpsAt = now; }
}
let statusHoldUntil = 0;

function statusFor(sides, hands) {
  if (!sides.length) return ['Não estou vendo as mãos. Coloque as duas mãos abertas na mesa, com a palma para baixo.', true];
  if (fingersPointDown(hands)) return ['Os dedos estão apontando para baixo na tela. Marque "Girar a imagem" nos ajustes.', true];
  if (sides.length === 1) return [`Estou vendo só a mão ${sides[0].side === 'L' ? 'esquerda' : 'direita'}.`, true];
  if (sides[0].how === 'posição') return ['As duas mãos parecem iguais. Confira se as palmas estão para baixo.', true];
  if (!meter.calibrated) return ['Vendo as duas mãos. Com elas abertas e paradas, clique em Calibrar.'];
  return ['Pronto! Dobre um dedo de cada vez.'];
}

/* ---------- start ---------- */
(async () => {
  try {
    await openCamera();
  } catch (e) {
    $('loading').textContent = 'Não consegui abrir a câmera. Confira se a webcam está ligada no USB e se outro programa não está usando.';
    setStatus('Câmera não abriu: ' + (e.message || e.name), true);
    return;
  }
  $('loading').textContent = 'Carregando o reconhecimento das mãos…';
  try {
    landmarker = await loadModel();
  } catch (e) {
    $('loading').textContent = 'Não encontrei os arquivos do reconhecimento das mãos. No PC de desenvolvimento, rode npm start de novo com internet uma vez.';
    setStatus('Erro ao carregar o MediaPipe: ' + (e.message || e), true);
    return;
  }
  $('loading').hidden = true;
  requestAnimationFrame(loop);
})();
