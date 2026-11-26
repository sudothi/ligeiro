// Bridge between the game page and the local server in the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('remoteBridge', {
  info: () => ipcRenderer.invoke('remote:info'),
  newCode: () => ipcRenderer.invoke('remote:newCode'),
  sendState: state => ipcRenderer.send('remote:state', state),
  onAction: fn => ipcRenderer.on('remote:action', (_e, name, arg) => fn(name, arg)),
  onRequest: fn => ipcRenderer.on('remote:req', (_e, cid, id, m, a) => fn(cid, id, m, a)),
  reply: (cid, id, payload) => ipcRenderer.send('remote:reply', cid, id, payload),
  onConfig: fn => ipcRenderer.on('remote:config', (_e, key, v) => fn(key, v)),
  onClients: fn => ipcRenderer.on('remote:clients', (_e, n) => fn(n))
});

contextBridge.exposeInMainWorld('storageBridge', {
  load: () => ipcRenderer.invoke('data:load'),
  save: text => ipcRenderer.invoke('data:save', text)
});

contextBridge.exposeInMainWorld('pdfBridge', {
  savePdf: (html, name) => ipcRenderer.invoke('pdf:save', html, name),
  saveText: (text, name) => ipcRenderer.invoke('text:save', text, name)
});

contextBridge.exposeInMainWorld('updateBridge', {
  check: () => ipcRenderer.invoke('update:check'),
  install: onProgress => {
    const h = (_e, p) => onProgress(p);
    ipcRenderer.on('update:progress', h);
    return ipcRenderer.invoke('update:install').finally(() => ipcRenderer.removeListener('update:progress', h));
  }
});
