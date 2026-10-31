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
const ver = () => (typeof DATA !== 'undefined' && DATA.generado) ? '?v=' + DATA.generado + '-r4' : '';
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar ' + src + '. Si abriste solo el archivo HTML, deja la carpeta "data" junto a él.')); }; document.head.appendChild(s); }); }
const R = () => window.AsesorReglas;

/* ------------------------------ estado y enlace ------------------------------ */
function encState(st){
  const a = [];
  if(st.o) a.push('o.' + st.o);
  if(st.u) a.push('u.' + st.u);
  if(st.r != null) a.push('r.' + st.r);
  const ls = (st.l || []).filter(l => l.p || l.q || l.m || l.n || l.pu);
  if(ls.length) a.push('l.' + ls.map(l => [l.p || '', encodeURIComponent((l.q || '').replace(/[*!~+]/g, ' ').trim()), l.t === 'servicio' ? 's' : (l.t === 'bien' ? 'b' : ''), l.n || '', l.pu || '', l.m || '', encodeURIComponent(l.um || '')].join('*')).join('!'));
  if(st.mes) a.push('f.' + st.mes);
  if(st.simple) a.push('e.1');
  if(st.nd) a.push('d.' + st.nd);
  if(st.s && st.s.length) a.push('s.' + st.s.join('+'));
  if(st.tab && st.tab !== 'asesor') a.push('v.' + st.tab);
  return a.join('~');
}
function decState(txt){
  const st = {s: [], l: []};
  String(txt || '').split('~').forEach(kv => {
    const i = kv.indexOf('.'); if(i < 1) return; const k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
    if(k === 'o') st.o = v; else if(k === 'u') st.u = v; else if(k === 'r'){ const rr = Number(v); if(Number.isInteger(rr) && rr >= 0 && rr <= 16) st.r = rr; } else if(k === 'p') st.p = v; else if(k === 't') st.t = v === 'servicio' ? 'servicio' : 'bien';
    else if(k === 'm') st.m = Math.max(0, Math.round(Number(v) || 0)); else if(k === 'f') st.mes = v; else if(k === 'e') st.simple = true; else if(k === 'd' && /^\d{4}-\d{2}-\d{2}$/.test(v)) st.nd = v;
    else if(k === 's') st.s = v.split('+').filter(Boolean); else if(k === 'v') st.tab = v;
    else if(k === 'l') st.l = v.split('!').slice(0, 1).map(x => { const f = x.split('*'); const num = y => Math.max(0, Math.round(Number(y) || 0)); return newLine({p: f[0] || '', q: decodeURIComponent(f[1] || ''), t: f[2] === 's' ? 'servicio' : (f[2] === 'b' ? 'bien' : ''), n: num(f[3]), pu: num(f[4]), m: num(f[5]), um: decodeURIComponent(f[6] || '')}); });
  });
  if(!st.l.length) st.l = [newLine({p: st.p || '', t: st.t || '', m: st.m || 0})];
  return st;
}
/* ------------------------------ líneas del proceso de compra ------------------------------ */
let LSEQ = 0;
function newLine(o){ return Object.assign({id: ++LSEQ, p: '', q: '', t: '', n: 0, pu: 0, m: 0, um: ''}, o || {}); }
/* Unidades de medida: las que declaran los compradores en el catálogo. Primero las más usadas según el tipo. */
const UM_TOP_B = ['unidad','caja','paquete','kilogramo','litro','metro lineal','metro cuadrado','metro cúbico','par','kit','juego','pack','resma','rollo','bolsa','bidón','galón','botella','frasco','saco','docena','tonelada'];
const UM_TOP_S = ['mes','hora','día','semana','quincena','año','mes/hombre','hora/hombre','día/hombre'];
const lineUm = l => l.um || (lineTipo(l) === 'servicio' ? 'mes' : 'unidad');
function umOptions(l){
  const all = (S.C.ums || []).filter(u => u !== 'unidad no definida'), cur = lineUm(l), serv = lineTipo(l) === 'servicio';
  const top = (serv ? UM_TOP_S : UM_TOP_B).filter(u => all.includes(u)), rest = all.filter(u => !top.includes(u)).sort((a, b) => a.localeCompare(b, 'es'));
  const o = u => `<option value="${esc(u)}"${u === cur ? ' selected' : ''}>${esc(u.charAt(0).toUpperCase() + u.slice(1))}</option>`;
  return `<optgroup label="Más usadas">${top.map(o).join('')}</optgroup><optgroup label="Otras unidades">${rest.map(o).join('')}</optgroup>`;
}
const lineTotal = l => (l.n && l.pu) ? Math.round(l.n * l.pu) : (l.m || 0);
function procTotal(){ return S.st.l.reduce((a, l) => a + lineTotal(l), 0); }
function autoTipo(code){ const sg = Number(String(code || '').slice(0, 2)); return sg >= SERV_CODE && sg <= 94 ? 'servicio' : 'bien'; }
function lineTipo(l){ return l.t || (l.p ? autoTipo(l.p) : 'bien'); }
function lineName(l){ const i = l.p ? S.prodByCode[l.p] : null; return i != null ? sentence(S.C.n[i]) : (l.q || ''); }
function activeLine(){ return S.st.l[S.li] || S.st.l[0]; }
function recalc(){ S.st.m = procTotal(); }
function activate(i){
  S.li = Math.max(0, Math.min(i, S.st.l.length - 1)); const l = activeLine();
  S.prodIdx = (l.p && S.prodByCode[l.p] != null) ? S.prodByCode[l.p] : null; S.prodQ = l.q || '';
  S.st.p = l.p || null; S.st.t = lineTipo(l); S.segData = null; recalc();
}
function withLine(l, fn){
  const sv = {pi: S.prodIdx, pq: S.prodQ, t: S.st.t, p: S.st.p};
  S.prodIdx = (l.p && S.prodByCode[l.p] != null) ? S.prodByCode[l.p] : null; S.prodQ = l.q || ''; S.st.t = lineTipo(l); S.st.p = l.p || null;
  try{ return fn(); } finally { S.prodIdx = sv.pi; S.prodQ = sv.pq; S.st.t = sv.t; S.st.p = sv.p; }
}
function shareUrl(){ return location.origin + location.pathname + location.search + '#asesor=' + encState(S.st); }
function syncUrl(){ try{ history.replaceState(null, '', '#asesor=' + encState(S.st)); }catch(e){} }

