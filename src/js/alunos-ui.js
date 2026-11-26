/* "Alunos" panel: list of children, report with charts, rename / merge / delete, export.
   Same UI on the game device (local api) and in the professor's phone (api over the
   network). api: list(), stats(id, period), rename(id, name), merge(from, into),
   remove(id), exportPdf(id | null, period), exportCsv() — all async. */
(function () {
  const esc = s => window.Report.esc(s);
  const fmtDate = t => (t ? new Date(t).toLocaleDateString('pt-BR') : '–');

  const CSS = `
.al{display:flex;flex-direction:column;gap:12px;color:#2a1f4f;font-family:"Nunito","Segoe UI",system-ui,sans-serif}
.al .al-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.al .al-btn{font-family:"Fredoka","Trebuchet MS",sans-serif;font-weight:600;font-size:17px;border:none;cursor:pointer;background:#fff;color:#2a1f4f;padding:10px 14px;border-radius:14px;box-shadow:0 4px 0 #cfc6f5}
.al .al-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #cfc6f5}
.al .al-btn.y{background:#ffc93c;box-shadow:0 4px 0 #e0a514}
.al .al-btn.r{background:#ff6b6b;color:#fff;box-shadow:0 4px 0 #d94c4c}
.al .al-btn:disabled{opacity:.5}
.al .al-list{display:flex;flex-direction:column;gap:8px}
.al .al-kid{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 5px 0 #cfc6f5;border:none;cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}
.al .al-kid b{font-family:"Fredoka","Trebuchet MS",sans-serif;font-size:21px;display:block}
.al .al-kid small{color:#6f6796;font-weight:700}
.al .al-acc{font-family:"Fredoka","Trebuchet MS",sans-serif;font-size:22px;color:#1c9450;white-space:nowrap}
.al .al-empty{background:#fff;border-radius:16px;padding:16px;text-align:center;font-weight:700;color:#6f6796}
.al .al-sheet{background:#fff;border-radius:20px;padding:14px;box-shadow:0 6px 0 #cfc6f5}
.al select,.al input{font:inherit;font-weight:700;font-size:16px;padding:9px 10px;border-radius:12px;border:2px solid #d9d3f2;background:#fff;color:#2a1f4f}
.al .al-edit{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#f4f1ff;border-radius:14px;padding:10px}
.al .al-msg{font-weight:800;color:#d94c4c;margin:0}
.al .al-info{font-weight:700;color:#6f6796;margin:0;font-size:14px}`;

  function mount(el, api, opts = {}) {
    if (!document.getElementById('al-css')) {
      const st = document.createElement('style'); st.id = 'al-css'; st.textContent = CSS + window.Report.CSS; document.head.appendChild(st);
    }
    let period = '90';
    let kids = [];

    async function showList(msg) {
      el.innerHTML = '<div class="al"><p class="al-info">Carregando…</p></div>';
      try { kids = await api.list(); } catch (e) { el.innerHTML = `<div class="al"><p class="al-msg">Não deu para carregar: ${esc(e.message || e)}</p></div>`; return; }
      el.innerHTML = `<div class="al">
        ${msg ? `<p class="al-msg">${esc(msg)}</p>` : ''}
        <div class="al-top">
          <button class="al-btn y" data-x="pdfAll"${kids.length ? '' : ' disabled'}>PDF de todos</button>
          ${api.exportCsv ? `<button class="al-btn" data-x="csv"${kids.length ? '' : ' disabled'}>Planilha (CSV)</button>` : ''}
          ${opts.extraTop || ''}
        </div>
        <div class="al-list">${kids.length ? kids.map(k => `
          <button class="al-kid" data-kid="${k.id}"><span><b>${esc(k.name)}</b><small>${k.rounds} ${k.rounds === 1 ? 'rodada' : 'rodadas'} · última ${fmtDate(k.last)}</small></span>
          <span class="al-acc">${k.acc == null ? '–' : k.acc + '%'}</span></button>`).join('')
        : '<div class="al-empty">Nenhuma criança ainda. Os nomes aparecem aqui depois da primeira rodada.</div>'}</div>
      </div>`;
      el.querySelectorAll('[data-kid]').forEach(b => { b.onclick = () => showKid(+b.dataset.kid); });
      const pa = el.querySelector('[data-x=pdfAll]'); if (pa) pa.onclick = () => run(pa, () => api.exportPdf(null, period));
      const cv = el.querySelector('[data-x=csv]'); if (cv) cv.onclick = () => run(cv, () => api.exportCsv());
      if (opts.onRender) opts.onRender(el);
    }

    async function run(btn, fn) {
      const t = btn.textContent; btn.disabled = true; btn.textContent = 'Gerando…';
      try { await fn(); } catch (e) { alertIn(e.message || String(e)); }
      btn.disabled = false; btn.textContent = t;
    }
    function alertIn(text) {
      let m = el.querySelector('.al-msg.live');
      if (!m) { m = document.createElement('p'); m.className = 'al-msg live'; el.querySelector('.al').prepend(m); }
      m.textContent = text;
    }

    async function showKid(id, msg) {
      el.innerHTML = '<div class="al"><p class="al-info">Carregando…</p></div>';
      let s;
      try { s = await api.stats(id, period); } catch (e) { showList('Não deu para abrir a ficha.'); return; }
      if (!s) { showList('Essa criança não existe mais.'); return; }
      const others = kids.filter(k => k.id !== id);
      el.innerHTML = `<div class="al">
        <div class="al-top">
          <button class="al-btn" data-x="back">← Alunos</button>
          <select data-x="period" aria-label="Período">${Object.entries(window.Report.PERIODS).map(([v, l]) => `<option value="${v}"${v === period ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <button class="al-btn y" data-x="pdf">Exportar PDF</button>
        </div>
        ${msg ? `<p class="al-msg">${esc(msg)}</p>` : ''}
        <div class="al-sheet">${window.Report.render(s)}</div>
        <div class="al-edit">
          <input data-x="name" value="${esc(s.name)}" maxlength="24" aria-label="Nome">
          <button class="al-btn" data-x="rename">Corrigir nome</button>
        </div>
        ${others.length ? `<div class="al-edit">
          <span class="al-info">Mesma criança com outro nome?</span>
          <select data-x="into">${others.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('')}</select>
          <button class="al-btn" data-x="merge">Juntar nesta</button>
        </div>` : ''}
        <div class="al-edit"><span class="al-info">Apagar a ficha remove todas as rodadas desta criança.</span>
          <button class="al-btn r" data-x="del">Apagar ficha</button></div>
      </div>`;
      const q = x => el.querySelector(`[data-x=${x}]`);
      q('back').onclick = () => showList();
      q('period').onchange = e => { period = e.target.value; showKid(id); };
      q('pdf').onclick = () => run(q('pdf'), () => api.exportPdf(id, period));
      q('rename').onclick = async () => {
        const r = await api.rename(id, q('name').value);
        if (r && r.ok) { kids = await api.list(); showKid(id); } else showKid(id, (r && r.error) || 'Não deu para corrigir.');
      };
      if (q('merge')) q('merge').onclick = async () => {
        const into = +q('into').value;
        const r = await api.merge(id, into);
        if (r && r.ok) { kids = await api.list(); showKid(into, 'Fichas unidas.'); } else showKid(id, (r && r.error) || 'Não deu para juntar.');
      };
      let armed = false;
      q('del').onclick = async () => {
        if (!armed) { armed = true; q('del').textContent = 'Toque de novo para apagar'; setTimeout(() => { armed = false; const b = q('del'); if (b) b.textContent = 'Apagar ficha'; }, 4000); return; }
        await api.remove(id);
        showList('Ficha apagada.');
      };
      if (opts.onRender) opts.onRender(el);
    }

    showList();
    return { refresh: () => showList(), showKid };
  }

  window.AlunosUI = { mount };
})();
