// Puts the hand-tracking files (MediaPipe) in src/vendor/mediapipe/ so the webcam test
// screen works offline. The library comes from node_modules; the model (~8 MB) is
// downloaded once from Google's storage. Runs before `npm start` and before the PC build.
// The folder is in .gitignore: nothing here goes to the repository.
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'vendor', 'mediapipe');
const lib = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL = path.join(out, 'hand_landmarker.task');

function copy(from, to) {
  const src = path.join(lib, from);
  const dst = path.join(out, to);
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) return;
  fs.copyFileSync(src, dst);
}

function download(url, file, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(res.headers.location, file, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const tmp = file + '.part';
      const ws = fs.createWriteStream(tmp);
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => { fs.renameSync(tmp, file); resolve(); }));
      ws.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  if (!fs.existsSync(lib)) {
    console.warn('\n[câmera] Falta instalar o reconhecimento das mãos. Feche o jogo e rode: npm install  (depois npm start de novo)\n');
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  copy('vision_bundle.mjs', 'vision_bundle.mjs');
  copy('wasm/vision_wasm_internal.js', 'vision_wasm_internal.js');
  copy('wasm/vision_wasm_internal.wasm', 'vision_wasm_internal.wasm');
  if (!fs.existsSync(MODEL) || fs.statSync(MODEL).size < 1e6) {
    console.log('[câmera] baixando o modelo das mãos (uma vez só, ~8 MB)…');
    try { await download(MODEL_URL, MODEL); }
    catch (e) { console.warn('[câmera] não consegui baixar o modelo:', e.message, '— a tela de teste da câmera não vai funcionar até baixar.'); }
  }
})();
