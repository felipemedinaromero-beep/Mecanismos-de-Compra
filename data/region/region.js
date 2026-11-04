/* Panel por región: compras de cada región (región de la unidad compradora) y ventas de los proveedores de cada región (región de la sucursal).
   Datos: data/region/meta.js (resumen nacional), data/region/{c|v}_<región>.js (c = comprador, v = proveedor) y data/region/provreg.js (región de cada proveedor del diccionario).
   Los N° de OC son enlaces: descargan en Excel las OC de esa cifra, leyendo los archivos de data/proc/ (los mismos del Buscador). */
(function(){
'use strict';
if(window.RegionPanel) return;
window.RG_SH = window.RG_SH || {};
const RB = 'data/region/', PB = 'data/proc/', CAP = 100000;
const MECS = [{k:'l', n:'Licitaciones', c:'#0032A2'}, {k:'td', n:'Trato directo', c:'#4A2E8F'}, {k:'ca', n:'Compra Ágil', c:'#0B78CC'},
  {k:'cm', n:'Convenio Marco', c:'#2F7D32'}, {k:'cc', n:'Compra coordinada', c:'#8A4FBF'}, {k:'ot', n:'Otras OC', c:'#6B7A88'}];
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const RXREG = [/arica/, /tarapaca/, /antofagasta/, /atacama/, /coquimbo/, /valparaiso/, /metropolitana/, /higgins/, /maule/, /nuble/, /bio.?bio/, /araucania/, /los rios/, /los lagos/, /aysen/, /magallanes/];
const S = {host: null, M: null, persp: 'c', reg: null, win: 'all', metric: 'm', D: null, P: null, busy: false};
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => n == null ? '' : Number(n).toLocaleString('es-CL', {maximumFractionDigits: 0});
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1, minimumFractionDigits: 1}) + ' %' : '—';
function fmtM(n){
  if(n == null || isNaN(n)) return '—'; n = Math.round(n); const a = Math.abs(n);
  if(a >= 1e12) return '$' + (n / 1e12).toLocaleString('es-CL', {maximumFractionDigits: 2}) + ' billones';
  if(a >= 1e8) return '$' + Math.round(n / 1e6).toLocaleString('es-CL') + ' millones';
  if(a >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' millones';
  return '$' + fmt(n);
}
const rutKey = s => String(s || '').toLowerCase().replace(/[^0-9k]/g, '');
const normS = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function dayStr(f){ if(f == null || f < 0) return ''; const d = new Date(Date.UTC(2024, 0, 1 + f)); return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear(); }
const ymLab = ym => MES[+ym.slice(5) - 1] + '-' + ym.slice(0, 4);
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar ' + src + '. Si abriste solo el archivo HTML, deja la carpeta "data" junto a él.')); }; document.head.appendChild(s); }); }
const ver = () => (typeof DATA !== 'undefined' && DATA.generado) ? '?v=' + DATA.generado : '';
const $ = id => S.host && S.host.querySelector('#' + id);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

const CSS = `
.rg-bar{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:10px 0 12px;}
.rg-f{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;}
.rg-f select{font:inherit;font-size:13.5px;font-weight:500;text-transform:none;letter-spacing:0;padding:9px 14px;border:1px solid var(--cc-navy);border-radius:99px;background:#fff;color:var(--cc-dark);min-width:200px;}
.rg-seg{display:inline-flex;border:1px solid rgba(0,50,162,.35);border-radius:99px;overflow:hidden;} .rg-seg button{font:inherit;font-size:12.5px;padding:8px 15px;border:0;background:#fff;color:var(--cc-navy);cursor:pointer;} .rg-seg button[aria-pressed=true]{background:var(--cc-navy);color:#fff;font-weight:700;}
.rg-note{font-size:12px;color:var(--text-secondary);line-height:1.5;margin:6px 0;} .rg-note a{color:var(--cc-navy);}
.rg-status{font-size:12.5px;color:var(--cc-navy);margin:6px 0;min-height:18px;} .rg-err{color:#B3261E;}
.rg-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:10px;margin:0 0 14px;}
.rg-k{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:#fff;} .rg-kl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);font-weight:700;} .rg-kv{font-size:19px;font-weight:700;color:var(--cc-navy);margin:3px 0 2px;line-height:1.15;} .rg-ks{font-size:11px;color:var(--text-secondary);line-height:1.4;}
.rg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:12px;margin:0 0 14px;}
.rg-p{border:1px solid var(--border);border-radius:14px;padding:12px 14px;background:#fff;min-width:0;} .rg-p.rg-w{grid-column:1/-1;}
.rg-ph{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin:0 0 8px;} .rg-ph h3{margin:0;font-size:13.5px;color:var(--cc-dark);} .rg-ph p{margin:2px 0 0;font-size:11.5px;color:var(--text-secondary);line-height:1.4;}
.rg-btn{font:inherit;font-size:12px;font-weight:700;padding:6px 14px;border-radius:99px;border:1px solid var(--cc-navy);background:#fff;color:var(--cc-navy);cursor:pointer;white-space:nowrap;} .rg-btn:hover{background:var(--cc-mist);} .rg-btn.rg-main{background:var(--cc-lime);border-color:var(--cc-lime);color:var(--cc-dark);} .rg-btn:disabled{opacity:.6;cursor:wait;}
.rg-bars{display:grid;gap:5px;} .rg-b{display:grid;grid-template-columns:minmax(90px,34%) 1fr minmax(120px,auto);gap:8px;align-items:center;font-size:11.5px;border-radius:8px;padding:2px;} .rg-b:hover{background:var(--cc-mist);}
.rg-bl{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25;overflow-wrap:anywhere;color:var(--cc-dark);}
.rg-bt{height:10px;min-width:50px;background:#EDF1F7;border-radius:99px;overflow:hidden;} .rg-bt i{display:block;height:100%;border-radius:99px;}
.rg-bv{text-align:right;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.25;} .rg-bv b{display:block;color:var(--cc-dark);font-size:12px;} .rg-bv small{display:block;font-size:10.5px;}
.rg-n{color:var(--cc-green,#2F7D32);font-weight:700;text-decoration:underline dotted;cursor:pointer;} .rg-n:hover{text-decoration:underline;}
.rg-chart{width:100%;height:auto;display:block;} .rg-chart text{font-size:10px;fill:var(--text-secondary);font-family:inherit;}
.rg-leg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:var(--cc-dark);margin:6px 0 0;} .rg-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px;}
.rg-tw{overflow-x:auto;} .rg-tbl{width:100%;border-collapse:collapse;font-size:12px;} .rg-tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);padding:6px 8px;border-bottom:1px solid var(--border);white-space:nowrap;}
.rg-tbl td{padding:7px 8px;border-bottom:1px solid #EDF1F7;vertical-align:top;} .rg-tbl td.num,.rg-tbl th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;} .rg-tbl td small{display:block;color:var(--text-secondary);font-size:10.5px;} .rg-tbl tr.rg-go{cursor:pointer;} .rg-tbl tr.rg-go:hover td{background:var(--cc-mist);}
.rg-stack{display:flex;height:9px;border-radius:99px;overflow:hidden;background:#EDF1F7;min-width:90px;} .rg-stack i{display:block;height:100%;border-right:2px solid #fff;} .rg-stack i:last-child{border-right:0;}
.rg-tip{position:fixed;z-index:10000;display:none;max-width:340px;background:var(--cc-navy,#00233B);color:#fff;font-size:12px;line-height:1.45;padding:9px 12px;border-radius:10px;box-shadow:0 6px 22px rgba(0,35,59,.35);pointer-events:none;} .rg-tip b{display:block;margin-bottom:3px;font-size:12.5px;}
.rg-prog{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:10001;background:var(--cc-navy,#00233B);color:#fff;border-radius:14px;padding:10px 18px;font-size:13px;box-shadow:0 6px 22px rgba(0,35,59,.35);max-width:92vw;display:none;}
@media (max-width:760px){.rg-grid{grid-template-columns:1fr}.rg-b{grid-template-columns:1fr}.rg-bv{text-align:left}}
`;
function injectCss(){ if(document.getElementById('rgCss')) return; const s = document.createElement('style'); s.id = 'rgCss'; s.textContent = CSS; document.head.appendChild(s); }

// ---------- datos ----------
async function ensureMeta(){ if(!window.RG_META) await loadScript(RB + 'meta.js' + ver() + '-r1'); S.M = window.RG_META; }
async function loadReg(persp, reg){
  const key = persp + reg;
  if(!window.RG_SH[key]) await loadScript(RB + persp + '_' + reg + '.js' + ver() + '-r1');
  if(!window.RG_SH[key]) throw new Error('El archivo de la región no trae datos.');
  return window.RG_SH[key];
}
const regName = i => S.M.regs[i];
const persLab = p => p === 'c' ? 'Compras de la región (región del comprador)' : 'Ventas de proveedores de la región (región del proveedor)';
const winLab = w => w === 'all' ? 'enero 2025 a ' + ymLab(S.M.yms[S.M.yms.length - 1]) : 'año ' + w;
function regsOf(persp){ return Object.keys(S.M.ov[persp]).map(Number).sort((a, b) => a - b); }

// ---------- descarga de OC (Excel) ----------
function prog(msg){ let p = document.getElementById('rgProg'); if(!p){ p = document.createElement('div'); p.id = 'rgProg'; p.className = 'rg-prog'; p.setAttribute('role', 'status'); document.body.appendChild(p); } if(msg == null){ p.style.display = 'none'; return; } p.textContent = msg; p.style.display = 'block'; }
async function ensureProc(){
  if(S.P) return S.P;
  prog('Cargando los diccionarios (la primera vez demora unos segundos)…');
  if(!window.PROC_MAN) await loadScript(PB + 'man.js' + ver());
  if(!window.PROC_DIC) await loadScript(PB + 'dic.js' + ver());
  if(!window.RG_PROVREG) await loadScript(RB + 'provreg.js' + ver() + '-r1');
  const D = window.PROC_DIC, pr = window.RG_PROVREG;
  const regc = D.reg.map(r => { const n = normS(r); for(let i = 0; i < RXREG.length; i++) if(RXREG[i].test(n)) return i; return /extranjero/.test(n) ? 16 : 17; });
  S.P = {D, MAN: window.PROC_MAN, ureg: D.uni.map(u => (u[4] != null && u[4] >= 0 ? regc[u[4]] : 17)), preg: v => (v >= 0 && v < pr.length ? parseInt(pr[v], 18) : 17),
    r1: D.rub.map(r => r.split(' › ')[0]), pk: D.prov.map(p => rutKey(p[0]))};
  return S.P;
}
function ocLink(c, mec){ return mec === 'l' ? 'http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=' + encodeURIComponent(c) : 'https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC=' + encodeURIComponent(c); }
function specText(sp){
  const t = [persLab(sp.p) + ': ' + regName(sp.r), 'Período: ' + (sp.ym ? ymLab(sp.ym) : winLab(sp.y))];
  if(sp.mec) t.push('Mecanismo: ' + MECS.find(m => m.k === sp.mec).n);
  if(sp.cp != null) t.push((sp.p === 'c' ? 'Región del proveedor: ' : 'Región del comprador: ') + regName(sp.cp));
  if(sp.on) t.push('Organismo: ' + sp.on); if(sp.pn) t.push('Proveedor: ' + sp.pn + (sp.pr ? ' (' + sp.pr + ')' : ''));
  if(sp.r1) t.push('Rubro N1: ' + sp.r1); if(sp.r2) t.push('Rubro N1 › N2: ' + sp.r2); if(sp.cm) t.push('Convenio Marco: ' + sp.cm); if(sp.sc) t.push('Sector: ' + sp.sc);
  return t;
}
async function ocDl(sp, el){
  if(S.busy) return; S.busy = true; const orig = el ? el.textContent : '';
  try {
    const P = await ensureProc(), D = P.D, man = P.MAN.m;
    const yms = S.M.yms.filter(ym => sp.ym ? ym === sp.ym : (sp.y === 'all' || ym.startsWith(sp.y)));
    const mecs = (sp.mec ? [sp.mec] : MECS.map(m => m.k));
    const jobs = []; mecs.forEach(mc => yms.forEach(ym => { if(mc === 'l'){ if(S.M.lo[ym]) jobs.push({mec: 'l', ym, h: S.M.lo[ym][1]}); } else if(man[mc] && man[mc][ym]) jobs.push({mec: mc, ym, h: man[mc][ym][2]}); }));
    const rutF = sp.pr ? rutKey(sp.pr) : '';
    const rows = [], lrows = []; let seen = 0, nOcAll = 0, nLAll = 0;
    const prune = a => { if(a.length > CAP * 2){ a.sort((x, y) => y.m - x.m); a.length = CAP; } };
    const okOrg = o => !sp.oc || D.org[o][0] === sp.oc;
    const okSec = o => !sp.sc || (D.org[o][2] || 'Sin dato') === sp.sc;
    const okRub = rb => (!sp.r1 || (rb >= 0 ? P.r1[rb] : 'Sin rubro') === sp.r1) && (!sp.r2 || (rb >= 0 ? D.rub[rb].split(' › ').slice(0, 2).join(' › ') : 'Sin rubro') === sp.r2);
    const okProv = v => (!rutF && !sp.pn) || (v >= 0 && (rutF ? P.pk[v] === rutF : D.prov[v][1] === sp.pn));
    const cpOf = (u, v) => sp.p === 'c' ? P.preg(v) : P.ureg[u];
    const mainOf = (u, v) => sp.p === 'c' ? P.ureg[u] : P.preg(v);
    const skey = j => (j.mec === 'l' ? 'lo' : j.mec) + '|' + j.ym;
    const load = j => loadScript((j.mec === 'l' ? RB + 'lo_' : PB + j.mec + '_') + j.ym + '.js?v=' + j.h).then(() => window.PROC_SH[skey(j)]);
    let next = jobs.length ? load(jobs[0]) : null;
    for(let k = 0; k < jobs.length; k++){
      const j = jobs[k]; prog('Leyendo OC… archivo ' + (k + 1) + ' de ' + jobs.length + ' (' + (MECS.find(m => m.k === j.mec).n) + ', ' + ymLab(j.ym) + ')');
      const sh = await next; next = k + 1 < jobs.length ? load(jobs[k + 1]) : null;
      if(!sh) continue;
      const N = sh.N;
      for(let i = 0; i < N; i++){
        const o = sh.o[i], u = sh.u[i];
        if(!okOrg(o) || !okSec(o)) continue;
        const rb = sh.rb ? sh.rb[i] : -1; if(!okRub(rb)) continue;
        const m = sh.m[i]; if(!(m > 0)) continue;
        const v = sh.v[i] == null ? -1 : sh.v[i];
        if(mainOf(u, v) !== sp.r) continue;
        if(sp.cp != null && cpOf(u, v) !== sp.cp) continue;
        if(!okProv(v)) continue;
        const cmx = j.mec === 'cm' && sh.x[i] ? sh.x[i].toUpperCase() : '';
        if(sp.cm && cmx !== sp.cm) continue;
        seen++; nOcAll++;
        rows.push({m, r: [sh.c[i], MECS.find(x => x.k === j.mec).n, dayStr(sh.f[i]), sh.t ? sh.t[i] : '', D.org[o][1], D.org[o][0], D.org[o][2] || '', D.uni[u][2], D.uni[u][5] || '', S.M.regs[P.ureg[u]],
          v >= 0 ? D.prov[v][1] : '', v >= 0 ? D.prov[v][0] : '', S.M.regs[P.preg(v)], rb >= 0 ? P.r1[rb] : 'Sin rubro', rb >= 0 ? D.rub[rb] : '', cmx, j.mec === 'l' ? (sh.x[i] || '') : '', Math.round(m), ocLink(sh.c[i], j.mec)]});
      }
      delete window.PROC_SH[skey(j)];
      prune(rows); prune(lrows);
    }
    prog('Armando el Excel…');
    await new Promise(r => setTimeout(r, 30));
    const cap = a => { a.sort((x, y) => y.m - x.m); return a.length > CAP ? a.slice(0, CAP) : a; };
    const nRows = nOcAll, nL = 0;
    const sheets = [];
    sheets.push({name: 'OC', headers: ['N° OC', 'Mecanismo', 'Fecha de envío', 'Título', 'Organismo', 'Código organismo', 'Sector', 'Unidad de compra', 'Comuna de la unidad', 'Región del comprador', 'Proveedor', 'RUT proveedor', 'Región del proveedor', 'Rubro (N1)', 'Rubro (N1 › N2 › N3)', 'Convenio Marco', 'ID licitación', 'Monto (CLP)', 'Enlace a la OC'], rows: cap(rows).map(x => x.r)});
    const notas = [['Selección', specText(sp).join(' | ')], ['Fuente', 'Datos Abiertos ChileCompra, OC en estado Recepción Conforme o Aceptada, deduplicadas por código; montos en pesos (CLP) con conversión del archivo de origen.'],
      ['Región', 'Comprador: región de la unidad de compra. Proveedor: región de la sucursal que figura en la OC (el mismo RUT se asigna a la región más frecuente).'],
      ['Filas', 'OC: ' + fmt(nRows)],
      ['Generado', new Date().toLocaleDateString('es-CL')]];
    if(nRows > CAP || nL > CAP) notas.push(['Aviso', 'Se incluyen las ' + fmt(CAP) + ' filas de mayor monto de cada hoja. Acota la selección (período, mecanismo, organismo) para ver el resto.']);
    sheets.push({name: 'Notas', headers: ['Tema', 'Detalle'], rows: notas});
    const slug = [sp.p === 'c' ? 'compras' : 'ventas', normS(regName(sp.r)).replace(/[^a-z0-9]+/g, '_'), sp.ym || sp.y, sp.mec, sp.cm, sp.on && 'org', sp.pn && 'prov', sp.r1 && 'rubro', sp.sc && 'sector', sp.cp != null && ('vs_' + normS(regName(sp.cp)).replace(/[^a-z0-9]+/g, '_'))].filter(Boolean).join('_');
    if(!nRows && !nL){ prog(null); alert('No se encontraron OC con esa selección.'); return; }
    xlsxSave(await xlsxBlob(sheets), 'oc_region_' + slug.slice(0, 90) + '.xlsx');
    prog('Listo: ' + fmt(nRows + nL) + ' filas.'); setTimeout(() => prog(null), 2500);
  } catch(e){ console.error(e); prog(null); alert('No se pudo generar el Excel: ' + e.message); }
  finally { S.busy = false; if(el) el.textContent = orig; }
}
function ocl(sp, n){ return n ? `<a href="#" class="rg-n" data-s="${esc(JSON.stringify(sp))}" title="Descargar las OC en Excel">${fmt(n)}</a>` : '0'; }
const base = (extra) => Object.assign({p: S.persp, r: S.reg, y: S.win}, extra || {});

// ---------- gráficos ----------
function tip(el, x, y){
  let t = document.getElementById('rgTip'); if(!t){ t = document.createElement('div'); t.id = 'rgTip'; t.className = 'rg-tip'; document.body.appendChild(t); }
  const raw = el && el.getAttribute('data-tip'); if(!raw){ t.style.display = 'none'; return; }
  t.innerHTML = raw; t.style.display = 'block'; const w = t.offsetWidth, h = t.offsetHeight; let l = x + 14, tp = y + 18;
  if(l + w > innerWidth - 8) l = Math.max(8, x - w - 14); if(tp + h > innerHeight - 8) tp = Math.max(8, y - h - 12);
  t.style.left = l + 'px'; t.style.top = tp + 'px';
}
function barsHtml(rows){
  const mx = Math.max(1, ...rows.map(r => r.w));
  return `<div class="rg-bars">${rows.map(r => `<div class="rg-b"${r.go != null ? ' data-r="' + r.go + '" style="cursor:pointer"' : ''} data-tip="${esc(r.tip || '<b>' + esc(r.lab) + '</b>')}"><div class="rg-bl">${esc(r.lab)}</div><div class="rg-bt"><i style="width:${Math.max(1, Math.round(100 * r.w / mx))}%;background:${r.c || '#005AF8'}"></i></div><div class="rg-bv"><b>${r.a}</b><small>${r.b}</small></div></div>`).join('')}</div>`;
}
function stackHtml(a){ // a = [n_l, n_td, ...] por mecanismo
  const t = sum(a, x => x) || 1;
  return `<div class="rg-stack" data-tip="${esc('<b>Mecanismos</b>' + MECS.map((m, i) => a[i] ? esc(m.n) + ': ' + fmt(a[i]) + ' OC (' + pct(a[i], t) + ')' : '').filter(Boolean).join('<br>'))}">${a.map((x, i) => x ? `<i style="width:${100 * x / t}%;background:${MECS[i].c}"></i>` : '').join('')}</div>`;
}
function monthChart(){
  const yms = S.M.yms, D = S.D, key = S.metric === 'm' ? 'm' : 'n';
  const val = (mi, k) => D.mes[MECS[mi].k][key][k], tot = k => sum(MECS, (m, ) => 0) + MECS.reduce((s, m, mi) => s + val(mi, k), 0);
  const mx = Math.max(1, ...yms.map((_, k) => tot(k)));
  const W = 900, H = 260, L = 46, R = 8, T = 14, B = 34, bw = (W - L - R) / yms.length;
  const lab = v => key === 'm' ? fmtM(v).replace(' millones', ' M').replace(' billones', ' B') : fmt(v);
  let svg = `<svg class="rg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución mensual por mecanismo">`;
  [0, .5, 1].forEach(f => { const y = H - B - (H - T - B) * f; svg += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${f ? '#E4EAF2' : '#C9D3E0'}"/><text x="${L - 5}" y="${y + 3}" text-anchor="end">${esc(lab(mx * f))}</text>`; });
  yms.forEach((ym, k) => {
    const x = L + k * bw, inWin = S.win === 'all' || ym.startsWith(S.win); let y0 = H - B;
    const e = MECS.map((m, mi) => `${esc(m.n)}: ${fmt(D.mes[m.k].n[k])} OC · ${fmtM(D.mes[m.k].m[k])}`).join('<br>');
    svg += `<g opacity="${inWin ? 1 : .35}" data-tip="${esc('<b>' + ymLab(ym) + '</b>Total: ' + fmt(MECS.reduce((s, m) => s + D.mes[m.k].n[k], 0)) + ' OC · ' + fmtM(MECS.reduce((s, m) => s + D.mes[m.k].m[k], 0)) + '<br>' + e)}">`;
    MECS.forEach((m, mi) => { const v = val(mi, k); if(!v) return; const h = Math.max(1, (H - T - B) * v / mx); y0 -= h; svg += `<rect x="${(x + bw * .14).toFixed(1)}" y="${y0.toFixed(1)}" width="${(bw * .72).toFixed(1)}" height="${Math.max(0, h - 1).toFixed(1)}" fill="${m.c}" rx="1.5"/>`; });
    svg += `<rect x="${x.toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="transparent"/></g>`;
    if(k % 3 === 0 || k === yms.length - 1) svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 18}" text-anchor="middle">${MES[+ym.slice(5) - 1]}</text><text x="${(x + bw / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${ym.slice(0, 4)}</text>`;
  });
  return svg + '</svg><div class="rg-leg">' + MECS.map(m => `<span><i style="background:${m.c}"></i>${esc(m.n)}</span>`).join('') + '</div>';
}

// ---------- hojas de Excel ----------
const MEC_N = MECS.map(m => m.n);
function sheetRows(kind, W, T){
  const N = sum(W.tot, t => t[0]), Mo = sum(W.tot, t => t[1]);
  const share = (n, m) => [n, m, N ? +(100 * n / N).toFixed(2) : 0, Mo ? +(100 * m / Mo).toFixed(2) : 0];
  const byM = r => r.slice(3, 9);
  const mk = (name, h0, rows, extraH) => ({name, headers: h0.concat(['N° OC', 'Monto (CLP)', '% de las OC de la región', '% del monto de la región', 'Monto medio por OC (CLP)'], MEC_N.map(n => 'N° OC · ' + n)), rows: rows.map(r => r.pre.concat(share(r.n, r.m), [r.n ? Math.round(r.m / r.n) : 0], byM(r.raw)))});
  if(kind === 'org') return mk('Organismos', ['Organismo', 'Código', 'Sector'], W.org.map(r => ({pre: [T.o[r[0]][1], T.o[r[0]][0], T.o[r[0]][2]], n: r[1], m: r[2], raw: r})));
  if(kind === 'prov') return mk('Proveedores', ['Proveedor', 'RUT', S.persp === 'c' ? 'Región del proveedor' : 'Región del proveedor'], W.prov.map(r => ({pre: [T.p[r[0]][1], T.p[r[0]][0], regName(T.p[r[0]][2])], n: r[1], m: r[2], raw: r})));
  if(kind === 'r1') return mk('Rubros N1', ['Rubro (N1)'], W.r1.map(r => ({pre: [T.r1[r[0]]], n: r[1], m: r[2], raw: r})));
  if(kind === 'r2') return mk('Rubros N1 › N2', ['Rubro (N1 › N2)'], W.r2.map(r => ({pre: [T.r2[r[0]]], n: r[1], m: r[2], raw: r})));
  if(kind === 'sec') return mk('Sectores', ['Sector del organismo'], W.sec.map(r => ({pre: [T.s[r[0]]], n: r[1], m: r[2], raw: r})));
  if(kind === 'x') return mk(S.persp === 'c' ? 'Región del proveedor' : 'Región del comprador', [S.persp === 'c' ? 'Región del proveedor' : 'Región del comprador'], W.x.map(r => ({pre: [regName(r[0])], n: r[1], m: r[2], raw: [0, 0, 0].concat(r.slice(3))})));
  if(kind === 'cm') return {name: 'Convenios Marco', headers: ['Convenio Marco (ID)', 'Nombre', 'N° OC', 'Monto (CLP)', '% del monto de la región', 'Monto medio por OC (CLP)'], rows: W.cm.map(r => [T.c[r[0]][0], T.c[r[0]][1], r[1], r[2], Mo ? +(100 * r[2] / Mo).toFixed(2) : 0, r[1] ? Math.round(r[2] / r[1]) : 0])};
  if(kind === 'mec') return {name: 'Mecanismos', headers: ['Mecanismo', 'N° OC', 'Monto (CLP)', '% de las OC', '% del monto', 'Monto medio por OC (CLP)'], rows: MECS.map((m, i) => [m.n, W.tot[i][0], W.tot[i][1], N ? +(100 * W.tot[i][0] / N).toFixed(2) : 0, Mo ? +(100 * W.tot[i][1] / Mo).toFixed(2) : 0, W.tot[i][0] ? Math.round(W.tot[i][1] / W.tot[i][0]) : 0])};
  if(kind === 'mes'){
    const yms = S.M.yms, D = S.D;
    return {name: 'Mensual', headers: ['Mes'].concat(MEC_N.map(n => 'N° OC · ' + n), ['N° OC total'], MEC_N.map(n => 'Monto (CLP) · ' + n), ['Monto total (CLP)']),
      rows: yms.map((ym, k) => [ymLab(ym)].concat(MECS.map(m => D.mes[m.k].n[k]), [MECS.reduce((s, m) => s + D.mes[m.k].n[k], 0)], MECS.map(m => D.mes[m.k].m[k]), [MECS.reduce((s, m) => s + D.mes[m.k].m[k], 0)]))};
  }
}
function notaSheet(extra){
  const cnt = W => '';
  return {name: 'Notas', headers: ['Tema', 'Detalle'], rows: [
    ['Selección', persLab(S.persp) + ': ' + regName(S.reg) + ' · período ' + winLab(S.win)],
    ['Fuente', 'Datos Abiertos ChileCompra (OC en estado Recepción Conforme o Aceptada, deduplicadas por código). Montos en pesos (CLP); las OC en UF, USD o EUR vienen convertidas a pesos en el archivo de origen.'],
    ['Región del comprador', 'Región de la unidad de compra de la OC.'], ['Región del proveedor', 'Región de la sucursal del proveedor en la OC; un mismo RUT se asigna a su región más frecuente.'],
    ['Licitaciones', S.M.nota], ['Tablas', 'Organismos y proveedores: 150 mayores por monto; rubros N1 › N2: 120 mayores; Convenios Marco: 120 mayores. Totales y mecanismos son completos.'],
    ['Generado', S.M.gen]].concat(extra || [])};
}
function dlSheets(kind){
  const W = S.D.w[S.win], T = S.D.T;
  if(kind === 'all') return ['mes', 'mec', 'x', 'org', 'prov', 'r1', 'r2', 'cm', 'sec'].map(k => sheetRows(k, W, T)).concat([notaSheet()]);
  return [sheetRows(kind, W, T), notaSheet()];
}
async function saveSheets(sheets, name, btn){
  const o = btn ? btn.textContent : ''; if(btn){ btn.disabled = true; btn.textContent = 'Generando Excel…'; }
  try { await new Promise(r => setTimeout(r, 30)); xlsxSave(await xlsxBlob(sheets), name); } catch(e){ console.error(e); alert('No se pudo generar el archivo Excel: ' + e.message); }
  finally { if(btn){ btn.disabled = false; btn.textContent = o; } }
}
const dlName = k => (S.persp === 'c' ? 'compras_' : 'ventas_') + normS(regName(S.reg)).replace(/[^a-z0-9]+/g, '_') + '_' + S.win + '_' + k + '.xlsx';
const dlBtn = (k, txt) => `<button type="button" class="rg-btn" data-dl="${k}">${txt || 'Descargar Excel'}</button>`;

// ---------- vistas ----------
function head(){
  const regs = regsOf(S.persp);
  const opt = regs.map(r => `<option value="${r}"${r === S.reg ? ' selected' : ''}>${esc(regName(r))}</option>`).join('');
  return `<div class="rg-bar">
    <div class="rg-f">Mira<div class="rg-seg" id="rgPers"><button type="button" data-p="c" aria-pressed="${S.persp === 'c'}">Compras de la región</button><button type="button" data-p="v" aria-pressed="${S.persp === 'v'}">Ventas de proveedores de la región</button></div></div>
    <label class="rg-f">Región<select id="rgReg"><option value="">Todas (resumen nacional)</option>${opt}</select></label>
    <div class="rg-f">Período<div class="rg-seg" id="rgWin">${S.M.wins.map(w => `<button type="button" data-w="${w}" aria-pressed="${S.win === w}">${w === 'all' ? 'Todo' : w}</button>`).join('')}</div></div>
  </div>
  <p class="rg-note">${S.persp === 'c' ? 'Región del comprador: región de la unidad de compra que emitió la OC. Se muestra a qué proveedores compra y dónde están.' : 'Región del proveedor: región de la sucursal que vende. Se muestra quién le compra y dónde están.'} Los N° de OC en verde son enlaces: descargan en Excel las OC de esa cifra. Datos hasta ${esc(ymLab(S.M.yms[S.M.yms.length - 1]))} (el último mes puede ser parcial).</p>`;
}
function overviewHtml(){
  const ov = S.M.ov[S.persp], regs = regsOf(S.persp);
  const rows = regs.map(r => { const a = ov[r][S.win]; return a ? {r, n: a[0], m: a[1], ko: a[2], kp: a[3]} : null; }).filter(Boolean).sort((a, b) => b.m - a.m);
  const T = {n: sum(rows, x => x.n), m: sum(rows, x => x.m)};
  const bars = barsHtml(rows.map(x => ({go: x.r, lab: regName(x.r), w: x.m, a: fmtM(x.m), b: ocl(base({r: x.r}), x.n) + ' OC · ' + pct(x.m, T.m), c: '#0B78CC', tip: `<b>${esc(regName(x.r))}</b>${fmt(x.n)} OC<br>${fmtM(x.m)}<br>${fmt(x.ko)} organismos · ${fmt(x.kp)} proveedores`})));
  const tbl = `<div class="rg-tw"><table class="rg-tbl"><thead><tr><th>Región</th><th class="num">N° OC</th><th class="num">Monto</th><th class="num">% del monto</th><th class="num">${S.persp === 'c' ? 'Organismos' : 'Compradores'}</th><th class="num">Proveedores</th><th class="num">Monto medio por OC</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="rg-go" data-r="${x.r}"><td><b>${esc(regName(x.r))}</b></td><td class="num">${ocl(base({r: x.r}), x.n)}</td><td class="num">${fmtM(x.m)}</td><td class="num">${pct(x.m, T.m)}</td><td class="num">${fmt(x.ko)}</td><td class="num">${fmt(x.kp)}</td><td class="num">${x.n ? fmtM(x.m / x.n) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="rg-kpis"><div class="rg-k"><div class="rg-kl">OC</div><div class="rg-kv">${fmt(T.n)}</div><div class="rg-ks">${esc(persLab(S.persp))}</div></div><div class="rg-k"><div class="rg-kl">Monto</div><div class="rg-kv">${fmtM(T.m)}</div><div class="rg-ks">${esc(winLab(S.win))}</div></div></div>
  <div class="rg-grid"><div class="rg-p rg-w"><div class="rg-ph"><div><h3>Monto por región</h3><p>Haz clic en una región (barra o fila de la tabla) para ver su detalle (compradores, proveedores, mecanismos, rubros y Convenios Marco).</p></div>${dlBtn('ov', 'Descargar Excel (resumen nacional)')}</div>${bars}</div>
  <div class="rg-p rg-w"><div class="rg-ph"><h3>Tabla por región</h3></div>${tbl}</div></div>`;
}
function ovSheets(){
  const mk = p => { const ov = S.M.ov[p]; return {name: p === 'c' ? 'Compras por región' : 'Ventas por región', headers: ['Región', 'Período', 'N° OC', 'Monto (CLP)', p === 'c' ? 'N° organismos compradores' : 'N° compradores', 'N° proveedores', 'Monto medio por OC (CLP)'],
    rows: [].concat(...Object.keys(ov).map(Number).sort((a, b) => a - b).map(r => S.M.wins.filter(w => ov[r][w]).map(w => { const a = ov[r][w]; return [regName(r), w === 'all' ? 'Todo el período' : w, a[0], a[1], a[2], a[3], a[0] ? Math.round(a[1] / a[0]) : 0]; })))}; };
  return [mk('c'), mk('v'), {name: 'Notas', headers: ['Tema', 'Detalle'], rows: [['Fuente', 'Datos Abiertos ChileCompra (OC Recepción Conforme o Aceptada, deduplicadas).'], ['Compras', 'Región de la unidad compradora.'], ['Ventas', 'Región de la sucursal del proveedor.'], ['Licitaciones', S.M.nota], ['Generado', S.M.gen]]}];
}
function regionHtml(){
  const D = S.D, W = D.w[S.win], T = D.T, N = sum(W.tot, t => t[0]), Mo = sum(W.tot, t => t[1]);
  if(!N) return '<p class="rg-note">Sin OC en este período para la región elegida.</p>';
  const own = W.x.find(r => r[0] === S.reg), local = own ? own[2] : 0, top10 = sum(W.prov.slice(0, 10), r => r[2]);
  const k = (l, v, s) => `<div class="rg-k"><div class="rg-kl">${l}</div><div class="rg-kv">${v}</div><div class="rg-ks">${s}</div></div>`;
  const kpis = `<div class="rg-kpis">${k('N° de OC', ocl(base(), N), esc(winLab(S.win)))}${k('Monto', fmtM(Mo), '$' + fmt(Mo))}${k(S.persp === 'c' ? 'Organismos compradores' : 'Compradores', fmt(W.ko), 'con al menos una OC')}${k('Proveedores', fmt(W.kp), 'con al menos una OC')}
    ${k('Monto medio por OC', fmtM(Mo / N), 'ticket promedio')}${k(S.persp === 'c' ? 'Compra local' : 'Venta local', pct(local, Mo), S.persp === 'c' ? 'del monto va a proveedores de la misma región' : 'del monto es a compradores de la misma región')}
    ${k('Concentración', pct(top10, Mo), 'del monto en los 10 mayores proveedores')}${k('Convenios Marco', fmt(W.kc), 'distintos usados')}</div>`;
  const cp = base();
  // mecanismos
  const mecBars = barsHtml(MECS.map((m, i) => ({lab: m.n, w: W.tot[i][1], c: m.c, a: fmtM(W.tot[i][1]), b: ocl(base({mec: m.k}), W.tot[i][0]) + ' OC · ' + pct(W.tot[i][1], Mo), tip: `<b>${esc(m.n)}</b>${fmt(W.tot[i][0])} OC (${pct(W.tot[i][0], N)})<br>${fmtM(W.tot[i][1])} (${pct(W.tot[i][1], Mo)})`})).filter(r => r.w > 0));
  // región contraparte
  const xr = W.x.slice().sort((a, b) => b[2] - a[2]);
  const xBars = barsHtml(xr.map(r => ({lab: regName(r[0]), w: r[2], c: r[0] === S.reg ? '#00233B' : '#0B78CC', a: fmtM(r[2]), b: ocl(base({cp: r[0]}), r[1]) + ' OC · ' + pct(r[2], Mo), tip: `<b>${esc(regName(r[0]))}</b>${fmt(r[1])} OC<br>${fmtM(r[2])} (${pct(r[2], Mo)})`})));
  // tablas
  const tOrg = `<div class="rg-tw"><table class="rg-tbl"><thead><tr><th>Organismo</th><th>Mecanismos (N° OC)</th><th class="num">N° OC</th><th class="num">Monto</th><th class="num">% monto</th></tr></thead><tbody>${W.org.slice(0, 50).map(r => { const o = T.o[r[0]]; return `<tr><td>${esc(o[1])}<small>${esc(o[2])} · código ${esc(o[0])}</small></td><td>${stackHtml(r.slice(3, 9))}</td><td class="num">${ocl(base({oc: o[0], on: o[1]}), r[1])}</td><td class="num">${fmtM(r[2])}</td><td class="num">${pct(r[2], Mo)}</td></tr>`; }).join('')}</tbody></table></div>`;
  const tProv = `<div class="rg-tw"><table class="rg-tbl"><thead><tr><th>Proveedor</th><th>Región</th><th>Mecanismos (N° OC)</th><th class="num">N° OC</th><th class="num">Monto</th><th class="num">% monto</th></tr></thead><tbody>${W.prov.slice(0, 50).map(r => { const p = T.p[r[0]]; return `<tr><td>${esc(p[1])}<small>RUT ${esc(p[0])}</small></td><td>${esc(regName(p[2]))}</td><td>${stackHtml(r.slice(3, 9))}</td><td class="num">${ocl(base({pr: p[0], pn: p[1]}), r[1])}</td><td class="num">${fmtM(r[2])}</td><td class="num">${pct(r[2], Mo)}</td></tr>`; }).join('')}</tbody></table></div>`;
  const rubBars = barsHtml(W.r1.slice(0, 15).map(r => ({lab: T.r1[r[0]], w: r[2], a: fmtM(r[2]), b: ocl(base({r1: T.r1[r[0]]}), r[1]) + ' OC · ' + pct(r[2], Mo), tip: `<b>${esc(T.r1[r[0]])}</b>${fmt(r[1])} OC<br>${fmtM(r[2])} (${pct(r[2], Mo)})`})));
  const tR2 = `<div class="rg-tw"><table class="rg-tbl"><thead><tr><th>Rubro (N1 › N2)</th><th class="num">N° OC</th><th class="num">Monto</th><th class="num">% monto</th></tr></thead><tbody>${W.r2.slice(0, 30).map(r => `<tr><td>${esc(T.r2[r[0]])}</td><td class="num">${ocl(base({r2: T.r2[r[0]]}), r[1])}</td><td class="num">${fmtM(r[2])}</td><td class="num">${pct(r[2], Mo)}</td></tr>`).join('')}</tbody></table></div>`;
  const tCm = W.cm.length ? `<div class="rg-tw"><table class="rg-tbl"><thead><tr><th>Convenio Marco</th><th class="num">N° OC</th><th class="num">Monto</th><th class="num">% monto región</th></tr></thead><tbody>${W.cm.slice(0, 30).map(r => { const c = T.c[r[0]]; return `<tr><td>${esc(c[1] || c[0])}<small>${esc(c[0])}</small></td><td class="num">${ocl(base({cm: c[0], mec: 'cm'}), r[1])}</td><td class="num">${fmtM(r[2])}</td><td class="num">${pct(r[2], Mo)}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="rg-note">Sin OC de Convenio Marco en este período.</p>';
  const secBars = barsHtml(W.sec.map(r => ({lab: T.s[r[0]], w: r[2], a: fmtM(r[2]), b: ocl(base({sc: T.s[r[0]]}), r[1]) + ' OC · ' + pct(r[2], Mo), tip: `<b>${esc(T.s[r[0]])}</b>${fmt(r[1])} OC<br>${fmtM(r[2])}`})));
  const panel = (t, sub, dl, body, wide) => `<div class="rg-p${wide ? ' rg-w' : ''}"><div class="rg-ph"><div><h3>${t}</h3>${sub ? '<p>' + sub + '</p>' : ''}</div>${dl ? dlBtn(dl) : ''}</div>${body}</div>`;
  return kpis + `<div class="rg-grid">
    ${panel('Evolución mensual por mecanismo', 'Barras apiladas; los meses fuera del período elegido se atenúan. <span class="rg-seg" style="margin-left:6px;vertical-align:middle" id="rgMet"><button type="button" data-m="m" aria-pressed="' + (S.metric === 'm') + '">Monto</button><button type="button" data-m="n" aria-pressed="' + (S.metric === 'n') + '">N° de OC</button></span>', 'mes', '<div id="rgMes">' + monthChart() + '</div>', true)}
    ${panel('Mecanismos de compra', 'Monto y N° de OC por mecanismo.', 'mec', mecBars)}
    ${panel(S.persp === 'c' ? 'Región de los proveedores' : 'Región de los compradores', S.persp === 'c' ? 'Dónde están los proveedores a los que compra la región (barra oscura: la misma región).' : 'Dónde están los compradores que le compran a los proveedores de la región (barra oscura: la misma región).', 'x', xBars)}
    ${panel(S.persp === 'c' ? 'Organismos compradores' : 'Compradores', 'Los 50 de mayor monto (el Excel trae hasta 150), con su mezcla de mecanismos.', 'org', tOrg, true)}
    ${panel('Proveedores', 'Los 50 de mayor monto (el Excel trae hasta 150).', 'prov', tProv, true)}
    ${panel('Rubros', 'Rubro de primer nivel (N1) por monto.', 'r1', rubBars)}
    ${panel('Sectores', 'Tipo de organismo comprador.', 'sec', secBars)}
    ${panel('Rubros en detalle (N1 › N2)', 'Los 30 de mayor monto (el Excel trae hasta 120).', 'r2', tR2, true)}
    ${panel('Convenios Marco', 'Los 30 de mayor monto (el Excel trae hasta 120).', 'cm', tCm, true)}
  </div>
  <div class="rg-actions" style="margin:6px 0 16px;">${dlBtn('all', 'Descargar todo en un Excel (' + (S.persp === 'c' ? 'compras' : 'ventas') + ' · ' + esc(regName(S.reg)) + ')').replace('class="rg-btn"', 'class="rg-btn rg-main"')} ${ocl(base(), N) === '0' ? '' : `<a href="#" class="rg-btn rg-main" style="text-decoration:none;" data-s="${esc(JSON.stringify(base()))}">Descargar las ${fmt(N)} OC (Excel)</a>`}</div>
  <p class="rg-note">${esc(S.M.nota)}</p>`;
}
function setHash(){ const h = '#region' + (S.reg != null ? '=' + S.persp + S.reg : ''); if(location.hash !== h) history.replaceState(null, '', h); }
async function render(){
  const body = $('rgBody'); if(!body) return;
  const st = $('rgStatus');
  try {
    if(S.reg != null){ st.textContent = 'Cargando los datos de ' + regName(S.reg) + '…'; S.D = await loadReg(S.persp, S.reg); }
    st.textContent = '';
    $('rgHead').innerHTML = head();
    body.innerHTML = S.reg == null ? overviewHtml() : regionHtml();
    setHash();
  } catch(e){ st.innerHTML = '<span class="rg-err">' + esc(e.message) + '</span>'; }
}
function wire(){
  const host = S.host;
  host.addEventListener('click', e => {
    const n = e.target.closest('[data-s]'); if(n){ e.preventDefault(); ocDl(JSON.parse(n.dataset.s), n); return; }
    const p = e.target.closest('#rgPers [data-p]'); if(p){ S.persp = p.dataset.p; if(S.reg != null && !S.M.ov[S.persp][S.reg]) S.reg = null; render(); return; }
    const w = e.target.closest('#rgWin [data-w]'); if(w){ S.win = w.dataset.w; render(); return; }
    const m = e.target.closest('#rgMet [data-m]'); if(m){ S.metric = m.dataset.m; $('rgMes').innerHTML = monthChart(); host.querySelectorAll('#rgMet [data-m]').forEach(b => b.setAttribute('aria-pressed', String(b === m))); return; }
    const d = e.target.closest('[data-dl]'); if(d){
      if(d.dataset.dl === 'ov') saveSheets(ovSheets(), 'resumen_por_region_' + S.win + '.xlsx', d); else saveSheets(dlSheets(d.dataset.dl), dlName(d.dataset.dl), d); return; }
    const r = e.target.closest('tr.rg-go[data-r], .rg-b[data-r]'); if(r && !e.target.closest('a')){ S.reg = +r.dataset.r; render(); window.scrollTo({top: host.getBoundingClientRect().top + scrollY - 10}); }
  });
  host.addEventListener('change', e => { if(e.target.id === 'rgReg'){ S.reg = e.target.value === '' ? null : +e.target.value; render(); } });
  host.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if(el) tip(el, e.clientX, e.clientY); else tip(null); });
  host.addEventListener('mousemove', e => { const el = e.target.closest('[data-tip]'); if(el) tip(el, e.clientX, e.clientY); });
  host.addEventListener('mouseleave', () => tip(null));
}
async function init(host, key){
  injectCss();
  const fresh = S.host !== host;
  S.host = host;
  if(fresh) host.innerHTML = '<div id="rgHead"></div><div class="rg-status" id="rgStatus" role="status">Cargando…</div><div id="rgBody"></div>';
  if(fresh) wire();
  try { await ensureMeta(); } catch(e){ $('rgStatus').innerHTML = '<span class="rg-err">' + esc(e.message) + '</span>'; return; }
  const m = /^([cv])(\d+)$/.exec(key || '');
  if(m && S.M.ov[m[1]][m[2]]){ S.persp = m[1]; S.reg = +m[2]; } else if(fresh || !key){ S.reg = null; }
  await render();
}
window.RegionPanel = {init};
})();
