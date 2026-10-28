/* Asesor estratégico de compras: orienta a un comprador sobre qué procedimiento usar, en qué orden y por qué,
   y cruza la recomendación con las compras reales de su organismo (fragmentación, Convenio Marco, trato directo, precios, proveedores de la región y demanda consolidable).
   Datos: data/asesor/ (cat.js, org.js, o_N.js por grupos de 25 organismos, p_SS.js por segmento de producto). Reglas: data/asesor/reglas.js. */
(function(){
'use strict';
if(window.AsesorCompras) return;
const AB = 'data/asesor/';
const MEC_NOM = {CM: 'Convenio Marco', CA: 'Compra Ágil', TD: 'Trato Directo', LP: 'Licitación Pública', LV: 'Licitación Privada', CO: 'Cotización', CC: 'Compra Coordinada', OT: 'Otros'};
const MEC_COL = {CM: '#0032A2', CA: '#005AF8', TD: '#4A2E8F', LP: '#0B78CC', LV: '#2F7D32', CO: '#8A4FBF', CC: '#E94860', OT: '#6B7A88'};
const SERV_CODE = 70;                                   // segmentos UNSPSC desde 70 corresponden a servicios
const S = {host: null, C: null, O: null, ready: null, st: {}, org: null, od: null, seg: {}, tab: 'asesor', orgIdx: null, prodIdx: null, orgQ: '', prodQ: '', orgList: [], prodList: [], loadingOrg: false};
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = n => n == null || isNaN(n) ? '' : Number(n).toLocaleString('es-CL', {maximumFractionDigits: 0});
const dec = (n, d) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-CL', {maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: d == null ? 0 : d});
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sentence = s => { s = String(s || '').trim().toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
const $ = id => S.host && S.host.querySelector('#' + id);
const mm = n => n == null ? '—' : (n >= 1e6 ? '$' + dec(n / 1e6, 1) + ' billones' : (n < 10 ? (Math.abs(n - 1) < 0.05 ? '$1 millón' : '$' + dec(n, 1) + ' millones') : '$' + fmt(n) + ' millones'));
const clp = n => '$' + fmt(n);
const ver = () => (typeof DATA !== 'undefined' && DATA.generado) ? '?v=' + DATA.generado : '';
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar ' + src + '. Si abriste solo el archivo HTML, deja la carpeta "data" junto a él.')); }; document.head.appendChild(s); }); }
const R = () => window.AsesorReglas;

/* ------------------------------ estado y enlace ------------------------------ */
function encState(st){
  const a = [];
  if(st.o) a.push('o.' + st.o);
  if(st.u) a.push('u.' + st.u);
  if(st.p) a.push('p.' + st.p);
  if(st.t) a.push('t.' + st.t);
  if(st.m) a.push('m.' + st.m);
  if(st.mes) a.push('f.' + st.mes);
  if(st.simple) a.push('e.1');
  if(st.s && st.s.length) a.push('s.' + st.s.join('+'));
  if(st.tab && st.tab !== 'asesor') a.push('v.' + st.tab);
  return a.join('~');
}
function decState(txt){
  const st = {s: []};
  String(txt || '').split('~').forEach(kv => {
    const i = kv.indexOf('.'); if(i < 1) return; const k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
    if(k === 'o') st.o = v; else if(k === 'u') st.u = v; else if(k === 'p') st.p = v; else if(k === 't') st.t = v === 'servicio' ? 'servicio' : 'bien';
    else if(k === 'm') st.m = Math.max(0, Math.round(Number(v) || 0)); else if(k === 'f') st.mes = v; else if(k === 'e') st.simple = true;
    else if(k === 's') st.s = v.split('+').filter(Boolean); else if(k === 'v') st.tab = v;
  });
  return st;
}
function shareUrl(){ return location.origin + location.pathname + location.search + '#asesor=' + encState(S.st); }
function syncUrl(){ try{ history.replaceState(null, '', '#asesor=' + encState(S.st)); }catch(e){} }

/* ------------------------------ carga de datos ------------------------------ */
function ensure(){
  if(S.ready) return S.ready;
  S.ready = Promise.all([loadScript(AB + 'cat.js' + ver()), loadScript(AB + 'org.js' + ver()), loadScript(AB + 'reglas.js' + ver()), loadScript(AB + 'cmvig.js' + ver()).catch(() => null).then(() => (window.AS_CMV && window.AS_CMV.cmcat) ? loadScript(AB + 'cmcat.js' + ver()).catch(() => null) : null)]).then(() => {
    S.C = window.AS_CAT; S.O = window.AS_ORG;
    S.orgNorm = S.O.o.map(o => norm(o[1]) + ' ' + o[0]);
    S.prodNorm = S.C.n.map((n, i) => norm(n) + ' ' + S.C.c[i]);
    S.orgByCode = {}; S.O.o.forEach((o, i) => S.orgByCode[o[0]] = i);
    S.prodByCode = {}; S.C.c.forEach((c, i) => S.prodByCode[c] = i);
    S.utmKeys = Object.keys(S.C.utm).sort((a, b) => { const x = a.split('-').map(Number), y = b.split('-').map(Number); return (x[0] - y[0]) || (x[1] - y[1]); });
  });
  return S.ready;
}
function loadOrg(i){
  const sh = Math.floor(i / S.O.sh); window.AS_OSH = window.AS_OSH || {};
  const get = () => window.AS_OSH[sh] && window.AS_OSH[sh][i];
  if(get()) return Promise.resolve(get());
  return loadScript(AB + 'o_' + sh + '.js' + ver()).then(get);
}
function loadSeg(code){
  const sg = String(code).slice(0, 2); window.AS_P = window.AS_P || {};
  if(window.AS_P[sg]) return Promise.resolve(window.AS_P[sg]);
  if(S.seg[sg] === null) return Promise.resolve(null);
  return loadScript(AB + 'p_' + sg + '.js' + ver()).then(() => window.AS_P[sg] || null).catch(() => { S.seg[sg] = null; return null; });
}

/* ------------------------------ estilos ------------------------------ */
const CSS = `
.as-wrap{margin-bottom:1.4rem;} .as-wrap *{box-sizing:border-box;}
.as-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px;border-bottom:1px solid var(--border);}
.as-tab{font:inherit;font-size:13px;font-weight:700;padding:9px 16px;border:0;border-bottom:3px solid transparent;background:none;color:var(--text-secondary);cursor:pointer;}
.as-tab[aria-selected=true]{color:var(--cc-navy);border-bottom-color:var(--cc-navy);} .as-tab:hover{color:var(--cc-navy);}
.as-grid{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:18px;align-items:start;}
@media(max-width:900px){.as-grid{grid-template-columns:1fr;}}
.as-side{position:sticky;top:10px;display:grid;gap:12px;align-content:start;max-height:calc(100vh - 20px);overflow-y:auto;overscroll-behavior:contain;padding:2px 6px 12px 2px;scrollbar-width:thin;} @media(max-width:900px){.as-side{position:static;max-height:none;overflow:visible;padding:0;}}
.as-card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px;box-shadow:var(--pbi-shadow);}
.as-card h3{margin:0 0 8px;font-size:14px;color:var(--cc-dark);display:flex;align-items:center;gap:9px;}
.as-n{flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:var(--cc-navy);color:#fff;font-size:12px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;}
.as-done .as-n{background:var(--cc-green);}
.as-in{width:100%;font:inherit;font-size:14px;padding:10px 14px;border:1px solid var(--cc-navy);border-radius:12px;background:#fff;color:var(--cc-dark);}
.as-in:focus-visible,.as-sel:focus-visible,.as-btn:focus-visible,.as-opt:focus-visible{outline:3px solid var(--cc-ice);outline-offset:1px;}
.as-sel{width:100%;font:inherit;font-size:13px;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--cc-dark);margin-top:8px;}
.as-lab{display:block;font-size:11.5px;color:var(--text-secondary);margin:10px 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;}
.as-vd{border-radius:14px;padding:14px 16px;margin:0 0 12px;border:1px solid;} .as-vd h3{margin:4px 0 6px;font-size:16px;} .as-vd p{margin:6px 0;font-size:13px;line-height:1.55;} .as-vd-b{margin-right:6px;display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.7);}
.as-vd-ok{background:#EAF6EC;border-color:#9BD0A6;color:#143A1C;} .as-vd-prob{background:#FFF6E5;border-color:#E8C26A;color:#5B3F00;} .as-vd-no{background:#F1F3F8;border-color:#C5CBD9;color:#1D2640;}
.as-vd-l{margin:6px 0 8px 18px;padding:0;font-size:13px;line-height:1.5;} .as-vd-l li{margin-bottom:8px;}
.as-list[hidden]{display:none !important;}
.as-list{display:grid;gap:5px;margin-top:8px;max-height:280px;overflow:auto;}
.as-opt{text-align:left;font:inherit;font-size:12.5px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--cc-dark);cursor:pointer;width:100%;}
.as-opt:hover,.as-opt:focus-visible{background:var(--cc-mist);border-color:var(--cc-navy);} .as-opt b{display:block;font-size:12.5px;overflow-wrap:anywhere;} .as-opt small{display:block;color:var(--text-secondary);font-size:11px;margin-top:2px;}
.as-sel-box{background:var(--cc-mist);border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.5;margin-top:8px;display:flex;gap:8px;justify-content:space-between;align-items:flex-start;}
.as-sel-box b{display:block;overflow-wrap:anywhere;} .as-x{font:inherit;font-size:11.5px;border:0;background:none;color:var(--cc-navy);text-decoration:underline;cursor:pointer;white-space:nowrap;}
.as-hint{font-size:11.5px;color:var(--text-secondary);margin:6px 0 0;line-height:1.5;}
.as-tipo{display:flex;gap:8px;margin-top:8px;} .as-tipo label{flex:1;display:flex;gap:6px;align-items:center;font-size:12.5px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;}
.as-tipo input{accent-color:var(--cc-navy);} .as-tipo label:has(input:checked){border-color:var(--cc-navy);background:var(--cc-mist);font-weight:700;}
.as-monto{display:flex;gap:8px;align-items:center;} .as-monto span{font-size:14px;font-weight:700;color:var(--cc-dark);}
.as-eq{margin-top:8px;font-size:13px;font-weight:700;color:var(--cc-navy);}
.as-chk{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.45;padding:7px 0;border-bottom:1px solid var(--surface-page);cursor:pointer;} .as-chk input{margin-top:3px;accent-color:var(--cc-navy);flex:0 0 auto;}
.as-chk small{display:block;color:var(--text-secondary);font-size:11px;}
details.as-det summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--cc-navy);padding:4px 0;}
.as-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.as-btn{font:inherit;font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:99px;border:1px solid var(--cc-navy);background:#fff;color:var(--cc-navy);cursor:pointer;text-decoration:none;display:inline-flex;gap:6px;align-items:center;}
.as-btn:hover{background:var(--cc-mist);} .as-btn.as-main{background:var(--cc-lime);border-color:var(--cc-lime);color:var(--cc-dark);} .as-btn.as-main:hover{background:var(--cc-navy);border-color:var(--cc-navy);color:#fff;}
.as-empty{border:2px dashed var(--border);border-radius:16px;padding:28px 20px;text-align:center;color:var(--text-secondary);font-size:13px;line-height:1.6;background:#fff;}
.as-reco{border-radius:18px;background:linear-gradient(135deg,#003457 0%,var(--cc-navy) 55%,#00618a 100%);color:#fff;padding:18px 20px;margin-bottom:14px;}
.as-reco .as-eye{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--cc-lime);font-weight:800;}
.as-reco h2{margin:4px 0 6px;font-size:22px;line-height:1.25;color:#fff;} .as-reco p{margin:0;font-size:13px;line-height:1.6;color:#E3EEF9;}
.as-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;}
.as-chip{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35);}
.as-sec{background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:12px;box-shadow:var(--pbi-shadow);}
.as-sec h3{margin:0 0 8px;font-size:13.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--cc-navy);}
.as-sec p{margin:0 0 8px;font-size:13px;line-height:1.6;color:var(--cc-dark);} .as-sec ul{margin:0 0 8px;padding-left:20px;font-size:13px;line-height:1.6;} .as-sec li{margin-bottom:4px;}
.as-cite{font-size:11.5px;color:var(--text-secondary);margin:6px 0 0;line-height:1.6;} .as-cite a{color:var(--cc-navy);} .as-cite b{color:var(--cc-dark);}
.as-steps{counter-reset:p;display:grid;gap:8px;margin:0;padding:0;list-style:none;}
.as-steps li{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;}
.as-steps li::before{counter-increment:p;content:counter(p);width:26px;height:26px;border-radius:50%;background:var(--cc-mist);color:var(--cc-navy);font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;}
.as-steps b{font-size:13px;} .as-steps p{margin:3px 0 0!important;font-size:12.5px!important;color:var(--text-secondary)!important;}
.as-tag{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:99px;margin-left:6px;vertical-align:middle;text-transform:uppercase;letter-spacing:.03em;}
.as-t-obligatorio{background:#E1E9FF;color:#0032A2;} .as-t-recomendado{background:#E3F4D9;color:#2F6B16;} .as-t-descartado{background:#EEF1F5;color:#4A5568;} .as-t-verificar{background:#FFF1D6;color:#8A5A00;} .as-t-previo{background:#EEF1F5;color:#3D5466;}
.as-al{border-radius:12px;padding:10px 14px;margin-bottom:8px;font-size:12.5px;line-height:1.55;border:1px solid;} .as-al b{display:block;margin-bottom:2px;}
.as-al-alto{background:#FDECEA;border-color:#E5A29C;color:#6B1410;} .as-al-medio{background:#FFF6E5;border-color:#E8C26A;color:#5B3F00;} .as-al-info{background:#EAF3FB;border-color:#B7D5EE;color:#0B3A5C;}
.as-al .as-acc{display:block;margin-top:4px;font-weight:700;}
.as-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 10px;}
.as-k{background:var(--surface-page);border-radius:10px;padding:8px 10px;} .as-k .l{font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-secondary);} .as-k .v{font-size:16px;font-weight:800;color:var(--cc-dark);} .as-k .s{font-size:10.5px;color:var(--text-secondary);}
table.as-t{width:100%;border-collapse:collapse;font-size:12px;} table.as-t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-secondary);border-bottom:1px solid var(--border);padding:5px 6px;}
table.as-t td{padding:6px;border-bottom:1px solid var(--surface-page);vertical-align:top;} table.as-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;} table.as-t th.n{text-align:right;}
table.as-t a{color:var(--cc-navy);text-decoration:none;} table.as-t a:hover{text-decoration:underline;}
.as-tw{overflow-x:auto;border:1px solid var(--border);border-radius:10px;}
.as-bar{display:grid;grid-template-columns:130px 1fr 90px;gap:8px;align-items:center;margin:5px 0;font-size:12px;}
.as-bt{height:14px;background:var(--surface-page);border:1px solid var(--border);border-radius:7px;position:relative;overflow:visible;} .as-bf{height:100%;border-radius:7px;} .as-bm{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--cc-dark);}
.as-price{position:relative;height:30px;margin:14px 6px 22px;} .as-pr-line{position:absolute;left:0;right:0;top:13px;height:4px;background:var(--border);border-radius:2px;}
.as-pr-band{position:absolute;top:8px;height:14px;background:#B9D4F5;border-radius:7px;border:1px solid #5B8FD1;} .as-pr-med{position:absolute;top:4px;height:22px;width:3px;background:var(--cc-navy);}
.as-pr-org{position:absolute;top:2px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--cc-pink);border:2px solid #fff;box-shadow:0 0 0 1px var(--cc-pink);top:8px;}
.as-pr-l{position:absolute;top:26px;font-size:10.5px;color:var(--text-secondary);transform:translateX(-50%);white-space:nowrap;}
.as-ref{display:grid;gap:8px;}
.as-mec{border:1px solid var(--border);border-radius:12px;background:#fff;} .as-mec summary{cursor:pointer;padding:10px 14px;font-size:13px;font-weight:700;color:var(--cc-dark);list-style:none;} .as-mec summary::-webkit-details-marker{display:none;}
.as-mec summary::before{content:"▸";color:var(--cc-navy);margin-right:8px;} .as-mec[open] summary::before{content:"▾";}
.as-mec .as-mb{padding:0 14px 12px;font-size:12.5px;line-height:1.55;} .as-mec .as-mb ul{margin:4px 0 6px;padding-left:20px;}
.as-note{font-size:11.5px;color:var(--text-secondary);line-height:1.55;margin:10px 0 0;}
.as-err{color:#B3261E;font-size:13px;padding:10px;}
.as-disc{background:#FFF6E5;border:1px solid #E8C26A;border-radius:12px;padding:10px 14px;font-size:12px;line-height:1.55;color:#5B3F00;margin-bottom:12px;}
.as-load{font-size:12.5px;color:var(--cc-navy);padding:8px 0;}
@media print{ .as-side{max-height:none;overflow:visible;position:static;} header.cc-header,.back-link,.as-noprint,.as-tabs,.as-side .as-card:not(.as-print-sum){display:none!important;} .as-grid{display:block;} .as-reco{-webkit-print-color-adjust:exact;print-color-adjust:exact;} .as-sec,.as-card{box-shadow:none;break-inside:avoid;} body{background:#fff;} }
`;

/* ------------------------------ datos derivados ------------------------------ */
function utmNow(){ const k = S.st.mes || S.utmKeys[S.utmKeys.length - 1]; return S.C.utm[k]; }
function curUtmKey(){ return S.st.mes || S.utmKeys[S.utmKeys.length - 1]; }
function orgRegion(){
  if(!S.org) return 0;
  if(S.st.u){ const u = S.org[4].find(x => x[0] === S.st.u); if(u) return u[2]; }
  return S.org[3] || 0;
}
function regName(r){ return r ? S.O.regs[r] : 'Nacional'; }
function qLab(q){ return (2025 + Math.floor(q / 4)) + ' T' + (q % 4 + 1); }
function histProd(){
  if(!S.od || S.prodIdx == null) return null;
  const row = S.od.hist.find(h => h[0] === S.prodIdx); const utm = S.C.utm[S.utmKeys[S.utmKeys.length - 1]];
  if(!row) return {row: null, noCmUtm: 0, totalUtm: 0, n12: 0, mecs: {}};
  let noCm = 0, tot = 0; const mecs = {};
  row[5].forEach(e => { const u = e[2] * 1000 / utm; tot += u; mecs[e[0]] = (mecs[e[0]] || 0) + u; if(e[0] === 'CA' || e[0] === 'TD' || e[0] === 'CO') noCm += u; });
  return {row, noCmUtm: noCm, totalUtm: tot, n12: row[3], mecs};
}
function fueraCmMM(){
  if(!S.od || S.prodIdx == null) return 0;
  const f = S.od.fcm.find(x => x[0] === S.prodIdx); if(!f) return 0;
  return f[1].reduce((a, e) => a + e[2], 0);
}
function cmVig(id){
  const V = window.AS_CMV && window.AS_CMV.cm; if(!V) return null;
  const e = V[id]; if(!e) return {vigente: false};
  let vig = true; if(e[1]){ const [d, m, a] = e[1].split('-').map(Number); vig = new Date(a, m - 1, d, 23, 59, 59) >= new Date(); }
  return {vigente: vig, nombre: e[0], hasta: e[1], maestra: e[2] === 1, cot: e[3] || '', url: e[4] || ''};
}
function cmInfo(){
  if(S.prodIdx == null) return {cm: false, nombres: [], lista: []};
  const cmv = S.C.cm[S.prodIdx]; if(!cmv) return {cm: false, nombres: [], lista: []};
  const lista = cmv.map(x => { const id = S.C.cmc[x[0]], v = cmVig(id); return {id, n: S.C.cmn[id] || id, mm: x[1], hist: x[2] === 1, v}; });
  const hay = !!(window.AS_CMV);
  const vig = hay ? lista.filter(x => x.v && x.v.vigente) : lista;
  return {cm: hay ? vig.length > 0 : true, nombres: vig.map(x => x.n), lista, soloHist: lista.every(x => x.hist), sinVigente: hay && vig.length === 0, hayVig: hay};
}
function isServicio(){ return S.st.t === 'servicio'; }


/* ------------------------------ ¿está en Convenio Marco? ------------------------------ */
const STOP = new Set(['de','del','la','el','los','las','y','e','o','u','para','por','con','sin','en','a','al','un','una','otros','otras','tipo','servicio','servicios','productos','producto']);
const stem = t => t.length > 4 ? t.replace(/(es|s)$/, '') : t;
function toks(txt){ return norm(txt).split(/\s+/).filter(t => t.length >= 3 && !STOP.has(t)).map(stem); }
function consultaTexto(){
  const out = [];
  if(S.prodIdx != null) out.push(sentence(S.C.n[S.prodIdx]));
  if(S.prodQ && S.prodQ.trim().length >= 3 && (S.prodIdx == null)) out.push(S.prodQ.trim());
  return out.join(' ');
}
function cmVigListado(id){ const v = cmVig(id); return v; }
function buscarCatalogo(q, reg){
  const CT = window.AS_CMCAT; if(!CT || !q) return [];
  if(!S.ctIdx){ S.ctIdx = CT.it.map(it => new Set(toks(it[1] + ' ' + it[2] + ' ' + it[3] + ' ' + it[4]))); }
  const qt = [...new Set(toks(q))]; if(!qt.length) return [];
  const need = qt.length >= 3 ? qt.length - 1 : qt.length, g = {};
  CT.it.forEach((it, i) => { const set = S.ctIdx[i]; let n = 0; qt.forEach(t => { if(set.has(t)) n++; }); if(n >= need && n > 0){ const k = it[0]; (g[k] = g[k] || []).push({it, n}); } });
  return Object.keys(g).map(k => { const lst = g[k].sort((a, b) => b.n - a.n); const id = CT.cms[k][0]; const best = lst[0].it; const rg = best[9].find(r => r[0] === reg);
    return {id, n: lst.length, ej: lst.slice(0, 3).map(x => x.it[1]), tipo: best[2], url: best[10], nProvReg: rg ? rg[1] : 0, pmedReg: rg ? rg[2] : 0, pmed: best[7]}; }).sort((a, b) => b.n - a.n);
}
function veredictoCm(){
  const V = window.AS_CMV, ci = cmInfo(), q = consultaTexto();
  const res = {nivel: 'ninguno', cms: [], q, evid: []};
  if(S.prodIdx == null && !q) return res;
  const reg = orgRegion();
  const add = (id, nivel, motivo, extra) => { const v = cmVig(id) || {}; let e = res.cms.find(x => x.id === id); if(!e){ e = {id, nivel, motivos: [], v, extra: {}}; res.cms.push(e); } if(rank(nivel) > rank(e.nivel)) e.nivel = nivel; e.motivos.push(motivo); Object.assign(e.extra, extra || {}); };
  // a) maestras (Catálogo)
  buscarCatalogo(q, reg).forEach(r => add(r.id, 'catalogo', `En la maestra hay ${r.n} producto(s) que coinciden, por ejemplo: ${r.ej.map(x => sentence(x)).join('; ')}.`, {cat: r}));
  // b) OC
  ci.lista.forEach(x => { if(x.v && x.v.vigente || !V) add(x.id, 'oc', `Se ha comprado este producto por este convenio${x.hist ? ' (solo antes de nov-2025)' : ' en los últimos 12 meses'}.`, {mm: x.mm}); });
  // c) familia ONU
  if(S.prodIdx != null && V){
    const code = S.C.c[S.prodIdx], fam = code.slice(0, 6), vistos = {};
    for(let i = 0; i < S.C.c.length; i++){ if(i === S.prodIdx || !S.C.cm[i] || S.C.c[i].slice(0, 6) !== fam) continue; S.C.cm[i].forEach(x => { const id = S.C.cmc[x[0]]; const v = cmVig(id); if(v && v.vigente && !vistos[id]){ vistos[id] = 1; add(id, 'familia', `Productos de la misma familia (${fam}) se han comprado por este convenio.`); } }); }
  }
  // d) tema (objeto del convenio, palabras clave y código ONU)
  if(V && V.det){
    const qn = ' ' + norm(q) + ' ', code = S.prodIdx != null ? S.C.c[S.prodIdx] : '';
    Object.keys(V.det).forEach(id => { const d = V.det[id], v = cmVig(id); if(!v || !v.vigente) return;
      if(d.ex && d.ex.some(x => qn.includes(' ' + norm(x)))) return;
      const kw = d.kw.find(k => { const kn = norm(k).trim(); return kn.length <= 5 ? qn.includes(' ' + kn + ' ') : qn.includes(' ' + kn); });
      const pre = code && d.onu.find(o => code.startsWith(o));
      if(kw) add(id, 'tema', `Lo que escribiste coincide con "${kw}", materia de este convenio.`);
      else if(pre) add(id, 'tema', `El código ONU ${code} pertenece a una línea que este convenio suele cubrir.`);
    });
  }
  const ord = {catalogo: 4, oc: 3, familia: 2, tema: 1};
  res.cms.sort((a, b) => ord[b.nivel] - ord[a.nivel]);
  res.nivel = res.cms.length ? res.cms[0].nivel : (ci.sinVigente ? 'novigente' : 'no');
  res.sinVigente = ci.sinVigente;
  return res;
}
function rank(n){ return {catalogo: 4, oc: 3, familia: 2, tema: 1}[n] || 0; }
function vereditoHtml(vd, o){
  const V = window.AS_CMV, p = o.principal, u = o.montoUtm;
  if(vd.nivel === 'ninguno') return '<div class="as-vd as-vd-no"><div class="as-vd-h"><span class="as-vd-b">CONVENIO MARCO</span><h3>Indica qué necesitas comprar</h3></div><p>Escribe lo que necesitas en el paso 2 (por ejemplo “papel higiénico” o “notebook”). El Asesor lo cruza con los Convenios Marco y con las compras del Estado, y te dice si está en un convenio o qué procedimiento corresponde.</p></div>';
  const si = ['catalogo', 'oc', 'familia', 'tema'].includes(vd.nivel), alta = vd.nivel === 'catalogo' || vd.nivel === 'oc';
  const principal = vd.cms[0], vp = principal && principal.v || {};
  const cert = alta ? 'Certeza alta' : (si ? 'Certeza media' : 'Certeza media');
  let h = `<div class="as-vd as-vd-${si ? 'ok' : 'no'}"><div class="as-vd-h"><span class="as-vd-b">CONVENIO MARCO: ${si ? 'SÍ' : 'NO'}</span><span class="as-vd-b">${cert}</span><h3>${si ? 'Está en Convenio Marco: ' + esc(vp.nombre || principal.id) : 'No está en ningún Convenio Marco vigente'}</h3></div>`;
  if(si){
    h += '<ul class="as-vd-l">' + vd.cms.slice(0, 3).map(c => { const v = c.v || {};
      return `<li><b>${esc(v.nombre || c.id)}</b> <span class="as-hint">(${esc(c.id)}${v.hasta ? ' · vigente hasta ' + esc(v.hasta) : ''})</span>${v.cot ? `<br>Forma de compra: ${esc(v.cot)}.` : ''}${c.extra.cat ? `<br>${c.extra.cat.nProvReg ? c.extra.cat.nProvReg + ' proveedor(es) en tu región' : 'Sin proveedores informados en tu región'}${c.extra.cat.pmedReg ? ', precio mediano en tienda $' + fmt(c.extra.cat.pmedReg) : ''}.` : ''}<br><span class="as-hint">${esc(c.motivos[0])}</span></li>`; }).join('') + '</ul>';
    h += u > 100
      ? `<p><b>Conclusión:</b> con ${dec(u, 1)} UTM corresponde comprar por Convenio Marco${u > 1000 ? ' mediante Gran Compra' : ''}. Solo puedes salir de él si obtienes directamente condiciones más ventajosas objetivas y demostrables, que debes informar a la Dirección de Compras (DS 661, art. 89).${alta ? '' : ' La coincidencia es por la materia del convenio: si el producto exacto no estuviera en el Catálogo, sigue el procedimiento de más abajo.'}</p>`
      : `<p><b>Conclusión:</b> con ${dec(u, 1)} UTM puedes comprar por Compra Ágil sin pasar por el Catálogo (DS 661, art. 97). Usa el precio del Convenio Marco como tope de referencia: si es menor que las cotizaciones, compra por Convenio Marco.</p>`;
  } else {
    h += `<p>${vd.nivel === 'novigente' ? 'Este producto solo se compró por convenios que ya terminaron o fueron reemplazados.' : 'No coincide con las maestras de productos, con el objeto de los convenios vigentes ni con compras anteriores por Convenio Marco.'}</p>`;
    h += `<p><b>Conclusión:</b> con ${dec(u, 1)} UTM corresponde <b>${esc(p.nom)}</b>. El detalle de cómo se hace y el orden de revisión están más abajo.</p>`;
  }
  const maestras = window.AS_CMCAT ? 'maestras de ' + window.AS_CMCAT.cms.length + ' convenio(s) al ' + esc(window.AS_CMCAT.gen || '') + ', ' : '';
  h += `<p class="as-hint">Cómo lo determiné: ${maestras}objeto y palabras clave de los 18 convenios vigentes y compras de los últimos 12 meses.${V ? ` Si quieres revisarlo tú mismo: <a href="${V.tienda}" target="_blank" rel="noopener">Tienda de Convenio Marco</a>${principal && vp.url ? ` · <a href="${esc(vp.url)}" target="_blank" rel="noopener">tienda de este convenio</a>` : ''} · <a href="${V.eco}" target="_blank" rel="noopener">Economía Circular</a>.` : ''}</p></div>`;
  return h;
}

function compute(){
  const R_ = R(), ci = cmInfo(), h = histProd(), vd = veredictoCm(), cmSi = ['catalogo', 'oc', 'familia', 'tema'].includes(vd.nivel);
  S.vd = vd;
  const dm = S.prodIdx != null && S.segData ? S.segData.dm[orgRegion() + '|' + S.prodIdx] : null;
  const inp = {montoClp: S.st.m, utm: utmNow(), tipo: S.st.t || 'bien', simple: !!S.st.simple, sit: S.st.s || [], cm: cmSi, cmNombres: cmSi ? vd.cms.slice(0, 2).map(c => (c.v && c.v.nombre) || c.id) : [], cmCerteza: (vd.nivel === 'catalogo' || vd.nivel === 'oc') ? 'alta' : 'media',
    sector: S.org ? S.org[2] : '', demanda: dm ? {no: dm[0], mm: dm[1]} : null,
    hist: h ? {noCmUtm: h.noCmUtm, totalUtm: h.totalUtm} : null, fueraCm: fueraCmMM()};
  return R_.recomendar(inp);
}

/* ------------------------------ interfaz base ------------------------------ */
function shell(){
  S.host.innerHTML = `<style>${CSS}</style><div class="as-wrap">
  <div class="as-disc">Orientación basada en la Ley N° 19.886 (texto consolidado de la BCN al 05-02-2026, con las leyes 21.634 y 21.806) y el Reglamento DS N° 661/2024. Cruza esa norma con las órdenes de compra de los últimos 12 meses (nov-2025 a oct-2026). No reemplaza el análisis de cada caso, las instrucciones obligatorias ni las directivas de la Dirección de Compras. El texto de la Ley que revisé figura vigente hasta el 31-10-2026: verifica en la BCN si hay modificaciones posteriores.</div>
  <div class="as-tabs" role="tablist">
    <button class="as-tab" role="tab" data-tab="asesor">Asesor de compra</button>
    <button class="as-tab" role="tab" data-tab="diag">Diagnóstico del organismo</button>
    <button class="as-tab" role="tab" data-tab="guia">Guía de todos los mecanismos</button>
  </div>
  <div id="as-view"></div></div>`;
  S.host.querySelectorAll('.as-tab').forEach(b => b.addEventListener('click', () => { S.st.tab = b.dataset.tab === 'asesor' ? '' : b.dataset.tab; S.tab = b.dataset.tab; syncUrl(); renderTab(); }));
}
function renderTab(){
  S.host.querySelectorAll('.as-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === S.tab ? 'true' : 'false'));
  const v = $('as-view');
  if(S.tab === 'guia'){ v.innerHTML = guiaHtml(); return; }
  if(S.tab === 'diag'){ v.innerHTML = '<div id="as-diag"></div>'; renderDiag(); return; }
  v.innerHTML = `<div class="as-grid"><div class="as-side">
    <div class="as-card" id="as-c1"><h3><span class="as-n">1</span>¿Quién compra?</h3>
      <input class="as-in" id="as-org" type="search" autocomplete="off" placeholder="Nombre del organismo o su código" aria-label="Buscar organismo">
      <div class="as-list" id="as-orgres" hidden></div><div id="as-orgsel"></div></div>
    <div class="as-card" id="as-c2"><h3><span class="as-n">2</span>¿Qué necesitas comprar?</h3>
      <input class="as-in" id="as-prod" type="search" autocomplete="off" placeholder="Ej.: toallas de papel, guardias de seguridad, 14111703" aria-label="Buscar producto o servicio">
      <div class="as-list" id="as-prodres" hidden></div><div id="as-prodsel"></div>
      <div class="as-tipo" role="radiogroup" aria-label="Tipo de contratación"><label><input type="radio" name="as-tipo" value="bien"> Bien</label><label><input type="radio" name="as-tipo" value="servicio"> Servicio</label></div>
      <p class="as-hint">Si no encuentras tu producto, sigue al paso 3: la recomendación por monto y por norma funciona igual, pero sin datos de precios ni de Convenio Marco.</p></div>
    <div class="as-card" id="as-c3"><h3><span class="as-n">3</span>¿Cuánto crees que costará?</h3>
      <label class="as-lab" for="as-monto">Monto total estimado, IVA incluido (pesos)</label>
      <div class="as-monto"><span>$</span><input class="as-in" id="as-monto" inputmode="numeric" autocomplete="off" placeholder="Ej.: 25.000.000"></div>
      <label class="as-lab" for="as-mes">Mes de la UTM</label><select class="as-sel" id="as-mes" style="margin-top:0"></select>
      <div class="as-eq" id="as-eq" aria-live="polite"></div>
      <label class="as-chk"><input type="checkbox" id="as-simple"><span>Es de simple y objetiva especificación<small>Permite reducir los plazos mínimos de publicación en licitaciones (art. 46)</small></span></label></div>
    <div class="as-card" id="as-c4"><h3><span class="as-n">4</span>¿Hay una situación especial?</h3>
      <details class="as-det" id="as-det"><summary id="as-detsum">Ninguna (compra habitual)</summary><div id="as-sits"></div></details>
      <p class="as-hint">Marca solo lo que puedas acreditar. Cada causal exige un acto fundado y publicidad.</p></div>
    <div class="as-card as-print-sum as-noprint"><div class="as-act">
      <button class="as-btn as-main" id="as-copy">Copiar enlace</button><button class="as-btn" id="as-print">Imprimir o guardar en PDF</button><button class="as-btn" id="as-reset">Limpiar</button></div>
      <p class="as-hint" id="as-copied" aria-live="polite">El enlace guarda tus respuestas: quien lo abra ve el mismo análisis.</p></div>
  </div><div id="as-res"></div></div>`;
  wire();
  paintSelections();
  update();
}
function wire(){
  const oi = $('as-org'), pi = $('as-prod');
  oi.addEventListener('input', () => { S.orgQ = oi.value; searchOrg(); });
  oi.addEventListener('focus', () => { if(oi.value) searchOrg(); });
  pi.addEventListener('input', () => { S.prodQ = pi.value; searchProd(); clearTimeout(S.tq); S.tq = setTimeout(update, 250); });
  pi.addEventListener('focus', () => { if(pi.value) searchProd(); });
  S.host.querySelectorAll('input[name=as-tipo]').forEach(r => r.addEventListener('change', () => { S.st.t = r.value; syncUrl(); update(); }));
  const mi = $('as-monto');
  mi.addEventListener('input', () => { const d = mi.value.replace(/\D/g, ''); S.st.m = d ? Number(d) : 0; update(); });
  mi.addEventListener('blur', () => { mi.value = S.st.m ? fmt(S.st.m) : ''; });
  const sel = $('as-mes'); sel.innerHTML = S.utmKeys.slice().reverse().map(k => `<option value="${k}">${monthLab(k)} · UTM $${fmt(S.C.utm[k])}</option>`).join('');
  sel.value = curUtmKey(); sel.addEventListener('change', () => { S.st.mes = sel.value; update(); });
  $('as-simple').addEventListener('change', e => { S.st.simple = e.target.checked; update(); });
  const box = $('as-sits'); box.innerHTML = R().SITUACIONES.map(s => `<label class="as-chk"><input type="checkbox" value="${s.k}"><span>${esc(s.t)}<small>${esc(s.ar)}</small></span></label>`).join('');
  box.querySelectorAll('input').forEach(c => c.addEventListener('change', () => { S.st.s = [...box.querySelectorAll('input:checked')].map(x => x.value); update(); }));
  $('as-copy').addEventListener('click', copyLink); $('as-print').addEventListener('click', () => window.print());
  $('as-reset').addEventListener('click', () => { S.st = {s: []}; S.org = null; S.od = null; S.orgIdx = null; S.prodIdx = null; S.segData = null; $('as-org').value = ''; $('as-prod').value = ''; $('as-monto').value = ''; paintSelections(); update(); });
}
function monthLab(k){ const [a, m] = k.split('-'); return ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][Number(m) - 1] + ' ' + a; }
function copyLink(){
  const url = shareUrl(), msg = $('as-copied');
  const ok = () => { msg.textContent = 'Enlace copiado. Quien lo abra verá el mismo análisis.'; };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => { msg.textContent = url; });
  else { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); ok(); }catch(e){ msg.textContent = url; } t.remove(); }
}
function paintSelections(){
  // organismo
  const os = $('as-orgsel');
  if(S.orgIdx != null){
    const o = S.O.o[S.orgIdx], opts = o[4].map(u => `<option value="${esc(u[0])}"${S.st.u === u[0] ? ' selected' : ''}>${esc(u[1])} · ${esc(regName(u[2]))}</option>`).join('');
    os.innerHTML = `<div class="as-sel-box"><div><b>${esc(o[1])}</b>${esc(o[2] === 'null' ? 'Sin sector' : o[2])} · ${fmt(o[6])} OC en 12 meses · región principal: ${esc(regName(o[3]))}</div><button class="as-x" id="as-orgx">cambiar</button></div>
      ${o[4].length > 1 ? `<label class="as-lab" for="as-unit">Unidad de compra (define la región)</label><select class="as-sel" id="as-unit" style="margin-top:0"><option value="">Todas · usar región principal</option>${opts}</select>` : ''}
      ${S.loadingOrg ? '<div class="as-load">Cargando las compras del organismo…</div>' : ''}`;
    $('as-orgx').addEventListener('click', () => { S.orgIdx = null; S.org = null; S.od = null; S.st.o = null; S.st.u = null; S.segData = null; $('as-org').value = ''; paintSelections(); update(); $('as-org').focus(); });
    const un = $('as-unit'); if(un) un.addEventListener('change', () => { S.st.u = un.value || null; update(); loadSegFor(); });
    $('as-org').style.display = 'none';
  } else { os.innerHTML = ''; $('as-org').style.display = ''; }
  // producto
  const ps = $('as-prodsel');
  if(S.prodIdx != null){
    const i = S.prodIdx;
    ps.innerHTML = `<div class="as-sel-box"><div><b>${esc(sentence(S.C.n[i]))}</b>${esc(S.C.rubros[S.C.r[i]] || '')} · código ${esc(S.C.c[i])}${S.C.cm[i] ? ' · en Convenio Marco' : ''}</div><button class="as-x" id="as-prodx">cambiar</button></div>`;
    $('as-prodx').addEventListener('click', () => { S.prodIdx = null; S.st.p = null; S.segData = null; $('as-prod').value = ''; paintSelections(); update(); $('as-prod').focus(); });
    $('as-prod').style.display = 'none';
  } else { ps.innerHTML = ''; $('as-prod').style.display = ''; }
  S.host.querySelectorAll('input[name=as-tipo]').forEach(r => r.checked = (S.st.t || 'bien') === r.value);
  if(S.st.m) $('as-monto').value = fmt(S.st.m);
  $('as-mes').value = curUtmKey(); $('as-simple').checked = !!S.st.simple;
  const box = $('as-sits'); box.querySelectorAll('input').forEach(c => c.checked = (S.st.s || []).includes(c.value));
  $('as-c1').classList.toggle('as-done', S.orgIdx != null); $('as-c2').classList.toggle('as-done', S.prodIdx != null); $('as-c3').classList.toggle('as-done', !!S.st.m);
}
function searchOrg(){
  const q = norm(S.orgQ).trim(), box = $('as-orgres');
  if(q.length < 2){ box.hidden = true; return; }
  const toks = q.split(/\s+/); const res = [];
  for(let i = 0; i < S.orgNorm.length; i++){ const s = S.orgNorm[i]; if(toks.every(t => s.includes(t))) res.push(i); }
  res.sort((a, b) => S.O.o[b][6] - S.O.o[a][6]);
  box.hidden = false;
  box.innerHTML = res.slice(0, 12).map(i => { const o = S.O.o[i]; return `<button class="as-opt" data-i="${i}"><b>${esc(o[1])}</b><small>${esc(o[2] === 'null' ? 'Sin sector' : o[2])} · ${fmt(o[6])} OC en 12 meses · ${esc(regName(o[3]))}</small></button>`; }).join('') || '<p class="as-hint">Sin resultados. Prueba con otra parte del nombre.</p>';
  box.querySelectorAll('.as-opt').forEach(b => b.addEventListener('click', () => chooseOrg(Number(b.dataset.i))));
}
function searchProd(){
  const q = norm(S.prodQ).trim(), box = $('as-prodres');
  if(q.length < 2){ box.hidden = true; return; }
  const toks = q.split(/\s+/); const res = [];
  for(let i = 0; i < S.prodNorm.length; i++){ const s = S.prodNorm[i]; if(toks.every(t => s.includes(t))) res.push(i); }
  res.sort((a, b) => (S.C.cm[b] ? 1e9 : 0) + S.C.v[b] - ((S.C.cm[a] ? 1e9 : 0) + S.C.v[a]));
  box.hidden = false;
  box.innerHTML = res.slice(0, 14).map(i => `<button class="as-opt" data-i="${i}"><b>${esc(sentence(S.C.n[i]))}</b><small>${esc(S.C.rubros[S.C.r[i]] || '')} · ${esc(S.C.c[i])} · ${mm(S.C.v[i])} en 12 meses${S.C.cm[i] ? ' · en Convenio Marco' : ''}</small></button>`).join('') || '<p class="as-hint">Sin resultados. Prueba con una palabra más corta o el código ONU.</p>';
  box.querySelectorAll('.as-opt').forEach(b => b.addEventListener('click', () => chooseProd(Number(b.dataset.i))));
}
function chooseOrg(i){
  S.orgIdx = i; S.org = S.O.o[i]; S.st.o = S.org[0]; S.st.u = null; S.od = null; $('as-orgres').hidden = true; S.loadingOrg = true; paintSelections(); update();
  loadOrg(i).then(d => { if(S.orgIdx !== i) return; S.od = d; S.loadingOrg = false; paintSelections(); loadSegFor(); update(); }).catch(e => { S.loadingOrg = false; paintSelections(); const r = $('as-res'); if(r) r.innerHTML = '<div class="as-err">' + esc(e.message) + '</div>'; });
}
function chooseProd(i){
  S.prodIdx = i; S.st.p = S.C.c[i]; S.st.t = Number(S.C.c[i].slice(0, 2)) >= SERV_CODE ? 'servicio' : 'bien'; $('as-prodres').hidden = true; paintSelections(); loadSegFor(); update();
}
function loadSegFor(){
  if(S.prodIdx == null) { S.segData = null; return Promise.resolve(); }
  const code = S.C.c[S.prodIdx], idx = S.prodIdx;
  return loadSeg(code).then(d => { if(S.prodIdx === idx){ S.segData = d; update(); } });
}

