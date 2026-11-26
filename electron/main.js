// Electron entry point: opens the game in a full-screen window and runs the local
// server that lets the professional's phone control the game on the same Wi-Fi.
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('./server');

let win = null;
const send = (ch, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...args); };

const remote = createServer({
  onAction: (name, arg) => send('remote:action', name, arg),
  onRequest: (cid, id, m, a) => send('remote:req', cid, id, m, a),
  onConfig: (key, v) => send('remote:config', key, v),
  onClients: n => send('remote:clients', n)
});

ipcMain.handle('remote:info', () => remote.info());
ipcMain.handle('remote:newCode', () => { remote.newCode(); return remote.info(); });
ipcMain.on('remote:state', (_e, state) => remote.setState(state));
ipcMain.on('remote:reply', (_e, cid, id, payload) => remote.reply(cid, id, payload));

/* Children's data: one small JSON file in the app's data folder (never leaves this PC). */
const dataFile = () => path.join(app.getPath('userData'), 'alunos.json');
ipcMain.handle('data:load', () => { try { return fs.readFileSync(dataFile(), 'utf8'); } catch (e) { return null; } });
ipcMain.handle('data:save', (_e, text) => {
  if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) return false;
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  try { fs.copyFileSync(dataFile(), dataFile() + '.bak'); } catch (e) {}
  fs.renameSync(tmp, dataFile());
  return true;
});

/* Report: render the HTML in a hidden window and save it as PDF where the user picks. */
ipcMain.handle('pdf:save', async (_e, html, name) => {
  const out = await dialog.showSaveDialog(win, {
    title: 'Salvar relatório', defaultPath: path.join(app.getPath('documents'), name || 'relatorio.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (out.canceled || !out.filePath) return { ok: false, canceled: true };
  await writePdf(html, out.filePath);
  return { ok: true, path: out.filePath };
});
async function writePdf(html, file) {
  const tmp = path.join(app.getPath('temp'), `dl-relatorio-${Date.now()}.html`);
  // fonts are referenced as css/fonts.css: resolve them against the game folder
  const base = 'file:///' + path.join(__dirname, '..', 'src').replace(/\\/g, '/') + '/';
  fs.writeFileSync(tmp, html.replace('<head>', `<head><base href="${base}">`), 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    fs.writeFileSync(file, pdf);
  } finally { pw.destroy(); try { fs.unlinkSync(tmp); } catch (e) {} }
}
ipcMain.handle('text:save', async (_e, text, name) => {
  const out = await dialog.showSaveDialog(win, { title: 'Salvar planilha', defaultPath: path.join(app.getPath('documents'), name || 'rodadas.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (out.canceled || !out.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(out.filePath, text, 'utf8');
  return { ok: true, path: out.filePath };
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#5b3fd9',
    autoHideMenuBar: true,
    title: 'Dedos Ligeiros',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.once('ready-to-show', () => win.maximize());
  // F11 toggles full screen for the session
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

Menu.setApplicationMenu(null);
app.whenReady().then(async () => {
  try { await remote.listen(); } catch (e) { console.error('Servidor local não iniciou:', e.message); }
  createWindow();
});
app.on('window-all-closed', () => { remote.close(); app.quit(); });
