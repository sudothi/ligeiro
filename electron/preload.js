// Bridge between the game page and the local server in the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('remoteBridge', {
  info: () => ipcRenderer.invoke('remote:info'),
  newCode: () => ipcRenderer.invoke('remote:newCode'),
  sendState: state => ipcRenderer.send('remote:state', state),
  onAction: fn => ipcRenderer.on('remote:action', (_e, name) => fn(name)),
  onConfig: fn => ipcRenderer.on('remote:config', (_e, key, v) => fn(key, v)),
  onClients: fn => ipcRenderer.on('remote:clients', (_e, n) => fn(n))
});
