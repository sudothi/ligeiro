/* Shared webcam hand tracker, used by the test screen (camera.js) and inside the game
   (game-cam.js): opens the webcam, runs MediaPipe, works out the bent finger and draws
   the hands with the number of each finger. Nothing is recorded or sent anywhere. */
import {
  BONES, FINGERS, GESTURES, fingerNumber, digitOf, toView, assignSides, BendMeter, FingerPicker
} from './fingers.js';

// same colours as the game and the paper rings (style.css --d0 … --d9)
export const COLORS = ['#6c5ce7', '#e84393', '#ff7f11', '#e6a800', '#22b268', '#00a3d4', '#3867d6', '#b04ad6', '#e5502f', '#0f9b8e'];
export const colorOf = n => COLORS[digitOf(n)];

export const CAM_ERRORS = {
  NotAllowedError: 'O Windows bloqueou a câmera. Abra Configurações > Privacidade e segurança > Câmera e ligue "Acesso à câmera", "Permitir que aplicativos acessem a câmera" e "Permitir que aplicativos da área de trabalho acessem a câmera".',
  NotReadableError: 'A câmera está ocupada ou travada. Feche programas que usam a câmera (Teams, Zoom, WhatsApp, navegador, app Câmera) e tente de novo.',
  NotFoundError: 'Nenhuma câmera foi encontrada. Confira o cabo USB e se a câmera aparece no Gerenciador de Dispositivos do Windows. Em alguns notebooks a câmera tem uma tecla (F8/F10) ou uma tampinha que desliga.',
  OverconstrainedError: 'A câmera escolhida não aceitou o formato pedido. Escolha outra câmera nos ajustes ou tente de novo.'
};

/* settings and calibration, remembered on this PC (shared by the test screen and the game) */
const KEY = 'dl.camera';
const REST_KEY = 'dl.camera.rest';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export function createTracker(canvas) {
  const ctx = canvas.getContext('2d');
  const opts = Object.assign({ deviceId: '', mirror: false, rotate: false, threshold: 0.5, holdMs: 300, gesture: 'levantar' }, load(KEY, {}));
  const meter = new BendMeter(opts.gesture);
  const picker = new FingerPicker({ threshold: opts.threshold, holdMs: opts.holdMs });
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;

  // calibration from an earlier session (test screen or game)
  const savedRest = load(REST_KEY, null);
  if (savedRest && savedRest.mirror === !!opts.mirror && savedRest.gesture === meter.gesture && savedRest.rest) {
    meter.rest = Object.assign({}, savedRest.rest); meter.restZ = Object.assign({}, savedRest.restZ || {}); meter.done = true;
  }

  let stream = null, landmarker = null, lastVideoTime = -1, raf = 0;
  let calibUntil = 0, calibDone = null;
  const t = {
    opts, meter, picker, video,
    target: null,          // finger number to highlight (guided test)
    onFrame: null,         // ({sides, hands, scores, picked, now}) per processed frame
    saveOpts: () => save(KEY, opts),
    get ready() { return !!landmarker; },
    get calibrating() { return !!calibUntil; },

    async openCamera() {
      if (stream) stream.getTracks().forEach(tr => tr.stop());
      const v0 = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: opts.deviceId ? Object.assign({ deviceId: { exact: opts.deviceId } }, v0) : v0, audio: false });
      } catch (e) {
        if (!opts.deviceId || e.name === 'NotAllowedError') throw e;
        opts.deviceId = ''; t.saveOpts();
        stream = await navigator.mediaDevices.getUserMedia({ video: v0, audio: false });
      }
      video.srcObject = stream;
      await video.play();
      return stream.getVideoTracks()[0].getSettings().deviceId;
    },
    async listCameras() {
      return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    },
    async loadModel() {
      const base = new URL('vendor/mediapipe/', location.href).href.replace(/\/$/, '');
      const { FilesetResolver, HandLandmarker } = await import('../../vendor/mediapipe/vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks(base);
      const make = delegate => HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: base + '/hand_landmarker.task', delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
      });
      try { landmarker = await make('GPU'); } catch (e) { console.warn('GPU indisponível, usando CPU', e); landmarker = await make('CPU'); }
    },
    /* 2.5 s with the hands open and still; cb(count of fingers calibrated) */
    calibrate(cb) {
      meter.startCalibration();
      calibUntil = performance.now() + 2500;
      calibDone = cb || null;
    },
    calibSecondsLeft(now = performance.now()) { return calibUntil ? Math.max(0, Math.ceil((calibUntil - now) / 1000)) : 0; },
    resetCalibration() { meter.reset(); try { localStorage.removeItem(REST_KEY); } catch (e) {} },
    setGesture(g) { if (g === meter.gesture) return; opts.gesture = g; t.saveOpts(); meter.setGesture(g); t.resetCalibration(); },
    get gesture() { return GESTURES[meter.gesture]; },
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() {
      if (raf) cancelAnimationFrame(raf); raf = 0;
      if (stream) stream.getTracks().forEach(tr => tr.stop()); stream = null;
    },
    get running() { return !!stream; }
  };

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const w = video.videoWidth, h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const res = landmarker.detectForVideo(video, now);
    const hands = (res.landmarks || []).map(lm => toView(lm, w, h, opts));
    const sides = assignSides(hands);
    const scores = meter.update(sides);
    const picked = calibUntil ? null : picker.update(scores, now);

    drawVideo(w, h);
    for (const s of sides) drawHand(s, scores);

    if (calibUntil && now >= calibUntil) {
      const count = meter.finishCalibration();
      calibUntil = 0;
      if (count) save(REST_KEY, { mirror: !!opts.mirror, gesture: meter.gesture, rest: meter.rest, restZ: meter.restZ });
      const cb = calibDone; calibDone = null;
      if (cb) cb(count);
    }
    if (t.onFrame) t.onFrame({ sides, hands, scores, picked, now });
  }

  function drawVideo(w, h) {
    ctx.save();
    if (opts.rotate) { ctx.translate(w, h); ctx.scale(-1, -1); }
    if (opts.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  }

  function drawHand({ pts, side }, scores) {
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
      if (t.target === n) {
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

  return t;
}
