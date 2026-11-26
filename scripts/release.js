// Release tool. See config/LEIA-ME.md.
//   node scripts/release.js chave                 one time: signing key + Android key, fills config/clinica.json
//   node scripts/release.js gerar <aberta|clinica> [--sem-windows] [--sem-android]
//                                                 builds the installer and/or APK of that edition into
//                                                 dist/<edition>/ with update.json (+ .sig when there is a key)
//   node scripts/release.js assinar <pasta> <edicao> [arquivos...]   (re)writes update.json(.sig) for files in a folder
//   node scripts/release.js publicar              sends dist/clinica/ to the VPS (files first, update.json last)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'config');
const pkg = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const win = process.platform === 'win32';
const die = msg => { console.error('\n✗ ' + msg); process.exit(1); };
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: ROOT, shell: win }, opts));

function editionFile(name) {
  if (name === 'aberta') return path.join(CFG, 'aberta.json');
  if (name === 'clinica') return path.join(CFG, 'clinica.json');
  die('edição desconhecida: ' + name + ' (use aberta ou clinica)');
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** Private key: config/chave-privada.pem (clinic) or env DL_SIGN_KEY (PEM text, CI secret for the open edition). */
function privateKey(edition) {
  if (edition === 'aberta') return process.env.DL_SIGN_KEY ? crypto.createPrivateKey(process.env.DL_SIGN_KEY) : null;
  const f = path.join(CFG, 'chave-privada.pem');
  if (!fs.existsSync(f)) die('falta config/chave-privada.pem. Rode: npm run release:chave');
  return crypto.createPrivateKey(fs.readFileSync(f));
}

function chave() {
  const cfgFile = path.join(CFG, 'clinica.json');
  const keyFile = path.join(CFG, 'chave-privada.pem');
  if (fs.existsSync(keyFile)) die('config/chave-privada.pem já existe. Não crie outra: os apps instalados só aceitam a chave atual.');
  const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync(keyFile, priv.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const cfg = fs.existsSync(cfgFile) ? readJson(cfgFile) : readJson(path.join(CFG, 'clinica.exemplo.json'));
  cfg.publicKey = pub.export({ type: 'spki', format: 'der' }).toString('base64');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  console.log('✓ chave de assinatura criada: config/chave-privada.pem');

  const jks = path.join(CFG, 'android.jks');
  const props = path.join(CFG, 'android.properties');
  if (!fs.existsSync(jks)) {
    const pass = crypto.randomBytes(18).toString('base64url');
    try {
      run('keytool', ['-genkeypair', '-keystore', jks, '-alias', 'dedosligeiros', '-keyalg', 'RSA', '-keysize', '3072',
        '-validity', '36500', '-storepass', pass, '-keypass', pass, '-dname', 'CN=Dedos Ligeiros, O=Clinica, C=BR']);
      fs.writeFileSync(props, `storeFile=${jks.replace(/\\/g, '/')}\nstorePassword=${pass}\nkeyAlias=dedosligeiros\nkeyPassword=${pass}\n`, { mode: 0o600 });
      console.log('✓ chave do Android criada: config/android.jks e config/android.properties');
    } catch (e) {
      console.log('! keytool não encontrado (vem com o Java/Android Studio). A chave do Android fica para depois: rode de novo com o Java instalado.');
    }
  }
  console.log('\nFalta só preencher em config/clinica.json o "feed" (endereço das atualizações) e o "vps".');
  console.log('GUARDE UMA CÓPIA de config/chave-privada.pem, config/android.jks e config/android.properties fora deste PC.');
}

/** Writes update.json (and update.json.sig when there is a key) describing the files in dir. */
function assinar(dir, edition, notes) {
  const version = pkg().version;
  const [a, b, c] = version.split('.').map(n => parseInt(n, 10) || 0);
  const m = { version, edition, date: new Date().toISOString().slice(0, 10), notes: notes || '' };
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (f.endsWith('.exe')) m.windows = { url: encodeURIComponent(f), sha256: sha256(full), size: fs.statSync(full).size };
    if (f.endsWith('.apk')) m.android = { url: encodeURIComponent(f), versionCode: a * 10000 + b * 100 + c, sha256: sha256(full), size: fs.statSync(full).size };
  }
  if (!m.windows && !m.android) die('nenhum .exe ou .apk em ' + dir);
  const text = JSON.stringify(m, null, 2) + '\n';
  fs.writeFileSync(path.join(dir, 'update.json'), text);
  const key = privateKey(edition);
  if (key) {
    const sig = crypto.sign('sha256', Buffer.from(text, 'utf8'), { key, dsaEncoding: 'ieee-p1363' });
    fs.writeFileSync(path.join(dir, 'update.json.sig'), sig.toString('base64') + '\n');
    console.log('✓ update.json assinado');
  } else {
    if (edition === 'clinica') die('a versão da clínica precisa de assinatura');
    console.log('! update.json sem assinatura (sem DL_SIGN_KEY): os apps conferem só o SHA-256');
  }
  return m;
}

function gerar(edition, flags) {
  const cfgFile = editionFile(edition);
  if (!fs.existsSync(cfgFile)) die(`falta ${path.relative(ROOT, cfgFile)}. Rode: npm run release:chave`);
  const cfg = readJson(cfgFile);
  if (!cfg.feed || /SEU-/.test(cfg.feed)) die(`preencha o "feed" em ${path.relative(ROOT, cfgFile)}`);
  if (edition === 'clinica' && !cfg.publicKey) die('falta a chave pública em config/clinica.json. Rode: npm run release:chave');
  const doWin = !flags.includes('--sem-windows');
  const doAndroid = !flags.includes('--sem-android');
  if (doWin && !win && !process.env.DL_WIN_ON_LINUX) die('o instalador do Windows precisa do Windows, ou de wine com DL_WIN_ON_LINUX=1 (ou use --sem-windows)');
  if (doAndroid && edition === 'clinica' && !fs.existsSync(path.join(CFG, 'android.properties')))
    die('falta config/android.properties (chave do Android). Rode: npm run release:chave com o Java instalado');

  const version = pkg().version;
  const out = path.join(ROOT, 'dist', edition);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const edJson = path.join(ROOT, 'src', 'edition.json');
  // the app only gets the public part: never the vps block
  let publicKey = cfg.publicKey || null;
  if (!publicKey && edition === 'aberta' && process.env.DL_SIGN_KEY)
    publicKey = crypto.createPublicKey(process.env.DL_SIGN_KEY).export({ type: 'spki', format: 'der' }).toString('base64');
  fs.writeFileSync(edJson, JSON.stringify({ edition: cfg.edition || edition, feed: cfg.feed, publicKey }, null, 2) + '\n');
  try {
    if (doWin) {
      run('npx', ['electron-builder', '--win', '--x64', '--publish', 'never', '-c.directories.output=dist/build-win']);
      const exe = path.join(ROOT, 'dist', 'build-win', `Dedos-Ligeiros-Instalador-${version}.exe`);
      fs.copyFileSync(exe, path.join(out, path.basename(exe)));
    }
    if (doAndroid) {
      run('node', ['scripts/build-www.js']);
      run('npx', ['cap', 'sync', 'android']);
      // without a fixed key (open edition, no CI secret) the APK is debug-signed: it installs, but
      // cannot update itself, because every build machine has a different debug key
      const signed = fs.existsSync(path.join(CFG, 'android.properties')) || process.env.DL_ANDROID_PROPS;
      if (!signed) console.log('! sem chave fixa do Android: APK de teste (não atualiza sozinho)');
      run(win ? 'gradlew.bat' : './gradlew', [signed ? 'assembleRelease' : 'assembleDebug', '--no-daemon'], { cwd: path.join(ROOT, 'android') });
      const apk = signed ? path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
        : path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
      if (!fs.existsSync(apk)) die('o APK não foi gerado ou não foi assinado (falta a chave do Android?)');
      fs.copyFileSync(apk, path.join(out, `Dedos-Ligeiros-${version}.apk`));
    }
  } finally {
    fs.rmSync(edJson, { force: true });
  }
  assinar(out, edition, process.env.DL_NOTES);
  console.log(`\n✓ pronto em dist/${edition}/`);
  if (edition === 'clinica') console.log('Para enviar para a VPS: npm run release:publicar');
}

function publicar() {
  const cfg = readJson(editionFile('clinica'));
  const dest = cfg.vps && cfg.vps.destino;
  if (!dest || /SEU-/.test(dest)) die('preencha "vps.destino" em config/clinica.json (ex.: ubuntu@IP:/var/www/atualizacoes/)');
  const dir = path.join(ROOT, 'dist', 'clinica');
  const m = readJson(path.join(dir, 'update.json'));
  const files = [m.windows, m.android].filter(Boolean).map(x => path.join(dir, decodeURIComponent(x.url)));
  const ssh = cfg.vps.chave ? ['-i', cfg.vps.chave.replace(/^~/, require('os').homedir()), '-o', 'IdentitiesOnly=yes'] : [];
  // big files first; the new update.json only appears when they are already there
  run('scp', [...ssh, ...files, dest], { shell: false });
  run('scp', [...ssh, path.join(dir, 'update.json.sig'), path.join(dir, 'update.json'), dest], { shell: false });
  console.log(`\n✓ versão ${m.version} publicada. Os apps da clínica atualizam na próxima vez que abrirem.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'chave') chave();
else if (cmd === 'gerar') gerar(rest[0], rest.slice(1));
else if (cmd === 'assinar') assinar(path.resolve(rest[0]), rest[1] || 'clinica', process.env.DL_NOTES);
else if (cmd === 'publicar') publicar();
else console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 8).join('\n'));
