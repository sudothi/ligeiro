// Electron entry point: opens the game in a full-screen window and runs the local
// server that lets the professional's phone control the game on the same Wi-Fi.
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { createServer } = require('./server');

let win = null;
const send = (ch, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...args); };

const remote = createServer({
  onAction: name => send('remote:action', name),
  onConfig: (key, v) => send('remote:config', key, v),
  onClients: n => send('remote:clients', n)
});

ipcMain.handle('remote:info', () => remote.info());
ipcMain.handle('remote:newCode', () => { remote.newCode(); return remote.info(); });
ipcMain.on('remote:state', (_e, state) => remote.setState(state));

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
