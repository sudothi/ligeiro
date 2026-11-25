/* Mode 1, game side: shows the QR code / room code and obeys the professional's phone.
   Only active inside the installed app (window.remoteBridge comes from electron/preload.js). */
(function () {
  const bridge = window.remoteBridge;
  if (!bridge || !window.Game) return;
  const $ = id => document.getElementById(id);

  let phones = 0;
  let wasConnected = false;

  async function fill(info) {
    if (!info || !info.url) {
      $('qrImg').hidden = true;
      $('roomUrl').textContent = '';
      $('connectErr').hidden = false;
      $('connectErr').textContent = info && !info.ip
        ? 'Este computador não está em nenhuma rede Wi-Fi ou cabo. Conecte na rede e tente de novo.'
        : 'O servidor local não iniciou. Feche e abra o jogo de novo.';
    } else {
      $('qrImg').hidden = false;
      $('qrImg').src = info.qr;
      $('roomUrl').textContent = info.url.replace(/^http:\/\//, '');
      $('connectErr').hidden = true;
    }
    $('roomCode').textContent = info && info.code ? info.code : '----';
  }

  function paint() {
    const on = phones > 0;
    document.body.classList.toggle('phone-on', on);
    $('phoneChip').hidden = !on;
    $('btnPhone').classList.toggle('on', on);
    $('phoneLabel').textContent = on ? 'Celular conectado' : 'Controlar pelo celular';
    const st = $('connectStatus');
    st.classList.toggle('ok', on);
    st.textContent = on ? (phones > 1 ? `${phones} celulares conectados!` : 'Celular conectado!') : 'Aguardando o celular…';
  }

  async function open() {
    $('connect').hidden = false;
    fill(await bridge.info());
  }
  function close() { $('connect').hidden = true; }

  $('btnPhone').hidden = false;
  $('btnPhone').onclick = () => { Audio2.sfx.click(); open(); };
  $('btnConnectClose').onclick = close;
  $('btnNewCode').onclick = async () => fill(await bridge.newCode());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('connect').hidden) { e.stopImmediatePropagation(); close(); } }, true);

  bridge.onAction(name => {
    if (!$('connect').hidden) close();
    Game.action(name);
  });
  bridge.onConfig((key, v) => Game.setConfig(key, v));
  bridge.onClients(n => {
    phones = n;
    paint();
    if (n > 0 && !wasConnected) {
      Audio2.sfx.appear();
      if (!$('connect').hidden) setTimeout(close, 1200);
    }
    wasConnected = n > 0;
  });

  Game.onChange(state => bridge.sendState(state));
  paint();
})();