/* ------------------------------ carga de datos ------------------------------ */
function ensure(){
  if(S.ready) return S.ready;
  S.ready = Promise.all([loadScript(AB + 'cat.js' + ver()), loadScript(AB + 'org.js' + ver()), loadScript(AB + 'reglas.js' + ver()), loadScript(AB + 'cmvig.js' + ver()).catch(() => null).then(() => (window.AS_CMV && window.AS_CMV.cmcat) ? loadScript(AB + 'cmcat.js' + ver()).catch(() => null) : null)]).then(() => {
    loadScript(AB + 'pres.js' + ver()).then(() => { S.pres = window.AS_PRES || null; S.presTried = true; if(S.orgIdx != null) update(); }).catch(() => { S.presTried = true; });
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
function loadPac(i){
  window.AS_PAC = window.AS_PAC || {};
  if(window.AS_PAC[i]) return Promise.resolve(window.AS_PAC[i]);
  return loadScript(AB + 'pac/pac_' + i + '.js' + ver()).then(() => window.AS_PAC[i] || null).catch(() => null);
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
.as-rtabs{margin:16px 0 12px;gap:2px 4px;}
.as-rtab{font:inherit;font-size:13px;font-weight:700;padding:9px 14px;border:0;border-bottom:3px solid transparent;background:none;color:var(--text-secondary);cursor:pointer;text-align:left;}
.as-rtab[aria-selected=true]{color:var(--cc-navy);border-bottom-color:var(--cc-navy);} .as-rtab:hover{color:var(--cc-navy);}
.as-rtab .as-bdg{display:inline-block;min-width:18px;padding:0 6px;margin-left:6px;border-radius:9px;background:#B3261E;color:#fff;font-size:11px;line-height:18px;text-align:center;}
.as-pan[hidden]{display:none;}
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
.as-cmb{margin:10px 0 6px;padding:10px 12px;border-left:3px solid var(--cc-navy);background:rgba(0,70,119,.05);border-radius:0 10px 10px 0;} .as-cmb h4{margin:0 0 6px;font-size:13.5px;} .as-cmb p{margin:6px 0;font-size:13px;line-height:1.55;} .as-cmb-l{display:flex;flex-wrap:wrap;gap:8px;} .as-cmb td.n,.as-cmb th.n{text-align:right;} .as-cmb td:nth-child(2){white-space:nowrap;}
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
.as-ln{border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:8px;background:var(--surface-card,#fff);} .as-ln.as-act{border-color:var(--cc-navy);box-shadow:0 0 0 2px rgba(20,60,120,.12);}
.as-ln-h{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;} .as-ln-n{flex:1;text-align:left;border:0;background:none;padding:0;font:inherit;cursor:pointer;display:flex;gap:8px;align-items:flex-start;color:inherit;}
.as-ln-n b{display:block;font-size:13px;overflow-wrap:anywhere;} .as-ln-n small{display:block;font-size:11.5px;color:var(--text-secondary);font-weight:400;}
.as-ln-k{flex:none;width:20px;height:20px;border-radius:99px;background:var(--cc-navy);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;}
.as-ln-f{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px;} .as-ln-f label{font-size:11px;color:var(--text-secondary);font-weight:600;display:flex;flex-direction:column;gap:3px;} .as-ln-f .as-in,.as-ln-f .as-sel{margin-top:0;}
.as-ln-f .as-span2{grid-column:1/-1;} .as-ln-f .as-in[readonly]{background:var(--cc-mist);} .as-ln-ht{margin:6px 0 0;}
.as-tot{display:flex;flex-direction:column;gap:2px;font-size:12.5px;} .as-tot b{font-size:20px;color:var(--cc-dark);font-variant-numeric:tabular-nums;} .as-tot small{color:var(--text-secondary);} .as-tot .as-warn{color:#9a5b00;font-weight:600;}
.as-fin{margin:8px 0 0;} .as-dist{margin:10px 0 4px;} .as-pj-h td{background:var(--cc-mist);}
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
.as-op{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--border);} .as-op:first-of-type{border-top:0;} .as-op-n{flex:0 0 74px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--cc-navy);padding-top:2px;} .as-op-b{flex:1;min-width:0;} .as-op-b p{margin:4px 0 6px;} .as-op-s{margin:2px 0 6px!important;} .as-op-s li.as-off{opacity:.7;text-decoration-color:#8a94a6;} .as-op-s li.as-off b{text-decoration:line-through;} .as-op-prev .as-op-n{color:#3D5466;}
.as-mes{display:inline-block;margin:0 4px 3px 0;padding:2px 7px;border-radius:999px;background:#E1E9FF;color:#0032A2;font-size:11.5px;white-space:nowrap;} .as-mes-p{background:#EEF1F5;color:#5A6678;} .as-mes-ok{background:#E3F4E6;color:#14532D;} .as-pk-sum{background:#EAF6EC;border:1px solid #9BD0A6;color:#143A1C;border-radius:12px;padding:10px 14px;margin:10px 0;font-size:13px;line-height:1.55;}
.as-sec{background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:12px;box-shadow:var(--pbi-shadow);}
.as-sec h3{margin:0 0 8px;font-size:13.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--cc-navy);}
.as-sec p{margin:0 0 8px;font-size:13px;line-height:1.6;color:var(--cc-dark);} .as-sec ul{margin:0 0 8px;padding-left:20px;font-size:13px;line-height:1.6;} .as-sec li{margin-bottom:4px;}
.as-cite{font-size:11.5px;color:var(--text-secondary);margin:6px 0 0;line-height:1.6;} .as-cite a{color:var(--cc-navy);} .as-cite b{color:var(--cc-dark);}
.as-steps{counter-reset:p;display:grid;gap:8px;margin:0;padding:0;list-style:none;}
.as-steps li{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:#fff;}
.as-steps li::before{counter-increment:p;content:counter(p);width:26px;height:26px;border-radius:50%;background:var(--cc-mist);color:var(--cc-navy);font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;}
.as-steps b{font-size:13px;} .as-steps p{margin:3px 0 0!important;font-size:12.5px!important;color:var(--text-secondary)!important;}
.as-tag{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:99px;margin-left:6px;vertical-align:middle;text-transform:uppercase;letter-spacing:.03em;}
.as-t-obligatorio{background:#E1E9FF;color:#0032A2;} .as-t-recomendado{background:#E3F4D9;color:#2F6B16;} .as-t-descartado{background:#EEF1F5;color:#4A5568;} .as-t-verificar{background:#FFF1D6;color:#8A5A00;} .as-t-previo{background:#EEF1F5;color:#3D5466;} .as-t-no-aplica{background:#EEF1F5;color:#4A5568;}
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
@media print{ .as-pan[hidden]{display:block!important;} .as-rtabs{display:none!important;} .as-side{max-height:none;overflow:visible;position:static;} header.cc-header,.back-link,.as-noprint,.as-tabs,.as-side .as-card:not(.as-print-sum){display:none!important;} .as-grid{display:block;} .as-reco{-webkit-print-color-adjust:exact;print-color-adjust:exact;} .as-sec,.as-card{box-shadow:none;break-inside:avoid;} body{background:#fff;} }
`;

/* ------------------------------ datos derivados ------------------------------ */
function utmNow(){ const k = S.st.mes || S.utmKeys[S.utmKeys.length - 1]; return S.C.utm[k]; }
function curUtmKey(){ return S.st.mes || S.utmKeys[S.utmKeys.length - 1]; }
function orgRegion(){
  if(!S.org) return 0;
  if(S.st.r != null) return S.st.r;
  if(S.st.u){ const u = S.org[4].find(x => x[0] === S.st.u); if(u) return u[2]; }
  return S.org[3] || 0;
}
function regName(r){ return r ? S.O.regs[r] : 'Nacional'; }
const regEn = r => r ? regName(r) : 'todo el país';
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
function buscarCatalogo(q, reg, parcial){
  const CT = window.AS_CMCAT; if(!CT || !q) return [];
  if(!S.ctIdx){ S.ctIdx = CT.it.map(it => new Set(toks(it[1] + ' ' + it[2] + ' ' + it[3] + ' ' + it[4]))); S.ctHead = CT.it.map(it => new Set(toks(it[1]).slice(0, 3))); }
  const qt = [...new Set(toks(q))]; if(!qt.length) return [];
  const need = parcial ? 1 : (qt.length >= 3 ? qt.length - 1 : qt.length), g = {};
  CT.it.forEach((it, i) => { const set = S.ctIdx[i]; let n = 0; qt.forEach(t => { if(set.has(t)) n++; }); if(n >= need && n > 0 && (parcial ? S.ctHead[i].has(qt[0]) : qt.some(t => S.ctHead[i].has(t)))){ const k = it[0]; (g[k] = g[k] || []).push({it, n, i}); } });
  return Object.keys(g).map(k => { const lst = g[k].sort((a, b) => b.n - a.n); const id = CT.cms[k][0]; const best = lst[0].it; const enReg = lst.filter(x => x.it[9] === 0 || ((x.it[9] >> reg) & 1)).length; const pr = CT.pc[k] && (CT.pc[k][reg] || CT.pc[k][99]);
    const ps = lst.map(x => x.it[7]).filter(x => x).sort((a, b) => a - b);
    return {id, k: Number(k), ix: lst.map(x => x.i), n: lst.length, enReg, nProvReg: pr ? pr.length : 0, ej: lst.slice(0, 3).map(x => x.it[1]), tipo: best[2], pmin: ps[0] || 0, pmed: ps.length ? ps[Math.floor(ps.length / 2)] : 0, pmax: ps[ps.length - 1] || 0}; }).sort((a, b) => b.n - a.n);
}
function veredictoCm(){
  const V = window.AS_CMV, ci = cmInfo(), q = consultaTexto();
  const res = {nivel: 'ninguno', cms: [], q, evid: []};
  if(S.prodIdx == null && !q) return res;
  const reg = orgRegion();
  const add = (id, nivel, motivo, extra) => { const v = cmVig(id) || {}; let e = res.cms.find(x => x.id === id); if(!e){ e = {id, nivel, motivos: [], v, extra: {}}; res.cms.push(e); } if(rank(nivel) > rank(e.nivel)) e.nivel = nivel; e.motivos.push(motivo); Object.assign(e.extra, extra || {}); };
  // a) maestras (Catálogo)
  const exa = buscarCatalogo(q, reg);
  if(!exa.length && toks(q).length === 2) buscarCatalogo(q, reg, true).forEach(r => add(r.id, 'tema', `En la maestra hay ${r.n} producto(s) del mismo tipo base (por ejemplo: ${r.ej.map(x => sentence(x)).join('; ')}), aunque no coinciden con toda la descripción que escribiste.`, {cat: r}));
  exa.forEach(r => add(r.id, 'catalogo', `En la maestra hay ${r.n} producto(s) que coinciden, por ejemplo: ${r.ej.map(x => sentence(x)).join('; ')}.`, {cat: r}));
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
      const kw = d.kw.find(k => { const kn = norm(k).trim(); return kn.length <= 5 ? (qn.includes(' ' + kn + ' ') || qn.includes(' ' + kn + 's ') || qn.includes(' ' + kn + 'es ')) : qn.includes(' ' + kn); });
      const pre = code && d.onu.find(o => code.startsWith(o));
      if(kw) add(id, 'tema', `Lo que escribiste coincide con "${kw}", materia de este convenio.`, {kw: 1});
      else if(pre) add(id, 'tema', `El código ONU ${code} pertenece a una línea que este convenio suele cubrir.`);
    });
  }
  const ord = {catalogo: 4, oc: 3, tema: 2, familia: 1};
  res.cms.sort((a, b) => (ord[b.nivel] - ord[a.nivel]) || ((b.extra.kw ? 1 : 0) - (a.extra.kw ? 1 : 0)) || ((b.extra.cat ? b.extra.cat.n : 0) - (a.extra.cat ? a.extra.cat.n : 0)));
  res.nivel = res.cms.length ? res.cms[0].nivel : (ci.sinVigente ? 'novigente' : 'no');
  res.sinVigente = ci.sinVigente;
  return res;
}
function rank(n){ return {catalogo: 4, oc: 3, tema: 2, familia: 1}[n] || 0; }
/* Proveedores del convenio en la región de la unidad de compra (o del organismo), con el plazo de entrega que fijan las bases. */
function ensureCmProv(){
  if(window.AS_CMPROV || S.cmprovLoading || S.cmprovTried) return;
  S.cmprovLoading = true;
  loadScript(AB + 'cmprov.js' + ver()).catch(() => null).then(() => { S.cmprovLoading = false; S.cmprovTried = true; update(); });
}
function unidadTxt(){
  if(S.st.r != null) return 'la región elegida (' + regName(S.st.r) + ')';
  if(S.org && S.st.u){ const u = S.org[4].find(x => x[0] === S.st.u); if(u) return 'la unidad de compra «' + u[1] + '» (' + regName(u[2]) + ')'; }
  return 'tu organismo (' + regName(orgRegion()) + ')';
}
function cmProveedores(c, reg){
  const CT = window.AS_CMCAT, PV = window.AS_CMPROV, cat = c.extra && c.extra.cat; if(!CT || !cat) return null;
  if(PV && PV.n === CT.it.length && cat.ix){
    const cnt = {}; let con = 0;
    cat.ix.forEach(i => { const m = PV.r[i]; if(!m) return; const set = new Set(reg ? [].concat(m[reg] || [], m['99'] || []) : [].concat(...Object.values(m))); if(!set.size) return; con++; set.forEach(p => { cnt[p] = (cnt[p] || 0) + 1; }); });
    const lst = Object.keys(cnt).map(p => ({n: cnt[p], rut: CT.pl[p][0], nom: CT.pl[p][1]})).sort((a, b) => (b.n - a.n) || a.nom.localeCompare(b.nom, 'es'));
    return {lst, con, total: cat.ix.length, nivel: 'producto'};
  }
  const pr = CT.pc[cat.k] && (reg ? (CT.pc[cat.k][reg] || []).concat(CT.pc[cat.k][99] || []) : [].concat(...Object.values(CT.pc[cat.k])));
  if(!pr) return {lst: [], con: 0, total: cat.n, nivel: 'convenio'};
  const m = {}; pr.forEach(x => { m[x[0]] = (m[x[0]] || 0) + x[1]; });
  return {lst: Object.keys(m).map(p => ({n: m[p], rut: CT.pl[p][0], nom: CT.pl[p][1]})).sort((a, b) => b.n - a.n), con: cat.enReg, total: cat.n, nivel: 'convenio'};
}
function cmPlazo(id, reg){
  const V = window.AS_CMV, z = V && V.plz && V.plz[id]; if(!z) return null;
  const r = z.r && z.r[reg];
  return {txt: r ? r[0] : z.g, corto: r ? r[1] : z.c, regional: !!r};
}
function cmBloqueHtml(vd){
  const V = window.AS_CMV, c = vd.cms[0]; if(!V || !c) return '';
  const v = c.v || {}, reg = orgRegion(), pz = cmPlazo(c.id, reg), pv = cmProveedores(c, reg);
  let h = `<div class="as-cmb"><h4>Para comprar en ${esc(v.nombre || c.id)}</h4><p class="as-cmb-l">${v.url ? `<a class="as-btn as-main" href="${esc(v.url)}" target="_blank" rel="noopener">Entrar al catálogo del convenio</a>` : ''}<a class="as-btn" href="${esc(V.fuente)}" target="_blank" rel="noopener">Ver la ficha pública (busca ${esc(c.id)})</a></p>`;
  h += `<p class="as-hint">El catálogo es donde se emite la orden de compra. La ficha pública resume objeto, vigencia, cotizador, garantías, multas y plazos de entrega del convenio.</p>`;
  h += pz ? `<p><b>Plazo de entrega que fijan las bases${pz.regional ? ' para ' + esc(regName(reg)) : ''}:</b> ${esc(pz.txt)}</p>` : `<p><b>Plazo de entrega:</b> la ficha no fija un plazo único para todo el convenio; está en las bases y en la oferta de cada proveedor dentro de la Tienda.</p>`;
  if(c.extra.cat){
    h += `<p><b>Proveedores del convenio en ${esc(regEn(reg))}</b>${pv && pv.nivel === 'producto' ? ' que ofrecen productos como el tuyo' : ''}:</p>`;
    if(!pv || (!pv.lst.length && pv.nivel === 'producto' && !window.AS_CMPROV)) h += '<p class="as-hint">Cargando proveedores…</p>';
    else if(!pv.lst.length) h += `<p>En las maestras no hay proveedores que ofrezcan estos productos en ${esc(regEn(reg))}${reg ? ' ni con cobertura nacional' : ''}. Revisa el catálogo: puede que la oferta haya cambiado desde las maestras del ${esc((window.AS_CMCAT || {}).gen || '')}.</p>`;
    else {
      const fila = x => `<tr><td>${esc(x.nom)}</td><td>${esc(x.rut)}</td><td class="n">${fmt(x.n)}</td><td>${pz ? esc(pz.corto) : 'ver bases'}</td></tr>`;
      const cab = '<div class="as-tw"><table class="as-t"><tr><th>Proveedor</th><th>RUT</th><th class="n">Productos que ofrece</th><th>Plazo máximo de entrega</th></tr>';
      h += `<p class="as-hint">${pv.lst.length} proveedor(es) con oferta en ${esc(regEn(reg))}${reg ? ' o con cobertura nacional' : ''}; ${pv.con} de los ${pv.total} producto(s) del Catálogo que coinciden se ofrecen ahí.</p>` + cab + pv.lst.slice(0, 12).map(fila).join('') + '</table></div>';
      if(pv.lst.length > 12) h += `<details class="as-det"><summary>Ver los otros ${pv.lst.length - 12} proveedores</summary>${cab}${pv.lst.slice(12, 150).map(fila).join('')}</table></div>${pv.lst.length > 150 ? '<p class="as-hint">Se muestran los primeros 150; el resto está en el catálogo.</p>' : ''}</details>`;
    }
    h += `<p class="as-hint">Fuente: maestras del Catálogo al ${esc((window.AS_CMCAT || {}).gen || '')}. El plazo es el máximo que exigen las bases del convenio, igual para todos los proveedores; el plazo que ofrece cada uno para un producto aparece en su ficha dentro del catálogo y puede ser menor. Verifica stock y precio ahí antes de emitir la orden de compra.</p>`;
  } else {
    h += `<p><b>Proveedores:</b> este convenio no tiene maestra de productos cargada en el Asesor. Los proveedores adjudicados, su cobertura por región y sus condiciones se ven en el catálogo del convenio.</p>`;
  }
  return h + '</div>';
}
function vereditoHtml(vd, o){
  const V = window.AS_CMV, p = o.principal, u = o.montoUtm;
  if(vd.nivel === 'ninguno') return '<div class="as-vd as-vd-no"><div class="as-vd-h"><span class="as-vd-b">CONVENIO MARCO</span><h3>Indica qué necesitas comprar</h3></div><p>Escribe lo que necesitas en el paso 2 (por ejemplo “papel higiénico” o “notebook”). El Asesor lo cruza con los Convenios Marco y con las compras del Estado, y te dice si está en un convenio o qué procedimiento corresponde.</p></div>';
  const si = ['catalogo', 'oc', 'familia', 'tema'].includes(vd.nivel), alta = vd.nivel === 'catalogo' || vd.nivel === 'oc';
  const principal = vd.cms[0], vp = principal && principal.v || {};
  const cert = alta ? 'Certeza alta' : (si ? 'Certeza media' : 'Certeza media');
  let h = `<div class="as-vd as-vd-${si ? 'ok' : 'no'}"><div class="as-vd-h"><span class="as-vd-b">CONVENIO MARCO: ${si ? 'SÍ' : 'NO'}</span><span class="as-vd-b">${cert}</span><h3>${si ? 'Está en Convenio Marco: ' + esc(vp.nombre || principal.id) : 'No está en ningún Convenio Marco vigente'}</h3></div>`;
  if(si){
    h += '<ul class="as-vd-l">' + vd.cms.slice(0, 3).map(c => { const v = c.v || {};
      return `<li><b>${esc(v.nombre || c.id)}</b> <span class="as-hint">(${esc(c.id)}${v.hasta ? ' · vigente hasta ' + esc(v.hasta) : ''})</span>${v.cot ? `<br>Forma de compra: ${esc(v.cot)}.` : ''}${c.extra.cat ? `<br>${c.extra.cat.n} producto(s) del Catálogo coinciden; ${c.extra.cat.enReg} se ofrecen en tu región (${c.extra.cat.nProvReg} proveedor(es) del convenio con presencia ahí). Precio en tienda: mediana $${fmt(c.extra.cat.pmed)}, rango $${fmt(c.extra.cat.pmin)} a $${fmt(c.extra.cat.pmax)}.` : ''}<br><span class="as-hint">${esc(c.motivos[0])}</span></li>`; }).join('') + '</ul>';
    h += cmBloqueHtml(vd);
    h += u > 100
      ? `<p><b>Conclusión:</b> con ${dec(u, 1)} UTM la primera opción es comprar por Convenio Marco${u > 1000 ? ' mediante Gran Compra' : ''}. Puedes salir de él solo si el producto no está disponible o si obtienes condiciones más ventajosas objetivas y demostrables, que debes informar a la Dirección de Compras (DS 661, arts. 89 y 92). La segunda opción, fuera de convenio, está en el cuadro de abajo.${alta ? '' : ' La coincidencia es por la materia del convenio: si el producto exacto no estuviera en el Catálogo, pasa a la segunda opción.'}</p>`
      : `<p><b>Conclusión:</b> con ${dec(u, 1)} UTM la primera opción es el Convenio Marco; su precio sirve de tope de referencia. La segunda, fuera de convenio, es la Compra Ágil (DS 661, arts. 92 y 97).</p>`;
  } else {
    h += `<p>${vd.nivel === 'novigente' ? 'Este producto solo se compró por convenios que ya terminaron o fueron reemplazados.' : 'No coincide con las maestras de productos, con el objeto de los convenios vigentes ni con compras anteriores por Convenio Marco.'}</p>`;
    h += `<p><b>Conclusión:</b> con ${dec(u, 1)} UTM corresponde <b>${esc(p.nom)}</b>. El detalle de cómo se hace y el orden de revisión están más abajo.</p>`;
  }
  const maestras = window.AS_CMCAT ? 'maestras de ' + window.AS_CMCAT.cms.length + ' convenio(s) al ' + esc(window.AS_CMCAT.gen || '') + ', ' : '';
  h += `<p class="as-hint">Cómo lo determiné: ${maestras}objeto y palabras clave de los 18 convenios vigentes y compras de los últimos 12 meses.${V ? ` Si quieres revisarlo tú mismo: <a href="${V.tienda}" target="_blank" rel="noopener">Tienda de Convenio Marco</a>${principal && vp.url ? ` · <a href="${esc(vp.url)}" target="_blank" rel="noopener">tienda de este convenio</a>` : ''} · <a href="${V.eco}" target="_blank" rel="noopener">Economía Circular</a>.` : ''}</p></div>`;
  return h;
}

function esConsumible(){
  const t = (S.st.t || 'bien') !== 'servicio'; if(!t) return false;
  const code = S.prodIdx != null ? S.C.c[S.prodIdx] : '', seg = code.slice(0, 2);
  if(['10', '11', '12', '14', '15', '47', '50', '51'].includes(seg)) return true;
  return /alimento|vivere|colaci|aseo|papel higi|toalla|detergente|cloro|desinfect|jab[oó]n|insumo|medicament|f[aá]rmaco|combustible|bencina|di[eé]sel|petr[oó]leo|gas licuado|reactivo|mascarilla|guante|pa[ñn]al|cartucho|t[oó]ner|resma|agua purificada|bolsa/i.test(norm(consultaTexto()));
}
function btDetect(){
  const R_ = R(), q = ' ' + norm(consultaTexto()) + ' ', code = S.prodIdx != null ? S.C.c[S.prodIdx] : '', serv = (S.st.t || 'bien') === 'servicio';
  if(!q.trim() && !code) return [];
  return R_.BASES_TIPO.filter(b => {
    if(b.soloBien && serv) return false;
    if(b.kw.some(k => q.includes(' ' + k) )) return true;
    return !!code && b.onu.some(o => code.startsWith(o));
  });
}
function compute(){
  const R_ = R(), ci = cmInfo(), h = histProd(), vd = veredictoCm(), cmSi = ['catalogo', 'oc', 'familia', 'tema'].includes(vd.nivel);
  S.vd = vd;
  const dm = S.prodIdx != null && S.segData ? S.segData.dm[orgRegion() + '|' + S.prodIdx] : null;
  const consumible = esConsumible();
  const noMueble = S.prodIdx != null && S.C.c[S.prodIdx].slice(0, 2) === '95';
  const inp = {bt: btDetect(), consumible, noMueble, montoClp: S.st.m, utm: utmNow(), tipo: S.st.t || 'bien', simple: !!S.st.simple, sit: S.st.s || [], cm: cmSi, cmNombres: cmSi ? vd.cms.slice(0, 2).map(c => (c.v && c.v.nombre) || c.id) : [], cmCerteza: (vd.nivel === 'catalogo' || vd.nivel === 'oc') ? 'alta' : 'media',
    sector: S.org ? S.org[2] : '', demanda: dm ? {no: dm[0], mm: dm[1]} : null,
    hist: h ? {noCmUtm: h.noCmUtm, totalUtm: h.totalUtm} : null, fueraCm: fueraCmMM()};
  S.inp = inp;
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
      <div class="as-list" id="as-orgres" hidden></div><div id="as-orgsel"></div><div id="as-orgfin"></div></div>
    <div class="as-card" id="as-c2"><h3><span class="as-n">2</span>¿Qué necesitas comprar?</h3>
      <input class="as-in" id="as-prod" type="search" autocomplete="off" placeholder="Ej.: toallas de papel, guardias de seguridad, 14111703" aria-label="Buscar producto o servicio">
      <div class="as-list" id="as-prodres" hidden></div>
      <div id="as-lines"></div>
      <p class="as-hint">Escribe el producto o servicio y elígelo de la lista; después indica la unidad de medida, la cantidad y el precio. El tipo (bien o servicio) se asigna solo desde el código del producto. Si no encuentras tu producto, escribe igual una descripción y elige si es bien o servicio: la recomendación por monto y por norma funciona, pero sin datos de precios ni de Convenio Marco.</p></div>
    <div class="as-card" id="as-c3"><h3><span class="as-n">3</span>¿Cuánto costará?</h3>
      <div class="as-tot" id="as-tot" aria-live="polite"></div>
      <div class="as-eq" id="as-eq" aria-live="polite"></div>
      <label class="as-lab" for="as-mes">Mes de la UTM</label><select class="as-sel" id="as-mes" style="margin-top:0"></select>
      <label class="as-lab" for="as-need">¿Para cuándo necesitas la adjudicación? (opcional)</label><input class="as-in" id="as-need" type="date" style="margin-top:0">
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
  pi.addEventListener('input', () => { S.prodQ = pi.value; const l = activeLine(); if(!l.p){ l.q = pi.value; } searchProd(); clearTimeout(S.tq); S.tq = setTimeout(() => { paintLines(); update(); }, 250); });
  pi.addEventListener('focus', () => { if(pi.value) searchProd(); });
  const ln = $('as-lines');
  ln.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if(!b) return; const i = Number(b.dataset.i), a = b.dataset.a, l = S.st.l[i]; if(!l) return;
    if(a === 'sel'){ activate(i); $('as-prod').value = l.p ? '' : (l.q || ''); $('as-prodres').hidden = true; paintLines(); loadSegFor(); update(); }
    else if(a === 'chg'){ activate(i); l.p = ''; l.q = ''; l.t = ''; activate(i); $('as-prod').value = ''; $('as-prodres').hidden = true; paintLines(); update(); $('as-prod').focus(); }
    else if(a === 'del'){ S.st.l.splice(i, 1); if(!S.st.l.length) S.st.l.push(newLine()); activate(Math.min(S.li > i ? S.li - 1 : S.li, S.st.l.length - 1)); $('as-prod').value = activeLine().p ? '' : (activeLine().q || ''); paintLines(); loadSegFor(); update(); }
  });
  ln.addEventListener('change', e => { const t = e.target;
    if(t.classList.contains('as-ln-um')){ S.st.l[Number(t.dataset.i)].um = t.value; paintLines(); update(); return; }
    if(!t.classList.contains('as-ln-t')) return; const l = S.st.l[Number(t.dataset.i)]; l.t = t.value === (l.p ? autoTipo(l.p) : 'bien') && l.p ? '' : t.value; if(Number(t.dataset.i) === S.li) activate(S.li); paintLines(); update(); });
  ln.addEventListener('input', e => {
    const t = e.target, row = t.closest('.as-ln'); if(!row || !/as-ln-(q|pu|m)\b/.test(t.className)) return;
    const l = S.st.l[Number(row.dataset.i)], prev = lineTotal(l), d = t.value.replace(/\D/g, ''), v = d ? Number(d) : 0;
    if(t.classList.contains('as-ln-q')) l.n = v; else if(t.classList.contains('as-ln-pu')) l.pu = v; else { l.m = v; l.n = 0; l.pu = 0; }
    const tin = row.querySelector('.as-ln-m');
    if(l.n && l.pu){ l.m = 0; tin.readOnly = true; tin.value = fmt(lineTotal(l)); }
    else if(!t.classList.contains('as-ln-m')){ l.m = prev; tin.readOnly = false; tin.value = prev ? fmt(prev) : ''; }
    recalc(); paintTot(); update();
  });
  ln.addEventListener('focusout', e => { const t = e.target; if(!/as-ln-(q|pu)\b/.test(t.className)) return; const l = S.st.l[Number(t.closest('.as-ln').dataset.i)]; const v = t.classList.contains('as-ln-q') ? l.n : l.pu; t.value = v ? fmt(v) : ''; });
  const sel = $('as-mes'); sel.innerHTML = S.utmKeys.slice().reverse().map(k => `<option value="${k}">${monthLab(k)} · UTM $${fmt(S.C.utm[k])}</option>`).join('');
  sel.value = curUtmKey(); sel.addEventListener('change', () => { S.st.mes = sel.value; update(); });
  $('as-simple').addEventListener('change', e => { S.st.simple = e.target.checked; update(); });
  $('as-need').addEventListener('change', e => { S.st.nd = e.target.value || null; update(); });
  const box = $('as-sits'); box.innerHTML = R().SITUACIONES.map(s => `<label class="as-chk"><input type="checkbox" value="${s.k}"><span>${esc(s.t)}<small>${esc(s.ar)}</small></span></label>`).join('');
  box.querySelectorAll('input').forEach(c => c.addEventListener('change', () => { S.st.s = [...box.querySelectorAll('input:checked')].map(x => x.value); update(); }));
  $('as-copy').addEventListener('click', copyLink); $('as-print').addEventListener('click', () => window.print());
  $('as-reset').addEventListener('click', () => { S.st = {s: [], l: [newLine()]}; S.li = 0; S.pacLn = {}; S.org = null; S.od = null; S.orgIdx = null; S.prodIdx = null; S.segData = null; $('as-org').value = ''; $('as-prod').value = ''; paintSelections(); update(); });
}
function monthLab(k){ const [a, m] = k.split('-'); return ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][Number(m) - 1] + ' ' + a; }
function copyLink(){
  const url = shareUrl(), msg = $('as-copied');
  const ok = () => { msg.textContent = 'Enlace copiado. Quien lo abra verá el mismo análisis.'; };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => { msg.textContent = url; });
  else { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); ok(); }catch(e){ msg.textContent = url; } t.remove(); }
}
const REG_ORDEN = [15, 1, 2, 3, 4, 5, 13, 6, 7, 16, 8, 9, 14, 10, 11, 12];
function autoRegion(){
  if(!S.org) return 0;
  if(S.st.u){ const u = S.org[4].find(x => x[0] === S.st.u); if(u) return u[2]; }
  return S.org[3] || 0;
}
function regOptions(){
  const cur = orgRegion();
  return `<option value="0"${cur === 0 ? ' selected' : ''}>Todo el país (sin filtrar por región)</option>` + REG_ORDEN.map(r => `<option value="${r}"${cur === r ? ' selected' : ''}>${esc(S.O.regs[r])}</option>`).join('');
}
function paintSelections(){
  // organismo
  const os = $('as-orgsel');
  if(S.orgIdx != null){
    const o = S.O.o[S.orgIdx], opts = o[4].map(u => `<option value="${esc(u[0])}"${S.st.u === u[0] ? ' selected' : ''}>${esc(u[1])} · ${esc(regName(u[2]))}</option>`).join('');
    os.innerHTML = `<div class="as-sel-box"><div><b>${esc(o[1])}</b>${esc(o[2] === 'null' ? 'Sin sector' : o[2])} · ${fmt(o[6])} OC en 12 meses · región principal: ${esc(regName(o[3]))}</div><button class="as-x" id="as-orgx">cambiar</button></div>
      ${o[4].length > 1 ? `<label class="as-lab" for="as-unit">Unidad de compra</label><select class="as-sel" id="as-unit" style="margin-top:0"><option value="">Todas · usar región principal</option>${opts}</select>` : ''}
      <label class="as-lab" for="as-reg">Región donde vas a comprar</label><select class="as-sel" id="as-reg" style="margin-top:0">${regOptions()}</select>
      <p class="as-hint">Parte con la región de la unidad de compra. Si la entrega será en otra, cámbiala: los proveedores y la demanda se filtran de inmediato.</p>
      ${S.loadingOrg ? '<div class="as-load">Cargando las compras del organismo…</div>' : ''}`;
    $('as-orgx').addEventListener('click', () => { S.orgIdx = null; S.org = null; S.od = null; S.st.o = null; S.st.u = null; S.st.r = null; S.segData = null; $('as-org').value = ''; paintSelections(); update(); $('as-org').focus(); });
    const un = $('as-unit'); if(un) un.addEventListener('change', () => { S.st.u = un.value || null; S.st.r = null; $('as-reg').innerHTML = regOptions(); update(); loadSegFor(); });
    $('as-reg').addEventListener('change', e => { const v = Number(e.target.value); S.st.r = v === autoRegion() ? null : v; update(); });
    $('as-org').style.display = 'none';
  } else { os.innerHTML = ''; $('as-org').style.display = ''; }
  // producto y montos (líneas)
  paintLines();
  $('as-mes').value = curUtmKey(); $('as-simple').checked = !!S.st.simple; $('as-need').value = S.st.nd || '';
  const box = $('as-sits'); box.querySelectorAll('input').forEach(c => c.checked = (S.st.s || []).includes(c.value));
  $('as-c1').classList.toggle('as-done', S.orgIdx != null); $('as-c2').classList.toggle('as-done', S.st.l.some(l => l.p || l.q)); $('as-c3').classList.toggle('as-done', !!S.st.m);
}
function paintLines(){
  const box = $('as-lines'); if(!box) return;
  const l = S.st.l[0]; S.li = 0;
  const pi = l.p ? S.prodByCode[l.p] : null, nm = lineName(l), tipo = lineTipo(l), auto = l.p ? autoTipo(l.p) : null, calc = !!(l.n && l.pu), tot = lineTotal(l), um = lineUm(l);
  const meta = pi != null ? `${esc(S.C.rubros[S.C.r[pi]] || '')} · código ${esc(l.p)}${S.C.cm[pi] ? ' · en Convenio Marco' : ''}` : '';
  const nota = auto ? `Tipo asignado según el código ONU ${esc(l.p)}${l.t && l.t !== auto ? '; lo cambiaste a mano' : ''}.` : 'Elige un producto de la lista y el tipo se asigna solo. Mientras tanto, indica si es bien o servicio.';
  box.innerHTML = `<div class="as-ln" data-i="0">
    ${pi != null ? `<div class="as-ln-h"><div class="as-ln-n"><span><b>${esc(nm)}</b>${meta ? `<small>${meta}</small>` : ''}</span></div><button class="as-x" data-a="chg" data-i="0">cambiar</button></div>` : ''}
    <div class="as-ln-f">
      <label>Tipo<select class="as-sel as-ln-t" data-i="0"><option value="bien"${tipo === 'bien' ? ' selected' : ''}>Bien</option><option value="servicio"${tipo === 'servicio' ? ' selected' : ''}>Servicio</option></select></label>
      <label>Unidad de medida<select class="as-sel as-ln-um" data-i="0">${umOptions(l)}</select></label>
      <label>Cantidad (${esc(um)})<input class="as-in as-ln-q" inputmode="numeric" autocomplete="off" placeholder="Ej.: 20" value="${l.n ? fmt(l.n) : ''}"></label>
      <label>Precio por ${esc(um)} con IVA<input class="as-in as-ln-pu" inputmode="numeric" autocomplete="off" placeholder="$" value="${l.pu ? fmt(l.pu) : ''}"></label>
      <label class="as-span2">Total con IVA<input class="as-in as-ln-m" inputmode="numeric" autocomplete="off" placeholder="$"${calc ? ' readonly' : ''} value="${tot ? fmt(tot) : ''}"></label>
    </div><p class="as-hint as-ln-ht">${nota}</p></div>`;
  const pr = $('as-prod'); if(pr){ const show = !l.p; pr.style.display = show ? '' : 'none'; if(!show) $('as-prodres').hidden = true; }
  paintTot();
}
function paintTot(){
  const el = $('as-tot'); if(!el) return; const L = S.st.l, t = procTotal(), sin = L.map((l, i) => (l.p || l.q) && !lineTotal(l) ? i + 1 : 0).filter(Boolean);
  el.innerHTML = t ? `<span>Total del proceso, IVA incluido</span><b>${clp(t)}</b>${L.length > 1 ? `<small>${L.length} líneas sumadas</small>` : ''}` : '<span>Ingresa cantidad y precio unitario, o directamente el total, en el paso 2.</span>';
  if(sin.length && t) el.insertAdjacentHTML('beforeend', `<small class="as-warn">Falta el monto de la línea ${sin.join(', ')}.</small>`);
  const c3 = $('as-c3'); if(c3) c3.classList.toggle('as-done', !!t);
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
/* Sinónimos del lenguaje cotidiano hacia productos del catálogo ONU (el catálogo usa nombres técnicos: "mail" o "casilla" no aparecen). */
const ALIAS = [
  {re: /\b(e-?mails?|mails?|correos? electronic\w*|casillas?|buzon(es)?|cuentas? de correo|correo institucional|webmail|correos?)\b/, cods: ['81112102', '43233501', '81112105', '81112107', '43232108'], nota: 'correo electrónico y casillas'},
  {re: /\b(courier|encomiendas?|carta certificada|cartas certificadas|correos de chile|correspondencia|franqueo|despacho de documentos|mensajeria fisica)\b|\bcorreos?\b/, cods: ['78102203', '78102201', '78102202', '78102204', '78102205'], nota: 'correo postal y courier'},
  {re: /\b(microsoft|office|365|word|excel|powerpoint|google workspace|ofimatica|suite de oficina)\b/, cods: ['43232112', '43232104', '43232110', '43232106', '43233501'], nota: 'ofimática y licencias'},
  {re: /\b(nube|cloud|servidor(es)?|hosting|alojamiento|dominio|pagina web|sitio web)\b/, cods: ['81112105', '81112106', '81112107', '81112103'], nota: 'nube, hosting y sitios web'},
  {re: /\b(teams|zoom|videoconferencias?|reuniones virtuales|webinar)\b/, cods: ['43233502', '43233503'], nota: 'videoconferencia'},
  {re: /\b(wifi|internet|enlace|banda ancha|fibra)\b/, cods: ['81112101'], nota: 'servicio de Internet'},
  {re: /\b(licencias?|software|antivirus)\b/, cods: ['43231512', '81112202'], nota: 'licencias y software'}
];
function searchProd(){
  const q = norm(S.prodQ).trim(), box = $('as-prodres');
  if(q.length < 2){ box.hidden = true; return; }
  const sq = q.split(/\s+/).map(t => stem(t)).filter(t => t.length >= 2);
  if(!S.prodStem){ S.prodStem = S.prodNorm.map(s => s.split(/\s+/).map(stem)); S.codeIdx = {}; S.C.c.forEach((c, i) => { S.codeIdx[c] = i; }); }
  const rank_ = (a, b) => (S.C.cm[b] ? 1e9 : 0) + S.C.v[b] - ((S.C.cm[a] ? 1e9 : 0) + S.C.v[a]);
  // coincidencia: cada palabra escrita es prefijo de alguna palabra del nombre, sin importar plurales
  const hit = i => { const w = S.prodStem[i]; return sq.every(t => w.some(x => x.startsWith(t))); };
  const res = []; for(let i = 0; i < S.prodNorm.length; i++){ if(hit(i)) res.push(i); }
  res.sort(rank_);
  // sinónimos
  const rel = [], notas = []; ALIAS.forEach(al => { if(al.re.test(q)){ notas.push(al.nota); al.cods.forEach(c => { const i = S.codeIdx[c]; if(i != null && !rel.includes(i)) rel.push(i); }); } });
  // si no hay nada, acepta coincidencias parciales (al menos una palabra)
  let par = [];
  if(!res.length && !rel.length && sq.length > 1){ for(let i = 0; i < S.prodNorm.length; i++){ const w = S.prodStem[i]; if(sq.some(t => t.length >= 4 && w.some(x => x.startsWith(t)))) par.push(i); } par.sort(rank_); }
  box.hidden = false;
  const opt = i => `<button class="as-opt" data-i="${i}"><b>${esc(sentence(S.C.n[i]))}</b><small>${esc(S.C.rubros[S.C.r[i]] || '')} · ${esc(S.C.c[i])} · ${mm(S.C.v[i])} en 12 meses${S.C.cm[i] ? ' · en Convenio Marco' : ''}</small></button>`;
  let h = '';
  if(rel.length) h += `<p class="as-hint" style="margin:6px 8px">Productos relacionados con ${esc(notas.join(', '))}:</p>` + rel.slice(0, 8).map(opt).join('');
  const resR = res.filter(i => !rel.includes(i));
  if(resR.length) h += (rel.length ? '<p class="as-hint" style="margin:6px 8px">Otros que coinciden con lo escrito:</p>' : '') + resR.slice(0, rel.length ? 8 : 14).map(opt).join('');
  if(par.length) h += '<p class="as-hint" style="margin:6px 8px">No hay coincidencia exacta. Productos que contienen alguna de tus palabras:</p>' + par.slice(0, 10).map(opt).join('');
  box.innerHTML = h || '<p class="as-hint">Sin resultados. Prueba con una palabra más corta, un sinónimo (por ejemplo "correo electrónico" en vez de "mail") o el código ONU.</p>';
  box.querySelectorAll('.as-opt').forEach(b => b.addEventListener('click', () => chooseProd(Number(b.dataset.i))));
}
function chooseOrg(i){
  S.orgIdx = i; S.org = S.O.o[i]; S.st.o = S.org[0]; S.st.u = null; S.st.r = null; S.od = null; $('as-orgres').hidden = true; S.loadingOrg = true; paintSelections(); update();
  loadOrg(i).then(d => { if(S.orgIdx !== i) return; S.od = d; S.loadingOrg = false; paintSelections(); loadSegFor(); update(); }).catch(e => { S.loadingOrg = false; paintSelections(); const r = $('as-res'); if(r) r.innerHTML = '<div class="as-err">' + esc(e.message) + '</div>'; });
}
function chooseProd(i){
  const l = activeLine(); l.p = S.C.c[i]; l.q = ''; l.t = ''; $('as-prod').value = ''; $('as-prodres').hidden = true;
  activate(S.li); paintLines(); loadSegFor(); update();
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
  recalc(); paintTot(); paintOrgFin();
  const utm = utmNow();
  if(eq) eq.textContent = S.st.m ? '= ' + dec(S.st.m / utm, 1) + ' UTM · ' + R().TRAMOS[R().tramoUtm(S.st.m / utm)].nom : '';
  const n = (S.st.s || []).length, ds = $('as-detsum'); if(ds) ds.textContent = n ? n + ' situación(es) marcada(s)' : 'Ninguna (compra habitual)';
  syncUrl();
  ensurePac(); ensureRef(); ensureOc();
  if(S.orgIdx == null || !S.st.m){
    res.innerHTML = `<div class="as-empty"><b>Tu recomendación aparecerá aquí.</b><br>Elige el organismo (paso 1) e indica el monto estimado (paso 3). Mientras más completes, más datos reales verás: precios de referencia, Convenios Marco, proveedores de tu región y compras de otros organismos que podrías consolidar.</div>`;
    return;
  }
  const out = compute(); S.out = out;
  res.innerHTML = resultHtml(out);
  wireResult();
  if(S.vd && S.vd.cms.length && S.vd.cms.some(c => c.extra && c.extra.cat)) ensureCmProv();
  const bx = $('as-sits'), cmSi = !!(S.inp && S.inp.cm);
  if(bx){ const ce = bx.querySelector('input[value=estandar]'); if(ce){ ce.disabled = cmSi; const sm = ce.parentNode.querySelector('small'); if(sm) sm.textContent = cmSi ? 'No aplica: el producto está en Convenio Marco' : 'Subasta Inversa Electrónica'; ce.parentNode.style.opacity = cmSi ? '.55' : ''; } }
}
function ensurePac(){
  if(S.orgIdx == null || S.pacOrg === S.orgIdx || S.pacLoading === S.orgIdx) return;
  const idx = S.orgIdx; S.pacLoading = idx;
  loadPac(idx).then(p => { if(S.orgIdx !== idx) { S.pacLoading = null; return; } S.pac = p; S.pacOrg = idx; S.pacLn = {}; S.pacTot = null; S.pacLoading = null; update(); });
}
const pesos = v => v >= 1e6 ? mm(v / 1e6) : clp(Math.round(v));
const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function ensureOc(){
  if(S.orgIdx == null || S.ocOrg === S.orgIdx || S.ocLoading === S.orgIdx) return;
  const idx = S.orgIdx; S.ocLoading = idx; window.AS_OC = window.AS_OC || {};
  (window.AS_OC[idx] ? Promise.resolve() : loadScript(AB + 'oc26/oc_' + idx + '.js' + ver()).catch(() => null)).then(() => { if(S.orgIdx !== idx){ S.ocLoading = null; return; } S.oc = window.AS_OC[idx] || null; S.ocOrg = idx; S.ocLoading = null; update(); });
}
/* Compras 2026 del organismo para el producto de una línea, por mes: {mes: [N OC, pesos]} */
function ocMeses(l){
  if(!l.p || S.ocOrg !== S.orgIdx || !S.oc || !S.oc.p[l.p]) return null;
  const o = {}; S.oc.p[l.p].split(',').forEach(x => { const [m, n, k] = x.split(':'); o[Number(m)] = [Number(n), Number(k) * 1000]; }); return o;
}
function pacMeses(str){ return str ? str.split(',').map(x => { const [m, v] = x.split(':'); return {m: Number(m), v: Number(v)}; }) : []; }
/* Ítems del PAC asociados a una línea: el texto del ítem debe contener las palabras del producto elegido (el PAC no trae código ONU). */
function pacState(l){
  const P = S.pacOrg === S.orgIdx ? S.pac : null; if(!P) return null;
  S.pacLn = S.pacLn || {};
  const qt = [...new Set(toks(withLine(l, consultaTexto)))], key = S.orgIdx + '|' + qt.join(' ');
  let st = S.pacLn[l.id];
  if(!st || st.key !== key){
    const need = qt.length >= 3 ? qt.length - 1 : qt.length, res = [], head = new Set();
    if(qt.length) P.i.forEach((it, k) => { const tk = toks(it[0]), set = new Set(tk); let n = 0; qt.forEach(t => { if(set.has(t)) n++; }); if(n >= need && n > 0){ res.push(k); if(qt.some(t => tk.slice(0, 3).includes(t))) head.add(k); } });
    res.sort((a, b) => ((head.has(b) ? 1 : 0) - (head.has(a) ? 1 : 0)) || (P.i[b][4] - P.i[a][4]));
    const matches = res.slice(0, 40);
    st = S.pacLn[l.id] = {key, matches, sel: new Set(matches.filter(k => head.has(k) && P.i[k][5]))};
  }
  return st;
}
function pacItems(){ const P = S.pacOrg === S.orgIdx ? S.pac : null, st = P && pacState(activeLine()); return st ? st.matches.map(k => ({k, it: P.i[k]})) : null; }
function pacResumen(items, sel, skip){
  const meses = new Set(), porMes = {}; let total = 0, n = 0, sinMes = 0, omit = 0;
  items.forEach(x => { if(!sel.has(x.k)) return; n++; const ms = pacMeses(x.it[5]); if(ms.length){ ms.forEach(m => { if(skip && skip.has(m.m)){ omit += m.v; return; } meses.add(m.m); total += m.v; porMes[m.m] = (porMes[m.m] || 0) + m.v; }); } else { total += x.it[4]; sinMes += x.it[4]; } });
  return {n, meses: meses.size, totalClp: Math.round(total), mesesList: [...meses].sort((a, b) => a - b), porMes, sinMes, omit: Math.round(omit)};
}
function ocHtml(l, planned){
  const oc = ocMeses(l), mes = new Date().getMonth() + 1, gen = S.oc && S.oc.g ? S.oc.g : '';
  if(S.ocOrg !== S.orgIdx) return '<p class="as-hint">Revisando las compras 2026 del organismo…</p>';
  if(!oc) return `<p><b>Compras 2026 de este producto en tu organismo:</b> no se registran órdenes de compra de este producto entre enero y ${MES3[mes - 1]}. Si el PAC planifica meses ya pasados, esa compra sigue pendiente.</p>`;
  const ch = Object.keys(oc).map(Number).sort((a, b) => a - b).map(m => `<span class="as-mes as-mes-ok">${MES3[m - 1]} · ${oc[m][0]} OC · ${pesos(oc[m][1])}</span>`).join(' ');
  const pend = planned.filter(m => m <= mes && !oc[m]), hecho = planned.filter(m => oc[m]);
  return `<p><b>Compras 2026 de este producto en tu organismo (todas las vías):</b> ${ch}</p>` + (planned.length ? `<p>${hecho.length ? 'Meses planificados con compra registrada: ' + hecho.map(m => MES3[m - 1]).join(', ') + '. ' : ''}${pend.length ? 'Meses planificados ya cumplidos sin compra registrada: ' + pend.map(m => MES3[m - 1]).join(', ') + ' (compra pendiente o hecha con otro producto).' : ''}</p>` : '') + `<p class="as-hint">Cruce por código de producto ONU con las órdenes de compra de datos abiertos${gen ? ' hasta ' + gen : ''}. El monto de una OC con varios productos se reparte en partes iguales. Si compraron un producto parecido con otro código, no aparece aquí.</p>`;
}
function distHtml(rs){
  const hoy = new Date().getMonth() + 1;
  const ch = rs.mesesList.map(m => `<span class="as-mes${m < hoy ? ' as-mes-p' : ''}">${MES3[m - 1]} ${pesos(rs.porMes[m])}</span>`).join(' ') + (rs.sinMes ? ` <span class="as-mes">sin mes ${pesos(rs.sinMes)}</span>` : '');
  return `<p class="as-dist"><b>Distribución de lo que marcaste:</b> ${ch}</p>`;
}
function pacConsHtml(o){
  if(S.orgIdx == null) return '';
  const P = S.pacOrg === S.orgIdx ? S.pac : null, items = pacItems(), nm = S.org ? S.org[1] : '', nmEnc = encodeURIComponent(nm), l = activeLine(), many = S.st.l.length > 1;
  const head = `<div class="as-sec as-pac" id="as-pacc"><h3>Tu PAC 2026 y la consolidación${many ? ' de la línea ' + (S.li + 1) : ' de este producto'}</h3>`;
  if(S.pacOrg !== S.orgIdx) return head + '<div class="as-load">Revisando el PAC 2026 de tu organismo…</div></div>';
  if(!S.pac) return head + `<p>No encontré PAC 2026 publicado para ${esc(nm)} en el archivo del 20-10-2026 (proyectos Publicado y Actualizado). Sin PAC, la compra debe justificarse en el acto que la autoriza (Ley 19.886 art. 12; DS 661 art. 27). Revisa el <a href="#pac26=${nmEnc}" target="_blank" rel="noopener">Buscador PAC 2026</a>.</p></div>`;
  const st = pacState(l), nomL = sentence(consultaTexto()) || 'este producto';
  if(!items.length) return head + `<p>En el PAC 2026 de tu organismo no aparece un ítem que coincida con «${esc(nomL)}». Si vas a comprarlo, agrégalo con una modificación del PAC y fundamenta el motivo en el acto administrativo (Ley art. 12; DS 661 arts. 27 y 166). Para revisar el PAC completo: <a href="#pac26=${nmEnc}" target="_blank" rel="noopener">Buscador PAC 2026</a>.</p></div>`;
  const hoy = new Date().getMonth() + 1, oc = ocMeses(l), plannedAll = pacResumen(items, st.sel).mesesList, tieneComprados = !!(oc && plannedAll.some(m => oc[m]));
  const skip = (tieneComprados && S.pendOnly !== false) ? new Set(plannedAll.filter(m => oc[m])) : null, rs = pacResumen(items, st.sel, skip), conPr = !!(P.pr && items.some(x => x.it[7] != null));
  let h = head + `<p>El Asesor asoció tu producto con ${items.length} ítem(s) del PAC de ${esc(nm)} (versión del 20-10-2026)${conPr ? ', agrupados por proyecto' : ''}. Marca los que corresponden a la misma necesidad: el Asesor suma sus meses y propone una sola compra.</p>`;
  const fila = x => {
    const ms = pacMeses(x.it[5]);
    const mtxt = ms.length ? ms.map(m => `<span class="as-mes${m.m < hoy ? ' as-mes-p' : ''}">${MES3[m.m - 1]} ${pesos(m.v)}</span>`).join(' ') : '<span class="as-hint">sin mes definido</span>';
    return `<tr><td><input type="checkbox" class="as-pk" data-k="${x.k}" ${st.sel.has(x.k) ? 'checked' : ''} aria-label="Incluir en la consolidación"></td><td>${esc(sentence(x.it[0]))}<br><span class="as-hint">${esc(P.u[x.it[1]] || '')} · ${esc(P.m[x.it[3]] || '')}</span></td><td class="n">${x.it[6] != null ? fmt(x.it[6]) : '—'}</td><td>${mtxt}</td><td class="n">${pesos(ms.length ? ms.reduce((a, m) => a + m.v, 0) : x.it[4])}</td></tr>`;
  };
  let filas = '';
  if(conPr){
    const gr = []; const seen = {};
    items.forEach(x => { const k = x.it[7] == null ? -1 : x.it[7]; if(seen[k] == null){ seen[k] = gr.length; gr.push({k, xs: []}); } gr[seen[k]].xs.push(x); });
    gr.forEach(g => { const pj = g.k >= 0 ? P.pr[g.k] : null, all = g.xs.every(x => st.sel.has(x.k)), tot = g.xs.reduce((a, x) => a + x.it[4], 0);
      filas += `<tr class="as-pj-h"><td><input type="checkbox" class="as-pj" data-ks="${g.xs.map(x => x.k).join(',')}" ${all ? 'checked' : ''} aria-label="Marcar todo el proyecto"></td><td colspan="3"><b>${pj ? 'Proyecto ' + esc(pj[0]) : 'Sin proyecto informado'}</b>${pj && pj[1] ? ' · ' + esc(sentence(pj[1])) : ''}<br><span class="as-hint">${g.xs.length} ítem(s)</span></td><td class="n">${pesos(tot)}</td></tr>` + g.xs.map(fila).join(''); });
  } else filas = items.map(fila).join('');
  h += '<div class="as-tw" style="max-height:420px;overflow:auto"><table class="as-t"><tr><th></th><th>Ítem del PAC</th><th class="n">Cant.</th><th>Meses planificados</th><th class="n">Total</th></tr>' + filas + '</table></div>' + (items.length >= 40 ? '<p class="as-hint">Se muestran hasta 40 ítems: primero los que parten con el producto, luego los que solo lo mencionan.</p>' : '') + '<p class="as-hint">Meses en gris ya pasaron: confirma en las compras de tu organismo (más abajo) si ya se concretaron. Si el texto del ítem corresponde a otro producto, desmárcalo.' + (conPr ? '' : ' Este PAC aún no trae el código de proyecto en el Asesor: se muestra la unidad de compra.') + '</p>';
  h += ocHtml(l, plannedAll);
  if(tieneComprados) h += `<p><label class="as-chk"><input type="checkbox" id="as-pend" ${S.pendOnly !== false ? 'checked' : ''}><span>Consolidar solo los meses sin compra registrada<small>Descuenta ${rs.omit ? pesos(rs.omit) : 'lo ya comprado'} de los meses con órdenes de compra de este producto.</small></span></label></p>`;
  if(!rs.n) return h + '<p>No hay ítems marcados. Marca los que corresponden a esta necesidad para ver la compra consolidada.</p></div>';
  const cons = R().consolidar(S.inp, rs), tot = cons.totalClp, cur = lineTotal(l), difiere = !cur || Math.abs(tot - cur) / cur > 0.05;
  h += distHtml(rs);
  h += `<div class="as-pk-sum"><b>Compra consolidada sugerida${many ? ' para esta línea' : ''}: ${pesos(tot)} (${dec(cons.totalUtm, 1)} UTM, ${esc(cons.tramoNom)})</b>${rs.mesesList.length > 1 ? '<br>Una sola compra en lugar de ' + rs.mesesList.length + ' (' + rs.mesesList.map(m => MES3[m - 1]).join(', ') + ').' : ''}<br>Procedimiento para ese monto: <b>${esc(cons.rec.principal.nom)}</b>.</div>`;
  cons.texto.forEach(t => { h += `<p>${esc(t)}</p>`; });
  cons.alertas.forEach(a => { h += `<div class="as-al as-al-${a.nivel}"><b>Atención</b>${esc(a.t)}</div>`; });
  if(difiere) h += `<p><button class="as-btn as-main" id="as-usepac">Usar ${pesos(tot)} como monto de ${many ? 'la línea ' + (S.li + 1) : 'esta compra'}</button></p><p class="as-hint">Verifica si el monto del PAC incluye IVA antes de usarlo.</p>`;
  return h + citas(cons.arts.concat([{n: 'Ley 19.886', t: 'art. 12'}])) + '</div>';
}
function wireResult(){
  const st = () => pacState(activeLine());
  S.host.querySelectorAll('.as-rtab').forEach(b => b.addEventListener('click', () => { S.rtab = b.dataset.rt; S.host.querySelectorAll('.as-rtab').forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false')); S.host.querySelectorAll('.as-pan').forEach(x => { x.hidden = x.dataset.rp !== S.rtab; }); }));
  S.host.querySelectorAll('.as-pk').forEach(c => c.addEventListener('change', () => { const k = Number(c.dataset.k), s_ = st(); if(c.checked) s_.sel.add(k); else s_.sel.delete(k); update(); }));
  S.host.querySelectorAll('.as-pj').forEach(c => c.addEventListener('change', () => { const s_ = st(); c.dataset.ks.split(',').forEach(k => { if(c.checked) s_.sel.add(Number(k)); else s_.sel.delete(Number(k)); }); update(); }));
  const pe = $('as-pend'); if(pe) pe.addEventListener('change', () => { S.pendOnly = pe.checked; update(); });
  const b = $('as-usepac');
  if(b) b.addEventListener('click', () => { const s_ = st(), P = S.pac, l = activeLine(), oc_ = ocMeses(l), pl_ = pacResumen(s_.matches.map(k => ({k, it: P.i[k]})), s_.sel).mesesList, sk_ = (oc_ && S.pendOnly !== false) ? new Set(pl_.filter(m => oc_[m])) : null, rs = pacResumen(s_.matches.map(k => ({k, it: P.i[k]})), s_.sel, sk_); l.n = 0; l.pu = 0; l.m = rs.totalClp; recalc(); paintLines(); update(); });
  S.host.querySelectorAll('.as-goln').forEach(bt => bt.addEventListener('click', () => { activate(Number(bt.dataset.i)); $('as-prod').value = ''; paintLines(); loadSegFor(); update(); const r = $('as-res'); if(r) r.scrollIntoView({behavior: 'smooth', block: 'start'}); }));
}
/* Presupuesto y PAC del organismo */
function pacTotal(){
  const P = S.pacOrg === S.orgIdx ? S.pac : null; if(!P) return null;
  if(!S.pacTot || S.pacTot.o !== S.orgIdx){ let t = 0; P.i.forEach(it => { t += it[4]; }); S.pacTot = {o: S.orgIdx, t, n: P.i.length, pj: P.pr ? P.pr.length : null}; }
  return S.pacTot;
}
function orgFinTxt(corto){
  if(S.orgIdx == null) return '';
  const code = S.org[0], pt = pacTotal(), pr = S.pres && S.pres.o ? S.pres.o[code] : null;
  let a = '', comp = '';
  if(S.pres && S.pres.o){
    if(pr && pr[1] === 2 && pr[0] > 0){
      a = `Presupuesto 2026 del servicio en la Ley N° 21.796 (subtítulos 22 y 29, sin terrenos ni edificios): <b>${pesos(pr[0])}</b>${pr[2] ? ' · ' + esc(pr[2]) : ''}.${pr[3] > 1 ? ` Es del servicio completo y lo comparten ${pr[3]} organismos de la base.` : ''}`;
      if(pr[5] && pr[0]) comp += `Ya ejecutó ${pesos(pr[5])} en órdenes de compra entre enero y septiembre (cifra del organismo, no solo de esta partida).`;
      if(!corto && S.st.m) comp += ` Este proceso equivale al ${dec(S.st.m / pr[0] * 100, 1)} % de ese presupuesto.`;
    } else if(pr && pr[1] === 4) a = `La Ley no desglosa un presupuesto propio para este organismo: solo se identifica el ministerio${pr[2] ? ' (' + esc(pr[2]) + ')' : ''}.`;
    else a = 'Sin presupuesto propio en la Ley de Presupuestos 2026 (por ejemplo municipios, corporaciones, universidades y empresas públicas): se financia con recursos propios o transferencias.';
  } else if(S.presTried) a = 'El presupuesto de la Ley 2026 aún no está cargado en el Asesor. Revísalo en la vista <a href="#presupuesto" target="_blank" rel="noopener">Presupuesto 2026</a> del sitio.';
  let b = '';
  if(S.pacOrg !== S.orgIdx) b = 'Revisando el PAC 2026…';
  else if(!pt) b = 'No tiene PAC 2026 publicado en el archivo del 20-10-2026.';
  else b = `PAC 2026: <b>${pesos(pt.t)}</b> en ${fmt(pt.n)} ítem(s)${pt.pj ? ' y ' + fmt(pt.pj) + ' proyecto(s)' : ''}.`;
  return [a, b, comp.trim()].filter(Boolean).join(' ');
}
function paintOrgFin(){ const el = $('as-orgfin'); if(!el) return; const t = orgFinTxt(true); el.innerHTML = t ? `<p class="as-hint as-fin">${t}</p>` : ''; }
/* Resumen del proceso con varias líneas */
function procesoHtml(o){
  const L = S.st.l.filter(l => l.p || l.q || lineTotal(l)); if(L.length < 2) return '';
  const utm = utmNow(), filas = [];
  let cmClp = 0, fuera = 0;
  L.forEach(l => { const idx = S.st.l.indexOf(l);
    const r = withLine(l, () => { const vd = veredictoCm(), pt = lineTipo(l), cons = pt === 'servicio' ? false : esConsumible(), nm = S.prodIdx != null && S.C.c[S.prodIdx].slice(0, 2) === '95';
      return {vd, tipo: pt, ec: pt === 'bien' && !cons && !nm}; });
    const ps = pacState(l), cm = ['catalogo', 'oc', 'familia', 'tema'].includes(r.vd.nivel), t = lineTotal(l);
    if(cm) cmClp += t; else fuera += t;
    const cmTxt = cm ? ((r.vd.cms[0].v && r.vd.cms[0].v.nombre) || r.vd.cms[0].id) + (r.vd.nivel === 'catalogo' || r.vd.nivel === 'oc' ? '' : ' (probable)') : 'No';
    const pacTxt = ps ? (ps.matches.length ? ps.matches.length + ' ítem(s)' + (ps.sel.size ? ', ' + ps.sel.size + ' marcado(s)' : '') : 'Sin ítem') : '…';
    filas.push(`<tr><td>${idx + 1}</td><td>${esc(lineName(l) || 'Sin producto')}</td><td>${r.tipo === 'servicio' ? 'Servicio' : 'Bien'}</td><td class="n">${t ? pesos(t) : '—'}</td><td>${r.ec ? 'Consultar primero' : 'No aplica'}</td><td>${esc(cmTxt)}</td><td>${pacTxt}</td><td><button class="as-x as-goln" data-i="${idx}">${idx === S.li ? 'en pantalla' : 'ver detalle'}</button></td></tr>`);
  });
  let h = `<div class="as-sec"><h3>Resumen del proceso: ${L.length} líneas, ${pesos(S.st.m)} (${dec(S.st.m / utm, 1)} UTM)</h3><div class="as-tw"><table class="as-t"><tr><th>#</th><th>Producto o servicio</th><th>Tipo</th><th class="n">Monto</th><th>Economía circular</th><th>Convenio Marco</th><th>PAC</th><th></th></tr>${filas.join('')}</table></div>`;
  h += `<p>El análisis completo que sigue corresponde a la línea ${S.li + 1}, con el total del proceso para definir el tramo. Cambia de línea con «ver detalle».</p>`;
  if(cmClp) h += `<p><b>Por Convenio Marco:</b> ${pesos(cmClp)} (${dec(cmClp / utm, 1)} UTM). Cada línea se compra por su convenio${cmClp / utm > 1000 ? '; sobre 1.000 UTM corresponde Gran Compra (DS 661, art. 90)' : ''}.</p>`;
  if(fuera){ const rec = R().recomendar(Object.assign({}, S.inp, {cm: false, cmNombres: [], montoClp: fuera, bt: []}));
    h += `<p><b>Fuera de Convenio Marco:</b> ${pesos(fuera)} (${dec(fuera / utm, 1)} UTM, ${esc(rec.tramoNom)}). Si estas líneas forman un mismo proceso de compra, el procedimiento se define con esa suma: <b>${esc(rec.principal.nom)}</b>. Si son necesidades distintas puedes tratarlas por separado, pero no dividas una compra para quedar bajo un umbral.</p>`; }
  return h + citas([{n: 'DS 661/2024', t: 'art. 16'}, {n: 'DS 661/2024', t: 'art. 90'}]) + '</div>';
}
/* Procesos de referencia: licitaciones y Compras Ágiles reales del mismo producto (índice data/asesor/ref/ref_SS.js, construido desde el buscador de procesos). */
function ensureRef(){
  if(S.prodIdx == null) return; const sg = S.C.c[S.prodIdx].slice(0, 2); S.ref = S.ref || {};
  if(S.ref[sg] !== undefined || (S.refLoading && S.refLoading[sg])) return;
  S.refLoading = S.refLoading || {}; S.refLoading[sg] = true;
  loadScript(AB + 'ref/ref_' + sg + '.js' + ver()).then(() => (window.AS_REF && window.AS_REF[sg]) || null).catch(() => null).then(d => { S.ref[sg] = d; S.refLoading[sg] = false; update(); });
}
function refFor(D, code){
  const own = D[code] || {}, cl = code.slice(0, 6), out = {L: own.L, C: own.C, claseL: false, claseC: false};
  const sib = Object.keys(D).filter(k => k !== code && k.slice(0, 6) === cl);
  const merge = (key, rowsAt) => {
    const rows = [], sum = {n: 0, a: 0, d: 0, ofs: 0, wa: 0};
    sib.forEach(k => { const e = D[k][key]; if(!e) return; sum.n += e[0]; if(key === 'L'){ sum.a += e[1]; sum.d += e[2]; sum.ofs += e[3] * e[1]; sum.wa += e[1]; } e[rowsAt].forEach(r => rows.push(r)); });
    rows.sort((x, y) => (y[1] || '').localeCompare(x[1] || ''));
    return sum.n ? {sum, rows: rows.slice(0, 10)} : null;
  };
  if(!own.L || own.L[0] < 3){ const m = merge('L', 5); if(m){ out.claseL = true; out.L = [m.sum.n + (own.L ? own.L[0] : 0), m.sum.a + (own.L ? own.L[1] : 0), m.sum.d + (own.L ? own.L[2] : 0), m.sum.wa ? Math.round(m.sum.ofs / m.sum.wa * 10) / 10 : 0, 0, (own.L ? own.L[5] : []).concat(m.rows).sort((x, y) => (y[1] || '').localeCompare(x[1] || '')).slice(0, 10)]; } }
  if(!own.C || own.C[0] < 3){ const m = merge('C', 2); if(m){ out.claseC = true; out.C = [m.sum.n + (own.C ? own.C[0] : 0), 0, (own.C ? own.C[2] : []).concat(m.rows).sort((x, y) => (y[1] || '').localeCompare(x[1] || '')).slice(0, 10)]; } }
  return out;
}
function planHtml(r){
  const T = r.L && r.L[6]; if(!T || r.claseL || T[0] < 5) return '';
  const fmtD = d => d.toLocaleDateString('es-CL', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
  let h = `<p><b>Tiempos reales:</b> en ${fmt(T[0])} licitaciones de este producto, desde que se publicaron hasta que se adjudicaron pasaron una mediana de <b>${T[1]} días</b>; el 75 % se adjudicó en <b>${T[2]} días</b> o menos (incluye plazo de publicación, preguntas, evaluación y adjudicación; no incluye contrato ni entrega).</p>`;
  if(S.st.nd){
    const need = new Date(S.st.nd + 'T00:00:00Z'), a = new Date(need.getTime() - T[1] * 864e5), b = new Date(need.getTime() - T[2] * 864e5), hoy = new Date(), h0 = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    h += `<p>Para tener la adjudicación el <b>${fmtD(need)}</b>, publica a más tardar el <b>${fmtD(b)}</b> si quieres cubrir el 75 % de los casos, o el ${fmtD(a)} en un caso típico.${b < h0 ? ' <b>La fecha prudente ya pasó</b>: evalúa si conviene Convenio Marco, o simplificar las bases (con una especificación simple y objetiva se reducen los plazos mínimos, DS 661 art. 46).' : ''}</p>`;
  } else h += '<p class="as-hint">Indica en el paso 3 para cuándo necesitas la adjudicación y el Asesor calcula la fecha límite de publicación.</p>';
  return h;
}
function refHtml(o){
  if(S.prodIdx == null) return '';
  const code = S.C.c[S.prodIdx], sg = code.slice(0, 2), D = S.ref && S.ref[sg], nm = sentence(S.C.n[S.prodIdx]), lic = o.montoUtm > 100, l = activeLine(), monto = lineTotal(l) || S.st.m;
  const head = `<div class="as-sec as-ref"><h3>${lic ? 'Licitaciones de referencia' : 'Compras Ágiles de referencia'}: ${esc(nm)}</h3>`;
  if(D === undefined) return head + '<div class="as-load">Buscando procesos parecidos…</div></div>';
  const busca = ' Puedes buscar por palabra en el <a href="#rubro" target="_blank" rel="noopener">buscador de procesos de compra</a> del sitio.';
  const r = D ? refFor(D, code) : {};
  const cerca = rows => rows.slice().sort((a, b) => Math.abs(Math.log((a[4] || 1) / monto)) - Math.abs(Math.log((b[4] || 1) / monto))).slice(0, 5).sort((a, b) => (b[1] || '').localeCompare(a[1] || ''));
  const link = (c, mec) => mec === 'l' ? `http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=${encodeURIComponent(c)}` : `https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC=${encodeURIComponent(c)}`;
  if(lic){
    if(!r.L) return head + `<p>No encontré licitaciones adjudicadas de este producto ni de su clase entre enero de 2025 y octubre de 2026 en los datos abiertos.${busca}</p></div>`;
    const L = r.L, des = L[2], pc = L[0] ? Math.round(des / L[0] * 100) : 0;
    let h = head + `<p>${r.claseL ? 'No hay suficientes licitaciones de este producto exacto; se muestran las de su clase (productos parecidos). ' : ''}En los últimos 12 meses se publicaron <b>${fmt(L[0])}</b> licitaciones${r.claseL ? ' de la clase' : ' de este producto'}: <b>${fmt(L[1])}</b> se adjudicaron y <b>${fmt(des)}</b> (${pc} %) quedaron desiertas o cerradas sin adjudicar.${L[3] ? ` Las adjudicadas recibieron en promedio <b>${dec(L[3], 1)}</b> ofertas.` : ''}${L[4] ? ` Monto mediano adjudicado: <b>${pesos(L[4])}</b>.` : ''}</p>`;
    if(L[3] && L[3] < 2.5) h += '<p>Se reciben pocas ofertas por licitación. Conviene revisar que las exigencias y los plazos de las bases no limiten la participación, y difundir el proceso entre proveedores del rubro.</p>';
    else if(pc >= 20) h += '<p>Más de 1 de cada 5 licitaciones de este producto no se adjudica. Antes de publicar, revisa los requisitos de admisibilidad y el presupuesto estimado frente a los precios de referencia.</p>';
    const rows = cerca(L[5]);
    h += '<div class="as-tw"><table class="as-t"><tr><th>Licitación</th><th>Publicada</th><th>Título</th><th>Organismo</th><th class="n">Monto</th><th class="n">Ofertas</th><th>Adjudicada a</th></tr>' + rows.map(x => `<tr><td><a href="${link(x[0], 'l')}" target="_blank" rel="noopener">${esc(x[0])}</a><br><span class="as-hint">${esc(x[7] || '')}</span></td><td>${esc(x[1])}</td><td>${esc(sentence(x[2]))}</td><td>${esc(x[3])}</td><td class="n">${x[4] ? pesos(x[4]) : '—'}</td><td class="n">${x[5] || '—'}</td><td>${esc(x[6] || '—')}</td></tr>`).join('') + '</table></div>';
    h += planHtml(r);
    return h + `<p class="as-hint">Se muestran las 5 licitaciones adjudicadas con monto más cercano al tuyo (${pesos(monto)}), entre una muestra de las más recientes desde enero de 2025, con montos variados. Ábrelas en Mercado Público para ver sus bases, criterios de evaluación y plazos. Los estados de licitaciones de 2025 pueden estar desactualizados.${S.st.l.length > 1 ? ' Corresponde a la línea ' + (S.li + 1) + '.' : ''}</p></div>`;
  }
  if(!r.C) return head + `<p>No encontré Compras Ágiles de este producto ni de su clase entre enero de 2025 y octubre de 2026 en los datos abiertos.${busca}</p></div>`;
  const C = r.C;
  let h = head + `<p>${r.claseC ? 'No hay suficientes Compras Ágiles de este producto exacto; se muestran las de su clase (productos parecidos). ' : ''}En los últimos 12 meses hubo <b>${fmt(C[0])}</b> compras ágiles${r.claseC ? ' de la clase' : ' de este producto'}${C[1] ? `, con un monto mediano de <b>${pesos(C[1])}</b>` : ''}.</p>`;
  const rows = cerca(C[2]);
  h += '<div class="as-tw"><table class="as-t"><tr><th>Orden de compra</th><th>Fecha</th><th>Título</th><th>Organismo</th><th class="n">Monto</th><th>Proveedor</th></tr>' + rows.map(x => `<tr><td><a href="${link(x[0], 'c')}" target="_blank" rel="noopener">${esc(x[0])}</a></td><td>${esc(x[1])}</td><td>${esc(sentence(x[2]))}</td><td>${esc(x[3])}</td><td class="n">${x[4] ? pesos(x[4]) : '—'}</td><td>${esc(x[5] || '—')}</td></tr>`).join('') + '</table></div>';
  return h + `<p class="as-hint">Se muestran las 5 compras con monto más cercano al tuyo (${pesos(monto)}), entre una muestra de las más recientes desde enero de 2025, con montos variados. Sirven para calibrar el precio y ver qué proveedores responden; la ficha en Mercado Público muestra el detalle.</p></div>`;
}
function resultHtml(o){
  const p = o.principal, st = S.st, st_ = S.st, h = histProd(), ci = cmInfo();
  const prodName = S.prodIdx != null ? sentence(S.C.n[S.prodIdx]) : 'tu compra';
  let html = `<div class="as-reco" role="status"><div class="as-eye">Recomendación para ${esc(S.org[1])}</div>${(o.escalera && o.escalera.ecOpcion) ? `<h2>Primero, economía circular</h2><p>Es un bien mueble: antes de comprar, consulta si otro organismo tiene uno disponible (DS 661, art. 28). Si no existe o no está disponible, deja constancia de que el producto no está disponible en economía circular y sigue con: <b>${esc(p.nom)}</b>.</p>` : `<h2>${esc(p.nom)}</h2><p>${esc(p.porque)}</p>`}
    <div class="as-chips"><span class="as-chip">${esc(prodName)}</span>${activeLine().n ? `<span class="as-chip">${fmt(activeLine().n)} ${esc(lineUm(activeLine()))}</span>` : ''}<span class="as-chip">${dec(o.montoUtm, 1)} UTM${st_.l.length > 1 ? ' en total' : ''}</span><span class="as-chip">${esc(o.tramoNom)}</span><span class="as-chip">${esc(regName(orgRegion()))}</span></div></div>`;
  html += `<div class="as-sec as-fin2"><h3>Presupuesto y PAC del organismo</h3><p>${orgFinTxt(false)}</p></div>`;
  html += procesoHtml(o);
  html += vereditoHtml(S.vd || veredictoCm(), o);
  /* Todo lo que sigue va en pestañas bajo la tarjeta de Convenio Marco. */
  const secs = [], h3t = x => (x.match(/<h3>([\s\S]*?)<\/h3>/) || [, ''])[1].replace(/<[^>]+>/g, '');
  const add = (k, label, x, bdg) => { if(x) secs.push({k, label, x, bdg}); };
  { const x = escaleraHtml(o); add('esc', 'Orden de opciones para esta compra', x); }
  { const x = refHtml(o); add('ref', h3t(x), x); }
  { const x = pacConsHtml(o); add('pacc', 'Tu PAC 2026 y la consolidación', x); }
  if(o.alertas.length) add('alertas', 'Alertas', '<div class="as-sec"><h3>Alertas</h3>' + o.alertas.map(a => `<div class="as-al as-al-${a.nivel}"><b>${a.nivel === 'alto' ? 'Atención' : (a.nivel === 'medio' ? 'Revisa' : 'Para tener presente')}</b>${esc(a.t)}${a.accion ? `<span class="as-acc">${esc(a.accion)}</span>` : ''}${a.arts ? citas(a.arts).replace('as-cite', 'as-cite" style="color:inherit;opacity:.85') : ''}</div>`).join('') + '</div>', o.alertas.length);
  { // detalle del procedimiento
    let x = `<div class="as-sec"><h3>Cómo se hace: ${esc(p.nom)}</h3>`;
    if(p.mec && p.mec.cuando) x += `<p>${esc(p.mec.cuando)}</p>`;
    if(p.plazos.length) x += '<p><b>Plazos</b></p><ul>' + p.plazos.map(y => `<li>${esc(y)}</li>`).join('') + '</ul>';
    if(p.req.length) x += '<p><b>Qué debes cumplir</b></p><ul>' + p.req.map(y => `<li>${esc(y)}</li>`).join('') + '</ul>';
    if(p.links && p.links.length) x += '<p><b>Base Tipo</b>' + linksHtml(p.links) + '</p>';
    if(p.vigencia) x += `<p class="as-cite">${esc(p.vigencia)}</p>`;
    add('como', 'Cómo se hace: ' + p.nom, x + citas(p.arts) + '</div>');
  }
  add('pasos', 'Orden de la decisión', '<div class="as-sec"><h3>Orden de la decisión</h3><ol class="as-steps">' + o.pasos.map(x => `<li><div><b>${esc(x.titulo)}</b><span class="as-tag as-t-${x.estado}">${x.estado}</span><p>${esc(x.texto)}</p>${linksHtml(x.links)}${citas(x.arts)}</div></li>`).join('') + '</ol></div>');
  add('datos', 'Compras de tu organismo', datosOrg(o, h, ci));
  add('precios', 'Precio de referencia', preciosHtml(h));
  if(ci.lista.length) add('cm', 'Convenios Marco del producto', cmHtml(ci));
  add('prov', 'Proveedores de tu región', provHtml());
  add('dem', 'Demanda que podrías consolidar', demandaHtml());
  add('pac', 'Antes de publicar: PAC y presupuesto', pacHtml());
  if(o.alternativas.length) add('alt', 'Otras vías', '<div class="as-sec"><h3>Otras vías que puedes evaluar</h3>' + o.alternativas.map(a => `<p><b>${esc(a.nom)}.</b> ${esc(a.texto)}</p>${citas(a.arts)}`).join('') + '</div>');
  if(S.od == null) html += '<div class="as-load">Cargando las compras del organismo para cruzarlas con la recomendación…</div>';
  if(secs.length){
    const sel = secs.some(z => z.k === S.rtab) ? S.rtab : secs[0].k;
    html += '<div class="as-tabs as-rtabs" role="tablist" aria-label="Más información de esta compra">' + secs.map(z => `<button class="as-rtab" role="tab" data-rt="${z.k}" aria-selected="${z.k === sel}">${esc(z.label)}${z.bdg ? `<span class="as-bdg">${z.bdg}</span>` : ''}</button>`).join('') + '</div>';
    html += secs.map(z => `<div class="as-pan" role="tabpanel" data-rp="${z.k}"${z.k === sel ? '' : ' hidden'}>${z.x}</div>`).join('');
  }
  html += `<p class="as-note">Generado el ${new Date().toLocaleDateString('es-CL')} con datos de órdenes de compra al ${monthLab(S.C.w12[1].toString().slice(0, 4) + '-' + S.C.w12[1].toString().slice(4))}. ${esc(R().TEXTO_BASE)}</p>`;
  return html;
}
function linksHtml(l){ return l && l.length ? '<br>' + l.map(x => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a>`).join(' · ') : ''; }
function escaleraHtml(o){
  const e = o.escalera; if(!e) return '';
  const ec = o.pasos.find(x => x.titulo === 'Economía circular');
  let h = '<div class="as-sec as-esc"><h3>Orden de opciones para esta compra</h3>';
  if(ec && !e.ecOpcion) h += `<div class="as-op as-op-prev"><div class="as-op-n">Antes</div><div class="as-op-b"><b>Economía circular</b> <span class="as-tag as-t-${esc2(ec.estado)}">${esc(ec.estado)}</span><p>${esc(ec.texto)}</p>${citas(ec.arts)}</div></div>`;
  e.opciones.forEach(op => {
    h += `<div class="as-op as-op-${op.k.toLowerCase()}"><div class="as-op-n">Opción ${op.n}</div><div class="as-op-b"><b>${esc(op.titulo)}</b> <span class="as-tag as-t-${op.tag === 'prioridad' || op.tag === 'primera opción' ? 'obligatorio' : (op.tag === 'excepcional' ? 'verificar' : 'recomendado')}">${esc(op.tag)}</span><p>${esc(op.texto)}</p>`;
    if(op.k === 'EC') h += `<p class="as-hint">Consulta la plataforma: <a href="${window.AS_CMV ? window.AS_CMV.eco : '#'}" target="_blank" rel="noopener">Economía Circular de Mercado Público</a>.</p>`;
    if(op.subs) h += '<ul class="as-op-s">' + op.subs.map(s => `<li class="${s.est === 'descartada' ? 'as-off' : ''}"><b>${esc(s.nom)}</b> <span class="as-tag as-t-${s.est === 'descartada' ? 'descartado' : (s.est === 'procede' ? 'recomendado' : (s.est === 'obligatoria' ? 'obligatorio' : 'verificar'))}">${esc(s.est)}</span> ${esc(s.texto)}${linksHtml(s.links)}${s.arts && s.k === 'BT' ? citas(s.arts) : ''}</li>`).join('') + '</ul>';
    if(op.causales) h += '<ul class="as-op-s">' + op.causales.map(c => `<li><b>${esc(CAUS_NOM(c))}</b> <span class="as-hint">(art. ${esc(c.n)} DS 661)</span></li>`).join('') + '</ul><p class="as-hint">Si ninguna calza con hechos que puedas acreditar, esta opción no corresponde. Elige en el paso 3 la situación que aplique y el Asesor te muestra los requisitos de esa causal.</p>';
    h += citas(op.arts) + '</div></div>';
  });
  return h + '</div>';
}
const esc2 = x => String(x).replace(/\s+/g, '-');
const CAUS_NOM = c => c.t;
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
  const ln = activeLine(), umSel = lineUm(ln), pu = ln.pu ? ln.pu / 1.19 : 0;
  const pps = pp.slice().sort((a, b) => (S.C.ums[b[0]] === umSel ? 1e12 : 0) + b[1] - ((S.C.ums[a[0]] === umSel ? 1e12 : 0) + a[1]));
  if(!pp.some(x => S.C.ums[x[0]] === umSel)) html += `<p class="as-hint">No hay precios de referencia por ${esc(umSel)}. Se muestran las unidades en que se ha comprado este producto.</p>`;
  pps.forEach(x => {
    const um = S.C.ums[x[0]], p25 = x[2], p50 = x[3], p75 = x[4], mia = um === umSel;
    let orgp = null;
    if(h && h.row && h.row[6] && h.row[6][0] === x[0]){ const z = h.row[6]; const ratio = z[1] / p50; if(ratio > .05 && ratio < 20) orgp = {v: z[1], n: z[3], ratio}; }
    const lo = Math.min(p25, orgp ? orgp.v : p25) * .6, hi = Math.max(p75, orgp ? orgp.v : p75) * 1.25;
    const pos = v => Math.max(0, Math.min(100, 100 * (v - lo) / (hi - lo)));
    html += `<p><b>Por ${esc(um)}${mia ? ' (tu unidad)' : ''}</b> · ${fmt(x[1])} compras · mediana ${clp(p50)}, rango central ${clp(p25)} a ${clp(p75)}</p>
      <div class="as-price" aria-hidden="true"><div class="as-pr-line"></div><div class="as-pr-band" style="left:${pos(p25)}%;width:${pos(p75) - pos(p25)}%"></div><div class="as-pr-med" style="left:${pos(p50)}%"></div>${orgp ? `<div class="as-pr-org" style="left:${pos(orgp.v)}%"></div>` : ''}
      <span class="as-pr-l" style="left:${pos(p25)}%">${clp(p25)}</span><span class="as-pr-l" style="left:${Math.min(96, pos(p75))}%">${clp(p75)}</span></div>`;
    if(mia && pu) html += `<p>Tu precio de ${clp(Math.round(pu))} neto por ${esc(um)} (${clp(ln.pu)} con IVA) está ${pu > p75 ? 'sobre el rango central' : (pu < p25 ? 'bajo el rango central' : 'dentro del rango central')}${p50 ? ' y ' + (Math.abs(pu / p50 - 1) < .05 ? 'cerca de la mediana' : Math.round(Math.abs(pu / p50 - 1) * 100) + ' % ' + (pu > p50 ? 'sobre' : 'bajo') + ' la mediana') : ''}.</p>`;
    if(orgp) html += `<p>Tu organismo pagó en promedio <b>${clp(Math.round(orgp.v))}</b> por ${esc(um)} en ${orgp.n} compras: ${orgp.ratio > 1.25 ? Math.round((orgp.ratio - 1) * 100) + ' % sobre la mediana nacional' : (orgp.ratio < .8 ? Math.round((1 - orgp.ratio) * 100) + ' % bajo la mediana nacional' : 'cerca de la mediana nacional')} (marca rosada). Es un promedio ponderado: un par de compras grandes puede distorsionarlo.</p>`;
  });
  return html + '<p class="as-hint">Referencia para negociar y para fundar el presupuesto estimado (DS 661, art. 41 N° 3: precios conforme al mercado). La unidad de medida declarada por los compradores varía; compara solo dentro de la misma unidad.' + (pu ? ' Tu precio se compara neto de IVA (19 %).' : '') + '</p></div>';
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
  let html = `<div class="as-sec"><h3>Proveedores de ${esc(regEn(reg))} que han vendido este producto</h3>`;
  const tabla = (lst) => '<div class="as-tw"><table class="as-t"><tr><th>Proveedor</th><th class="n">OC</th><th class="n">Vendido 12 meses</th></tr>' + lst.map(x => { const pv = P.pl[x[0]]; return `<tr><td>${pv[0] ? `<a href="#proveedores=${encodeURIComponent(pv[0])}" target="_blank" rel="noopener">${esc(pv[1])}</a>` : esc(pv[1])}<br><span class="as-hint">${esc(pv[0])}</span></td><td class="n">${fmt(x[1])}</td><td class="n">${mm(x[2])}</td></tr>`; }).join('') + '</table></div>';
  if(rp){
    html += `<p>${fmt(rp[0])} proveedores con ventas de este producto a organismos ${reg ? 'de la región' : 'del país'} (se muestran los ${rp.length - 1} con mayor venta). La región es la que elegiste en el paso 1.</p>` + tabla(rp.slice(1));
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
  return `<div class="as-sec"><h3>Demanda que podrías consolidar</h3><p>${fmt(d[0])} organismos de ${esc(regEn(reg))} compraron este producto por ${mm(d[1])} en los últimos 12 meses.${d[2] ? ' Ya existen compras coordinadas de este producto por ' + mm(d[2]) + '.' : ''} Agregar demanda mediante Compra Coordinada puede mejorar el precio y reducir los costos de transacción de todos.</p>
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
      b2.querySelectorAll('.as-opt').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.i); S.orgIdx = i; S.org = S.O.o[i]; S.st.o = S.org[0]; S.st.u = null; S.st.r = null; S.od = null; syncUrl(); el.innerHTML = '<div class="as-load">Cargando…</div>'; loadOrg(i).then(d => { S.od = d; renderDiag(); }); }));
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
  $('as-dx').addEventListener('click', () => { S.orgIdx = null; S.org = null; S.od = null; S.st.o = null; S.st.u = null; S.st.r = null; syncUrl(); renderDiag(); });
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
    S.li = 0; S.pacLn = {}; activate(0);
    if(!st.mes || !S.C.utm[st.mes]) st.mes = null;
    const ready = [];
    if(st.o && S.orgByCode[st.o] != null){ S.orgIdx = S.orgByCode[st.o]; S.org = S.O.o[S.orgIdx]; S.loadingOrg = true; ready.push(loadOrg(S.orgIdx).then(d => { S.od = d; S.loadingOrg = false; })); }
    renderTab();
    return Promise.all(ready).then(() => { if(S.tab === 'asesor'){ paintSelections(); return loadSegFor(); } else renderDiag(); }).then(() => { if(S.tab === 'asesor') update(); });
  }).catch(e => { host.innerHTML = '<div class="as-err">' + esc(e.message) + '</div>'; });
}
window.AsesorCompras = {init};
})();
