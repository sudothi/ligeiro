// Builds www/ for the Android app: the game (src/) plus the phone page (remote/),
// the Capacitor runtime and a QR generator, with the Android bridge injected.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(root, 'src'), www, { recursive: true });
fs.cpSync(path.join(root, 'remote'), path.join(www, 'remote'), { recursive: true });
fs.cpSync(path.join(root, 'app'), www, { recursive: true });
fs.mkdirSync(path.join(www, 'js', 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'js/vendor/capacitor.js'));
fs.copyFileSync(path.join(root, 'node_modules/qrcode-generator/dist/qrcode.js'), path.join(www, 'js/vendor/qrcode.js'));
fs.copyFileSync(path.join(root, 'node_modules/jsqr/dist/jsQR.js'), path.join(www, 'js/vendor/jsQR.js'));
const idx = path.join(www, 'index.html');
const html = fs.readFileSync(idx, 'utf8');
const tag = '<script src="js/remote.js"></script>';
if (!html.includes(tag)) throw new Error('remote.js tag not found in index.html');
fs.writeFileSync(idx, html.replace(tag,
  '<script src="js/vendor/capacitor.js"></script>\n<script src="js/vendor/qrcode.js"></script>\n<script src="js/remote-android.js"></script>\n' + tag + '\n<script src="js/role.js"></script>'));
// the professor screen inside the app is the same page the browser gets, plus the app runtime
const rp = path.join(www, 'remote', 'index.html');
const rh = fs.readFileSync(rp, 'utf8');
if (!rh.includes('</head>')) throw new Error('no </head> in remote/index.html');
fs.writeFileSync(rp, rh.replace('</head>', '<script src="../js/vendor/capacitor.js"></script>\n<script src="../js/vendor/jsQR.js"></script>\n</head>'));
console.log('www/ pronto');
