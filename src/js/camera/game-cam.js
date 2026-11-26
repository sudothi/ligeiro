/* Webcam inside the game (PC app only): a small camera window on the game screen and
   the child's answer read from the fingers. For 472 the child bends finger 4, then 7,
   then 2 (0 is finger 10, the right pinky). Each right digit gets a green line; when
   all are right it counts as the professional's "Certo". A wrong finger shakes the
   digit, is noted in the round's stats (like the phone's marking) and the game waits.
   The professional's buttons keep working as before. */
import { createTracker, CAM_ERRORS } from './tracker.js';
import { digitOf, fingersPointDown } from './fingers.js';

(async function () {
  if (!window.remoteBridge || !window.Game || !navigator.mediaDevices) return; // PC app only
  const $ = id => document.getElementById(id);
  const ON_KEY = 'dl.camera.inGame';

  /* ---------- home setting: Câmera Ligada / Desligada ---------- */
  let devices = [];
  try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) {}
  let on;
  try { on = JSON.parse(localStorage.getItem(ON_KEY)); } catch (e) { on = null; }
  if (on == null) on = devices.length > 0;
  const seg = $('segCam');
  $('lblCam').hidden = false; seg.hidden = false;
  function paintSeg() {
    seg.innerHTML = '';
    [true, false].forEach(v => {
      const b = document.createElement('button');
      b.textContent = v ? 'Ligada' : 'Desligada';
      b.setAttribute('aria-pressed', on === v);
      b.onclick = () => { on = v; try { localStorage.setItem(ON_KEY, JSON.stringify(v)); } catch (e) {} paintSeg(); sync(Game.state); };
      seg.appendChild(b);
    });
  }
  paintSeg();

  /* ---------- camera window ---------- */
  const win = $('camWin'), msg = $('camMsg'), status = $('camStatus');
  const tracker = createTracker($('camView'));
  let opening = null, failed = false;

  function setMsg(text) { msg.hidden = !text; if (text) msg.textContent = text; }
  function setStatus(text, warn) { if (status.textContent !== text) status.textContent = text; status.classList.toggle('warn', !!warn); }

  async function startCamera() {
    if (tracker.running || opening || failed) return opening;
    opening = (async () => {
      setMsg('Abrindo a câmera…');
      try { await tracker.openCamera(); } catch (e) {
        failed = true;
        setMsg('A câmera não abriu. ' + (CAM_ERRORS[e.name] || 'Confira se a webcam está ligada.'));
        setStatus('Sem câmera', true);
        return;
      }
      if (!tracker.ready) {
        setMsg('Carregando o reconhecimento das mãos…');
        try { await tracker.loadModel(); } catch (e) {
          console.error(e);
          failed = true;
          setMsg('Faltam os arquivos do reconhecimento das mãos. Rode npm install e depois npm start.');
          setStatus('Sem reconhecimento', true);
          tracker.stop();
          return;
        }
      }
      setMsg('');
      tracker.start();
    })().finally(() => { opening = null; });
    return opening;
  }
  function stopCamera() { tracker.stop(); }

  $('btnCamCalib').onclick = () => {
    $('btnCamCalib').disabled = true;
    tracker.calibrate(count => {
      $('btnCamCalib').disabled = false;
      calibMsgUntil = performance.now() + 2500;
      setStatus(count >= 10 ? 'Calibrado!' : `Calibrei só ${count} dedos. Calibre de novo.`, count < 10);
    });
  };
  let calibMsgUntil = 0;

  /* ---------- reading the answer ---------- */
  let roundKey = null;   // which number we are reading (idx + num)
  let pos = 0;           // digits already right
  let active = false;
  let wasShown = false;

  function cardDigits() { return $('card') ? [...$('card').children] : []; }
  function paintDone() {
    cardDigits().forEach((el, i) => el.classList.toggle('done', i < pos));
  }

  function sync(s) {
    const want = on && s.screen === 'game';
    win.hidden = !want;
    if (want && !wasShown) failed = false; // try again each time a game starts
    wasShown = want;
    if (want) startCamera(); else if (tracker.running) stopCamera();
    active = want && !s.paused && !s.busy && !!s.num;
    const key = s.screen === 'game' && s.num ? `${s.idx}:${s.num}` : null;
    if (key !== roundKey) { roundKey = key; pos = 0; }
    // the card is rebuilt on each new number: put the green lines back if needed
    requestAnimationFrame(paintDone);
  }
  Game.onChange(sync);

  tracker.onFrame = ({ sides, hands, picked, now }) => {
    if (tracker.calibrating) setStatus(`Calibrando… mãos ${tracker.gesture.rest} e paradas (${tracker.calibSecondsLeft(now)})`);
    else if (now > calibMsgUntil) {
      if (!sides.length) setStatus('Não vejo as mãos', true);
      else if (fingersPointDown(hands)) setStatus('Imagem de ponta-cabeça (ajuste na tela de teste)', true);
      else if (sides.length === 1) setStatus(`Só a mão ${sides[0].side === 'L' ? 'esquerda' : 'direita'}`, true);
      else if (!tracker.meter.calibrated) setStatus(`Mãos ${tracker.gesture.rest} e clique em Calibrar`, true);
      else setStatus(`Pronto: ${tracker.gesture.verb.toLowerCase()} o dedo`);
    }
    if (picked != null) onPick(picked);
  };

  function onPick(picked) {
    if (!active) return;
    const s = Game.state;
    if (!s.num || pos >= s.num.length) return;
    const want = +s.num[pos];
    const el = cardDigits()[pos];
    if (digitOf(picked) === want) {
      pos++;
      paintDone();
      if (pos >= s.num.length) Game.action('correct');
    } else {
      Game.action('markOn', pos);
      if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); }
    }
  }
  // for checking the flow without a child at the table (DevTools: DLCam.pick(7))
  window.DLCam = { pick: onPick };
})();
