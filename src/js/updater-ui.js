/* Update before playing (PC and Android). window.updateBridge comes from electron/preload.js
   or js/updater-android.js; without it (browser, `npm start`) this does nothing.
   When the game opens: if a newer signed version exists, the screen says so and installs it.
   Offline or any problem: the child just plays the current version. */
(function () {
  const bridge = window.updateBridge;
  if (!bridge) return;
  const $ = id => document.getElementById(id);
  let busy = false;

  function show(title, text, canPlay) {
    $('updBox').hidden = false;
    $('updTitle').textContent = title;
    $('updText').textContent = text;
    $('updActions').hidden = !canPlay;
  }
  const progress = p => { $('updFill').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; };
  $('btnUpdPlay').onclick = () => { $('updBox').hidden = true; };

  async function run() {
    if (busy) return;
    busy = true;
    try {
      const u = await bridge.check();
      if (!u) return;
      try { if (window.Mascot && !$('updMascot').firstChild) Mascot.mount($('updMascot')).set('happy'); } catch (e) {}
      progress(0);
      show('Tem uma versão nova!', `Atualizando para a versão ${u.version}… não feche o jogo.`, false);
      const r = await bridge.install(progress);
      if (r && r.ok) {
        show(r.title || 'Pronto!', r.message || 'O jogo vai abrir de novo sozinho.', !!r.canPlay);
      } else {
        show('Não deu para atualizar agora', 'Dá para jogar normalmente. Tentamos de novo na próxima vez.', true);
        console.error('Atualização:', r && r.error);
      }
    } catch (e) {
      console.error('Atualização:', e);
      if (!$('updBox').hidden) show('Não deu para atualizar agora', 'Dá para jogar normalmente. Tentamos de novo na próxima vez.', true);
    } finally { busy = false; }
  }

  window.UpdaterUI = { run };
  run();
})();
