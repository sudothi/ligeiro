/* Android (tablet): the local server lives in the native LocalServer plugin
   (android/.../LocalServerPlugin.java). This file gives it the same shape as the
   Electron preload bridge, so remote.js works unchanged. Only injected into www/. */
(function () {
  const cap = window.Capacitor;
  if (window.remoteBridge || !cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const LS = cap.registerPlugin('LocalServer');

  function withQr(info) {
    if (info && info.url && window.qrcode) {
      const q = window.qrcode(0, 'M');
      q.addData(info.url);
      q.make();
      info.qr = q.createDataURL(8, 2);
    }
    return info;
  }

  window.remoteBridge = {
    info: async () => { await LS.start().catch(() => {}); return withQr(await LS.info()); },
    newCode: async () => withQr(await LS.newCode()),
    sendState: state => { LS.sendState({ state: JSON.stringify(state) }).catch(() => {}); },
    onAction: fn => LS.addListener('action', e => fn(e.name, e.arg)),
    onRequest: fn => LS.addListener('req', e => fn(e.cid, e.id, e.m, e.a ? JSON.parse(e.a) : [])),
    reply: (cid, id, payload) => { LS.reply({ cid, id, payload: JSON.stringify(payload) }).catch(() => {}); },
    onConfig: fn => LS.addListener('config', e => fn(e.key, e.value)),
    onClients: fn => LS.addListener('clients', e => fn(e.count))
  };

  /* children's data: a small file in the app's private storage */
  window.storageBridge = {
    load: async () => { const r = await LS.loadData(); return r && r.text ? r.text : null; },
    save: async text => { await LS.saveData({ text }); }
  };
})();
