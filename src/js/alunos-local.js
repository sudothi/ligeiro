/* Game device side of "Alunos": the PIN-protected screen, exporting PDF/CSV from this
   device, and the requests the professor's phone makes over the network (AlunosHost.handle). */
(function () {
  const $ = id => document.getElementById(id);
  const cap = window.Capacitor;
  const inApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const LS = inApp ? cap.registerPlugin('LocalServer') : null;

  const slug = s => (Students.keyOf(s) || 'todos').replace(/\s+/g, '-');
  const today = () => new Date().toISOString().slice(0, 10);

  async function reportDoc(id, period) {
    await Students.load();
    if (id == null) {
      const list = Students.list();
      const parts = [window.Report.renderAll(list)];
      for (const k of list) parts.push(`<div class="pb">${window.Report.render(Students.stats(k.id, period))}</div>`);
      return { title: `Relatório geral ${today()}`, file: `Dedos-Ligeiros-todos-${today()}`, body: parts.join('') };
    }
    const s = Students.stats(id, period);
    return { title: `Relatório ${s ? s.name : ''}`, file: `Dedos-Ligeiros-${slug(s ? s.name : 'crianca')}-${today()}`, body: window.Report.render(s) };
  }

  /* Print / save a full HTML page as PDF on this device. */
  async function printHtml(html, file) {
    if (window.pdfBridge) return window.pdfBridge.savePdf(html, file + '.pdf');           // PC: save dialog
    if (LS) return LS.print({ html, name: file });                                        // Android: system print / save as PDF
    const fr = document.createElement('iframe');                                           // browser fallback
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    fr.contentDocument.open(); fr.contentDocument.write(html); fr.contentDocument.close();
    await new Promise(r => setTimeout(r, 400));
    fr.contentWindow.focus(); fr.contentWindow.print();
    setTimeout(() => fr.remove(), 2000);
  }
  async function saveText(text, file) {
    if (window.pdfBridge && window.pdfBridge.saveText) return window.pdfBridge.saveText(text, file);
    if (LS) return LS.print({ html: `<pre style="font-size:10px">${window.Report.esc(text)}</pre>`, name: file });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const localApi = {
    list: async () => { await Students.load(); return Students.list(); },
    stats: async (id, period) => { await Students.load(); return Students.stats(id, period); },
    rename: async (id, name) => Students.rename(id, name),
    merge: async (a, b) => Students.merge(a, b),
    remove: async id => Students.remove(id),
    exportPdf: async (id, period) => {
      const d = await reportDoc(id, period);
      await printHtml(window.Report.page(d.title, d.body, 'css/fonts.css'), d.file);
    },
    exportCsv: async () => { await Students.load(); await saveText(Students.csv(), `Dedos-Ligeiros-rodadas-${today()}.csv`); }
  };

  /* ---------- requests from the professor's phone ---------- */
  async function handle(method, args) {
    await Students.load();
    const a = Array.isArray(args) ? args : [];
    switch (method) {
      case 'list': return Students.list();
      case 'stats': return Students.stats(+a[0], String(a[1] || 'all'));
      case 'rename': return Students.rename(+a[0], String(a[1] || ''));
      case 'merge': return Students.merge(+a[0], +a[1]);
      case 'remove': return Students.remove(+a[0]);
      case 'report': { const d = await reportDoc(a[0] == null ? null : +a[0], String(a[1] || 'all')); return d; }
      case 'csv': return { text: Students.csv(), file: `Dedos-Ligeiros-rodadas-${today()}.csv` };
      case 'resetPin': Students.clearPin(); return { ok: true };
      default: throw new Error('pedido desconhecido');
    }
  }
  window.AlunosHost = { handle, api: localApi };

  /* ---------- PIN + screen on the game device ---------- */
  let ui = null;
  let pinStep = null; // 'enter' | 'new' | 'confirm'
  let firstPin = '';
  function openPin() {
    Students.load().then(() => {
      pinStep = Students.hasPin() ? 'enter' : 'new';
      firstPin = '';
      paintPin();
      $('pinBox').hidden = false;
      setTimeout(() => $('pinIn').focus(), 50);
    });
  }
  function paintPin(err) {
    $('pinIn').value = '';
    $('pinTitle').textContent = pinStep === 'enter' ? 'PIN do professor' : 'Crie um PIN';
    $('pinHelp').textContent = pinStep === 'enter' ? 'Digite o PIN de 4 números. Esqueceu? Pelo celular conectado, em Alunos, dá para apagar o PIN.'
      : pinStep === 'new' ? 'Escolha 4 números para proteger os dados das crianças.' : 'Digite o mesmo PIN de novo.';
    $('pinErr').hidden = !err; $('pinErr').textContent = err || '';
  }
  function submitPin() {
    const v = $('pinIn').value.trim();
    if (!/^\d{4}$/.test(v)) { paintPin('O PIN tem 4 números.'); return; }
    if (pinStep === 'enter') {
      if (!Students.checkPin(v)) { paintPin('PIN errado.'); return; }
      openAlunos();
    } else if (pinStep === 'new') { firstPin = v; pinStep = 'confirm'; paintPin(); }
    else if (v !== firstPin) { pinStep = 'new'; paintPin('Os dois PINs não batem. Tente de novo.'); }
    else { Students.setPin(v); openAlunos(); }
  }
  function openAlunos() {
    $('pinBox').hidden = true;
    window.Game.show('alunos');
    if (!ui) ui = window.AlunosUI.mount($('alunosPanel'), localApi);
    else ui.refresh();
    if (window.ClinicUI) window.ClinicUI.open(() => ui && ui.refresh());
  }
  $('btnAlunos').onclick = () => { if (window.Audio2) Audio2.sfx.click(); openPin(); };
  $('btnPinOk').onclick = submitPin;
  $('btnPinCancel').onclick = () => { $('pinBox').hidden = true; };
  $('pinIn').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); if (e.key === 'Escape') $('pinBox').hidden = true; e.stopPropagation(); });
  $('btnAlunosBack').onclick = () => window.Game.action('home');
})();
