/* Android: gives the native Updater plugin (UpdaterPlugin.java) the same shape as the
   Electron bridge, for js/updater-ui.js. Only injected into www/ (scripts/build-www.js). */
(function () {
  const cap = window.Capacitor;
  if (window.updateBridge || !cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const U = cap.registerPlugin('Updater');
  window.updateBridge = {
    check: async () => {
      const r = await U.check();
      if (r && r.error) console.error('Atualização:', r.error);
      return r && r.version ? r : null;
    },
    install: async onProgress => {
      const h = await U.addListener('progress', e => onProgress(e.p));
      try {
        const r = await U.install();
        if (r.need === 'permission') return { ok: true, canPlay: true, title: 'Falta uma permissão',
          message: 'Na tela que abriu, ligue "Permitir desta fonte" e volte. A atualização continua na próxima vez que abrir o jogo.' };
        return { ok: true, canPlay: true, title: 'Quase lá!', message: 'Toque em "Instalar" na janela que abriu.' };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      } finally { h.remove(); }
    }
  };
})();