/* ------------------------------ resultado ------------------------------ */
function citas(arts){
  if(!arts || !arts.length) return '';
  const g = {}; arts.forEach(a => { (g[a.n] = g[a.n] || []).push(a.t); });
  return '<p class="as-cite"><b>Fundamento:</b> ' + Object.keys(g).map(n => {
    const url = n === 'Ley 19.886' ? R().URL_LEY : (n === 'DS 661/2024' ? R().URL_DS : '');
    const nm = n === 'DS 661/2024' ? 'Reglamento DS 661/2024' : n;
    return (url ? `<a href="${url}" target="_blank" rel="noopener">${esc(nm)}</a>` : esc(nm)) + ': ' + esc(g[n].join('; '));
  }).join('. ') + '.</p>';
}
function update(){
  const res = $('as-res'); if(!res) return;
  const eq = $('as-eq');
  const utm = utmNow();
  if(eq) eq.textContent = S.st.m ? '= ' + dec(S.st.m / utm, 1) + ' UTM · ' + R().TRAMOS[R().tramoUtm(S.st.m / utm)].nom : '';
  const n = (S.st.s || []).length, ds = $('as-detsum'); if(ds) ds.textContent = n ? n + ' situación(es) marcada(s)' : 'Ninguna (compra habitual)';
  syncUrl();
  if(S.orgIdx == null || !S.st.m){
    res.innerHTML = `<div class="as-empty"><b>Tu recomendación aparecerá aquí.</b><br>Elige el organismo (paso 1) e indica el monto estimado (paso 3). Mientras más completes, más datos reales verás: precios de referencia, Convenios Marco, proveedores de tu región y compras de otros organismos que podrías consolidar.</div>`;
    return;
  }
  const out = compute(); S.out = out;
  res.innerHTML = resultHtml(out);
  wireResult();
}
function wireResult(){ }
function resultHtml(o){
  const p = o.principal, st = S.st, h = histProd(), ci = cmInfo();
  const prodName = S.prodIdx != null ? sentence(S.C.n[S.prodIdx]) : 'tu compra';
  let html = `<div class="as-reco" role="status"><div class="as-eye">Recomendación para ${esc(S.org[1])}</div><h2>${esc(p.nom)}</h2><p>${esc(p.porque)}</p>
    <div class="as-chips"><span class="as-chip">${esc(prodName)}</span><span class="as-chip">${dec(o.montoUtm, 1)} UTM</span><span class="as-chip">${esc(o.tramoNom)}</span><span class="as-chip">${esc(regName(orgRegion()))}</span></div></div>`;
  html += vereditoHtml(S.vd || veredictoCm(), o);
  if(S.od == null) html += '<div class="as-load">Cargando las compras del organismo para cruzarlas con la recomendación…</div>';
  // alertas
  if(o.alertas.length) html += '<div class="as-sec"><h3>Alertas</h3>' + o.alertas.map(a => `<div class="as-al as-al-${a.nivel}"><b>${a.nivel === 'alto' ? 'Atención' : (a.nivel === 'medio' ? 'Revisa' : 'Para tener presente')}</b>${esc(a.t)}${a.accion ? `<span class="as-acc">${esc(a.accion)}</span>` : ''}${a.arts ? citas(a.arts).replace('as-cite', 'as-cite" style="color:inherit;opacity:.85') : ''}</div>`).join('') + '</div>';
  // detalle del procedimiento
  html += `<div class="as-sec"><h3>Cómo se hace: ${esc(p.nom)}</h3>`;
  if(p.mec && p.mec.cuando) html += `<p>${esc(p.mec.cuando)}</p>`;
  if(p.plazos.length) html += '<p><b>Plazos</b></p><ul>' + p.plazos.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
  if(p.req.length) html += '<p><b>Qué debes cumplir</b></p><ul>' + p.req.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
  if(p.vigencia) html += `<p class="as-cite">${esc(p.vigencia)}</p>`;
  html += citas(p.arts) + '</div>';
  // orden de verificación
  html += '<div class="as-sec"><h3>Orden de la decisión</h3><ol class="as-steps">' + o.pasos.map(x => `<li><div><b>${esc(x.titulo)}</b><span class="as-tag as-t-${x.estado}">${x.estado}</span><p>${esc(x.texto)}</p>${citas(x.arts)}</div></li>`).join('') + '</ol></div>';
  // datos del organismo
  html += datosOrg(o, h, ci);
  // precios
  html += preciosHtml(h);
  // convenio marco
  if(ci.lista.length) html += cmHtml(ci);
  // proveedores región
  html += provHtml();
  // demanda
  html += demandaHtml();
  // PAC y presupuesto
  html += pacHtml();
  // alternativas
  if(o.alternativas.length) html += '<div class="as-sec"><h3>Otras vías que puedes evaluar</h3>' + o.alternativas.map(a => `<p><b>${esc(a.nom)}.</b> ${esc(a.texto)}</p>${citas(a.arts)}`).join('') + '</div>';
  html += `<p class="as-note">Generado el ${new Date().toLocaleDateString('es-CL')} con datos de órdenes de compra al ${monthLab(S.C.w12[1].toString().slice(0, 4) + '-' + S.C.w12[1].toString().slice(4))}. ${esc(R().TEXTO_BASE)}</p>`;
  return html;
}
function datosOrg(o, h, ci){
  if(S.od == null) return '';
  let html = '<div class="as-sec"><h3>Lo que muestran las compras de tu organismo</h3>';
  if(S.prodIdx == null){
    html += '<p>Elige un producto en el paso 2 para ver cuánto ha comprado tu organismo de lo mismo, por qué mecanismos y con qué riesgo de fragmentación.</p>';
  } else if(!h.row){
    html += '<p>En los datos no aparecen compras de este producto por parte de tu organismo. No hay historial que pueda fragmentarse.</p>';
  } else {
    const r = h.row, mecs = Object.keys(h.mecs).sort((a, b) => h.mecs[b] - h.mecs[a]);
    html += `<div class="as-kpis"><div class="as-k"><div class="l">Compras 12 meses</div><div class="v">${fmt(r[3])}</div><div class="s">órdenes de compra</div></div>
      <div class="as-k"><div class="l">Gasto 12 meses</div><div class="v">${dec(h.totalUtm, 0)} UTM</div><div class="s">${mm(Math.round(r[4] / 1000))}</div></div>
      <div class="as-k"><div class="l">Por mecanismos simples</div><div class="v">${dec(h.noCmUtm, 0)} UTM</div><div class="s">Compra Ágil, Trato Directo, Cotización</div></div>
      <div class="as-k"><div class="l">Compras en 22 meses</div><div class="v">${fmt(r[1])}</div><div class="s">${mm(Math.round(r[2] / 1000))}</div></div></div>`;
    if(mecs.length) html += '<p><b>Cómo lo compraste en 12 meses</b></p>' + mecs.map(m => `<div class="as-bar"><span>${MEC_NOM[m] || m}</span><div class="as-bt"><div class="as-bf" style="width:${Math.max(2, 100 * h.mecs[m] / h.totalUtm)}%;background:${MEC_COL[m] || '#6B7A88'}"></div></div><span class="n">${dec(h.mecs[m], 0)} UTM</span></div>`).join('');
    const fr = S.od.frag.filter(f => f[0] === S.prodIdx);
    if(fr.length) html += '<p style="margin-top:10px"><b>Trimestres con posible fragmentación en este producto</b></p><div class="as-tw"><table class="as-t"><tr><th>Trimestre</th><th class="n">Compras</th><th class="n">Suma (UTM)</th><th>Mecanismos</th></tr>' + fr.map(f => `<tr><td>${qLab(f[1])}</td><td class="n">${f[2]}</td><td class="n">${fmt(f[3])}</td><td>${esc(f[4].match(/../g).map(x => MEC_NOM[x] || x).join(', '))}</td></tr>`).join('') + '</table></div><p class="as-hint">Criterio de revisión: tres o más compras en un trimestre por Compra Ágil, Trato Directo o Cotización que juntas superan 100 UTM. Es una señal para revisar, no una conclusión de infracción.' + '</p>' + citas([R().MEC_BY.CA.arts[1]].map(() => ({n: 'DS 661/2024', t: 'art. 16'})));
    const fc = S.od.fcm.find(x => x[0] === S.prodIdx);
    if(fc && ci.cm) html += `<p style="margin-top:10px"><b>Compras fuera de Convenio Marco:</b> ${fc[1].map(e => (MEC_NOM[e[0]] || e[0]) + ' ' + e[1] + ' OC (' + mm(e[2]) + ')').join('; ')}.</p>`;
  }
  // perfil rápido de trato directo del organismo
  const td = S.od.mix.TD; if(td){
    const tot = Object.values(S.od.mix).reduce((a, x) => a + x[1], 0), sh = tot ? td[1] / tot : 0;
    const b = S.O.bench[S.org[2]]; const bsh = b ? b[2] : null;
    html += `<p style="margin-top:10px"><b>Trato Directo en tu organismo:</b> ${fmt(td[0])} OC por ${mm(td[1])}, ${dec(100 * sh, 1)} % del monto transado${bsh != null ? ` (mediana de organismos del sector ${esc(S.org[2])}: ${dec(100 * bsh, 1)} %)` : ''}. Revisa el detalle por causal en la pestaña Diagnóstico.</p>`;
  }
  return html + '</div>';
}
function preciosHtml(h){
  if(S.prodIdx == null) return '';
  const pp = S.C.p[S.prodIdx]; if(!pp || !pp.length) return '';
  let html = '<div class="as-sec"><h3>Precio de referencia</h3><p>Precio unitario neto pagado por todos los organismos en compras que no son Convenio Marco (últimos 12 meses). La banda azul cubre del percentil 25 al 75 y la marca oscura es la mediana.</p>';
  pp.forEach(x => {
    const um = S.C.ums[x[0]], p25 = x[2], p50 = x[3], p75 = x[4];
    let orgp = null;
    if(h && h.row && h.row[6] && h.row[6][0] === x[0]){ const z = h.row[6]; const ratio = z[1] / p50; if(ratio > .05 && ratio < 20) orgp = {v: z[1], n: z[3], ratio}; }
    const lo = Math.min(p25, orgp ? orgp.v : p25) * .6, hi = Math.max(p75, orgp ? orgp.v : p75) * 1.25;
    const pos = v => Math.max(0, Math.min(100, 100 * (v - lo) / (hi - lo)));
    html += `<p><b>Por ${esc(um)}</b> · ${fmt(x[1])} compras · mediana ${clp(p50)}, rango central ${clp(p25)} a ${clp(p75)}</p>
      <div class="as-price" aria-hidden="true"><div class="as-pr-line"></div><div class="as-pr-band" style="left:${pos(p25)}%;width:${pos(p75) - pos(p25)}%"></div><div class="as-pr-med" style="left:${pos(p50)}%"></div>${orgp ? `<div class="as-pr-org" style="left:${pos(orgp.v)}%"></div>` : ''}
      <span class="as-pr-l" style="left:${pos(p25)}%">${clp(p25)}</span><span class="as-pr-l" style="left:${Math.min(96, pos(p75))}%">${clp(p75)}</span></div>`;
    if(orgp) html += `<p>Tu organismo pagó en promedio <b>${clp(Math.round(orgp.v))}</b> por ${esc(um)} en ${orgp.n} compras: ${orgp.ratio > 1.25 ? Math.round((orgp.ratio - 1) * 100) + ' % sobre la mediana nacional' : (orgp.ratio < .8 ? Math.round((1 - orgp.ratio) * 100) + ' % bajo la mediana nacional' : 'cerca de la mediana nacional')} (marca rosada). Es un promedio ponderado: un par de compras grandes puede distorsionarlo.</p>`;
  });
  return html + '<p class="as-hint">Referencia para negociar y para fundar el presupuesto estimado (DS 661, art. 41 N° 3: precios conforme al mercado). La unidad de medida declarada por los compradores varía; compara solo dentro de la misma unidad.</p></div>';
}
function cmHtml(ci){
  const est = x => !ci.hayVig ? '' : (x.v && x.v.vigente ? `<br><span class="as-hint">Vigente hasta ${esc(x.v.hasta)} · ${esc(x.id)}${x.v.cot ? '<br>Forma de compra: ' + esc(x.v.cot) : ''}</span>` : (x.v && x.v.hasta ? `<br><span class="as-hint">Vigencia indicada en la ficha: ${esc(x.v.hasta)} (ya pasó; revisa si fue prorrogada) · ${esc(x.id)}</span>` : `<br><span class="as-hint">No figura entre los 18 convenios vigentes (probablemente reemplazado) · ${esc(x.id)}</span>`));
  const aviso = ci.sinVigente ? '<div class="as-al as-al-medio" style="margin:8px 0"><b>Revisa</b>Este producto se compró por Convenios Marco que ya no figuran vigentes, por lo que no corresponde esa vía.</div>' : '';
  return `<div class="as-sec"><h3>Convenios Marco en que se ha comprado este producto</h3>${aviso}<div class="as-tw"><table class="as-t"><tr><th>Convenio Marco</th><th class="n">Monto 12 meses</th></tr>${ci.lista.map(x => `<tr><td>${esc(x.n)}${est(x)}</td><td class="n">${x.hist ? 'solo antes de nov-2025' : mm(x.mm)}</td></tr>`).join('')}</table></div>
   <p class="as-hint">Esta lista se deduce de las órdenes de compra: indica dónde ya se compró el producto, no el Catálogo completo. La vigencia viene de las fichas de <a href="${window.AS_CMV ? window.AS_CMV.fuente : '#'}" target="_blank" rel="noopener">Convenios Marco vigentes</a>. Norma: DS 661, arts. 29 y 89.</p></div>`;
}
function provHtml(){
  if(S.prodIdx == null) return '';
  const reg = orgRegion(), key = reg + '|' + S.prodIdx;
  if(S.segData === undefined || (S.segData == null && S.prodIdx != null && !S.segTried)) { }
  const P = S.segData;
  if(!P) return '<div class="as-sec"><h3>Proveedores de tu región</h3><div class="as-load">Cargando proveedores…</div></div>';
  const rp = P.rp[key], nat = P.rp['0|' + S.prodIdx];
  let html = `<div class="as-sec"><h3>Proveedores de ${esc(regName(reg))} que han vendido este producto</h3>`;
  const tabla = (lst) => '<div class="as-tw"><table class="as-t"><tr><th>Proveedor</th><th class="n">OC</th><th class="n">Vendido 12 meses</th></tr>' + lst.map(x => { const pv = P.pl[x[0]]; return `<tr><td>${pv[0] ? `<a href="#proveedores=${encodeURIComponent(pv[0])}" target="_blank" rel="noopener">${esc(pv[1])}</a>` : esc(pv[1])}<br><span class="as-hint">${esc(pv[0])}</span></td><td class="n">${fmt(x[1])}</td><td class="n">${mm(x[2])}</td></tr>`; }).join('') + '</table></div>';
  if(rp){
    html += `<p>${fmt(rp[0])} proveedores con ventas de este producto a organismos de la región (se muestran los ${rp.length - 1} con mayor venta). La región se toma de la unidad de compra que elegiste.</p>` + tabla(rp.slice(1));
    html += `<p class="as-hint">Con 100 UTM o menos, la Compra Ágil debe dirigirse primero a empresas de menor tamaño y proveedores locales (Ley art. 56; DS art. 97). Un proveedor local es una empresa de menor tamaño con domicilio principal en la región donde se entrega el bien o servicio (DS art. 4 N° 25). El tamaño de cada empresa está en su ficha.</p>`;
  } else html += '<p>No hay proveedores de esta región con ventas registradas de este producto en 12 meses.</p>';
  if(reg && nat) html += '<details class="as-det"><summary>Ver proveedores a nivel nacional</summary>' + tabla(nat.slice(1)) + '</details>';
  return html + '</div>';
}
function demandaHtml(){
  if(S.prodIdx == null || !S.segData) return '';
  const reg = orgRegion(), d = S.segData.dm[reg + '|' + S.prodIdx];
  if(!d) return '<div class="as-sec"><h3>Demanda que podrías consolidar</h3><p>No encontré otros organismos de tu región con compras relevantes de este producto en 12 meses.</p></div>';
  const lst = d.slice(3).filter(x => x[0] >= 0 && S.O.o[x[0]] && S.O.o[x[0]][0] !== (S.org && S.org[0]));
  return `<div class="as-sec"><h3>Demanda que podrías consolidar</h3><p>${fmt(d[0])} organismos de ${esc(regName(reg))} compraron este producto por ${mm(d[1])} en los últimos 12 meses.${d[2] ? ' Ya existen compras coordinadas de este producto por ' + mm(d[2]) + '.' : ''} Agregar demanda mediante Compra Coordinada puede mejorar el precio y reducir los costos de transacción de todos.</p>
   <div class="as-tw"><table class="as-t"><tr><th>Organismo</th><th class="n">OC</th><th class="n">Monto 12 meses</th></tr>${lst.map(x => `<tr><td>${esc(S.O.o[x[0]][1])}</td><td class="n">${fmt(x[1])}</td><td class="n">${mm(x[2])}</td></tr>`).join('')}</table></div>
   ${citas([{n: 'DS 661/2024', t: 'art. 4 N° 7 (definición de Compra Coordinada); art. 35 (representación por la Dirección de Compras)'}])}</div>`;
}
function pacHtml(){
  const nm = S.org ? S.org[1] : '';
  return `<div class="as-sec"><h3>Antes de publicar: PAC y presupuesto</h3><ul>
    <li>Confirma que la compra esté en tu Plan Anual de Compras; si no está, fundamenta el motivo en el acto administrativo (DS 661, arts. 27 y 166; Ley art. 12).</li>
    <li>Revisa el PAC de tu organismo en este sitio: <a href="#pac26=${encodeURIComponent(nm)}" target="_blank" rel="noopener">Buscador PAC 2026</a> y la comparación con el <a href="#presupuesto" target="_blank" rel="noopener">presupuesto 2026</a>.</li>
    <li>Obtén el certificado de disponibilidad presupuestaria antes de adjudicar (DS 661, art. 5).</li></ul></div>`;
}

