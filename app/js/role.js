/* Android app only: on launch, ask who uses this device.
   Jogador = this device shows the game (and hosts the room). Professor = controller. */
(function () {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  let skip = false;
  try { skip = localStorage.getItem('dl-role') === 'player'; localStorage.removeItem('dl-role'); } catch (e) {}

  const LS = cap.registerPlugin('LocalServer');
  const box = document.createElement('div');
  box.className = 'overlay role';
  box.innerHTML = `
    <div class="box role-box">
      <div class="mascot" id="roleMascot"></div>
      <h2>Quem vai usar este aparelho?</h2>
      <button class="btn yellow big" id="rolePlayer">Sou o jogador</button>
      <p>Este aparelho mostra o jogo para a criança.</p>
      <button class="btn green big" id="roleProf">Sou o professor</button>
      <p>Este aparelho controla o jogo (no tablet ou no computador).</p>
    </div>`;
  if (skip) { LS.start().catch(() => {}); return; }
  document.body.appendChild(box);
  if (window.Mascot) Mascot.mount(document.getElementById('roleMascot')).set('happy');
  document.getElementById('rolePlayer').onclick = () => {
    if (window.Audio2) Audio2.sfx.click();
    LS.start().catch(() => {});
    box.remove();
  };
  document.getElementById('roleProf').onclick = () => {
    LS.stop().catch(() => {});
    location.href = 'remote/index.html';
  };
})();
