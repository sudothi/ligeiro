/* Child report: turns Students.stats() into HTML with inline SVG charts.
   Used on the game device, inside the phone controller (which gets this file from the
   game's server) and for the PDF. Everything a child typed is escaped. */
(function () {
  const COLORS = ['#6c5ce7', '#e84393', '#ff7f11', '#e6a800', '#22b268', '#00a3d4', '#3867d6', '#b04ad6', '#e5502f', '#0f9b8e'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const fmtDate = t => new Date(t).toLocaleDateString('pt-BR');
  const PERIODS = { 30: 'últimos 30 dias', 90: 'últimos 90 dias', 365: 'último ano', all: 'todo o período' };

  const CSS = `
.rep{font-family:"Nunito","Segoe UI",system-ui,sans-serif;color:#2a1f4f;display:flex;flex-direction:column;gap:14px}
.rep h2{font-family:"Fredoka","Trebuchet MS",sans-serif;font-size:26px;margin:0}
.rep h3{font-family:"Fredoka","Trebuchet MS",sans-serif;font-size:18px;margin:0 0 6px}
.rep .sub{color:#6f6796;font-weight:700;margin:0;font-size:14px}
.rep .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.rep .cardx{background:#f4f1ff;border-radius:14px;padding:10px 12px}
.rep .cardx b{display:block;font-family:"Fredoka","Trebuchet MS",sans-serif;font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}
.rep .cardx span{color:#6f6796;font-weight:800;font-size:12px}
.rep .box{background:#fff;border:2px solid #e6e1fa;border-radius:16px;padding:12px 14px;break-inside:avoid}
.rep .note{background:#fff7dc;border-radius:14px;padding:10px 14px;font-weight:700;line-height:1.45}
.rep .note p{margin:0}
.rep svg{width:100%;height:auto;display:block;overflow:visible}
.rep svg text{font-family:"Nunito","Segoe UI",sans-serif;font-weight:800;fill:#2a1f4f}
.rep .legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;font-weight:800;color:#6f6796;margin-top:4px}
.rep .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.rep .nums{display:flex;flex-wrap:wrap;gap:6px}
.rep .nums span{background:#f4f1ff;border-radius:10px;padding:4px 10px;font-family:"Fredoka","Trebuchet MS",sans-serif;font-size:20px;font-variant-numeric:tabular-nums}
.rep .empty{color:#6f6796;font-weight:700;margin:0}
.rep table{border-collapse:collapse;width:100%;font-size:14px}
.rep th,.rep td{text-align:left;padding:6px 8px;border-bottom:1px solid #e6e1fa}
.rep th{color:#6f6796;font-size:12px;text-transform:uppercase}
.rep .num{text-align:right;font-variant-numeric:tabular-nums}
@media print{.rep .box{border-color:#ccc}}`;

  /* vertical bars; items: [{label, value(0-100), color, note}] */
  function bars(items, { h = 150, unit = '%', max = 100 } = {}) {
    const w = Math.max(240, items.length * 44);
    const bw = Math.min(34, (w - 20) / items.length - 10);
    const step = (w - 20) / items.length;
    const top = 18, base = h - 26;
    let g = `<line x1="10" y1="${base}" x2="${w - 10}" y2="${base}" stroke="#d9d3f2" stroke-width="2"/>`;
    items.forEach((it, i) => {
      const x = 10 + i * step + (step - bw) / 2;
      const v = Math.max(0, Math.min(max, it.value || 0));
      const bh = ((base - top) * v) / max;
      g += `<rect x="${x}" y="${base - bh}" width="${bw}" height="${Math.max(bh, 1)}" rx="6" fill="${it.color}"${it.empty ? ' opacity=".25"' : ''}/>`;
      g += `<text x="${x + bw / 2}" y="${base - bh - 5}" text-anchor="middle" font-size="12">${it.empty ? '–' : esc(Math.round(v)) + unit}</text>`;
      g += `<text x="${x + bw / 2}" y="${base + 17}" text-anchor="middle" font-size="13">${esc(it.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" role="img">${g}</svg>`;
  }

  /* line chart over sessions; points: [{t, v}] */
  function line(points, { h = 150, unit = '%', max = 100, color = '#5b3fd9' } = {}) {
    if (points.length < 2) return '<p class="empty">Precisa de pelo menos 2 sessões para mostrar a evolução.</p>';
    const w = 520, l = 34, r = 12, top = 14, base = h - 26;
    const mx = max || Math.max(...points.map(p => p.v), 1);
    const X = i => l + ((w - l - r) * i) / (points.length - 1);
    const Y = v => base - ((base - top) * Math.min(v, mx)) / mx;
    let g = '';
    [0, 0.5, 1].forEach(f => {
      const y = Y(mx * f);
      g += `<line x1="${l}" y1="${y}" x2="${w - r}" y2="${y}" stroke="#eee9fc" stroke-width="1.5"/><text x="${l - 6}" y="${y + 4}" text-anchor="end" font-size="11">${Math.round(mx * f)}${unit}</text>`;
    });
    g += `<polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points.map((p, i) => `${X(i)},${Y(p.v)}`).join(' ')}"/>`;
    points.forEach((p, i) => { g += `<circle cx="${X(i)}" cy="${Y(p.v)}" r="4" fill="${color}"/>`; });
    const lab = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    lab.forEach(i => { g += `<text x="${X(i)}" y="${base + 17}" text-anchor="middle" font-size="11">${esc(new Date(points[i].t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))}</text>`; });
    return `<svg viewBox="0 0 ${w} ${h}" role="img">${g}</svg>`;
  }

  function summaryText(s) {
    const out = [];
    const lv = [1, 2, 3, 4].map(l => ({ l, ...s.level[l] })).filter(x => x.n >= 5);
    if (lv.length) {
      const worst = lv.slice().sort((a, b) => b.hard / b.n - a.hard / a.n)[0];
      const best = lv.slice().sort((a, b) => a.hard / a.n - b.hard / b.n)[0];
      if (worst.hard > 0) out.push(`Mais dificuldade com <b>${worst.l} ${worst.l === 1 ? 'algarismo' : 'algarismos'}</b> (${pct(worst.hard, worst.n)}% dos números precisaram de repetição ou foram pulados).`);
      if (best !== worst) out.push(`Melhor desempenho com ${best.l} ${best.l === 1 ? 'algarismo' : 'algarismos'} (${pct(best.ok, best.n)}% de acertos).`);
    }
    const ds = s.digit.map((d, i) => ({ i, ...d })).filter(d => d.n >= 4 && d.hard > 0).sort((a, b) => b.hard / b.n - a.hard / a.n);
    if (ds.length) {
      const top = ds.slice(0, 3).filter(d => d.hard / d.n >= 0.15);
      if (top.length) out.push(`Algarismos que mais aparecem nos erros: <b>${top.map(d => d.i).join(', ')}</b>.`);
    }
    if (s.pos.marked >= 3) {
      const p = [['primeiro', s.pos.first], ['do meio', s.pos.middle], ['último', s.pos.last]].sort((a, b) => b[1] - a[1])[0];
      out.push(`Quando erra, costuma ser no <b>${p[0]}</b> algarismo do número.`);
    }
    const ev = s.evolution;
    if (ev.length >= 3) {
      const a = ev.slice(0, Math.ceil(ev.length / 2)), b = ev.slice(Math.floor(ev.length / 2));
      const avg = x => x.reduce((t, p) => t + p.acc, 0) / x.length;
      const d = Math.round(avg(b) - avg(a));
      if (d >= 5) out.push(`Os acertos subiram cerca de ${d} pontos ao longo das sessões.`);
      else if (d <= -5) out.push(`Os acertos caíram cerca de ${-d} pontos nas últimas sessões.`);
      else out.push('Os acertos estão estáveis ao longo das sessões.');
    }
    return out;
  }

  function render(s) {
    if (!s) return '<div class="rep"><p class="empty">Criança não encontrada.</p></div>';
    const head = `<div><h2>${esc(s.name)}</h2><p class="sub">${esc(PERIODS[s.period] || 'todo o período')} · gerado em ${fmtDate(Date.now())}${s.last ? ` · última sessão em ${fmtDate(s.last)}` : ''}</p></div>`;
    if (!s.numbers) return `<div class="rep">${head}<p class="empty">Ainda não há rodadas neste período.</p></div>`;
    const cards = `<div class="cards">
      <div class="cardx"><b>${s.rounds}</b><span>rodadas</span></div>
      <div class="cardx"><b>${s.numbers}</b><span>números</span></div>
      <div class="cardx"><b>${s.acc}%</b><span>acertos</span></div>
      <div class="cardx"><b>${s.skip}</b><span>pulados</span></div>
      <div class="cardx"><b>${s.rep}</b><span>com repetição</span></div>
      <div class="cardx"><b>${s.avgSecs != null ? String(s.avgSecs).replace('.', ',') + 's' : '–'}</b><span>por número</span></div>
    </div>`;
    const notes = summaryText(s);
    const note = notes.length ? `<div class="note">${notes.map(t => `<p>${t}</p>`).join('')}</div>` : '';

    const lv = [1, 2, 3, 4].map(l => s.level[l]);
    const levelChart = `<div class="box"><h3>Dificuldade por quantidade de algarismos</h3>${bars(lv.map((L, i) => ({
      label: `${i + 1} alg.`, value: pct(L.hard, L.n), color: '#ff6b6b', empty: !L.n })))}
      <div class="legend"><span><i style="background:#ff6b6b"></i>% dos números pulados, repetidos ou com algarismo marcado</span></div></div>`;
    const digitChart = `<div class="box"><h3>Algarismos difíceis (0 a 9)</h3>${bars(s.digit.map((d, i) => ({
      label: String(i), value: pct(d.hard, d.n), color: COLORS[i], empty: !d.n })))}
      <div class="legend"><span>% das vezes que o algarismo apareceu num número difícil${s.pos.marked ? ' (ou foi marcado como errado)' : ''}</span></div></div>`;
    const timeChart = `<div class="box"><h3>Tempo médio por número (segundos)</h3>${bars(lv.map((L, i) => ({
      label: `${i + 1} alg.`, value: L.n ? Math.round((10 * L.secs) / L.n) / 10 : 0, color: '#3ba4ff', empty: !L.n })), { unit: 's', max: Math.max(5, ...lv.map(L => (L.n ? L.secs / L.n : 0))) * 1.15 })}</div>`;
    const posChart = s.pos.marked ? `<div class="box"><h3>Em que posição erra</h3>${bars([
      { label: 'primeiro', value: pct(s.pos.first, s.pos.marked), color: '#b04ad6' },
      { label: 'meio', value: pct(s.pos.middle, s.pos.marked), color: '#b04ad6' },
      { label: 'último', value: pct(s.pos.last, s.pos.marked), color: '#b04ad6' }])}
      <div class="legend"><span>Com base nos algarismos que o professor marcou (${s.pos.marked})</span></div></div>` : '';
    const hardest = `<div class="box"><h3>Números com mais dificuldade</h3>${s.hardest.length
      ? `<div class="nums">${s.hardest.map(h => `<span>${esc(h.num)}</span>`).join('')}</div>`
      : '<p class="empty">Nenhum número pulado ou repetido.</p>'}</div>`;
    const evo = `<div class="box"><h3>Evolução dos acertos por sessão</h3>${line(s.evolution.map(e => ({ t: e.t, v: e.acc })))}</div>`;
    const namePts = s.evolution.filter(e => e.name != null).map(e => ({ t: e.t, v: e.name }));
    const nameEvo = namePts.length ? `<div class="box"><h3>Tempo para digitar o nome (segundos)</h3>${line(namePts, { unit: 's', max: Math.max(10, ...namePts.map(p => p.v)) * 1.15, color: '#22b268' })}</div>` : '';

    return `<div class="rep">${head}${cards}${note}${levelChart}${digitChart}${posChart}${hardest}${timeChart}${evo}${nameEvo}</div>`;
  }

  function renderAll(list) {
    if (!list.length) return '<div class="rep"><p class="empty">Nenhuma criança cadastrada ainda.</p></div>';
    return `<div class="rep"><div><h2>Resumo de todas as crianças</h2><p class="sub">gerado em ${fmtDate(Date.now())}</p></div>
      <table><thead><tr><th>Criança</th><th class="num">Rodadas</th><th class="num">Acertos</th><th>Última sessão</th></tr></thead><tbody>
      ${list.map(k => `<tr><td>${esc(k.name)}</td><td class="num">${k.rounds}</td><td class="num">${k.acc == null ? '–' : k.acc + '%'}</td><td>${k.last ? fmtDate(k.last) : '–'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* Full printable document. fontsHref: where css/fonts.css lives for this page. */
  function page(title, bodyHtml, fontsHref) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
${fontsHref ? `<link rel="stylesheet" href="${esc(fontsHref)}">` : ''}
<style>@page{size:A4;margin:14mm}html,body{margin:0;background:#fff}body{padding:0}.brand{font-family:"Fredoka","Trebuchet MS",sans-serif;color:#5b3fd9;font-weight:700;margin-bottom:8px}.pb{break-before:page}${CSS}</style>
</head><body><div class="brand">Dedos Ligeiros · relatório</div>${bodyHtml}</body></html>`;
  }

  window.Report = { render, renderAll, page, CSS, esc, PERIODS };
})();
