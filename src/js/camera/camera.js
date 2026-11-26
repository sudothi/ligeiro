/* Webcam test screen: shows the hands, the number of each finger (1 to 10) and which
   finger the child bent. Everything runs on this computer: no image is saved or sent.
   Camera, MediaPipe and drawing are in tracker.js (shared with the game); the finger
   maths in fingers.js. This file is the test screen itself. */
import { fingerLabel, fingersPointDown, GESTURES } from './fingers.js';
import { createTracker, colorOf, CAM_ERRORS } from './tracker.js';

const $ = id => document.getElementById(id);
const tracker = createTracker($('view'));
const { opts, meter, picker } = tracker;
const saveOpts = tracker.saveOpts;

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
const G = () => tracker.gesture;
function paintGesture() {
  $('selGesture').value = tracker.meter.gesture;
  $('pickedLbl').textContent = 'Dedo ' + G().past;
  $('barsLbl').textContent = 'Quanto cada dedo se mexeu';
}
$('selGesture').onchange = e => { tracker.setGesture(e.target.value); paintGesture(); statusHoldUntil = 0; };
paintGesture();
$('optMirror').checked = opts.mirror;
$('optRotate').checked = opts.rotate;
$('optSens').value = String(1.05 - opts.threshold);
$('optHold').value = String(opts.holdMs);
function paintOpts() {
  $('outSens').textContent = Math.round((1.05 - picker.threshold) * 100) + '%';
  $('outHold').textContent = (picker.holdMs / 1000).toFixed(2).replace('.', ',') + ' s';
  paintThreshold();
}
$('optMirror').onchange = e => { opts.mirror = e.target.checked; saveOpts(); tracker.resetCalibration(); };
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
async function openCamera() {
  const curId = await tracker.openCamera();
  await listCameras(curId);
}
async function listCameras(curId) {
  const devs = await tracker.listCameras();
  $('selCam').innerHTML = devs.length
    ? devs.map((d, i) => `<option value="${d.deviceId}"${d.deviceId === curId ? ' selected' : ''}>${(d.label || 'Câmera ' + (i + 1)).replace(/[<>&"]/g, '')}</option>`).join('')
    : '<option value="">Nenhuma câmera encontrada</option>';
  return devs.length;
}
function showCameraError(e) {
  const name = (e && e.name) || 'Erro';
  const tip = CAM_ERRORS[name] || 'Confira se a webcam está ligada e se outro programa não está usando.';
  const box = $('loading');
  box.hidden = false;
  box.innerHTML = `Não consegui abrir a câmera.<br><small>${tip}</small><br><small class="code">(${name}${e && e.message ? ': ' + String(e.message).replace(/[<>&]/g, '') : ''})</small><br><button class="btn yellow" id="btnCamRetry">Tentar de novo</button>`;
  $('btnCamRetry').onclick = () => location.reload();
  setStatus('Câmera não abriu (' + name + '). Veja a mensagem na imagem.', true);
}
$('selCam').onchange = async e => {
  opts.deviceId = e.target.value; saveOpts();
  try { await openCamera(); $('loading').hidden = tracker.ready; } catch (err) { showCameraError(err); }
};

/* ---------- drawing extras ---------- */
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
  $('pickedName').textContent = n == null ? '\u00a0' : fingerLabel(n) + (n === 10 ? ' (0 no jogo)' : '');
}