/* ------------------------------ diagnóstico del organismo ------------------------------ */
function renderDiag(){
  const el = $('as-diag'); if(!el) return;
  if(S.orgIdx == null){
    el.innerHTML = `<div class="as-card" style="max-width:640px"><h3><span class="as-n">1</span>Elige un organismo</h3><input class="as-in" id="as-org2" type="search" autocomplete="off" placeholder="Nombre del organismo" aria-label="Buscar organismo"><div class="as-list" id="as-orgres2" hidden></div><p class="as-hint">El diagnóstico resume cómo compra el organismo: mezcla de mecanismos frente a su sector, tratos directos y sus causales, fragmentación y compras fuera de Convenio Marco.</p></div>`;
    const i2 = $('as-org2'), b2 = $('as-orgres2');
    i2.addEventListener('input', () => {
      const q = norm(i2.value).trim(); if(q.length < 2){ b2.hidden = true; return; } const toks = q.split(/\s+/); const res = [];
      for(let i = 0; i < S.orgNorm.length; i++){ if(toks.every(t => S.orgNorm[i].includes(t))) res.push(i); }
      res.sort((a, b) => S.O.o[b][6] - S.O.o[a][6]); b2.hidden = false;
      b2.innerHTML = res.slice(0, 12).map(i => `<button class="as-opt" data-i="${i}"><b>${esc(S.O.o[i][1])}</b><small>${esc(S.O.o[i][2] === 'null' ? 'Sin sector' : S.O.o[i][2])} · ${fmt(S.O.o[i][6])} OC en 12 meses</small></button>`).join('');
      b2.querySelectorAll('.as-opt').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.i); S.orgIdx = i; S.org = S.O.o[i]; S.st.o = S.org[0]; S.st.u = null; S.od = null; syncUrl(); el.innerHTML = '<div class="as-load">Cargando…</div>'; loadOrg(i).then(d => { S.od = d; renderDiag(); }); }));
    });
    return;
  }
  if(!S.od){ el.innerHTML = '<div class="as-load">Cargando el diagnóstico…</div>'; loadOrg(S.orgIdx).then(d => { S.od = d; renderDiag(); }).catch(e => { el.innerHTML = '<div class="as-err">' + esc(e.message) + '</div>'; }); return; }
  const o = S.org, d = S.od, MEC = S.O.mecs;
  const totMM = Object.values(d.mix).reduce((a, x) => a + x[1], 0), totN = Object.values(d.mix).reduce((a, x) => a + x[0], 0);
  const b = S.O.bench[o[2]];
  const barras = MEC.filter(m => d.mix[m]).map(m => { const sh = totMM ? d.mix[m][1] / totMM : 0, bi = MEC.indexOf(m), bs = b ? b[bi] : null;
    return `<div class="as-bar"><span>${MEC_NOM[m]}</span><div class="as-bt"><div class="as-bf" style="width:${Math.max(1, 100 * sh)}%;background:${MEC_COL[m]}"></div>${bs != null ? `<div class="as-bm" style="left:${100 * bs}%" title="Mediana del sector"></div>` : ''}</div><span class="n">${dec(100 * sh, 1)} %${bs != null ? ' · sector ' + dec(100 * bs, 1) + ' %' : ''}</span></div>`; }).join('');
  const tdn = d.td.map(x => `<tr><td>${esc(S.O.causales[x[0]])}</td><td class="n">${fmt(x[1])}</td><td class="n">${mm(x[2])}</td><td class="n">${x[3] ? fmt(x[3]) : '—'}</td></tr>`).join('');
  const tdp = d.tdp.map(x => `<tr><td>${x[0] ? `<a href="#proveedores=${encodeURIComponent(x[0])}" target="_blank" rel="noopener">${esc(x[1])}</a>` : esc(x[1])}<br><span class="as-hint">${esc(x[0])}</span></td><td class="n">${fmt(x[2])}</td><td class="n">${mm(x[3])}</td></tr>`).join('');
  const frag = d.frag.slice(0, 12).map(f => `<tr><td>${esc(sentence(S.C.n[f[0]]))}</td><td>${qLab(f[1])}</td><td class="n">${f[2]}</td><td class="n">${fmt(f[3])}</td></tr>`).join('');
  const fcm = d.fcm.slice(0, 12).map(f => { const tot = f[1].reduce((a, e) => a + e[2], 0); return `<tr><td>${esc(sentence(S.C.n[f[0]]))}</td><td>${f[1].map(e => (MEC_NOM[e[0]] || e[0]) + ' ' + e[1]).join(', ')}</td><td class="n">${mm(tot)}</td></tr>`; }).join('');
  el.innerHTML = `<div class="as-sec"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h3 style="margin:0">Diagnóstico de compras</h3><div style="font-size:18px;font-weight:800;color:var(--cc-dark);margin:4px 0">${esc(o[1])}</div><div class="as-hint">${esc(o[2] === 'null' ? 'Sin sector' : o[2])} · región principal ${esc(regName(o[3]))} · órdenes de compra de nov-2025 a oct-2026</div></div><div class="as-act as-noprint"><button class="as-btn" id="as-dx">Cambiar organismo</button><button class="as-btn as-main" id="as-dcopy">Copiar enlace</button><button class="as-btn" id="as-dprint">Imprimir o PDF</button></div></div></div>
   <div class="as-kpis"><div class="as-k"><div class="l">Órdenes de compra</div><div class="v">${fmt(totN)}</div></div><div class="as-k"><div class="l">Monto transado</div><div class="v">${mm(totMM)}</div></div>
   <div class="as-k"><div class="l">Trato Directo</div><div class="v">${dec(totMM && d.mix.TD ? 100 * d.mix.TD[1] / totMM : 0, 1)} %</div><div class="s">del monto${b ? ' · sector ' + dec(100 * b[2], 1) + ' %' : ''}</div></div>
   <div class="as-k"><div class="l">Convenio Marco</div><div class="v">${dec(totMM && d.mix.CM ? 100 * d.mix.CM[1] / totMM : 0, 1)} %</div><div class="s">del monto${b ? ' · sector ' + dec(100 * b[0], 1) + ' %' : ''}</div></div>
   <div class="as-k"><div class="l">Fuera de Convenio Marco</div><div class="v">${mm(d.fcmt)}</div><div class="s">en productos con cobertura</div></div></div>
   <div class="as-sec"><h3>Mezcla de mecanismos frente a su sector</h3>${barras}<p class="as-hint">La línea oscura es la mediana de ${b ? b[8] : 0} organismos del mismo sector con 100 o más OC. Alejarse del sector no es una falta por sí mismo: sirve para saber dónde mirar.</p></div>
   <div class="as-sec"><h3>Trato Directo por causal</h3>${tdn ? `<div class="as-tw"><table class="as-t"><tr><th>Causal registrada</th><th class="n">OC</th><th class="n">Monto</th><th class="n">≥ 1.000 UTM</th></tr>${tdn}</table></div><p class="as-hint">Sobre 1.000 UTM, las causales de proveedor único, urgencia y confianza exigen informe técnico (DS 661, art. 80) y las de proveedor único y confianza además publicar la intención de contratar con 5 días hábiles (art. 78). La causal de confianza solo procede sobre 1.000 UTM (art. 75).</p>` : '<p>Sin tratos directos en el período.</p>'}
   ${tdp ? `<p style="margin-top:12px"><b>Proveedores con mayor monto por Trato Directo</b></p><div class="as-tw"><table class="as-t"><tr><th>Proveedor</th><th class="n">OC</th><th class="n">Monto</th></tr>${tdp}</table></div>` : ''}${citas([{n: 'Ley 19.886', t: 'art. 8 bis'}, {n: 'DS 661/2024', t: 'arts. 71 a 84'}])}</div>
   <div class="as-sec"><h3>Posible fragmentación</h3>${frag ? `<div class="as-tw"><table class="as-t"><tr><th>Producto</th><th>Trimestre</th><th class="n">Compras</th><th class="n">Suma (UTM)</th></tr>${frag}</table></div><p class="as-hint">Productos con tres o más compras en un trimestre por Compra Ágil, Trato Directo o Cotización que, sumadas, superan 100 UTM. Es una alerta para revisar la planificación; no presume infracción.</p>` : '<p>No se detectan trimestres con este patrón.</p>'}${citas([{n: 'DS 661/2024', t: 'art. 16'}])}</div>
   <div class="as-sec"><h3>Compras fuera de Convenio Marco en productos con cobertura</h3>${fcm ? `<div class="as-tw"><table class="as-t"><tr><th>Producto</th><th>Mecanismo</th><th class="n">Monto 12 meses</th></tr>${fcm}</table></div><p class="as-hint">Si hubo condiciones más ventajosas objetivas, debes tener los antecedentes e informar a la Dirección de Compras (DS 661, art. 92). La cobertura se deduce de las órdenes de compra de Convenio Marco; verifica contra el Catálogo vigente.</p>` : '<p>Sin compras de este tipo.</p>'}${citas([{n: 'Ley 19.886', t: 'art. 30 letra d)'}, {n: 'DS 661/2024', t: 'arts. 29, 89, 92'}])}</div>
   <p class="as-note">${esc(R().TEXTO_BASE)}</p>`;
  $('as-dx').addEventListener('click', () => { S.orgIdx = null; S.org = null; S.od = null; S.st.o = null; S.st.u = null; syncUrl(); renderDiag(); });
  $('as-dcopy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(shareUrl()); $('as-dcopy').textContent = 'Enlace copiado'; });
  $('as-dprint').addEventListener('click', () => window.print());
}

