/* Proveedores: búsqueda por nombre o RUT y ficha con ventas, mecanismos, Convenios Marco y licitaciones.
   Datos: data/proc/dic.js (diccionarios compartidos con el buscador de procesos) y data/prov/ (idx.js con el índice y p_K.js con la ficha de 2.000 proveedores cada uno).
   Solo incluye proveedores que vendieron (OC) u ofertaron en licitaciones con ficha de bases (2025 en adelante). */
(function(){
'use strict';
if(window.ProvFicha) return;
window.PROV_SH = window.PROV_SH || {};
const PB = 'data/prov/', DB = 'data/proc/';
const MEC_COL = ['#0032A2', '#005AF8', '#4A2E8F', '#0B78CC', '#2F7D32', '#8A4FBF', '#E94860', '#6B7A88'];
const TIPO_LIC = {L1:'Licitación Pública menor a 100 UTM', LE:'Licitación Pública entre 100 y 1.000 UTM', LP:'Licitación Pública entre 1.000 y 2.000 UTM', LQ:'Licitación Pública entre 2.000 y 5.000 UTM',
  LR:'Licitación Pública mayor a 5.000 UTM', LS:'Licitación Pública de servicios personales especializados', E2:'Licitación Privada menor a 100 UTM', CO:'Licitación Privada entre 100 y 1.000 UTM',
  B2:'Licitación Privada entre 1.000 y 2.000 UTM', H2:'Licitación Privada entre 2.000 y 5.000 UTM', I2:'Licitación Privada mayor a 5.000 UTM', O1:'Licitación Privada de servicios personales especializados', O2:'Licitación Privada'};
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const S = {host: null, D: null, X: null, nm: [], rt: [], byKey: null, cur: null, ready: null, metric: 'm', q: ''};
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => n == null ? '' : Number(n).toLocaleString('es-CL', {maximumFractionDigits: 0});
const dec1 = x => x == null || isNaN(x) ? '—' : x.toLocaleString('es-CL', {maximumFractionDigits: 1});
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %' : '—';
function fmtM(n){
  if(n == null || isNaN(n)) return '—'; n = Math.round(n); const a = Math.abs(n);
  if(a >= 1e12) return '$' + (n / 1e12).toLocaleString('es-CL', {maximumFractionDigits: 2}) + ' billones';
  if(a >= 1e8) return '$' + Math.round(n / 1e6).toLocaleString('es-CL') + ' millones';
  if(a >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' millones';
  return '$' + fmt(n);
}
function norm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
const nameKey = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const rutKey = s => String(s || '').toLowerCase().replace(/[^0-9k]/g, '');
function dayStr(f){ if(f == null || f < 0) return ''; const d = new Date(Date.UTC(2024, 0, 1 + f)); return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear(); }
const moLab = k => MES[k % 12] + '-' + (2025 + Math.floor(k / 12));
const sentence = s => { s = String(s || '').trim().toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar ' + src + '. Si abriste solo el archivo HTML, deja la carpeta "data" junto a él.')); }; document.head.appendChild(s); }); }
const ver = () => (typeof DATA !== 'undefined' && DATA.generado) ? '?v=' + DATA.generado : '';
const $ = id => S.host && S.host.querySelector('#' + id);

const CSS = `
.pv-box{margin-bottom:1.4rem;}
.pv-search{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 8px;}
.pv-search input{flex:1 1 360px;font-size:15px;padding:12px 16px;border:1px solid var(--cc-navy);border-radius:99px;background:#fff;color:var(--cc-dark);font-family:inherit;box-sizing:border-box;min-width:0;}
.pv-search input:focus-visible{outline:3px solid var(--cc-ice);outline-offset:1px;}
.pv-status{font-size:12.5px;color:var(--cc-navy);margin:6px 0;min-height:18px;} .pv-err{color:#B3261E;}
.pv-hint{font-size:12px;color:var(--text-secondary);margin:0 0 10px;}
.pv-list{display:grid;gap:6px;margin:8px 0 14px;}
.pv-r{display:grid;grid-template-columns:minmax(180px,2.2fr) 130px minmax(160px,1fr) minmax(120px,.8fr);gap:6px 14px;align-items:center;text-align:left;font:inherit;font-size:12.5px;padding:9px 14px;border:1px solid var(--border);border-radius:12px;background:#fff;color:var(--cc-dark);cursor:pointer;width:100%;}
.pv-r:hover,.pv-r:focus-visible{background:var(--cc-mist);border-color:var(--cc-navy);outline:none;}
.pv-r b{font-size:13px;overflow-wrap:anywhere;} .pv-r small{display:block;color:var(--text-secondary);font-size:11px;}
.pv-r .pv-num{text-align:right;font-variant-numeric:tabular-nums;}
.pv-h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);font-weight:700;margin:14px 0 6px;}
.pv-head{border:1px solid var(--border);border-radius:16px;background:#fff;padding:16px 18px;margin:14px 0;}
.pv-head h2{margin:0 0 4px;font-size:20px;color:var(--cc-dark);overflow-wrap:anywhere;}
.pv-id{font-size:12.5px;color:var(--text-secondary);line-height:1.6;overflow-wrap:anywhere;} .pv-id b{color:var(--cc-dark);}
.pv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;}
.pv-btn{font:inherit;font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:99px;border:1px solid var(--cc-navy);background:#fff;color:var(--cc-navy);cursor:pointer;text-decoration:none;display:inline-flex;gap:6px;align-items:center;}
.pv-btn:hover{background:var(--cc-mist);} .pv-btn.pv-main{background:var(--cc-lime);border-color:var(--cc-lime);color:var(--cc-dark);} .pv-btn.pv-main:hover{background:var(--cc-navy);border-color:var(--cc-navy);color:#fff;}
.pv-note{font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin:8px 0 0;} .pv-note a{color:var(--cc-navy);}
.pv-warn{background:#FFF6E5;border:1px solid #E8C26A;border-radius:12px;padding:10px 14px;font-size:12.5px;color:var(--cc-dark);margin:0 0 12px;}
.pv-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:10px;margin:0 0 14px;}
.pv-k{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:#fff;}
.pv-kl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);font-weight:700;}
.pv-kv{font-size:19px;font-weight:700;color:var(--cc-navy);margin:3px 0 2px;line-height:1.15;overflow-wrap:anywhere;}
.pv-ks{font-size:11px;color:var(--text-secondary);overflow-wrap:anywhere;line-height:1.4;}
.pv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:12px;margin:0 0 14px;}
.pv-p{border:1px solid var(--border);border-radius:14px;padding:12px 14px;background:#fff;min-width:0;} .pv-p.pv-w{grid-column:1/-1;}
.pv-p h3{margin:0 0 8px;font-size:13px;color:var(--cc-dark);}
.pv-bars{display:grid;gap:5px;}
.pv-b{display:grid;grid-template-columns:minmax(90px,36%) 1fr minmax(104px,auto);gap:8px;align-items:center;font-size:11.5px;border-radius:8px;padding:2px 2px;} .pv-b:hover{background:var(--cc-mist);}
.pv-bl{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25;overflow-wrap:anywhere;color:var(--cc-dark);}
.pv-bt{height:10px;min-width:50px;background:#EDF1F7;border-radius:99px;overflow:hidden;} .pv-bt i{display:block;height:100%;border-radius:99px;}
.pv-bv{text-align:right;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.25;} .pv-bv b{display:block;color:var(--cc-dark);font-size:12px;} .pv-bv small{display:block;font-size:10.5px;}
.pv-seg{display:inline-flex;border:1px solid rgba(0,50,162,.35);border-radius:99px;overflow:hidden;margin:0 0 8px;}
.pv-seg button{font:inherit;font-size:11.5px;padding:4px 12px;border:0;background:#fff;color:var(--cc-navy);cursor:pointer;} .pv-seg button[aria-pressed=true]{background:var(--cc-navy);color:#fff;font-weight:700;}
.pv-chart{width:100%;height:auto;display:block;} .pv-chart text{font-size:10px;fill:var(--text-secondary);font-family:inherit;} .pv-chart rect.pv-bar{fill:var(--cc-blue,#0B78CC);} .pv-chart rect.pv-bar:hover{fill:var(--cc-navy,#00233B);}
.pv-tw{overflow-x:auto;} .pv-tbl{width:100%;border-collapse:collapse;font-size:12px;} .pv-tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);padding:6px 8px;border-bottom:1px solid var(--border);white-space:nowrap;}
.pv-tbl td{padding:7px 8px;border-bottom:1px solid #EDF1F7;vertical-align:top;} .pv-tbl td.num,.pv-tbl th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;} .pv-tbl a{color:var(--cc-navy);}
.pv-tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap;} .pv-ok{background:#E3F4E5;color:#1E6B2A;} .pv-no{background:#EDF1F7;color:#33475B;} .pv-rej{background:#FDE8EA;color:#9B1C2E;}
.pv-tip{position:fixed;z-index:10000;display:none;max-width:340px;background:var(--cc-navy,#00233B);color:#fff;font-size:12px;line-height:1.45;padding:9px 12px;border-radius:10px;box-shadow:0 6px 22px rgba(0,35,59,.35);pointer-events:none;} .pv-tip b{display:block;margin-bottom:3px;font-size:12.5px;overflow-wrap:anywhere;}
.pv-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;} .pv-tab{font:inherit;font-size:12px;padding:6px 13px;border:1px solid rgba(0,50,162,.35);border-radius:99px;background:#fff;color:var(--cc-navy);cursor:pointer;} .pv-tab:hover{background:var(--cc-mist);} .pv-tab[aria-pressed=true]{background:var(--cc-navy);color:#fff;font-weight:700;}
.pv-rkh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin:4px 0 6px;} .pv-rkh p{margin:0;font-size:12.5px;color:var(--text-secondary);line-height:1.5;max-width:880px;}
.pv-tbl tr.pv-rk{cursor:pointer;} .pv-tbl tr.pv-rk:hover td{background:var(--cc-mist);} .pv-tbl td b{color:var(--cc-dark);} .pv-tbl td small{display:block;color:var(--text-secondary);font-size:10.5px;} .pv-up{color:#1E6B2A;font-weight:700;} .pv-dn{color:#9B1C2E;font-weight:700;}
.pv-lead{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px;} .pv-lead .pv-p h3{font-size:12.5px;} .pv-lead .pv-b{grid-template-columns:minmax(90px,45%) 1fr auto;}
@media (max-width:760px){.pv-grid{grid-template-columns:1fr}.pv-r{grid-template-columns:1fr 1fr}.pv-b{grid-template-columns:1fr}.pv-bv{text-align:left}}
`;
function injectCss(){ if(document.getElementById('pvCss')) return; const s = document.createElement('style'); s.id = 'pvCss'; s.textContent = CSS; document.head.appendChild(s); }

// ---------- datos ----------
async function ensureData(setMsg){
  if(S.ready) return S.ready;
  S.ready = (async () => {
    setMsg('Cargando los diccionarios y el índice de proveedores (la primera vez demora unos segundos)…');
    await Promise.all([window.PROC_DIC ? 0 : loadScript(DB + 'dic.js' + ver()), window.PROV_IDX ? 0 : loadScript(PB + 'idx.js' + ver())]);
    const D = window.PROC_DIC, X = window.PROV_IDX; S.D = D; S.X = X;
    S.nm = D.prov.map(p => nameKey(p[1])); S.rt = D.prov.map(p => rutKey(p[0]));
    S.byKey = new Map(); D.prov.forEach((p, i) => { S.byKey.set(p[0] ? rutKey(p[0]) : 'n:' + S.nm[i], i); });
    S.top = Array.from({length: D.prov.length}, (_, i) => i).filter(i => X.m[i] > 0).sort((a, b) => X.m[b] - X.m[a]).slice(0, 15);
  })().catch(e => { S.ready = null; throw e; });
  return S.ready;
}
async function loadShard(K){
  if(window.PROV_SH[K]) return window.PROV_SH[K];
  await loadScript(PB + 'p_' + K + '.js?v=' + (S.X.h[K] || ''));
  if(!window.PROV_SH[K]) throw new Error('El archivo del proveedor no trae datos.');
  return window.PROV_SH[K];
}
const keyOf = i => { const p = S.D.prov[i]; return p[0] || ('N:' + p[1]); };

// ---------- búsqueda ----------
function search(q){
  q = q.trim(); if(q.length < 3) return null;
  const X = S.X, n = S.D.prov.length, hits = [];
  const compact = q.replace(/[.\s]/g, '');
  if(/^[0-9kK\-]+$/.test(compact) && /\d{3,}/.test(compact)){
    const t = rutKey(q); for(let i = 0; i < n; i++) if(S.rt[i] && S.rt[i].indexOf(t) === 0) hits.push(i);
  } else {
    const toks = nameKey(q).split(' ').filter(Boolean); if(!toks.length) return [];
    for(let i = 0; i < n; i++){ const h = ' ' + S.nm[i]; let ok = true; for(let k = 0; k < toks.length; k++) if(h.indexOf(' ' + toks[k]) < 0){ ok = false; break; } if(ok) hits.push(i); }
  }
  hits.sort((a, b) => (X.m[b] - X.m[a]) || (X.n[b] - X.n[a]) || (X.l[b] - X.l[a]));
  return hits;
}
function rowHtml(i){
  const p = S.D.prov[i], X = S.X;
  return `<button type="button" class="pv-r" data-i="${i}"><span><b>${esc(p[1])}</b><small>${p[0] ? 'RUT ' + esc(p[0]) : 'Sin RUT informado'}</small></span>
    <span class="pv-num">${X.m[i] ? fmtM(X.m[i]) : '—'}<small>vendido en OC</small></span><span class="pv-num">${fmt(X.n[i])} OC<small>${X.l[i] ? fmt(X.l[i]) + ' licitaciones ofertadas' : 'sin ofertas registradas'}</small></span>
    <span class="pv-num">Ver ficha →</span></button>`;
}
function showList(hits, titulo){
  const el = $('pvList'); if(!el) return;
  if(hits == null){ showRank(); return; }
  if(!hits.length){ el.innerHTML = '<div class="pv-note">No hay proveedores que coincidan. Prueba con menos palabras o con el RUT. Solo están los proveedores que vendieron (OC) u ofertaron en licitaciones con ficha desde 2025.</div>'; return; }
  const shown = hits.slice(0, 30);
  el.innerHTML = `<div class="pv-h2">${fmt(hits.length)} proveedor${hits.length === 1 ? '' : 'es'}${hits.length > 30 ? ' (se muestran los 30 con más ventas)' : ''}</div><div class="pv-list">${shown.map(rowHtml).join('')}</div>`;
}


// ---------- rankings de la portada ----------
const RK = {tab: 'top', sub: 0};
async function ensureRank(){
  if(window.PROV_RANK) return window.PROV_RANK;
  await loadScript(PB + 'rank.js?v=' + (S.X.rk || ''));
  return window.PROV_RANK;
}
const orgNm = o => o >= 0 && S.D.org[o] ? S.D.org[o][1] : 'Sin dato';
const prv = i => { const p = S.D.prov[i]; return `<b>${esc(p[1])}</b><small>${p[0] ? 'RUT ' + esc(p[0]) : 'Sin RUT informado'}</small>`; };
const pm = v => dec1(v / 10) + ' %';
function rkTable(heads, rows, nums){
  nums = nums || [];
  return `<div class="pv-tw"><table class="pv-tbl"><thead><tr><th>#</th>${heads.map((h, k) => `<th class="${nums.indexOf(k) >= 0 ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, n) => `<tr class="pv-rk" data-pi="${r[0]}" tabindex="0"><td class="num">${n + 1}</td>${r.slice(1).map((c, k) => `<td class="${nums.indexOf(k) >= 0 ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function rankTabs(R){
  const M = R.kpi.meses;
  return [
    {k: 'top', lab: 'Más ventas', desc: 'Los 25 proveedores con mayor monto vendido en órdenes de compra desde enero de 2025.',
     heads: ['Proveedor', 'Ventas', 'OC', 'Licitaciones ofertadas'], nums: [1, 2, 3],
     rows: () => S.top25.map(i => [i, prv(i), fmtM(S.X.m[i]), fmt(S.X.n[i]), fmt(S.X.l[i])])},
    {k: 'fiel', lab: 'Un solo comprador', desc: `Proveedores con ventas desde 2025 de $100 millones o más, al menos 10 OC y 90 % o más de sus ventas a un mismo organismo: ${fmt(R.nfiel[0])} proveedores, ${fmtM(R.nfiel[1])} en total. Una venta concentrada no es irregular por sí sola; sirve para revisar dependencia mutua y competencia.`,
     heads: ['Proveedor', 'Comprador', '% con ese comprador', 'OC', 'Ventas', 'Meses con venta'], nums: [2, 3, 4, 5],
     rows: () => R.fiel.map(r => [r[0], prv(r[0]), esc(orgNm(r[1])), pm(r[2]), fmt(r[3]), fmtM(r[4]), r[5] + ' de ' + M])},
    {k: 'par', lab: 'Pares comprador–proveedor', desc: 'Las relaciones de compra más grandes entre un organismo y un proveedor, con cuánto pesa el proveedor dentro del gasto total de ese organismo.',
     heads: ['Proveedor', 'Comprador', 'Ventas', 'OC', 'Meses con venta', '% del gasto del comprador'], nums: [2, 3, 4, 5],
     rows: () => R.par.map(r => [r[0], prv(r[0]), esc(orgNm(r[1])), fmtM(r[2]), fmt(r[3]), r[4] + ' de ' + M, pm(r[5])])},
    {k: 'cm', lab: 'Convenios Marco', desc: 'Proveedores con ventas en más Convenios Marco distintos (cada código de convenio cuenta una vez). Entre paréntesis se muestra cuántos proveedores tienen ventas en algún convenio.',
     heads: ['Proveedor', 'Convenios Marco', 'Ventas en convenios', 'OC'], nums: [1, 2, 3],
     rows: () => R.cm.map(r => [r[0], prv(r[0]), fmt(r[1]), fmtM(r[2]), fmt(r[3])]), foot: `${fmt(R.kpi.pcm)} proveedores venden por Convenio Marco.`},
    {k: 'org', lab: 'Más compradores', desc: 'Proveedores que venden a más organismos distintos: menor dependencia de un cliente y mayor presencia en el Estado.',
     heads: ['Proveedor', 'Organismos distintos', 'Ventas'], nums: [1, 2],
     rows: () => R.org.map(r => [r[0], prv(r[0]), fmt(r[1]), fmtM(r[2])])},
    {k: 'td', lab: 'Trato directo', subs: ['Mayor monto', 'Dependen del trato directo'],
     desc: s => s === 0 ? 'Proveedores con mayor monto vendido por trato o contratación directa.' : `Proveedores con $50 millones o más por trato directo y 80 % o más de sus ventas por esa vía: ${fmt(R.ntdd[0])} proveedores, ${fmtM(R.ntdd[1])}. Es una señal para revisar causales y posibles licitaciones, no una conclusión de irregularidad.`,
     heads: ['Proveedor', 'Monto por trato directo', 'OC', '% de sus ventas'], nums: [1, 2, 3],
     rows: s => (s === 0 ? R.td : R.tdd).map(r => [r[0], prv(r[0]), fmtM(r[1]), fmt(r[2]), pm(r[3])])},
    {k: 'lic', lab: 'Licitaciones', subs: ['Más adjudicaciones', 'Mejor tasa de éxito', 'Ofertan mucho y no ganan'],
     desc: s => s === 0 ? 'Proveedores con más licitaciones adjudicadas (licitaciones con ficha de bases, 2025 en adelante).' : s === 1 ? 'Entre quienes ofertaron en 20 licitaciones o más, los que más veces resultaron adjudicados.' : 'Entre quienes ofertaron en 20 licitaciones o más, los que menos adjudicaciones logran. Puede reflejar ofertas poco competitivas, rechazos por bases o participación sin intención de contratar.',
     heads: ['Proveedor', 'Ofertó', 'Adjudicadas', s => s === 0 ? 'Monto adjudicado' : 'Tasa de éxito'], nums: [1, 2, 3],
     rows: s => s === 0 ? R.ad.map(r => [r[0], prv(r[0]), fmt(r[1]), fmt(r[2]), fmtM(r[3])]) : (s === 1 ? R.tasa : R.sinex).map(r => [r[0], prv(r[0]), fmt(r[1]), fmt(r[2]), pm(r[3])])},
    {k: 'mov', lab: 'Crecen y caen', subs: ['Más crecen', 'Más caen'],
     desc: 'Ventas de los últimos 6 meses frente a los 6 anteriores. Solo se consideran proveedores con $50 millones o más en el período de mayor venta.',
     heads: ['Proveedor', 'Últimos 6 meses', '6 meses anteriores', 'Variación'], nums: [1, 2, 3],
     rows: s => (s === 0 ? R.up : R.dn).map(r => [r[0], prv(r[0]), fmtM(r[1]), fmtM(r[2]), `<span class="${r[1] >= r[2] ? 'pv-up' : 'pv-dn'}">${r[1] >= r[2] ? '+' : '−'}${fmtM(Math.abs(r[1] - r[2]))}</span>`])},
    {k: 'nuevos', lab: 'Nuevos en 2026', desc: `Proveedores cuya primera OC es de 2026: ${fmt(R.nnuevos[0])} proveedores, ${fmtM(R.nnuevos[1])} vendido. Se muestran los 25 con mayores ventas.`,
     heads: ['Proveedor', 'Ventas', 'OC', 'Primera OC'], nums: [1, 2],
     rows: () => R.nuevos.map(r => [r[0], prv(r[0]), fmtM(r[2]), fmt(r[1]), dayStr(r[3])])},
    {k: 'rub', lab: 'Líderes por rubro', desc: 'Los 14 rubros con más ventas y sus 5 principales proveedores, con su participación en el rubro. Sirve para ver qué tan concentrado está cada mercado.', custom: true}
  ];
}
function rkBody(R){
  const tabs = rankTabs(R), T = tabs.find(t => t.k === RK.tab) || tabs[0];
  const sub = T.subs ? Math.min(RK.sub, T.subs.length - 1) : 0;
  const head = `<div class="pv-rkh"><p>${typeof T.desc === 'function' ? T.desc(sub) : T.desc}</p>${T.custom ? '' : '<button type="button" class="pv-btn" id="pvRkDl">Descargar este ranking (Excel)</button>'}</div>`;
  const subs = T.subs ? `<div class="pv-seg">${T.subs.map((t, k) => `<button type="button" data-rksub="${k}" aria-pressed="${k === sub}">${t}</button>`).join('')}</div>` : '';
  if(T.custom){
    return head + `<div class="pv-lead">${R.rub.map(r => `<div class="pv-p"><h3>${esc(sentence(r[0]))}</h3><div class="pv-note" style="margin:0 0 6px">${fmtM(r[1])} vendido</div>${bars(r[2].map(x => ({lab: S.D.prov[x[0]][1], tip: S.D.prov[x[0]][1] + ' · ' + pm(x[2]) + ' del rubro', w: x[1], a: fmtM(x[1]), b: pm(x[2]), c: 'var(--cc-royal,#005AF8)'}))).replace(/class="pv-b"/g, 'class="pv-b" style="cursor:pointer"').replace(/data-tip=/g, 'data-tip=')}</div>`).join('')}</div>`;
  }
  const rows = T.rows(sub), heads = T.heads.map(h => typeof h === 'function' ? h(sub) : h);
  return head + subs + rkTable(heads, rows, T.nums) + (T.foot ? `<p class="pv-note">${T.foot}</p>` : '');
}
async function showRank(){
  const el = $('pvList'); if(!el) return;
  el.innerHTML = '<div class="pv-status">Cargando rankings…</div>';
  let R; try { R = await ensureRank(); } catch(e){ el.innerHTML = `<div class="pv-status pv-err">${esc(e.message)}</div>`; return; }
  if(!S.top25) S.top25 = Array.from({length: S.D.prov.length}, (_, i) => i).filter(i => S.X.m[i] > 0).sort((a, b) => S.X.m[b] - S.X.m[a]).slice(0, 25);
  if($('pvQ') && $('pvQ').value.trim().length >= 3) return;
  const k = R.kpi;
  const kp = [kpi('Proveedores con ventas', fmt(k.act), 'con OC desde enero de 2025'), kpi('Ventas en OC', fmtM(k.monto), k.meses + ' meses'),
    kpi('Concentración', pm(k.top10), 'de las ventas están en 10 proveedores; en 100: ' + pm(k.top100)),
    kpi('Por mecanismo', pm(k.cm) + ' CM', pm(k.td) + ' trato directo · ' + pm(k.ca) + ' Compra Ágil'),
    kpi('Con un solo comprador', fmt(k.un_comprador), 'proveedores con 90 % o más de sus ventas a un organismo (5 OC o más)'),
    kpi('Participan en licitaciones', fmt(k.pl), 'proveedores con ofertas registradas')].join('');
  const tabs = rankTabs(R);
  el.innerHTML = `<div class="pv-kpis">${kp}</div><div class="pv-h2">Rankings</div><div class="pv-tabs" role="group" aria-label="Rankings de proveedores">${tabs.map(t => `<button type="button" class="pv-tab" data-rktab="${t.k}" aria-pressed="${t.k === RK.tab}">${t.lab}</button>`).join('')}</div><div id="pvRkBody">${rkBody(R)}</div>
    <p class="pv-note">Período: enero de 2025 a octubre de 2026 (OC en estado Aceptada o Recepción Conforme). Los montos de OC superiores a $1 billón se excluyen por error de digitación. Los rankings describen ventas y no indican por sí solos irregularidades.</p>`;
}
function rkRefresh(){ const R = window.PROV_RANK, b = $('pvRkBody'); if(!R || !b) return; b.innerHTML = rkBody(R); }
function rkSheets(){
  const R = window.PROV_RANK, tabs = rankTabs(R), T = tabs.find(t => t.k === RK.tab) || tabs[0], sub = T.subs ? Math.min(RK.sub, T.subs.length - 1) : 0;
  const strip = h => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const rows = T.rows(sub).map((r, n) => [n + 1].concat(r.slice(1).map(strip))), heads = ['#'].concat(T.heads.map(h => typeof h === 'function' ? h(sub) : h));
  // prv() entrega «nombre + RUT» pegados al quitar etiquetas: separamos nombre y RUT
  const out = rows.map((r, n) => { const p = S.D.prov[T.rows(sub)[n][0]]; r.splice(1, 1, p[1], p[0] || ''); return r; }); heads.splice(1, 1, 'Proveedor', 'RUT');
  return [{name: T.lab.slice(0, 28), headers: heads, rows: out}, {name: 'Nota', headers: ['Dato', 'Valor'], rows: [['Ranking', T.lab + (T.subs ? ' · ' + T.subs[sub] : '')], ['Período', 'ene-2025 a oct-2026'], ['Fuente', 'Datos abiertos de ChileCompra (Mercado Público)'], ['Generado el', new Date().toLocaleString('es-CL')]]}];
}

// ---------- ficha ----------
const kpi = (l, v, s) => `<div class="pv-k"><div class="pv-kl">${l}</div><div class="pv-kv">${v}</div>${s ? `<div class="pv-ks">${s}</div>` : ''}</div>`;
function bars(rows){
  const mx = Math.max(1, ...rows.map(r => r.w));
  return `<div class="pv-bars">${rows.map(r => `<div class="pv-b" data-tip="${esc(r.tip || r.lab)}"><div class="pv-bl">${esc(r.lab)}</div><div class="pv-bt"><i style="width:${Math.max(1, Math.round(100 * r.w / mx))}%;background:${r.c || 'var(--cc-royal,#005AF8)'}"></i></div><div class="pv-bv"><b>${r.a}</b><small>${r.b}</small></div></div>`).join('')}</div>`;
}
function monthChart(rec, metric){
  const mo = rec.mo || {}, ks = Object.keys(mo).map(Number); if(!ks.length) return '<p class="pv-note">Sin OC en el período.</p>';
  const all = []; const last = Math.max(21, ...ks); for(let k = 0; k <= last; k++) all.push(k);
  const val = k => mo[k] ? mo[k][metric === 'm' ? 1 : 0] : 0, mx = Math.max(1, ...all.map(val));
  const W = 760, H = 230, L = 8, R = 8, T = 22, B = 34, bw = (W - L - R) / all.length;
  const lab = v => metric === 'm' ? fmtM(v) : fmt(v) + ' OC';
  let svg = `<svg class="pv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas por mes"><text x="${L}" y="12">Máximo mensual: ${esc(lab(mx))}</text><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#C9D3E0"/>`;
  all.forEach((k, i) => {
    const v = val(k), h = v ? Math.max(2, (H - T - B) * v / mx) : 0, x = L + i * bw, e = mo[k] || [0, 0];
    const tip = `<b>${moLab(k)}</b>${fmt(e[0])} OC<br>${e[1] ? '$' + fmt(e[1]) : 'sin monto'}`;
    svg += `<rect class="pv-bar" data-tip="${esc(tip)}" data-html="1" x="${(x + bw * 0.14).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>`;
    if(i % 3 === 0 || i === all.length - 1) svg += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 16}" text-anchor="middle">${MES[k % 12]}</text><text x="${(x + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${2025 + Math.floor(k / 12)}</text>`;
  });
  return svg + '</svg>';
}
function resultTag(sel, rej){ return sel ? '<span class="pv-tag pv-ok">Adjudicada a este proveedor</span>' : rej ? '<span class="pv-tag pv-rej">Oferta rechazada</span>' : '<span class="pv-tag pv-no">No adjudicada</span>'; }
function sheetsOf(i, rec){
  const D = S.D, X = S.X, p = D.prov[i], t = rec.t || [0, 0], S1 = [];
  const orgN = o => o >= 0 && D.org[o] ? D.org[o][1] : 'Sin dato';
  S1.push({name: 'Resumen', headers: ['Dato', 'Valor'], rows: [['Proveedor', p[1]], ['RUT', p[0]], ['Código proveedor (Mercado Público)', rec.cp || ''], ['Giro / actividad', rec.a || ''], ['Comuna', rec.g || ''], ['Región', rec.rg || ''], ['País', rec.pa || 'Chile'],
    ['OC emitidas', t[0]], ['Ventas en OC (CLP)', t[1]], ['Organismos distintos', rec.no || 0], ['Primera OC', rec.f ? dayStr(rec.f[0]) : ''], ['Última OC', rec.f ? dayStr(rec.f[1]) : ''],
    ['Licitaciones ofertadas', rec.l ? rec.l[0] : 0], ['Licitaciones adjudicadas', rec.l ? rec.l[1] : 0], ['Ofertas rechazadas', rec.l ? rec.l[2] : 0], ['Monto adjudicado en licitaciones (CLP)', rec.l ? rec.l[3] : 0],
    ['Período de las OC', 'ene-2025 a ' + (typeof DATA !== 'undefined' && DATA.periodo ? DATA.periodo : 'oct-2026')], ['Fuente', 'Datos abiertos de ChileCompra (Mercado Público)'], ['Generado el', new Date().toLocaleString('es-CL')]]});
  S1.push({name: 'Ventas por mes', headers: ['Mes', 'OC', 'Monto OC (CLP)'], rows: Object.keys(rec.mo || {}).map(Number).sort((a, b) => a - b).map(k => [moLab(k), rec.mo[k][0], rec.mo[k][1]])});
  S1.push({name: 'Por mecanismo', headers: ['Mecanismo', 'OC', 'Monto OC (CLP)', '% del monto'], rows: (rec.m || []).map(x => [X.mec[x[0]], x[1], x[2], t[1] ? +(100 * x[2] / t[1]).toFixed(1) : ''])});
  S1.push({name: 'Convenios Marco', headers: ['Código del convenio', 'Nombre', 'OC', 'Monto OC (CLP)', 'Organismos distintos', 'Enlace'], rows: (rec.cm || []).map(x => [x[0], X.cmn[x[0]] || '', x[1], x[2], x[3], 'http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=' + encodeURIComponent(x[0])])});
  S1.push({name: 'Organismos compradores', headers: ['Cód. organismo', 'Organismo', 'Sector', 'OC', 'Monto OC (CLP)', '% del monto'], rows: (rec.o || []).map(x => { const o = D.org[x[0]]; return [o ? o[0] : '', orgN(x[0]), o ? o[2] : '', x[1], x[2], t[1] ? +(100 * x[2] / t[1]).toFixed(1) : '']; })});
  S1.push({name: 'Regiones', headers: ['Región del comprador', 'OC', 'Monto OC (CLP)'], rows: (rec.r || []).map(x => [String(D.reg[x[0]] || '').trim(), x[1], x[2]])});
  S1.push({name: 'Rubros', headers: ['Rubro', 'OC', 'Monto OC (CLP)'], rows: (rec.rb || []).map(x => [sentence(x[0]), x[1], x[2]])});
  S1.push({name: 'Productos', headers: ['Producto', 'OC con el producto'], rows: (rec.pd || []).map(x => [D.prd[x[0]], x[1]])});
  if(rec.l){
    S1.push({name: 'Ofertas por tipo', headers: ['Tipo', 'Descripción', 'Ofertó', 'Adjudicó'], rows: (rec.l[4] || []).map(x => [x[0], TIPO_LIC[x[0]] || '', x[1], x[2]])});
    S1.push({name: 'Licitaciones recientes', headers: ['ID licitación', 'Publicación', 'Nombre', 'Organismo', 'Tipo', 'Resultado', 'Enlace'], rows: (rec.l[5] || []).map(x => [x[0], dayStr(x[1]), x[4], orgN(x[5]), x[6], x[2] ? 'Adjudicada a este proveedor' : x[3] ? 'Oferta rechazada' : 'No adjudicada', 'http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=' + encodeURIComponent(x[0])])});
  }
  if(rec.at) S1.push({name: 'OC con monto atípico', headers: ['Código OC', 'Monto informado (CLP)'], rows: rec.at});
  return S1;
}
function fichaHtml(i, rec){
  const D = S.D, X = S.X, p = D.prov[i], t = rec.t || [0, 0], hasOc = t[0] > 0, L = rec.l;
  const orgN = o => o >= 0 && D.org[o] ? D.org[o][1] : 'Sin dato de organismo';
  const rutTxt = p[0] ? 'RUT <b>' + esc(p[0]) + '</b>' : 'Sin RUT informado';
  const place = [rec.g, rec.rg ? String(rec.rg).replace(/^Región (de |del |de la )?/, '') : '', rec.pa].filter(Boolean).join(', ');
  const idl = [rutTxt, rec.cp ? 'Código proveedor <b>' + esc(rec.cp) + '</b>' : '', rec.a ? 'Giro: ' + esc(rec.a) : '', place ? esc(place) : ''].filter(Boolean).join(' · ');
  const buscarHref = '#rubro&prov=' + encodeURIComponent(p[0] || p[1]);
  const top1 = rec.o && rec.o[0], mec1 = (rec.m || []).slice().sort((a, b) => b[2] - a[2])[0];
  const mesMax = Object.keys(rec.mo || {}).sort((a, b) => rec.mo[b][1] - rec.mo[a][1])[0];
  const cmTot = (rec.cm || []).reduce((a, x) => [a[0] + x[1], a[1] + x[2]], [0, 0]);
  let kp = '';
  if(hasOc) kp += kpi('Ventas en OC', fmtM(t[1]), fmt(t[0]) + ' OC emitidas, en pesos chilenos')
    + kpi('Organismos compradores', fmt(rec.no || 0), 'distintos')
    + (top1 ? kpi('Cliente principal', esc(orgN(top1[0])), pct(top1[2], t[1]) + ' del monto · ' + fmtM(top1[2])) : '')
    + (mec1 ? kpi('Mecanismo principal', esc(X.mec[mec1[0]]), pct(mec1[2], t[1]) + ' del monto') : '')
    + kpi('Monto medio por OC', fmtM(t[1] / t[0]), 'promedio simple')
    + (rec.f ? kpi('Primera y última OC', dayStr(rec.f[0]) + ' a ' + dayStr(rec.f[1]), 'fecha de envío de la OC') : '')
    + (mesMax != null ? kpi('Mes con más ventas', moLab(+mesMax), fmtM(rec.mo[mesMax][1]) + ' · ' + fmt(rec.mo[mesMax][0]) + ' OC') : '')
    + (cmTot[0] ? kpi('Convenios Marco', fmt((rec.cm || []).length) + (rec.cm.length >= 30 ? ' o más' : ''), fmt(cmTot[0]) + ' OC · ' + fmtM(cmTot[1])) : '');
  if(L) kp += kpi('Licitaciones ofertadas', fmt(L[0]), 'con ficha de bases, desde 2025')
    + kpi('Adjudicadas', fmt(L[1]), 'tasa de adjudicación ' + pct(L[1], L[0]))
    + kpi('Ofertas rechazadas', fmt(L[2]), pct(L[2], L[0]) + ' de las ofertas')
    + (L[3] ? kpi('Monto adjudicado', fmtM(L[3]), 'ofertas seleccionadas en licitaciones en pesos') : '');
  const warn = rec.at ? `<div class="pv-warn"><b>${rec.at.length} OC con monto atípico</b> (más de $1 billón cada una) no se suman a las ventas: ${rec.at.map(x => esc(x[0]) + ' (' + fmtM(x[1]) + ')').join(', ')}. Suelen ser errores de digitación en la OC.</div>` : '';
  const panels = [];
  if(hasOc){
    panels.push(`<section class="pv-p pv-w"><h3>Ventas por mes</h3><div class="pv-seg" role="group" aria-label="Medida del gráfico"><button type="button" data-metric="m" aria-pressed="${S.metric === 'm'}">Monto en OC</button><button type="button" data-metric="n" aria-pressed="${S.metric === 'n'}">N° de OC</button></div><div id="pvChart">${monthChart(rec, S.metric)}</div>
      <p class="pv-note">Mes de envío de la OC, enero de 2025 en adelante${typeof DATA !== 'undefined' && DATA.parcial && Object.keys(DATA.parcial).length ? '; el último mes es parcial' : ''}. Pasa el cursor por una barra para ver el detalle.</p></section>`);
    panels.push(`<section class="pv-p"><h3>Ventas por mecanismo de compra</h3>${bars((rec.m || []).slice().sort((a, b) => b[2] - a[2]).map(x => ({lab: X.mec[x[0]], c: MEC_COL[x[0]], w: x[2], a: fmtM(x[2]), b: fmt(x[1]) + ' OC · ' + pct(x[2], t[1]), tip: '<b>' + esc(X.mec[x[0]]) + '</b>' + fmt(x[1]) + ' OC<br>$' + fmt(x[2])})))}</section>`);
  }
  if(rec.cm && rec.cm.length){
    panels.push(`<section class="pv-p pv-w"><h3>Convenios Marco en los que ha vendido</h3><div class="pv-tw"><table class="pv-tbl"><thead><tr><th>Convenio Marco</th><th class="num">OC</th><th class="num">Monto OC</th><th class="num">Organismos</th></tr></thead><tbody>${rec.cm.map(x => `<tr><td>${X.cmn[x[0]] ? '<b>' + esc(X.cmn[x[0]]) + '</b><br>' : ''}<a href="http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=${encodeURIComponent(x[0])}" target="_blank" rel="noopener">${esc(x[0])}</a></td><td class="num">${fmt(x[1])}</td><td class="num">${fmtM(x[2])}</td><td class="num">${fmt(x[3])}</td></tr>`).join('')}</tbody></table></div>
      <p class="pv-note">Se muestran hasta 30 convenios, de mayor a menor monto. El nombre aparece solo para los convenios cuya licitación está en los archivos descargados (2025 en adelante); en los demás se ve el código del convenio.</p></section>`);
  }
  if(L){
    const tipos = (L[4] || []);
    panels.push(`<section class="pv-p"><h3>Licitaciones por tipo</h3>${tipos.length ? bars(tipos.map(x => ({lab: x[0] + ' · ' + (TIPO_LIC[x[0]] || '').replace('Licitación ', ''), tip: '<b>' + esc(x[0] + ' · ' + (TIPO_LIC[x[0]] || 'Tipo ' + x[0])) + '</b>Ofertó ' + fmt(x[1]) + '<br>Adjudicó ' + fmt(x[2]), c: '#0032A2', w: x[1], a: fmt(x[1]) + (x[1] === 1 ? ' oferta' : ' ofertas'), b: fmt(x[2]) + (x[2] === 1 ? ' adjudicada · ' : ' adjudicadas · ') + pct(x[2], x[1])}))) : '<p class="pv-note">Sin datos.</p>'}</section>`);
    const rows = (L[5] || []).map(x => `<tr><td><a href="http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=${encodeURIComponent(x[0])}" target="_blank" rel="noopener">${esc(x[0])}</a></td><td>${dayStr(x[1])}</td><td>${esc(x[4])}</td><td>${esc(orgN(x[5]))}</td><td>${esc(x[6])}</td><td>${resultTag(x[2], x[3])}</td></tr>`).join('');
    panels.push(`<section class="pv-p pv-w"><h3>Últimas licitaciones en que participó</h3><div class="pv-tw"><table class="pv-tbl"><thead><tr><th>ID</th><th>Publicación</th><th>Nombre</th><th>Organismo</th><th>Tipo</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="pv-note">Las 12 más recientes de ${fmt(L[0])}. Para ver todos sus procesos (licitaciones, tratos directos, Compra Ágil y Convenio Marco) usa «Ver sus procesos en el buscador».</p></section>`);
  }
  if(hasOc){
    panels.push(`<section class="pv-p"><h3>Organismos que más le compran</h3>${bars((rec.o || []).map(x => ({lab: orgN(x[0]), tip: '<b>' + esc(orgN(x[0])) + '</b>' + fmt(x[1]) + ' OC<br>$' + fmt(x[2]), c: '#0032A2', w: x[2], a: fmtM(x[2]), b: fmt(x[1]) + ' OC · ' + pct(x[2], t[1])})))}<p class="pv-note">Los ${Math.min(12, (rec.o || []).length)} principales de ${fmt(rec.no || 0)} organismos.</p></section>`);
    if(rec.r && rec.r.length) panels.push(`<section class="pv-p"><h3>Regiones de los compradores</h3>${bars(rec.r.map(x => ({lab: String(D.reg[x[0]] || 'Sin región').trim(), c: '#0B78CC', w: x[2], a: fmtM(x[2]), b: fmt(x[1]) + ' OC · ' + pct(x[2], t[1])})))}</section>`);
    if(rec.rb && rec.rb.length) panels.push(`<section class="pv-p"><h3>Rubros</h3>${bars(rec.rb.map(x => ({lab: sentence(x[0]), c: '#E94860', w: x[2], a: fmtM(x[2]), b: fmt(x[1]) + ' OC · ' + pct(x[2], t[1])})))}<p class="pv-note">Rubro del producto principal de cada OC, según el catálogo de Mercado Público.</p></section>`);
    if(rec.pd && rec.pd.length) panels.push(`<section class="pv-p"><h3>Productos más frecuentes</h3>${bars(rec.pd.map(x => ({lab: D.prd[x[0]] || '', c: '#6FD3E0', w: x[1], a: fmt(x[1]) + ' OC', b: 'con el producto'})))}</section>`);
  }
  const notas = `<p class="pv-note">Datos abiertos de ChileCompra: OC de enero de 2025 en adelante y ofertas en licitaciones con ficha de bases de ese período. Las ventas excluyen montos atípicos. Los datos abiertos no traen contacto ni habilidad para contratar con el Estado; esos datos están en la ficha oficial del proveedor en Mercado Público.</p>`;
  return `<div class="pv-head"><h2>${esc(p[1])}</h2><div class="pv-id">${idl}</div>
    <div class="pv-actions"><a class="pv-btn pv-main" href="${esc(buscarHref)}" target="_blank" rel="noopener">Ver sus procesos en el buscador</a>
    <button type="button" class="pv-btn" id="pvDl">Descargar ficha (Excel)</button>
    <a class="pv-btn" id="pvOficial" href="https://www.mercadopublico.cl/" target="_blank" rel="noopener" title="Abre Mercado Público; busca al proveedor con su RUT">Ficha oficial en Mercado Público</a>
    ${p[0] ? '<button type="button" class="pv-btn" id="pvCopy" title="Copia el RUT para pegarlo en Mercado Público">Copiar RUT</button>' : ''}</div>
    <p class="pv-note">La ficha oficial incluye el estado de habilidad y los datos de contacto. Mercado Público no permite abrirla desde un enlace directo: copia el RUT y búscalo ahí.</p></div>
    ${warn}${kp ? `<div class="pv-kpis">${kp}</div>` : ''}<div class="pv-grid">${panels.join('')}</div>${notas}`;
}
async function openProv(i, silent){
  const el = $('pvFicha'); if(!el) return;
  el.innerHTML = '<div class="pv-status">Cargando la ficha…</div>';
  try {
    const K = Math.floor(i / S.X.shard), sh = await loadShard(K), rec = sh[i] || {};
    S.cur = {i, rec}; el.innerHTML = fichaHtml(i, rec);
    if(!silent){ try { history.replaceState(null, '', '#proveedores=' + encodeURIComponent(keyOf(i))); } catch(e){} }
    document.title = S.D.prov[i][1] + ' · Proveedores · ChileCompra';
    el.scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch(e){ console.error(e); el.innerHTML = `<div class="pv-status pv-err">${esc(e.message)}</div>`; }
}
function findKey(key){
  key = String(key || ''); if(!key) return -1;
  if(/^n:/i.test(key)) return S.byKey.has('n:' + nameKey(key.slice(2))) ? S.byKey.get('n:' + nameKey(key.slice(2))) : -1;
  const k = rutKey(key); return S.byKey.has(k) ? S.byKey.get(k) : -1;
}

// ---------- eventos ----------
function tipEl(){ let t = document.getElementById('pvTip'); if(!t){ t = document.createElement('div'); t.id = 'pvTip'; t.className = 'pv-tip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); } return t; }
function tipShow(el, x, y){
  const t = tipEl(), raw = el.getAttribute('data-tip'); if(!raw){ t.style.display = 'none'; return; }
  t.innerHTML = el.getAttribute('data-html') ? raw : (raw.charAt(0) === '<' ? raw : '<b>' + esc(raw) + '</b>'); t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight; let l = x + 14, tp = y + 18;
  if(l + w > window.innerWidth - 8) l = Math.max(8, x - w - 14); if(tp + h > window.innerHeight - 8) tp = Math.max(8, y - h - 12);
  t.style.left = l + 'px'; t.style.top = tp + 'px';
}
function tipHide(){ const t = document.getElementById('pvTip'); if(t) t.style.display = 'none'; }
function wire(){
  const host = S.host, inp = $('pvQ');
  let tm = null;
  inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { S.q = inp.value; const h = search(S.q); if(h == null) showList(null, 'Proveedores con más ventas'); else showList(h); }, 160); });
  inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ const h = search(inp.value); if(h && h.length === 1) openProv(h[0]); } });
  host.addEventListener('keydown', e => { if(e.key === 'Enter'){ const r = e.target.closest && e.target.closest('tr[data-pi]'); if(r) openProv(+r.dataset.pi); } });
  host.addEventListener('click', e => {
    const r = e.target.closest('.pv-r'); if(r){ openProv(+r.dataset.i); return; }
    const rk = e.target.closest('[data-pi]'); if(rk){ openProv(+rk.dataset.pi); return; }
    const tb = e.target.closest('[data-rktab]'); if(tb){ RK.tab = tb.dataset.rktab; RK.sub = 0; host.querySelectorAll('[data-rktab]').forEach(b => b.setAttribute('aria-pressed', String(b === tb))); rkRefresh(); return; }
    const sb = e.target.closest('[data-rksub]'); if(sb){ RK.sub = +sb.dataset.rksub; rkRefresh(); return; }
    if(e.target.closest('#pvRkDl')){ const sh = rkSheets(); DL_STORE.provRank = {headers: [], rows: [], sheets: () => sh}; downloadXlsx('provRank', 'ranking_proveedores_' + RK.tab + '.xlsx', e.target.closest('#pvRkDl')); return; }
    const m = e.target.closest('[data-metric]'); if(m && S.cur){ S.metric = m.dataset.metric; $('pvChart').innerHTML = monthChart(S.cur.rec, S.metric); host.querySelectorAll('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === S.metric))); return; }
    if(e.target.closest('#pvCopy')){ const rut = S.D.prov[S.cur.i][0], b = e.target.closest('#pvCopy'); const done = () => { const o = b.textContent; b.textContent = 'RUT copiado'; setTimeout(() => { b.textContent = o; }, 1800); };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(rut).then(done, done); else { const ta = document.createElement('textarea'); ta.value = rut; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(x){} ta.remove(); done(); } return; }
    if(e.target.closest('#pvDl') && S.cur){
      const i = S.cur.i, rec = S.cur.rec, p = S.D.prov[i], sheets = sheetsOf(i, rec);
      DL_STORE.provFicha = {headers: [], rows: [], sheets: () => sheets};
      downloadXlsx('provFicha', 'proveedor_' + (rutKey(p[0]) || nameKey(p[1]).replace(/ /g, '_').slice(0, 30)) + '.xlsx', e.target.closest('#pvDl'));
    }
  });
  const over = e => { const el = e.target.closest('[data-tip]'); if(el) tipShow(el, e.clientX, e.clientY); else tipHide(); };
  host.addEventListener('mouseover', over); host.addEventListener('mousemove', e => { const el = e.target.closest('[data-tip]'); if(el) tipShow(el, e.clientX, e.clientY); });
  host.addEventListener('mouseleave', tipHide);
}
async function init(host, key){
  injectCss(); S.host = host;
  if(!host.dataset.pvReady){
    host.innerHTML = `<section class="pv-box"><div class="pv-search"><input type="search" id="pvQ" placeholder="Nombre o RUT del proveedor (ej.: 76.123.456-7 o «servicios de aseo»)" autocomplete="off" aria-label="Buscar proveedor por nombre o RUT" disabled></div>
      <div class="pv-status" id="pvStatus" aria-live="polite"></div><p class="pv-hint" id="pvHint"></p><div id="pvList"></div><div id="pvFicha"></div></section>`;
    host.dataset.pvReady = '1';
  }
  const st = $('pvStatus');
  try {
    await ensureData(m => { st.textContent = m; });
    st.textContent = ''; const inp = $('pvQ'); inp.disabled = false;
    if(!host.dataset.pvWired){ host.dataset.pvWired = '1'; wire(); }
    $('pvHint').textContent = fmt(S.D.prov.length) + ' proveedores con ventas en OC u ofertas en licitaciones (ene-2025 en adelante). Escribe al menos 3 caracteres del nombre o del RUT.';
    if(!S.q) showList(null, 'Proveedores con más ventas');
    if(key){ const i = findKey(key); if(i >= 0){ openProv(i, true); } else { $('pvFicha').innerHTML = '<div class="pv-status pv-err">No se encontró ese proveedor. Puede que no tenga OC ni ofertas desde 2025.</div>'; } }
    else if(!S.q) inp.focus();
  } catch(e){ console.error(e); st.innerHTML = `<span class="pv-err">${esc(e.message)}</span>`; }
}
window.ProvFicha = {init, open: key => { if(!S.byKey) return; const i = findKey(key); if(i >= 0) openProv(i, true); }, _search: search};
})();