/* ---------- calibration ---------- */
let testAfterCalib = false;
function calibrate() {
  $('btnCalib').disabled = true;
  tracker.calibrate(count => {
    $('btnCalib').disabled = false;
    setStatus(count >= 10 ? `Calibrado! Agora ${G().verb.toLowerCase()} um dedo de cada vez.` : `Calibrei só ${count} dedos. Deixe as duas mãos inteiras na imagem e calibre de novo.`, count < 10);
    statusHoldUntil = performance.now() + 2500;
    if (testAfterCalib) { testAfterCalib = false; if (count >= 10) startTest(); }
  });
}
$('btnCalib').onclick = calibrate;

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
  b.innerHTML = `<span class="n" style="--dc:${colorOf(n)}">${n}</span><span>${G().verb} o dedo ${n}<small>${fingerLabel(n)} · ${test.i + 1} de ${test.list.length}</small></span>` +
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
$('btnTest').onclick = () => {
  if (meter.calibrated) return startTest();
  testAfterCalib = true; // calibrate first, then start
  calibrate();
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
    <p>Gesto: ${G().verb.toLowerCase()} o dedo. Sensibilidade ${$('outSens').textContent}, tempo segurando ${$('outHold').textContent}.</p>
    <table><thead><tr><th>Dedo</th><th></th><th>Acertos</th><th>Confundiu com</th><th>Não viu / pulou</th><th>Tempo médio</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <div class="row-actions"><button class="btn green" id="btnAgain">Fazer de novo</button>${window.pdfBridge ? '<button class="btn" id="btnCsv">Salvar planilha</button>' : ''}<button class="btn" id="btnClose">Fechar</button></div>`;
  $('btnAgain').onclick = startTest;
  $('btnClose').onclick = () => { el.hidden = true; };
  if ($('btnCsv')) $('btnCsv').onclick = () => {
    const lines = ['pedido;visto;resultado;ms'].concat(test.log.map(l => `${l.asked};${l.got ?? ''};${l.why};${l.ms}`));
    window.pdfBridge.saveText(lines.join('\n') + '\n', `teste-camera-${new Date().toISOString().slice(0, 10)}.csv`);
  };
}

/* ---------- per frame ---------- */
let frames = 0, fpsAt = performance.now();
tracker.onFrame = ({ sides, hands, scores, picked, now }) => {
  tracker.target = test.on && test.feedbackUntil === 0 ? test.list[test.i] : null;
  paintBars(scores);

  if (picked != null) { showPicked(picked); if (!test.on) beep(); }
  else if (picker.active == null && $('picked').textContent !== '–' && !test.on) showPicked(null);

  if (tracker.calibrating) setStatus(`Calibrando… deixe as mãos ${G().rest} e paradas (${tracker.calibSecondsLeft(now)})`);
  else if (now > statusHoldUntil) setStatus(...statusFor(sides, hands));

  /* guided test */
  if (test.on) {
    if (test.feedbackUntil) {
      if (now > test.feedbackUntil && picker.active == null) nextOrFinish();
    } else if (picked != null) answer(picked);
    else if (now - test.askedAt > TIMEOUT) answer(null, 'não viu');
  }

  frames++;
  if (now - fpsAt > 1000) { $('fps').textContent = `${Math.round(frames * 1000 / (now - fpsAt))} quadros/s`; frames = 0; fpsAt = now; }
};
let statusHoldUntil = 0;

function statusFor(sides, hands) {
  if (!sides.length) return [`Não estou vendo as mãos. Coloque as duas mãos ${G().rest}, com a palma para baixo.`, true];
  if (fingersPointDown(hands)) return ['Os dedos estão apontando para baixo na tela. Marque "Girar a imagem" nos ajustes.', true];
  if (sides.length === 1) return [`Estou vendo só a mão ${sides[0].side === 'L' ? 'esquerda' : 'direita'}.`, true];
  if (sides[0].how === 'posição') return ['As duas mãos parecem iguais. Confira se as palmas estão para baixo.', true];
  if (!meter.calibrated) return [`Vendo as duas mãos. Com elas ${G().rest} e paradas, clique em Calibrar.`];
  return [`Pronto! ${G().verb} um dedo de cada vez.`];
}

/* ---------- start ---------- */
(async () => {
  try {
    await openCamera();
  } catch (e) {
    await listCameras().catch(() => {});
    showCameraError(e);
    return;
  }
  $('loading').textContent = 'Carregando o reconhecimento das mãos…';
  try {
    await tracker.loadModel();
  } catch (e) {
    $('loading').textContent = 'A câmera abriu, mas faltam os arquivos do reconhecimento das mãos. Na pasta do jogo, rode npm install e depois npm start, com internet (só da primeira vez).';
    console.error(e);
    setStatus('Faltam os arquivos do reconhecimento das mãos. Rode npm install e depois npm start.', true);
    return;
  }
  $('loading').hidden = true;
  tracker.start();
})();
