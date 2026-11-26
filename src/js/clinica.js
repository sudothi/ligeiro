/* "Conectar à clínica" box on the Alunos screen (PC, clinic edition only).
   Paired once with a code made on the server (node admin.js parear "Sala 1"); after that the
   children's data of every clinic PC is shared through the clinic server (see students.js). */
(function () {
  const b = window.syncBridge;
  if (!b) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  let onData = () => {};
  let confirmOff = false;

  async function paint(msg) {
    const box = $('clinicBox');
    let st;
    try { st = await b.status(); } catch (e) { st = null; }
    if (!st || !st.enabled) { box.hidden = true; return; }
    box.hidden = false;
    if (!st.paired) {
      box.innerHTML = `<b>Servidor da clínica</b>
        <p>Este PC ainda não guarda os alunos no servidor da clínica. Peça um código de conexão e digite aqui (uma vez só).</p>
        <div class="clinic-row">
          <input id="clinicCode" placeholder="Código (ABCD-2345)" maxlength="9" autocomplete="off" aria-label="Código de conexão">
          <input id="clinicName" placeholder="Nome deste PC (ex.: Sala 1)" maxlength="40" aria-label="Nome deste PC">
          <button class="btn yellow" id="clinicGo">Conectar</button>
        </div>${msg ? `<p class="clinic-msg">${esc(msg)}</p>` : ''}`;
      const go = async () => {
        const code = $('clinicCode').value.trim(), name = $('clinicName').value.trim();
        if (code.replace(/[^a-z0-9]/gi, '').length !== 8) { paint('O código tem 8 letras e números.'); return; }
        $('clinicGo').disabled = true; $('clinicGo').textContent = 'Conectando…';
        const r = await b.pair(code, name);
        if (!r.ok) { paint(r.error); return; }
        await Students.startSync();
        onData();
        paint();
      };
      $('clinicGo').onclick = go;
      for (const id of ['clinicCode', 'clinicName']) $(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
      return;
    }
    const info = Students.syncInfo();
    const state = info.ok === false && info.error === 'unpaired' ? 'Este PC foi desconectado no servidor. Conecte de novo com um código novo.'
      : info.ok === false ? `Sem conexão com o servidor agora.${info.pending ? ` ${info.pending} ${info.pending === 1 ? 'alteração espera' : 'alterações esperam'} para subir.` : ''} O jogo continua salvando neste PC.`
      : info.at ? `Tudo sincronizado às ${hm(info.at)}.` : 'Sincronizando…';
    box.innerHTML = `<b>Servidor da clínica · ${esc(st.name || 'este PC')}</b>
      <p>${esc(msg || state)} As fichas mostram o que cada criança jogou em todos os PCs da clínica.</p>
      <div class="clinic-row">
        <button class="btn" id="clinicNow">Sincronizar agora</button>
        <button class="btn" id="clinicOff">${confirmOff ? 'Toque de novo para desconectar' : 'Desconectar este PC'}</button>
      </div>`;
    $('clinicNow').onclick = async () => { $('clinicNow').disabled = true; $('clinicNow').textContent = 'Sincronizando…'; await Students.sync(); onData(); paint(); };
    $('clinicOff').onclick = async () => {
      if (!confirmOff) { confirmOff = true; paint(); setTimeout(() => { confirmOff = false; }, 4000); return; }
      confirmOff = false;
      await b.unpair(); Students.stopSync();
      paint('PC desconectado. Os dados que já estavam aqui continuam neste PC.');
    };
  }

  window.ClinicUI = {
    open(refresh) {
      onData = refresh || (() => {});
      paint();
      Students.sync().then(() => { onData(); paint(); });
    }
  };
})();