/* ------------------------------ guía de mecanismos ------------------------------ */
function guiaHtml(){
  const R_ = R();
  const tabla = `<div class="as-sec"><h3>Resumen por monto</h3><div class="as-tw"><table class="as-t"><tr><th>Monto estimado</th><th>Camino habitual</th><th>Plazo mínimo de publicación</th><th>Garantías y otros</th></tr>
   <tr><td>Hasta 100 UTM</td><td>Compra Ágil; o Convenio Marco si conviene (el Catálogo es obligatorio solo sobre 100 UTM)</td><td>Licitación pública: 5 días corridos</td><td>OC aceptada basta como contrato</td></tr>
   <tr><td>Más de 100 y hasta 1.000 UTM</td><td>Convenio Marco si está en el Catálogo; si no, licitación pública</td><td>10 días corridos (5 si es de simple y objetiva especificación)</td><td>Contrato u OC según las bases; garantía de fiel cumplimiento facultativa y fundada</td></tr>
   <tr><td>Más de 1.000 y hasta 5.000 UTM</td><td>Gran Compra por Convenio Marco; si no, licitación pública</td><td>20 días corridos (10 si es simple); Gran Compra: 10 días hábiles</td><td>Comisión de 3 funcionarios; garantía de fiel cumplimiento 5 %</td></tr>
   <tr><td>Más de 5.000 UTM</td><td>Licitación pública (o Gran Compra si hay Convenio Marco)</td><td>30 días corridos</td><td>Análisis técnico y económico previo; garantía de seriedad excepcional hasta 3 %; fiel cumplimiento 5 %; contrato tras 10 días hábiles</td></tr></table></div>
   ${citas([{n: 'DS 661/2024', t: 'arts. 31, 36, 46, 52, 54, 89, 90, 97, 117, 119, 121'}])}</div>`;
  const mecs = '<div class="as-sec"><h3>Todos los mecanismos</h3><div class="as-ref">' + R_.MECANISMOS.map(m => `<details class="as-mec"><summary>${esc(m.nom)}</summary><div class="as-mb"><p>${esc(m.cuando)}</p><ul>${m.req.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${m.vig ? `<p class="as-cite">${esc(m.vig)}</p>` : ''}${citas(m.arts)}</div></details>`).join('') + '</div></div>';
  const causales = '<div class="as-sec"><h3>Causales de Trato Directo</h3><div class="as-ref">' + Object.keys(R_.CAUSALES).map(k => { const c = R_.CAUSALES[k]; return `<details class="as-mec"><summary>${esc(c.t)} · art. ${esc(c.n)} del reglamento</summary><div class="as-mb"><ul>${c.reglas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${citas([{n: 'Ley 19.886', t: 'art. 8 bis ' + c.ley}, {n: 'DS 661/2024', t: c.arts.join('; ')}])}</div></details>`; }).join('') + '</div></div>';
  let vig = '';
  if(window.AS_CMV){
    const rows = Object.keys(window.AS_CMV.cm).map(id => { const v = cmVig(id); return `<tr><td>${esc(window.AS_CMV.cm[id][0])}</td><td>${esc(id)}</td><td>${v && v.vigente ? esc(v.hasta) : esc(window.AS_CMV.cm[id][1]) + ' (fecha ya pasada; revisa si fue prorrogada)'}</td><td>${window.AS_CMV.cm[id][2] === 1 ? 'Sí' : 'No'}</td><td>${esc(window.AS_CMV.cm[id][3] || '')}</td></tr>`; }).join('');
    vig = `<div class="as-sec"><h3>Convenios Marco vigentes</h3><div class="as-tw"><table class="as-t"><tr><th>Convenio Marco</th><th>ID de licitación</th><th>Vigencia hasta</th><th>Maestra de productos</th><th>Forma de compra</th></tr>${rows}</table></div><p class="as-hint">Fichas al ${esc(window.AS_CMV.gen)}. Detalle de cada convenio (objeto, cotizador, reajuste, transacciones): <a href="${window.AS_CMV.fuente}" target="_blank" rel="noopener">Fichas de Convenios Marco vigentes</a>. El Catálogo oficial es la referencia final (DS 661, art. 29).</p></div>`;
  }
  return tabla + vig + mecs + causales + `<p class="as-note">${esc(R_.TEXTO_BASE)}</p>`;
}

/* ------------------------------ arranque ------------------------------ */
function init(host, payload){
  S.host = host; S.st = decState(payload); S.tab = S.st.tab || 'asesor';
  host.innerHTML = '<div class="as-load">Cargando el Asesor de compras…</div>';
  return ensure().then(() => {
    shell();
    const st = S.st;
    if(st.p && S.prodByCode[st.p] != null){ S.prodIdx = S.prodByCode[st.p]; }
    if(!st.mes || !S.C.utm[st.mes]) st.mes = null;
    const ready = [];
    if(st.o && S.orgByCode[st.o] != null){ S.orgIdx = S.orgByCode[st.o]; S.org = S.O.o[S.orgIdx]; S.loadingOrg = true; ready.push(loadOrg(S.orgIdx).then(d => { S.od = d; S.loadingOrg = false; })); }
    renderTab();
    return Promise.all(ready).then(() => { if(S.tab === 'asesor'){ paintSelections(); return loadSegFor(); } else renderDiag(); }).then(() => { if(S.tab === 'asesor') update(); });
  }).catch(e => { host.innerHTML = '<div class="as-err">' + esc(e.message) + '</div>'; });
}
window.AsesorCompras = {init};
})();
