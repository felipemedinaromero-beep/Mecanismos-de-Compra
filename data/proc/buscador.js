/* Buscador de procesos de compra (licitaciones, tratos directos, Compra Ágil, Convenio Marco, compras coordinadas y otros).
   Los datos viven en data/proc/: man.js (manifiesto), dic.js (diccionarios) y un archivo por mecanismo y mes (PROC_SH["mec|AAAA-MM"]).
   Cada búsqueda recorre los archivos del período y mecanismos elegidos de uno en uno (más nuevo primero) y descarta cada archivo después de revisarlo. */
(function(){
'use strict';
if(window.ProcBuscador) return;
window.PROC_SH = window.PROC_SH || {};
const BASE = 'data/proc/';
const MECS = [
  {k:'l',  n:'Licitaciones',      sub:'públicas y privadas', c:'#0032A2'},
  {k:'td', n:'Trato directo',     sub:'contratación directa', c:'#4A2E8F'},
  {k:'ca', n:'Compra Ágil',       sub:'cotizaciones', c:'#0B78CC'},
  {k:'cm', n:'Convenio Marco',    sub:'catálogo', c:'#2F7D32'},
  {k:'cc', n:'Compra coordinada', sub:'gran compra', c:'#8A4FBF'},
  {k:'ot', n:'Otras OC',          sub:'cotización y sin clasificar', c:'#6B7A88'}
];
const MEC = Object.fromEntries(MECS.map(m => [m.k, m]));
const CAP = 50000, PAGE = 30;
const REGS = [['Arica y Parinacota',/arica/],['Tarapacá',/tarapaca/],['Antofagasta',/antofagasta/],['Atacama',/atacama/],['Coquimbo',/coquimbo/],
  ['Valparaíso',/valparaiso/],['Metropolitana de Santiago',/metropolitana/],['O’Higgins',/higgins/],['Maule',/maule/],['Ñuble',/nuble/],
  ['Biobío',/bio.?bio/],['La Araucanía',/araucania/],['Los Ríos',/los rios/],['Los Lagos',/los lagos/],['Aysén',/aysen/],['Magallanes',/magallanes/]];
const SYN = [['mantencion','mantenimiento','mantenci'],['reparacion','reparar'],['instalacion','instalar'],['arriendo','arrendamiento','alquiler'],
  ['limpieza','aseo'],['asesoria','consultoria'],['capacitacion','capacitar'],['climatizacion','climatizador']];
const SYN2 = [['aire acondicionado','aires acondicionados','climatizacion','climatizador','aire acond']];
const STOP = new Set(['de','del','la','el','los','las','y','e','en','para','por','a','al','con','un','una','o','u','se','su']);
const ST = {token:0, N:null, res:[], cnt:{}, sum:{}, total:0, sumAll:0, capped:false, page:0, sort:{k:'sc', dir:-1}, open:new Set(), params:null, busy:false, q:'', t0:0, A:null, listOpen:false, pv:{}, pn:null, jobs:null, filtTxt:null};
const ASCII = /^[\x00-\x7f]*$/;
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => n == null ? '' : Number(n).toLocaleString('es-CL', {maximumFractionDigits:0});
function norm(s){ if(!s) return ''; s = String(s); return ASCII.test(s) ? s.toLowerCase() : s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function stem(w){ return w.length >= 5 ? w.replace(/(es|s)$/, '') : w; }
function dayDate(f){ return new Date(Date.UTC(2024, 0, 1 + f)); }
function dayStr(f){ if(f == null || f < 0) return ''; const d = dayDate(f); return String(d.getUTCDate()).padStart(2,'0') + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + d.getUTCFullYear(); }
function ymLabel(ym){ const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; return M[+ym.slice(5) - 1] + '-' + ym.slice(0,4); }
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('No se pudo cargar ' + src + '. Si abriste solo el archivo HTML, deja la carpeta "data" junto a él.')); }; document.head.appendChild(s); }); }
const ver = () => (typeof DATA !== 'undefined' && DATA.generado) ? '?v=' + DATA.generado : '';
async function ensureMan(){ if(window.PROC_MAN) return window.PROC_MAN; await loadScript(BASE + 'man.js' + ver()); return window.PROC_MAN; }
let _dicP = null;
async function ensureDic(){
  if(!window.PROC_DIC){ if(!_dicP) _dicP = loadScript(BASE + 'dic.js' + ver()).catch(e => { _dicP = null; throw e; }); await _dicP; }
  if(!ST.N){
    const D = window.PROC_DIC;
    ST.N = {prd: D.prd.map(norm), rub: D.rub.map(norm), org: D.org.map(o => norm(o[1])),
      uni: D.uni.map(u => { const r = norm(u[3]); return norm(u[2]) + ' ' + r + ' ' + r.replace(/\./g, '') + ' ' + u[1]; }),
      prov: D.prov.map(p => { const r = norm(p[0]); return norm(p[1]) + ' ' + r + ' ' + r.replace(/\./g, ''); }),
      sec: D.org.map(o => norm(o[2])),
      regc: D.reg.map(r => { const n = norm(r); for(let i = 0; i < REGS.length; i++) if(REGS[i][1].test(n)) return i; return -1; })};
  }
  return window.PROC_DIC;
}
function shardUrl(job){ return BASE + job.mec + '_' + job.ym + '.js?v=' + job.h; }
function loadShard(job){
  const key = job.mec + '|' + job.ym;
  return loadScript(shardUrl(job)).then(() => { const sh = window.PROC_SH[key]; if(!sh) throw new Error('El archivo ' + key + ' no trae datos'); return sh; });
}

// ---------- consulta ----------
// Coincidencia por inicio de palabra (mantencion encuentra mantenciones; aseo no encuentra paseo).
const ID_RE = /^\d+-\d+-[a-z0-9]+$/;
function squash(s){ return (' ' + s).replace(/[^a-z0-9]+/g, ' '); }
function parseQuery(raw, useSyn){
  let q = norm(raw);
  const phrases = [];
  q = q.replace(/"([^"]+)"/g, (m, p) => { p = squash(norm(p)).replace(/\s+$/, ''); if(p.trim()) phrases.push(p); return ' '; });
  const neg = [], toks = [], ids = [], toksRaw = [];
  q.split(/\s+/).filter(Boolean).forEach(w => {
    if(w[0] === '-' && w.length > 2 && !ID_RE.test(w.slice(1))){ squash(w.slice(1)).trim().split(' ').filter(Boolean).forEach(x => neg.push(' ' + stem(x))); return; }
    if(ID_RE.test(w)){ ids.push(w); return; }
    squash(w).trim().split(' ').filter(x => x && !STOP.has(x)).forEach(x => { toks.push(stem(x)); toksRaw.push(x); });
  });
  const groups = [];
  for(let i = 0; i < toks.length; i++){
    const t = toks[i];
    if(useSyn && t === 'aire' && toks[i+1] && toks[i+1].indexOf('acondicionad') === 0){ groups.push({alts: SYN2[0].map(a => ' ' + a)}); i++; continue; }
    let alts = [t];
    if(useSyn){ const g = SYN.find(g => g.some(a => t.indexOf(a) === 0 || (t.length >= 6 && a.indexOf(t) === 0))); if(g) alts = g.slice(); }
    groups.push({alts: alts.map(a => ' ' + a)});
  }
  ids.forEach(x => groups.push({alts: [x], id: true}));
  return {groups, phrases, neg, empty: !groups.length && !phrases.length && !neg.length, raw, joined: toksRaw.length > 1 ? ' ' + toksRaw.join(' ') : ''};
}
function textTest(h, ih, P){
  for(let i = 0; i < P.groups.length; i++){
    const g = P.groups[i], H = g.id ? ih : h; let ok = false;
    for(let j = 0; j < g.alts.length; j++) if(H.indexOf(g.alts[j]) >= 0){ ok = true; break; }
    if(!ok) return false;
  }
  for(let i = 0; i < P.phrases.length; i++) if(h.indexOf(P.phrases[i]) < 0) return false;
  for(let i = 0; i < P.neg.length; i++) if(h.indexOf(P.neg[i]) >= 0) return false;
  return true;
}
function tokens(s){ return norm(s).split(/\s+/).filter(Boolean).map(t => t.replace(/\./g, '')); }
function provIdxs(mec, sh, i){
  if(mec !== 'l') return [sh.v[i]];
  const out = [];
  [sh.adj && sh.adj[i], sh.ocv && sh.ocv[i]].forEach(s => { if(s) s.split(',').forEach(x => { const k = +x.split(':')[0]; if(!isNaN(k) && out.indexOf(k) < 0) out.push(k); }); });
  return out;
}
function mkRec(mec, job, sh, i, sc){
  const r = {mec, ym: job.ym, sc}; for(const k in sh){ const a = sh[k]; if(Array.isArray(a)) r[k] = a[i]; }
  if(sh.fx && sh.fx[i]) r.fx = sh.fx[i];
  return r;
}
function matchShard(job, sh, P){
  const D = window.PROC_DIC, N = ST.N, mec = job.mec, n = sh.N, isL = mec === 'l', hasText = !P.q.empty;
    for(let i = 0; i < n; i++){
    const mo = isL ? (sh.moc[i] || 0) : sh.m[i];
    if(P.min != null && (isL ? (mo || sh.me[i]) : mo) < P.min) continue;
    if(P.max != null && (isL ? (mo || sh.me[i]) : mo) > P.max) continue;
    const u = sh.u[i];
    if(P.reg >= 0 && N.regc[D.uni[u][4]] !== P.reg) continue;
    if(P.est){ if(isL){ if(P.est.k !== 'l' || sh.es[i] !== P.est.v) continue; } else if(P.est.k !== 'o' || sh.e[i] !== P.est.v) continue; }
    if(P.tipo){ if(!isL) continue; if(P.tipo === 'pub'){ if(sh.k[i]) continue; } else if(P.tipo === 'priv'){ if(!sh.k[i]) continue; } else if(sh.tp[i] !== P.tipo) continue; }
    if(P.nmin != null || P.nmax != null){ if(!isL) continue; const no = sh.no[i] || 0; if(P.nmin != null && no < P.nmin) continue; if(P.nmax != null && no > P.nmax) continue; }
    if(P.cau >= 0){ if(isL || !sh.k || sh.k[i] !== P.cau) continue; }
    if(P.sec && N.sec[sh.o[i]] !== P.sec) continue;
    if(P.rub.length){ const rb0 = sh.rb[i]; if(rb0 < 0) continue; const hr0 = N.rub[rb0]; let ok0 = true; for(let k = 0; k < P.rub.length; k++) if(hr0.indexOf(P.rub[k]) < 0){ ok0 = false; break; } if(!ok0) continue; }
    if(P.ids.length){ let ih0 = sh.c[i].toLowerCase(); if(sh.x){ const x0 = sh.x[i]; if(x0) ih0 += ' ' + x0.toLowerCase(); } if(sh.l){ const l0 = sh.l[i]; if(l0) ih0 += ' ' + l0.toLowerCase(); } let ok1 = false; for(let k = 0; k < P.ids.length; k++) if(ih0.indexOf(P.ids[k]) >= 0){ ok1 = true; break; } if(!ok1) continue; }
    if(P.org.length){ const h = N.org[sh.o[i]] + ' ' + N.uni[u]; let ok = true; for(let k = 0; k < P.org.length; k++) if(h.indexOf(P.org[k]) < 0){ ok = false; break; } if(!ok) continue; }
    if(P.prov.length){
      const pv = provIdxs(mec, sh, i); let ok = false;
      for(let a = 0; a < pv.length && !ok; a++){ const h = N.prov[pv[a]]; let all = true; for(let k = 0; k < P.prov.length; k++) if(h.indexOf(P.prov[k]) < 0){ all = false; break; } if(all) ok = true; }
      if(!ok) continue;
    }
    let sc = 0;
    if(hasText){
      const ht = squash(norm(sh.t[i]));
      let hx = '';
      if(sh.d){ const d = sh.d[i]; if(d) hx += ' ' + norm(d); }
      if(sh.ln){ const l = sh.ln[i]; if(l) hx += ' ' + norm(l); }
      const p = sh.p[i]; if(p){ const ps = p.split(','); for(let k = 0; k < ps.length; k++) hx += ' ' + N.prd[+ps[k]]; }
      hx = squash(hx);
      const rb = sh.rb[i]; const hr = rb >= 0 ? squash(N.rub[rb]) : '';
      let ih = sh.c[i].toLowerCase(); if(sh.x){ const x = sh.x[i]; if(x) ih += ' ' + x.toLowerCase(); } if(sh.l){ const l = sh.l[i]; if(l) ih += ' ' + l.toLowerCase(); }
      if(!textTest(ht + hx + hr, ih, P.q)) continue;
      const Q = P.q;
      for(let g = 0; g < Q.groups.length; g++){
        const G = Q.groups[g]; if(G.id){ sc += 5; continue; }
        let t = false, x = false; for(let j = 0; j < G.alts.length; j++){ if(ht.indexOf(G.alts[j]) >= 0){ t = true; break; } if(hx.indexOf(G.alts[j]) >= 0) x = true; }
        sc += t ? 3 : (x ? 1.5 : 0.5);
      }
      for(let k = 0; k < Q.phrases.length; k++) if(ht.indexOf(Q.phrases[k]) >= 0) sc += 3;
      if(Q.joined && ht.indexOf(Q.joined) >= 0) sc += 4;
    }
    if(P.grp && !grpTest(P.grp, mec, job.ym, k => sh[k] ? sh[k][i] : undefined)) continue;
    if(P.sink){ if(P.sink.res.length < CAP) P.sink.res.push(mkRec(mec, job, sh, i, sc)); else P.sink.capped = true; continue; }
    const moa = mo > OUT_MAX ? 0 : (mo || 0);
    ST.cnt[mec] = (ST.cnt[mec] || 0) + 1; ST.sum[mec] = (ST.sum[mec] || 0) + moa; ST.total++; ST.sumAll += moa;
    accum(job, sh, i, mo || 0);
    if(ST.res.length < CAP) ST.res.push(mkRec(mec, job, sh, i, sc)); else ST.capped = true;
  }
}

// ---------- datos de un registro ----------
const D_ = () => window.PROC_DIC;
function montoOf(r){ return r.mec === 'l' ? (r.moc || 0) : (r.m || 0); }
function orgOf(r){ return D_().org[r.o]; }
function uniOf(r){ return D_().uni[r.u]; }
function regionOf(r){ const g = D_().reg[uniOf(r)[4]]; return g ? g.trim() : ''; }
function provParse(s){ return s ? s.split(',').map(x => { const [i, m] = x.split(':'); return {p: D_().prov[+i], m: +m || 0}; }).filter(x => x.p) : []; }
function provsOf(r){
  if(r.mec !== 'l'){ const p = D_().prov[r.v]; return p ? [{p, m: r.m}] : []; }
  const a = provParse(r.adj); return a.length ? a : provParse(r.ocv);
}
function estadoOf(r){ if(r.mec === 'l') return r.es >= 0 ? D_().est[r.es] : 'Licitación anterior a ene-2025'; return r.e === 0 ? 'Aceptada' : 'Recepción conforme'; }
function linkOf(r){ return r.mec === 'l' ? 'http://www.mercadopublico.cl/fichaLicitacion.html?idLicitacion=' + encodeURIComponent(r.c) : 'https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC=' + encodeURIComponent(r.c); }
function prodsOf(r){ return r.p ? r.p.split(',').map(x => D_().prd[+x]) : []; }
function rubOf(r){ return r.rb >= 0 ? D_().rub[r.rb] : ''; }
const TIPO_LIC = {L1:'Licitación Pública menor a 100 UTM', LE:'Licitación Pública entre 100 y 1.000 UTM', LP:'Licitación Pública entre 1.000 y 2.000 UTM', LQ:'Licitación Pública entre 2.000 y 5.000 UTM',
  LR:'Licitación Pública mayor a 5.000 UTM', LS:'Licitación Pública de servicios personales especializados', E2:'Licitación Privada menor a 100 UTM', CO:'Licitación Privada entre 100 y 1.000 UTM',
  B2:'Licitación Privada entre 1.000 y 2.000 UTM', H2:'Licitación Privada entre 2.000 y 5.000 UTM', I2:'Licitación Privada mayor a 5.000 UTM', O1:'Licitación Privada de servicios personales especializados', O2:'Licitación Privada'};
function mecLabel(r){ if(r.mec === 'l') return r.k ? 'Licitación privada' : 'Licitación pública'; return MEC[r.mec].n; }
function sortVal(r, k){
  switch(k){
    case 'f': return r.f;
    case 'sc': return r.sc || 0;
    case 'mo': return r.mec === 'l' ? (r.moc || r.me || 0) : r.m;
    case 't': return norm(r.t);
    case 'org': return norm(orgOf(r)[1]);
    case 'mec': return mecLabel(r);
    case 'c': return r.c;
  }
  return 0;
}

// ---------- presentación ----------
function hl(text, P){
  const t = String(text == null ? '' : text); if(!t) return '';
  const n = norm(t); if(n.length !== t.length || !P || P.empty) return esc(t);
  const iv = [];
  const add = s => { s = s.trim(); if(s.length < 2) return; let i = 0; while((i = n.indexOf(s, i)) >= 0){ if(i === 0 || !/[a-z0-9]/.test(n[i-1])) iv.push([i, i + s.length]); i += s.length; } };
  P.groups.forEach(g => { if(!g.id) g.alts.forEach(add); }); P.phrases.forEach(add);
  if(!iv.length) return esc(t);
  iv.sort((a, b) => a[0] - b[0]); const m = [iv[0].slice()];
  for(let i = 1; i < iv.length; i++){ const l = m[m.length - 1]; if(iv[i][0] <= l[1]) l[1] = Math.max(l[1], iv[i][1]); else m.push(iv[i].slice()); }
  let out = '', p = 0; m.forEach(([a, b]) => { out += esc(t.slice(p, a)) + '<mark>' + esc(t.slice(a, b)) + '</mark>'; p = b; });
  return out + esc(t.slice(p));
}
function monCode(s){
  const n = norm(s);
  if(!n) return ''; if(n === 'clp' || n.indexOf('peso chileno') >= 0) return 'CLP'; if(n.indexOf('unidad de fomento') >= 0 || n === 'clf' || n === 'uf') return 'UF';
  if(n.indexOf('dolar') >= 0 || n === 'usd') return 'USD'; if(n.indexOf('euro') >= 0 || n === 'eur') return 'EUR'; if(n.indexOf('revisar') >= 0) return 'Por revisar'; return String(s).trim();
}
function monedaTxt(r){
  if(r.mec === 'l') return r.mo >= 0 ? monCode(D_().mon[r.mo]) : '';
  return r.fx ? fmt(r.fx[1]) + ' ' + monCode(D_().mon[r.fx[0]]) : '';
}
function fichaField(k, v, wide){ if(v == null || v === '') return ''; return `<div class="pf${wide ? ' pf-w' : ''}"><span class="pf-k">${esc(k)}</span><span class="pf-v">${v}</span></div>`; }
function fichaHtml(r, P){
  const D = D_(), o = orgOf(r), u = uniOf(r), mec = r.mec;
  const link = linkOf(r);
  const prods = prodsOf(r), pr = provsOf(r);
  const si = v => v === '1' || v === 'Si' || v === 'Sí' ? 'Sí' : (v === '0' || v === 'No' ? 'No' : v);
  let proc = '', mont = '', fech = '', que = '';
  proc += fichaField('ID', `<b>${esc(r.c)}</b> · <a href="${esc(link)}" target="_blank" rel="noopener">Abrir ficha en Mercado Público</a>`);
  proc += fichaField('Mecanismo', esc(mecLabel(r)));
  if(mec === 'l'){
    proc += fichaField('Tipo de licitación', esc((r.tp || '') + (TIPO_LIC[r.tp] ? ' · ' + TIPO_LIC[r.tp] : '')));
    proc += fichaField('Estado', esc(estadoOf(r)));
    if(r.sb) proc += fichaField('Origen de la ficha', 'Licitación publicada antes de ene-2025: los datos salen de las OC asociadas y no hay ficha de bases en los archivos descargados.', true);
    proc += fichaField('Renovable', si(r.re)) + fichaField('Toma de razón', si(r.tr));
    proc += fichaField('Criterios ambientales', si(r.am)) + fichaField('Criterios sociales', si(r.so));
    proc += fichaField('Fuente de financiamiento', esc(r.fu));
  } else {
    proc += fichaField('Estado de la OC', esc(estadoOf(r)));
    if(mec === 'td'){ proc += fichaField('Causal de trato directo', esc(r.k >= 0 ? D.cau[r.k] : '')); proc += fichaField('Ficha de trato directo', esc(r.x)); }
    if(mec === 'ca') proc += fichaField('ID de la cotización (Compra Ágil)', esc(r.x));
    if(mec === 'cm') proc += fichaField('Convenio Marco', esc(r.x));
    if(mec === 'cc' || mec === 'ot') proc += fichaField('Procedencia', esc(r.k >= 0 ? D.cau[r.k] : ''));
    if(mec === 'ot') proc += fichaField('Licitación de origen', esc(r.l));
    proc += fichaField('Plan Anual de Compras (código de proyecto)', esc(r.pa));
  }
  if(r.d) proc += fichaField(mec === 'l' ? 'Descripción' : 'Descripción de la OC', hl(r.d, P && P.q), true);
  if(mec === 'l'){
    mont += fichaField('Monto estimado', r.me ? esc(fmt(r.me) + ' ' + monedaTxt(r)) + (r.vm ? '' : ' <span class="pf-s">(monto no visible para los oferentes)</span>') : '');
    mont += fichaField('N° de ofertas / oferentes', r.no ? fmt(r.no) : '');
    mont += fichaField('N° de ítems', r.ni ? fmt(r.ni) : '');
    mont += fichaField('OC asociadas (ene-2025 a oct-2026)', r.noc ? fmt(r.noc) + ' OC · $' + fmt(r.moc) + ' CLP' : (r.sb ? '' : 'Sin OC en el período'));
    mont += fichaField('Primera / última OC', r.noc ? dayStr(r.f1) + ' / ' + dayStr(r.f2) : '');
    fech += fichaField(r.sb ? 'Primera OC' : 'Publicación', dayStr(r.f)) + fichaField('Cierre de ofertas', dayStr(r.fc)) + fichaField('Adjudicación (fecha informada)', dayStr(r.fa));
  } else {
    mont += fichaField('Monto total OC (CLP)', '$' + fmt(r.m));
    mont += fichaField('Monto en moneda original', r.fx ? esc(monedaTxt(r)) : '');
    mont += fichaField('N° de ítems', r.n ? fmt(r.n) : '');
    fech += fichaField('Fecha de envío de la OC', dayStr(r.f));
  }
  if(mec === 'l' && r.ln) que += fichaField('Líneas de adquisición', esc(r.ln), true);
  if(prods.length) que += fichaField('Productos', prods.map(esc).join('; ') + ((mec === 'l' ? r.ni : r.n) > prods.length ? ' <span class="pf-s">(los principales)</span>' : ''), true);
  que += fichaField('Rubro › familia › clase', esc(rubOf(r)), true);
  let comp = fichaField('Organismo', esc(o[1]) + ' <span class="pf-s">cód. ' + esc(o[0]) + '</span>') + fichaField('Sector', esc(o[2]));
  comp += fichaField('Unidad de compra', esc(u[2]) + ' <span class="pf-s">cód. ' + esc(u[1]) + '</span>') + fichaField('RUT unidad', esc(u[3]));
  comp += fichaField('Región', esc(regionOf(r))) + fichaField('Comuna / ciudad', esc(u[5])) + fichaField('Dirección', esc(r.di));
  comp += fichaField('Contacto', '<span class="pf-s">Los datos abiertos no incluyen nombre, correo ni teléfono del comprador. Están en la ficha oficial de Mercado Público.</span>', true);
  const prl = pr.map(x => `<div>${esc(x.p[1])} <span class="pf-s">RUT ${esc(x.p[0])}${x.m ? ' · $' + fmt(x.m) : ''}</span></div>`).join('');
  let prov = prl ? fichaField(mec === 'l' ? (r.adj ? 'Proveedores adjudicados' : 'Proveedores con OC') : 'Proveedor', prl, true) : '';
  if(mec === 'l' && r.adj && r.ocv) prov += fichaField('Proveedores con más OC', provParse(r.ocv).map(x => `<div>${esc(x.p[1])} <span class="pf-s">RUT ${esc(x.p[0])} · $${fmt(x.m)}</span></div>`).join(''), true);
  if(mec === 'l' && r.ns > 3) prov += fichaField('Otros', 'Se adjudicó a ' + r.ns + ' proveedores; se muestran los 3 de mayor monto.', true);
  const sec = (h, body) => body ? `<div class="pf-sec"><h4>${h}</h4><div class="pf-grid">${body}</div></div>` : '';
  const sid = encodeURIComponent(o[0]);
  return `<div class="pf-wrap">${sec('Proceso', proc)}${sec('Qué se compró', que)}${sec('Comprador', comp)}${sec('Proveedores', prov)}${sec('Montos', mont)}${sec('Fechas', fech)}
    <div class="pf-actions"><a class="proc-lnk" href="${esc(link)}" target="_blank" rel="noopener">Ver en Mercado Público</a>
    <a class="proc-lnk" href="#comprador=${sid}" target="_blank" rel="noopener">Ver todas las compras de este organismo</a></div></div>`;
}
function sortedRes(){
  const k = ST.sort.k, d = ST.sort.dir;
  if(!ST._sorted || ST._sortKey !== k + d){
    ST._sorted = ST.res.map((r, i) => i);
    const vals = ST.res.map(r => sortVal(r, k));
    ST._sorted.sort((a, b) => { const x = vals[a], y = vals[b]; return (x < y ? -1 : x > y ? 1 : 0) * d || (ST.res[b].f - ST.res[a].f); });
    ST._sortKey = k + d;
  }
  return ST._sorted;
}
function provShort(r){ const p = provsOf(r); if(!p.length) return '<span class="pf-s">—</span>'; return esc(p[0].p[1]) + (p.length > 1 ? ' <span class="pf-s">+' + (p.length - 1) + '</span>' : ''); }
function renderResults(){
  const out = document.getElementById('procOut'); if(!out) return;
  const P = ST.params;
  if(!ST.total){
    out.innerHTML = `<div class="cp-placeholder">No hay procesos que coincidan. Prueba con menos palabras, activa más mecanismos, amplía el período o quita filtros.${ST.notice ? '<br><span class="pf-s">' + esc(ST.notice) + '</span>' : ''}</div>`;
    return;
  }
  const idx = sortedRes(), pages = Math.max(1, Math.ceil(idx.length / PAGE)); ST.page = Math.min(ST.page, pages - 1);
  const chips = MECS.filter(m => ST.cnt[m.k]).map(m => `<span class="proc-chip" style="--c:${m.c}"><i></i>${esc(m.n)} <b>${fmt(ST.cnt[m.k])}</b></span>`).join('');
  const th = (k, lab, cls) => `<th class="sortable ${cls || ''}" data-sort="${k}">${lab}${ST.sort.k === k ? (ST.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const rows = !ST.listOpen ? '' : idx.slice(ST.page * PAGE, ST.page * PAGE + PAGE).map(ix => {
    const r = ST.res[ix], o = orgOf(r), u = uniOf(r), m = MEC[r.mec], opened = ST.open.has(ix);
    const mo = r.mec === 'l' ? (r.moc ? '$' + fmt(r.moc) : (r.me ? '<span class="pf-s" title="Monto estimado de la licitación">est. ' + fmt(r.me) + '</span>' : '—')) : '$' + fmt(r.m);
    const pr = prodsOf(r), sub = (pr.length ? pr.slice(0, 2).join('; ') : rubOf(r).split(' › ').pop());
    return `<tr class="proc-r${opened ? ' open' : ''}" data-i="${ix}">
      <td><span class="proc-tag" style="--c:${m.c}">${esc(mecLabel(r))}</span></td>
      <td class="proc-id"><a href="${esc(linkOf(r))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(r.c)}</a></td>
      <td>${dayStr(r.f)}</td>
      <td class="proc-t"><div>${hl(r.t, P.q) || '<span class="pf-s">(sin título)</span>'}</div><div class="pf-s">${hl(sub, P.q)}</div></td>
      <td><div>${esc(o[1])}</div><div class="pf-s">${esc(u[2])}</div></td>
      <td>${provShort(r)}</td>
      <td class="num">${mo}</td>
      <td>${esc(estadoOf(r))}</td></tr>` + (opened ? `<tr class="proc-f"><td colspan="8">${fichaHtml(r, P)}</td></tr>` : '');
  }).join('');
  const pg = pages > 1 ? `<div class="proc-pager"><button type="button" data-pg="-1" ${ST.page === 0 ? 'disabled' : ''}>← Anterior</button><span>Página ${ST.page + 1} de ${fmt(pages)}</span><button type="button" data-pg="1" ${ST.page >= pages - 1 ? 'disabled' : ''}>Siguiente →</button></div>` : '';
  const cap = ST.capped ? `<p class="cp-cap-note">Hay ${fmt(ST.total)} coincidencias. El análisis las incluye todas; el listado y la descarga traen las ${fmt(CAP)} más recientes. Acota la búsqueda para ver el listado completo.</p>` : '';
  const secs = ((Date.now() - ST.t0) / 1000).toFixed(1);
  const nota = ST.notice ? `<p class="cp-cap-note">${esc(ST.notice)}</p>` : '';
  out.innerHTML = `<div class="proc-sum"><div class="proc-sum-n"><b>${fmt(ST.total)}</b> proceso${ST.total === 1 ? '' : 's'}${ST.sumAll ? ' · <b>$' + fmt(ST.sumAll) + '</b> en OC (CLP)' : ''}</div><div class="proc-chips">${chips}</div></div>
    ${cap}${nota}
    <div class="proc-dl">${typeof dlBtn === 'function' ? dlBtn('procBuscador', 'procesos_de_compra_busqueda.csv', 'Descargar análisis y listado (Excel)') : ''}<span class="pf-s">El Excel trae el resumen, las tablas de este análisis y el listado; el CSV trae solo el listado. Búsqueda hecha en ${secs} s.</span></div>
    ${anHtml()}
    <details class="an-list" id="procList"${ST.listOpen ? ' open' : ''}><summary>Ver el listado de procesos (${fmt(Math.min(ST.total, CAP))})</summary>
      <div class="proc-dl"><label class="pf-s" for="procSort">Ordenar por</label><select id="procSort"><option value="sc"${ST.sort.k === 'sc' ? ' selected' : ''}>Relevancia</option><option value="f"${ST.sort.k === 'f' ? ' selected' : ''}>Más recientes</option><option value="mo"${ST.sort.k === 'mo' ? ' selected' : ''}>Mayor monto</option></select><span class="pf-s">Haz clic en una fila para ver todos los antecedentes</span></div>
      ${ST.listOpen ? `<div class="table-wrap proc-tw"><table class="dt proc-tbl"><thead><tr>${th('mec', 'Mecanismo')}${th('c', 'ID')}${th('f', 'Fecha')}${th('t', 'Título y qué se compró')}${th('org', 'Organismo · unidad')}<th>Proveedor</th>${th('mo', 'Monto (CLP)', 'num')}<th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${pg}` : ''}</details>`;
}
function exportRows(list){
  const D = D_();
  return (list || ST.res).map(r => {
    const o = orgOf(r), u = uniOf(r), pr = provsOf(r);
    const extra = r.mec === 'l' ? r.tp : (r.x || '');
    return [mecLabel(r), r.c, dayStr(r.f), r.t, (r.d || '').slice(0, 400), o[0], o[1], o[2], u[1], u[2], u[3], regionOf(r), u[5] || '', r.di || '',
      pr.map(x => x.p[1]).join(' | '), pr.map(x => x.p[0]).join(' | '), r.mec === 'l' ? (r.moc || '') : r.m, r.mec === 'l' ? (r.me || '') : '',
      r.mec === 'l' ? monedaTxt(r) : (r.fx ? monedaTxt(r) : 'CLP'), estadoOf(r), r.mec === 'l' ? (r.no || '') : '', r.mec === 'l' ? (r.noc || '') : 1,
      r.mec === 'td' ? (r.k >= 0 ? D.cau[r.k] : '') : (r.mec === 'cc' || r.mec === 'ot' ? (r.k >= 0 ? D.cau[r.k] : '') : ''), extra, r.pa || '', r.l || '',
      prodsOf(r).join('; '), rubOf(r), r.mec === 'l' ? (r.ni || '') : r.n, linkOf(r)];
  });
}
const EXP_HDR = ['Mecanismo','ID proceso','Fecha','Título / nombre','Descripción','Cód. organismo','Organismo','Sector','Cód. unidad de compra','Unidad de compra','RUT unidad','Región','Comuna / ciudad','Dirección',
  'Proveedor(es)','RUT proveedor(es)','Monto OC (CLP)','Monto estimado','Moneda (monto estimado u original)','Estado','N° oferentes','N° OC','Causal / procedencia','Tipo licitación / ID relacionado','Código PAC','Licitación de origen','Productos','Rubro › familia › clase','N° ítems','Enlace Mercado Público'];

// ---------- análisis de los resultados ----------
// Se acumula durante la lectura de cada archivo (todas las coincidencias, sin el tope del listado) y se dibuja al final.
// Cada grupo (fila de un gráfico) guarda procesos, monto de OC y número de OC: [n, monto, oc].
const OUT_MAX = 1e12;   // un proceso con más de $1 billón se trata como monto atípico: se informa aparte y no entra en sumas ni promedios
const HB = 0.02, HN = 1400;   // histograma logarítmico (paso de 2 %) para la mediana y los percentiles
const RANGOS = [[0,1e6,'Hasta $1 millón'],[1e6,3e6,'$1 a $3 millones'],[3e6,1e7,'$3 a $10 millones'],[1e7,3e7,'$10 a $30 millones'],[3e7,1e8,'$30 a $100 millones'],
  [1e8,5e8,'$100 a $500 millones'],[5e8,1e9,'$500 a $1.000 millones'],[1e9,Infinity,'Más de $1.000 millones']];
const OFERTAS = [[1,1,'1 oferta'],[2,2,'2 ofertas'],[3,3,'3 ofertas'],[4,5,'4 a 5 ofertas'],[6,10,'6 a 10 ofertas'],[11,Infinity,'Más de 10 ofertas']];
const PLAZOS = [[0,5,'Hasta 5 días'],[6,10,'6 a 10 días'],[11,20,'11 a 20 días'],[21,30,'21 a 30 días'],[31,Infinity,'Más de 30 días']];
const ORD_TP = ['L1','LE','LP','LQ','LR','LS','E2','CO','B2','H2','I2','O1','O2'];
const TIPO_LAB = {'l-pub':'Licitación pública','l-priv':'Licitación privada'};
const sentence = s => { s = String(s || '').trim().toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
const pct = (a, b) => b ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %' : '—';
const dec1 = x => x == null || isNaN(x) ? '—' : x.toLocaleString('es-CL', {maximumFractionDigits: 1});
function sig3(x){ if(!(x > 0)) return x; const p = Math.pow(10, Math.floor(Math.log10(x)) - 2); return Math.round(x / p) * p; }
function fmtM(n){
  if(n == null || isNaN(n)) return '—'; n = Math.round(n); const a = Math.abs(n);
  if(a >= 1e12) return '$' + (n / 1e12).toLocaleString('es-CL', {maximumFractionDigits: 2}) + ' billones';
  if(a >= 1e8) return '$' + Math.round(n / 1e6).toLocaleString('es-CL') + ' millones';
  if(a >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' millones';
  return '$' + fmt(n);
}
function plzIdx(d){ for(let k = 0; k < PLAZOS.length; k++) if(d <= PLAZOS[k][1]) return k; return PLAZOS.length - 1; }
function newAgg(){
  return {n: 0, nAmt: 0, sum: 0, oc: 0, items: {n: 0, s: 0}, fmin: null, fmax: null, min: null, max: null, hist: new Float64Array(HN), out: {n: 0, sum: 0, top: []},
    tipo: {}, tp: {}, rango: RANGOS.map(() => [0, 0, 0]),
    comp: {nL: 0, nFicha: 0, nOf: 0, sumOf: 0, hist: OFERTAS.map(() => [0, 0, 0]), est: {}, nAdj: 0, nNs: 0, sumNs: 0, nOfAdj: 0, sumOfAdj: 0},
    pl: {n: 0, sum: 0, hist: PLAZOS.map(() => [0, 0, 0]), nAd: 0, sumAd: 0}, estm: {n: 0, me: 0, moc: 0},
    reg: Array.from({length: 17}, () => [0, 0, 0]), sec: new Map(), org: new Map(), uni: new Map(), prov: new Map(), prd: new Map(), rub: new Map(), mes: new Map(), cau: new Map(),
    top: [], cand: [], candSeen: 0, estAdj: -2, monClp: null, done: false};
}
function bump(m, k, mo, oc){ let e = m.get(k); if(!e){ e = [0, 0, 0]; m.set(k, e); } e[0]++; e[1] += mo; e[2] += oc || 0; return e; }
function accum(job, sh, i, mo){
  const A = ST.A, D = window.PROC_DIC, N = ST.N, mec = job.mec, isL = mec === 'l';
  if(A.estAdj === -2){ A.estAdj = D.est.findIndex(e => e.indexOf('Adjudicada') === 0); A.monClp = D.mon.map(x => monCode(x) === 'CLP'); }
  const noc = isL ? (sh.noc ? (sh.noc[i] || 0) : 0) : 1;
  A.n++; A.oc += noc;
  const tk = isL ? (sh.k[i] ? 'l-priv' : 'l-pub') : mec;
  const T = A.tipo[tk] || (A.tipo[tk] = [0, 0, 0, 0]); T[0]++; T[3] += noc;
  if(isL){ const tp = sh.tp[i] || '?', e = A.tp[tp] || (A.tp[tp] = [0, 0, 0, 0]); e[0]++; e[3] += noc; }
  const f = sh.f[i]; if(f >= 0){ if(A.fmin == null || f < A.fmin) A.fmin = f; if(A.fmax == null || f > A.fmax) A.fmax = f; }
  const ni = isL ? (sh.ni ? sh.ni[i] : 0) : (sh.n ? sh.n[i] : 0); if(ni > 0){ A.items.n++; A.items.s += ni; }
  const atip = mo > OUT_MAX, m = (mo > 0 && !atip) ? mo : 0;
  if(atip){
    A.out.n++; A.out.sum += mo; A.out.top.push({c: sh.c[i], m: mo, t: sh.t[i], mec}); A.out.top.sort((a, b) => b.m - a.m); if(A.out.top.length > 5) A.out.top.length = 5;
  } else if(m){
    A.nAmt++; A.sum += m; T[1]++; T[2] += m;
    if(isL){ const e = A.tp[sh.tp[i] || '?']; e[1]++; e[2] += m; }
    const ref = () => ({c: sh.c[i], m, mec, ym: job.ym, t: sh.t[i], o: sh.o[i]});
    if(!A.min || m < A.min.m) A.min = ref();
    if(!A.max || m > A.max.m) A.max = ref();
    if(A.top.length < 10 || m > A.top[A.top.length - 1].m){ A.top.push(ref()); A.top.sort((a, b) => b.m - a.m); if(A.top.length > 10) A.top.length = 10; }
    A.hist[Math.min(HN - 1, Math.max(0, Math.floor(Math.log(m) / HB)))]++;
    for(let k = 0; k < RANGOS.length; k++) if(m < RANGOS[k][1]){ const r = A.rango[k]; r[0]++; r[1] += m; r[2] += noc; break; }
    if(isL && sh.me && sh.mo){ const me = sh.me[i] || 0, mi = sh.mo[i]; if(me > 0 && mi >= 0 && A.monClp[mi]){ A.estm.n++; A.estm.me += me; A.estm.moc += m; } }
  }
  bump(A.mes, job.ym, m, noc);
  const rg = N.regc[D.uni[sh.u[i]][4]], re = A.reg[rg < 0 ? 16 : rg]; re[0]++; re[1] += m; re[2] += noc;
  const o = D.org[sh.o[i]]; bump(A.sec, o[2] && o[2] !== 'SINDATO' ? o[2] : 'Sin sector', m, noc); bump(A.org, sh.o[i], m, noc);
  bump(A.uni, sh.u[i], m, noc)[3] = sh.o[i];
  // proveedores: en licitaciones se cuentan los adjudicados y los de las OC; el monto sale de las OC (CLP). No se lleva el número de OC por proveedor.
  if(isL){
    const seen = new Set();
    const add = (s, withAmt) => { if(!s) return; s.split(',').forEach(x => { const p = x.split(':'), k = +p[0]; if(isNaN(k)) return;
      let e = A.prov.get(k); if(!e){ e = [0, 0, 0]; A.prov.set(k, e); } if(!seen.has(k)){ e[0]++; seen.add(k); } if(withAmt) e[1] += (+p[1] || 0); }); };
    add(sh.adj[i], false); add(sh.ocv[i], true);
  } else if(sh.v[i] >= 0) bump(A.prov, sh.v[i], m, 1);
  const ps = sh.p[i]; if(ps) ps.split(',').forEach(x => { const k = +x; bump(A.prd, k, m, noc); });
  const rb = sh.rb[i]; if(rb >= 0){ const key = sentence(D.rub[rb].split(' › ')[0]); bump(A.rub, key, m, noc); }
  if(!isL && (mec === 'td' || mec === 'cc' || mec === 'ot') && sh.k && sh.k[i] >= 0) bump(A.cau, sh.k[i], m, noc);
  if(isL){
    const C = A.comp; C.nL++;
    if(!sh.sb[i]){
      C.nFicha++; const es = sh.es[i]; const ee = C.est[es] || (C.est[es] = [0, 0, 0]); ee[0]++; ee[1] += m; ee[2] += noc;
      const no = sh.no[i] || 0;
      if(no > 0){ C.nOf++; C.sumOf += no; for(let k = 0; k < OFERTAS.length; k++) if(no >= OFERTAS[k][0] && no <= OFERTAS[k][1]){ const h = C.hist[k]; h[0]++; h[1] += m; h[2] += noc; break; } }
      const fc = sh.fc ? sh.fc[i] : -1, fa = sh.fa ? sh.fa[i] : -1;
      if(f >= 0 && fc >= f){
        const d = fc - f, h = A.pl.hist[plzIdx(d)]; A.pl.n++; A.pl.sum += d; h[0]++; h[1] += m; h[2] += noc;
        if(fa >= fc && fa - fc < 400){ A.pl.nAd++; A.pl.sumAd += fa - fc; }
      }
      if(es === A.estAdj){
        C.nAdj++; const ns = sh.ns[i] || 0; if(ns > 0){ C.nNs++; C.sumNs += ns; } if(no > 0){ C.nOfAdj++; C.sumOfAdj += no; }
        if(!sh.k[i] && no >= 3 && m){
          A.candSeen++;
          const rec = {c: sh.c[i], ym: job.ym, f: sh.f[i], t: sh.t[i], o: sh.o[i], u: sh.u[i], m, no, adj: sh.adj[i], ocv: sh.ocv[i], tp: sh.tp[i]};
          if(A.cand.length < 20000) A.cand.push(rec); else { const j = Math.floor(Math.random() * A.candSeen); if(j < 20000) A.cand[j] = rec; }
        }
      }
    }
  }
}
function histQ(A, q){
  const h = A.hist; let tot = 0; for(let i = 0; i < HN; i++) tot += h[i]; if(!tot) return null;
  const t = q * tot; let c = 0; for(let i = 0; i < HN; i++){ c += h[i]; if(c >= t) return Math.exp((i + 0.5) * HB); } return null;
}
function pickCases(A){
  const c = A.cand; if(!c.length) return {med: null, list: [], n: 0};
  const ms = c.map(x => x.m).sort((a, b) => a - b), med = ms[Math.floor(ms.length / 2)];
  const sorted = c.slice().sort((a, b) => Math.abs(Math.log(a.m / med)) - Math.abs(Math.log(b.m / med)) || b.no - a.no);
  const list = [], porOrg = {};
  for(const x of sorted){ const k = x.o; if((porOrg[k] || 0) >= 2) continue; porOrg[k] = (porOrg[k] || 0) + 1; list.push(x); if(list.length >= 10) break; }
  return {med, list, n: A.candSeen};
}
function caseProv(x){ const a = provParse(x.adj); const l = a.length ? a : provParse(x.ocv); return l.length ? l[0].p[1] + (l.length > 1 ? ' (+' + (l.length - 1) + ')' : '') : ''; }
function topList(m, by, n){
  const a = [...m.entries()].map(([k, v]) => ({k, n: v[0], s: v[1], oc: v[2], v}));
  a.sort((x, y) => by === 's' ? (y.s - x.s || y.n - x.n) : (y.n - x.n || y.s - x.s));
  return a.slice(0, n);
}
function share10(m){ let tot = 0; const a = []; m.forEach(v => { tot += v[1]; a.push(v[1]); }); if(!(tot > 0)) return null; a.sort((x, y) => y - x); let t = 0; for(let i = 0; i < Math.min(10, a.length); i++) t += a[i]; return t / tot; }
const pctN = x => x == null ? '—' : (100 * x).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' %';

// ---- pertenencia a un grupo (para descargar los procesos de una fila del análisis) ----
// V(k) entrega el campo k del proceso, sea desde las columnas de un archivo o desde un registro del listado.
function grpTest(g, mec, ym, V){
  const D = D_(), N = ST.N, isL = mec === 'l';
  const mo = isL ? (V('moc') || 0) : (V('m') || 0);
  switch(g.t){
    case 'tipo': return g.k === 'l-pub' ? isL && !V('k') : g.k === 'l-priv' ? isL && !!V('k') : mec === g.k;
    case 'tp': return isL && (V('tp') || '?') === g.k;
    case 'rango': { const R = RANGOS[g.k]; return mo > 0 && mo <= OUT_MAX && mo >= R[0] && mo < R[1]; }
    case 'of': { if(!isL || V('sb')) return false; const no = V('no') || 0, O = OFERTAS[g.k]; return no > 0 && no >= O[0] && no <= O[1]; }
    case 'est': return isL && !V('sb') && V('es') === g.k;
    case 'plz': { if(!isL || V('sb')) return false; const f = V('f'), fc = V('fc'); return f >= 0 && fc >= f && plzIdx(fc - f) === g.k; }
    case 'reg': { const rg = N.regc[D.uni[V('u')][4]]; return (rg < 0 ? 16 : rg) === g.k; }
    case 'sec': { const o = D.org[V('o')]; return (o[2] && o[2] !== 'SINDATO' ? o[2] : 'Sin sector') === g.k; }
    case 'org': return V('o') === g.k;
    case 'uni': return V('u') === g.k;
    case 'prov': {
      if(!isL) return V('v') === g.k;
      for(const s of [V('adj'), V('ocv')]) if(s){ const a = s.split(','); for(let j = 0; j < a.length; j++) if(+a[j].split(':')[0] === g.k) return true; }
      return false;
    }
    case 'prd': { const p = V('p'); return !!p && ('^' + p.split(',').join('^') + '^').indexOf('^' + g.k + '^') >= 0; }
    case 'rub': { const rb = V('rb'); return rb >= 0 && sentence(D.rub[rb].split(' › ')[0]) === g.k; }
    case 'cau': return !isL && (mec === 'td' || mec === 'cc' || mec === 'ot') && V('k') === g.k;
    case 'mes': return ym === g.k;
  }
  return false;
}

// ---- paneles del análisis: cada uno tiene filas (grupos) con orden, inversión y descarga propios ----
function buildPanels(){
  const A = ST.A; if(ST._pnFor === A) return ST._pnList;
  const D = D_(), C = A.comp, hasL = C.nL > 0, out = []; ST.pn = {};
  const add = p => { if(!p.items.length) return; p.items.forEach((it, ix) => { it.ix = ix; if(it.ord == null) it.ord = ix; }); p.hasOc = p.items.some(it => it.oc != null); if(!p.o) p.o = ['Orden original', 'Orden inverso']; ST.pn[p.key] = p; out.push(p); };
  const T = A.tipo, order = ['l-pub', 'l-priv', 'td', 'ca', 'cm', 'cc', 'ot'];
  add({key: 'tipo', title: 'Mecanismo de compra', def: 'n', mk: 'n', pct: true, base: A.n, on: 'Orden habitual', o: ['Orden habitual', 'Orden inverso'], c: 'var(--cc-royal)',
    note: 'Barras según el criterio elegido. El monto es el de las OC en pesos chilenos; en licitaciones, el de las OC emitidas.',
    items: order.filter(k => T[k]).map((k, i) => ({lab: TIPO_LAB[k] || MEC[k].n, c: (MEC[k] || MEC.l).c, n: T[k][0], s: T[k][2], oc: T[k][3], ord: i, grp: {t: 'tipo', k}}))});
  const tpk = Object.keys(A.tp);
  if(tpk.length > 1) add({key: 'tp', title: 'Licitaciones por tipo', def: 'n', mk: 'n', pct: true, base: C.nL, on: 'Por tipo (L1, LE, LP…)', o: ['Por tipo', 'Tipo inverso'], c: '#0032A2', lim: 8,
    items: tpk.map(k => ({lab: k + ' · ' + (TIPO_LIC[k] || '').replace('Licitación ', ''), full: k + ' · ' + (TIPO_LIC[k] || 'Tipo ' + k), n: A.tp[k][0], s: A.tp[k][2], oc: A.tp[k][3], ord: ORD_TP.indexOf(k) < 0 ? 99 : ORD_TP.indexOf(k), grp: {t: 'tp', k}}))});
  if(A.nAmt) add({key: 'rango', title: 'Rangos de monto', def: 'o', mk: 'n', pct: true, base: A.nAmt, on: 'Por tramo de monto', o: ['De menor a mayor monto', 'De mayor a menor monto'], c: '#0B78CC', lim: 8,
    note: 'Solo procesos con monto conocido. En licitaciones es el monto de las OC emitidas.',
    items: RANGOS.map((r, k) => ({lab: r[2], n: A.rango[k][0], s: A.rango[k][1], oc: A.rango[k][2], ord: k, grp: {t: 'rango', k}}))});
  if(hasL && C.nOf) add({key: 'of', title: 'Ofertas recibidas por licitación', def: 'o', mk: 'n', pct: true, base: C.nOf, on: 'Menos a más ofertas', o: ['De menos a más ofertas', 'De más a menos ofertas'], c: '#005AF8',
    note: `Se calcula sobre ${fmt(C.nOf)} de ${fmt(C.nFicha)} licitaciones con ficha que informan el número de ofertas.`,
    items: OFERTAS.map((o, k) => ({lab: o[2], n: C.hist[k][0], s: C.hist[k][1], oc: C.hist[k][2], ord: k, grp: {t: 'of', k}}))});
  if(hasL && C.nFicha) add({key: 'est', title: 'Estado de las licitaciones con ficha', def: 'n', mk: 'n', pct: true, base: C.nFicha, c: '#4A2E8F', on: 'Orden habitual',
    note: `Adjudicadas: ${fmt(C.nAdj)}${C.nNs ? ' · proveedores adjudicados por licitación: ' + dec1(C.sumNs / C.nNs) + ' en promedio' : ''}${C.nOfAdj ? ' · ofertas por licitación adjudicada: ' + dec1(C.sumOfAdj / C.nOfAdj) : ''}.`,
    items: Object.keys(C.est).map((k, i) => ({lab: +k >= 0 ? D.est[+k] : 'Sin estado', n: C.est[k][0], s: C.est[k][1], oc: C.est[k][2], ord: i, grp: {t: 'est', k: +k}}))});
  if(hasL && A.pl.n) add({key: 'plz', title: 'Plazo entre publicación y cierre de ofertas', def: 'o', mk: 'n', pct: true, base: A.pl.n, on: 'De menor a mayor plazo', o: ['De menor a mayor plazo', 'De mayor a menor plazo'], c: '#6FD3E0',
    note: `Días corridos entre la publicación y el cierre: ${dec1(A.pl.sum / A.pl.n)} en promedio${A.pl.nAd ? '; entre el cierre y la fecha de adjudicación informada: ' + dec1(A.pl.sumAd / A.pl.nAd) : ''}. Los plazos mínimos según tipo de licitación están en el Reglamento de la Ley 19.886 (DS 661 de 2024).`,
    items: PLAZOS.map((r, k) => ({lab: r[2], n: A.pl.hist[k][0], s: A.pl.hist[k][1], oc: A.pl.hist[k][2], ord: k, grp: {t: 'plz', k}}))});
  add({key: 'reg', kind: 'tiles', title: 'Mapa por región del comprador', def: 'o', mk: 'n', on: 'De norte a sur', o: ['De norte a sur', 'De sur a norte'], lim: 17,
    note: 'Más oscuro, más procesos. Haz clic en una región para filtrar la búsqueda.',
    items: REGS.map((r, i) => ({lab: r[0], n: A.reg[i][0], s: A.reg[i][1], oc: A.reg[i][2], ord: i, grp: {t: 'reg', k: i}, reg: i})).concat(A.reg[16][0] ? [{lab: 'Sin región informada', n: A.reg[16][0], s: A.reg[16][1], oc: A.reg[16][2], ord: 16, grp: {t: 'reg', k: 16}}] : [])});
  add({key: 'sec', title: 'Sectores compradores', def: 'n', mk: 'n', c: '#007096', lim: 8, items: [...A.sec].map(([k, v]) => ({lab: k, n: v[0], s: v[1], oc: v[2], grp: {t: 'sec', k}}))});
  add({key: 'rub', title: 'Rubros', def: 's', mk: 's', c: '#E94860', lim: 8, note: 'Rubro del producto principal, según el catálogo de Mercado Público.',
    items: [...A.rub].map(([k, v]) => ({lab: k, n: v[0], s: v[1], oc: v[2], grp: {t: 'rub', k}}))});
  add({key: 'org', title: 'Organismos que más compran', def: 's', mk: 's', c: '#0032A2', lim: 10, note: 'Haz clic en un organismo para filtrar la búsqueda.',
    items: [...A.org].map(([k, v]) => { const o = D.org[k]; return {lab: o[1], full: o[1] + ' · cód. ' + o[0], n: v[0], s: v[1], oc: v[2], attr: `data-org="${esc(o[1])}"`, grp: {t: 'org', k}}; })});
  add({key: 'prov', title: 'Proveedores con más monto', def: 's', mk: 's', c: '#4A2E8F', lim: 10, note: 'Monto de las OC; en licitaciones sin OC solo se cuenta la adjudicación. Haz clic para filtrar por proveedor.',
    items: [...A.prov].map(([k, v]) => { const p = D.prov[k]; return {lab: p[1], full: p[1] + (p[0] ? ' · RUT ' + p[0] : ''), n: v[0], s: v[1], oc: null, attr: `data-prov="${esc(p[0] || p[1])}"`, grp: {t: 'prov', k}}; })});
  add({key: 'uni', title: 'Unidades de compra', def: 's', mk: 's', c: '#0B78CC', lim: 10, note: 'Unidad de compra dentro de cada organismo comprador.',
    items: [...A.uni].map(([k, v]) => { const u = D.uni[k], o = D.org[v[3]]; return {lab: u[2], full: u[2] + (o ? ' · ' + o[1] : ''), n: v[0], s: v[1], oc: v[2], grp: {t: 'uni', k}}; })});
  add({key: 'prd', title: 'Productos más frecuentes', def: 'n', mk: 'n', c: '#6FD3E0', lim: 10, note: 'Procesos que incluyen el producto. El monto es el del proceso completo, no el del producto.',
    items: [...A.prd].map(([k, v]) => ({lab: D.prd[k], n: v[0], s: v[1], oc: v[2], grp: {t: 'prd', k}}))});
  add({key: 'cau', title: 'Causales de trato directo y procedencia', def: 'n', mk: 'n', c: '#8A4FBF', lim: 8, note: 'Solo tratos directos, compras coordinadas y otras compras con causal informada. Las causales de trato directo están en el artículo 8 de la Ley 19.886 y en el Reglamento.',
    items: [...A.cau].map(([k, v]) => ({lab: D.cau[k], n: v[0], s: v[1], oc: v[2], grp: {t: 'cau', k}}))});
  const ms = [...A.mes.keys()].sort();
  if(ms.length > 1) add({key: 'mes', title: 'Evolución mensual', def: 'o', mk: 'n', c: '#0B78CC', lim: 24, on: 'Cronológico', o: ['Cronológico', 'Más reciente primero'], note: 'Procesos por mes de publicación (licitaciones) o de envío de la OC.',
    items: ms.map((k, i) => ({lab: ymLabel(k), n: A.mes.get(k)[0], s: A.mes.get(k)[1], oc: A.mes.get(k)[2], ord: i, grp: {t: 'mes', k}}))});
  ST._pnFor = A; ST._pnList = out; return out;
}
function pv(p){ return ST.pv[p.key] || (ST.pv[p.key] = {by: p.def, inv: false, lim: p.lim || 10}); }
function sortedItems(p){
  const v = pv(p), by = v.by, base = (by === 'o' || by === 'a') ? 1 : -1, dir = v.inv ? -base : base;
  const cmp = by === 'a' ? (x, y) => x.lab.localeCompare(y.lab, 'es') : by === 'o' ? (x, y) => x.ord - y.ord : by === 's' ? (x, y) => (x.s - y.s) || (x.n - y.n)
    : by === 'oc' ? (x, y) => ((x.oc || 0) - (y.oc || 0)) || (x.n - y.n) : (x, y) => (x.n - y.n) || (x.s - y.s);
  return p.items.slice().sort((x, y) => dir * cmp(x, y) || (x.ord - y.ord));
}
function dirLabel(p, v){
  if(v.by === 'a') return v.inv ? 'Z → A' : 'A → Z';
  if(v.by === 'o') return v.inv ? p.o[1] : p.o[0];
  return v.inv ? 'Menor a mayor' : 'Mayor a menor';
}
const DL_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
function valHtml(p, it){
  const parts = [fmt(it.n) + ' proc.'];
  if(it.oc != null) parts.push(fmt(it.oc) + ' OC');
  if(p.pct && p.base) parts.push(pct(it.n, p.base));
  return `<b>${it.s ? fmtM(it.s) : '—'}</b><small>${parts.join(' · ')}</small>`;
}
function dlBtnHtml(p, it){
  return it.n ? `<button type="button" class="an-dl" data-pn="${p.key}" data-ix="${it.ix}" title="Descargar en Excel los ${fmt(it.n)} procesos de este grupo, con todos los datos disponibles" aria-label="Descargar en Excel los procesos de ${esc(it.lab)}">${DL_ICO}</button>` : '<span></span>';
}
function panelBody(p){
  const v = pv(p), its = sortedItems(p).slice(0, v.lim), key = (v.by === 's' || v.by === 'n' || v.by === 'oc') ? v.by : p.mk;
  const mx = Math.max(1, ...p.items.map(it => it[key] || 0));
  if(p.kind === 'tiles'){
    const w = [34, 38, 44, 40, 44, 52, 66, 50, 48, 44, 48, 44, 40, 46, 34, 30, 30], mn = Math.max(1, ...p.items.map(it => it.n));
    return `<div class="an-map">` + its.map(it => {
      const a = it.n ? 0.18 + 0.82 * Math.sqrt(it.n / mn) : 0.06;
      return `<div class="an-rg" ${it.reg != null ? `data-reg="${it.reg}" tabindex="0" role="button"` : ''} data-pn="${p.key}" data-ix="${it.ix}"><span class="an-rl">${esc(it.lab)}</span>
        <span class="an-rt"><i style="width:${w[it.ord] || 30}px;background:rgba(0,50,162,${a.toFixed(2)})"></i></span><span class="an-rv">${fmt(it.n)}${it.s ? ' · ' + fmtM(it.s) : ''}</span>${dlBtnHtml(p, it)}</div>`;
    }).join('') + `</div>`;
  }
  return `<div class="an-bars">` + its.map(it => `<div class="an-b${it.attr ? ' an-cl' : ''}" ${it.attr ? it.attr + ' tabindex="0" role="button"' : ''} data-pn="${p.key}" data-ix="${it.ix}">
    <div class="an-bl">${esc(it.lab)}</div><div class="an-bt"><i style="width:${Math.max(1, Math.round(100 * (it[key] || 0) / mx))}%;background:${it.c || p.c || 'var(--cc-royal)'}"></i></div>
    <div class="an-bv">${valHtml(p, it)}</div>${dlBtnHtml(p, it)}</div>`).join('') + `</div>`;
}
const SORT_LAB = {s: 'Monto', n: 'N° de procesos', oc: 'N° de OC', a: 'Nombre'};
function panelTools(p){
  if(p.items.length < 2) return '';
  const v = pv(p), opts = [];
  if(p.items.some(it => it.s > 0)) opts.push('s'); opts.push('n'); if(p.hasOc) opts.push('oc'); opts.push('a'); if(p.on) opts.push('o');
  const sel = `<label class="an-tl">Ordenar por <select class="an-sel" data-pn="${p.key}">${opts.map(k => `<option value="${k}"${v.by === k ? ' selected' : ''}>${esc(k === 'o' ? p.on : SORT_LAB[k])}</option>`).join('')}</select></label>`;
  const inv = `<button type="button" class="an-inv" data-pn="${p.key}" title="Invertir el orden">⇅ ${esc(dirLabel(p, v))}</button>`;
  const ls = [...new Set([p.lim || 10, 25, 50, 100])].filter(x => x <= p.items.length || x === (p.lim || 10)).sort((a, b) => a - b);
  const lim = p.items.length > (p.lim || 10) ? `<label class="an-tl">Ver <select class="an-lim" data-pn="${p.key}">${ls.map(x => `<option value="${x}"${v.lim === x ? ' selected' : ''}>${x}</option>`).join('')}${p.items.length > 100 ? '' : ''}</select> de ${fmt(p.items.length)}</label>` : '';
  return sel + inv + lim;
}
function panelHtml(p){
  return `<section class="an-p${p.wide ? ' an-w' : ''}" data-pn="${p.key}"><h3>${esc(p.title)}</h3><div class="an-tools">${panelTools(p)}</div><div class="an-body">${panelBody(p)}</div>${p.note ? `<p class="an-note">${p.note}</p>` : ''}</section>`;
}
function rerenderPanel(key, focusCls){
  const p = ST.pn && ST.pn[key], sec = document.querySelector('#procOut section[data-pn="' + key + '"]'); if(!p || !sec) return;
  sec.querySelector('.an-body').innerHTML = panelBody(p); sec.querySelector('.an-tools').innerHTML = panelTools(p);
  if(focusCls){ const f = sec.querySelector('.' + focusCls); if(f) f.focus(); }
}
// ---- ayuda emergente con el nombre completo y las cifras del grupo ----
function tipEl(){ let t = document.getElementById('anTip'); if(!t){ t = document.createElement('div'); t.id = 'anTip'; t.className = 'an-tip'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t); } return t; }
function tipHtml(el){
  const p = ST.pn && ST.pn[el.dataset.pn], it = p && p.items[+el.dataset.ix]; if(!it) return '';
  let h = `<b>${esc(it.full || it.lab)}</b><div>Procesos: <b>${fmt(it.n)}</b>${p.base ? ' (' + pct(it.n, p.base) + ' del total)' : ''}</div>`;
  if(it.oc != null) h += `<div>OC emitidas: <b>${fmt(it.oc)}</b></div>`;
  if(it.s) h += `<div>Monto en OC: <b>$${fmt(Math.round(it.s))}</b></div>`;
  if(el.matches('[data-reg],[data-org],[data-prov]')) h += '<div class="an-tip-h">Clic para filtrar la búsqueda</div>';
  return h;
}
function tipShow(el, x, y){
  const t = tipEl(), h = tipHtml(el); if(!h){ t.style.display = 'none'; return; }
  t.innerHTML = h; t.style.display = 'block'; const w = t.offsetWidth, hh = t.offsetHeight;
  let l = x + 14, tp = y + 18; if(l + w > window.innerWidth - 8) l = Math.max(8, x - w - 14); if(tp + hh > window.innerHeight - 8) tp = Math.max(8, y - hh - 12);
  t.style.left = l + 'px'; t.style.top = tp + 'px';
}
function tipHide(){ const t = document.getElementById('anTip'); if(t) t.style.display = 'none'; }

// ---- descarga de un grupo ----
function slug(s){ return norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36) || 'grupo'; }
function filtSummary(){
  const g = id => { const e = document.getElementById(id); return e ? e.value : ''; }, sel = id => { const e = document.getElementById(id); return e && e.selectedIndex > 0 ? e.options[e.selectedIndex].text : ''; };
  const L = [['Texto buscado', g('procQ')], ['Mecanismos', [...document.querySelectorAll('#procMecs input:checked')].map(i => MEC[i.value].n).join(', ')],
    ['Período', ymLabel(g('procFrom')) + ' a ' + ymLabel(g('procTo'))], ['Organismo o unidad', g('procOrg')], ['Proveedor', g('procProv')], ['Región del comprador', sel('procReg')],
    ['Monto mínimo (CLP)', g('procMin')], ['Monto máximo (CLP)', g('procMax')], ['Estado', sel('procEst')], ['Tipo de licitación', sel('procTipo')], ['Causal o procedencia', sel('procCau')],
    ['Sector del comprador', sel('procSec')], ['Rubro, familia o clase', g('procRub')], ['ID del proceso u OC', g('procId')], ['N° de ofertas, mínimo', g('procNmin')], ['N° de ofertas, máximo', g('procNmax')]];
  return L.filter(x => x[1] !== '' && x[1] != null);
}
async function scanGroup(g, onMsg){
  const jobs = ST.jobs, my = ST.token, P = Object.assign({}, ST.params, {grp: g, sink: {res: [], capped: false}});
  const loads = new Map(), get = j => { const k = j.mec + '|' + j.ym; if(!loads.has(k)) loads.set(k, loadShard(j)); return loads.get(k); };
  try {
    for(let i = 0; i < jobs.length; i++){
      for(let k = i; k < Math.min(i + 3, jobs.length); k++) get(jobs[k]).catch(() => {});
      const j = jobs[i], key = j.mec + '|' + j.ym; onMsg(`Reuniendo los procesos del grupo… archivo ${i + 1} de ${jobs.length}`);
      const sh = await get(j);
      if(my !== ST.token){ delete window.PROC_SH[key]; throw new Error('Se inició otra búsqueda y se canceló la descarga del grupo.'); }
      matchShard(j, sh, P); loads.delete(key); delete window.PROC_SH[key];
      await new Promise(r => setTimeout(r, 0));
      if(P.sink.res.length >= CAP){ P.sink.capped = true; break; }
    }
  } finally { loads.forEach((pr, k) => pr.then(() => { delete window.PROC_SH[k]; }).catch(() => {})); }
  return P.sink;
}
function groupSheets(p, it, recs, capped){
  const prov = [], prod = [];
  recs.forEach(r => {
    provsOf(r).forEach(x => prov.push([r.c, mecLabel(r), x.p[0], x.p[1], x.m || '', r.mec === 'l' ? (r.adj ? 'Adjudicado' : 'Con OC') : 'Proveedor de la OC']));
    prodsOf(r).forEach(x => prod.push([r.c, mecLabel(r), x]));
  });
  const res = [['Análisis', p.title], ['Grupo', it.full || it.lab], ['Procesos del grupo', it.n], ['OC emitidas', it.oc == null ? '' : it.oc], ['Monto en OC (CLP)', Math.round(it.s || 0)],
    ['Procesos en el listado', recs.length], ['Nota', capped ? 'El grupo supera ' + fmt(CAP) + ' procesos: el listado trae los más recientes.' : 'El listado trae todos los procesos del grupo.']]
    .concat([['', ''], ['Búsqueda que originó el análisis', '']], ST.filtTxt || [], [['', ''], ['Generado el', new Date().toLocaleString('es-CL')], ['Fuente', 'Datos abiertos de ChileCompra (Mercado Público)']]);
  return [{name: 'Resumen del grupo', headers: ['Dato', 'Valor'], rows: res}, {name: 'Listado', headers: EXP_HDR, rows: exportRows(recs)},
    {name: 'Proveedores', headers: ['ID proceso', 'Mecanismo', 'RUT proveedor', 'Proveedor', 'Monto OC (CLP)', 'Relación'], rows: prov},
    {name: 'Productos', headers: ['ID proceso', 'Mecanismo', 'Producto'], rows: prod}];
}
async function downloadGroup(btn){
  const p = ST.pn && ST.pn[btn.dataset.pn], it = p && p.items[+btn.dataset.ix]; if(!it || btn.disabled) return;
  const orig = btn.innerHTML, st = document.getElementById('procStatus'); btn.disabled = true; btn.textContent = '…';
  try {
    let recs, capped = false;
    if(!ST.capped){ recs = ST.res.filter(r => grpTest(it.grp, r.mec, r.ym, k => r[k])); }
    else { const sink = await scanGroup(it.grp, msg => { if(st) st.innerHTML = msg; }); recs = sink.res; capped = sink.capped; }
    if(!recs.length){ if(st) st.innerHTML = '<span class="proc-err">No se encontraron procesos para ese grupo.</span>'; return; }
    const sheets = groupSheets(p, it, recs, capped);
    DL_STORE.procGrupo = {headers: EXP_HDR, rows: [], sheets: () => sheets};
    if(st) st.innerHTML = 'Generando el Excel del grupo…';
    await downloadXlsx('procGrupo', 'procesos_' + slug(p.title) + '_' + slug(it.lab) + '.xlsx', null);
  } catch(e){ console.error(e); if(st) st.innerHTML = `<span class="proc-err">${esc(e.message)}</span>`; return; }
  finally { btn.disabled = false; btn.innerHTML = orig; }
  if(st) st.innerHTML = '';
}

const an = {
  kpi(lab, val, sub){ return `<div class="an-k"><div class="an-kl">${lab}</div><div class="an-kv">${val}</div>${sub ? `<div class="an-ks">${sub}</div>` : ''}</div>`; }
};
function anHtml(){
  const A = ST.A, D = window.PROC_DIC; if(!A || !A.n) return '';
  const med = histQ(A, .5), q1 = histQ(A, .25), q3 = histQ(A, .75), p90 = histQ(A, .9), avg = A.nAmt ? A.sum / A.nAmt : null;
  const C = A.comp, hasL = C.nL > 0, cases = A.cases || pickCases(A);
  const lnk = x => x ? `<a href="${esc(linkOf({mec: x.mec, c: x.c}))}" target="_blank" rel="noopener">${esc(x.c)}</a>` : '';
  const s10p = share10(A.prov), s10o = share10(A.org);
  let kp = an.kpi('Procesos', fmt(A.n), A.nAmt < A.n ? fmt(A.nAmt) + ' con monto informado' : 'todos con monto')
    + an.kpi('OC emitidas', fmt(A.oc), 'órdenes de compra de estos procesos')
    + an.kpi('Monto total', fmtM(A.sum), 'en OC, pesos chilenos')
    + an.kpi('Monto mínimo', A.min ? fmtM(A.min.m) : '—', A.min ? lnk(A.min) : '')
    + an.kpi('Monto máximo', A.max ? fmtM(A.max.m) : '—', A.max ? lnk(A.max) : '')
    + an.kpi('Mediana', med ? '≈ ' + fmtM(sig3(med)) : '—', q1 && q3 ? 'la mitad central: ' + fmtM(sig3(q1)) + ' a ' + fmtM(sig3(q3)) : '')
    + an.kpi('Percentil 90', p90 ? '≈ ' + fmtM(sig3(p90)) : '—', '9 de cada 10 procesos con monto están bajo este valor')
    + an.kpi('Promedio', fmtM(avg), 'por proceso con monto')
    + an.kpi('Organismos', fmt(A.org.size), 'distintos')
    + an.kpi('Proveedores', fmt(A.prov.size), 'distintos')
    + (s10p != null ? an.kpi('Concentración de proveedores', pctN(s10p), 'del monto lo concentran los 10 proveedores principales') : '')
    + (s10o != null ? an.kpi('Concentración de organismos', pctN(s10o), 'del monto lo concentran los 10 organismos principales') : '')
    + (A.items.n ? an.kpi('Ítems por proceso', dec1(A.items.s / A.items.n), 'promedio, en ' + fmt(A.items.n) + ' procesos con dato') : '')
    + (A.fmin != null ? an.kpi('Período cubierto', dayStr(A.fmin) + ' a ' + dayStr(A.fmax), 'fecha de publicación o de envío de la OC') : '');
  if(hasL && C.nOf) kp += an.kpi('Ofertas por licitación', dec1(C.sumOf / C.nOf), 'promedio; ' + fmt(C.nOf) + ' licitaciones con dato')
    + an.kpi('Con 3 o más ofertas', pct(C.hist[2][0] + C.hist[3][0] + C.hist[4][0] + C.hist[5][0], C.nOf), 'de las que informan ofertas')
    + an.kpi('Con una sola oferta', pct(C.hist[0][0], C.nOf), 'de las que informan ofertas');
  if(hasL && A.pl.n) kp += an.kpi('Plazo de publicación a cierre', dec1(A.pl.sum / A.pl.n) + ' días', 'promedio, días corridos; ' + fmt(A.pl.n) + ' licitaciones')
    + (A.pl.nAd ? an.kpi('Del cierre a la adjudicación', dec1(A.pl.sumAd / A.pl.nAd) + ' días', 'promedio según la fecha de adjudicación informada') : '');
  if(A.estm.n) kp += an.kpi('OC sobre monto estimado', pct(A.estm.moc, A.estm.me), 'monto de las OC respecto del estimado, en ' + fmt(A.estm.n) + ' licitaciones en pesos con ambos montos (referencial)');
  const panels = buildPanels();
  const ext = (A.min || A.max) ? `<p class="an-note">Menor monto: ${A.min ? lnk(A.min) + ' · ' + esc(A.min.t) : '—'}<br>Mayor monto: ${A.max ? lnk(A.max) + ' · ' + esc(A.max.t) : '—'}</p>` : '';
  // procesos de mayor monto
  let topHtml = '';
  if(A.top.length){
    const rows = A.top.map(x => { const o = D.org[x.o]; return `<tr><td class="proc-id"><a href="${esc(linkOf(x))}" target="_blank" rel="noopener">${esc(x.c)}</a></td><td>${esc(MEC[x.mec].n)}</td><td class="proc-t">${hl(x.t, ST.params && ST.params.q)}</td><td>${esc(o[1])}</td><td class="num">${fmtM(x.m)}</td></tr>`; }).join('');
    topHtml = `<section class="an-p an-w"><h3>Procesos de mayor monto</h3><div class="table-wrap"><table class="dt proc-tbl an-tbl"><thead><tr><th>ID</th><th>Mecanismo</th><th>Título</th><th>Organismo</th><th class="num">Monto OC</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="an-note">Los 10 procesos con mayor monto de OC, sin contar los montos atípicos.</p></section>`;
  }
  let casos = '';
  if(cases.list.length){
    const rows = cases.list.map(x => { const o = D.org[x.o];
      return `<tr><td class="proc-id"><a href="${esc(linkOf({mec: 'l', c: x.c}))}" target="_blank" rel="noopener">${esc(x.c)}</a></td><td>${dayStr(x.f)}</td><td class="proc-t">${hl(x.t, ST.params && ST.params.q)}</td><td>${esc(o[1])}</td><td>${esc(caseProv(x))}</td><td class="num">${fmtM(x.m)}</td><td class="num">${x.no}</td></tr>`; }).join('');
    casos = `<div class="table-wrap"><table class="dt proc-tbl an-tbl"><thead><tr><th>ID</th><th>Fecha</th><th>Título</th><th>Organismo</th><th>Adjudicado a</th><th class="num">Monto OC</th><th class="num">Ofertas</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="an-note">Son licitaciones públicas adjudicadas con 3 o más ofertas y monto cercano a la mediana (${fmtM(cases.med)}) de las ${fmt(cases.n)} que cumplen esa condición en esta búsqueda, máximo dos por organismo. Sirven como punto de partida para revisar bases, criterios y precios; no son una recomendación.</p>`;
  } else if(hasL) casos = '<p class="an-note">Esta búsqueda no tiene licitaciones públicas adjudicadas con 3 o más ofertas y monto conocido.</p>';
  const casosHtml = casos ? `<section class="an-p an-w"><h3>Casos de referencia</h3>${casos}</section>` : '';
  const atip = A.out.n ? `<div class="an-warn"><b>${fmt(A.out.n)} proceso${A.out.n === 1 ? '' : 's'} con monto atípico (más de $1 billón cada uno, ${fmtM(A.out.sum)} en total)</b> quedó fuera de las sumas, promedios y rangos. Suelen ser errores de digitación en la OC: ${A.out.top.map(x => lnk(x) + ' (' + fmtM(x.m) + ')').join(', ')}. Se cuentan en el número de procesos.</div>` : '';
  const help = `<p class="an-help">En cada gráfico puedes cambiar el criterio de orden, invertirlo y ver más filas. Al pasar el cursor por una fila se lee el nombre completo y sus cifras; el botón de descarga <span class="an-dl-ex">${DL_ICO}</span> baja en Excel los procesos de ese grupo con todos los datos disponibles.</p>`;
  return `${atip}<div class="an-kpis">${kp}</div>${help}${ext}
    <div class="an-grid">${panels.map(panelHtml).join('')}${topHtml}${casosHtml}</div>`;
}
function anSheets(){
  const A = ST.A, D = D_(); const C = A.comp, med = histQ(A, .5), q1 = histQ(A, .25), q3 = histQ(A, .75), p90 = histQ(A, .9), cases = A.cases || pickCases(A);
  const S = [], s10p = share10(A.prov), s10o = share10(A.org);
  S.push({name: 'Resumen', headers: ['Indicador', 'Valor', 'Nota'], rows: [
    ['Búsqueda', ST.params ? ST.params.q.raw : '', 'Texto buscado'],
    ['Procesos encontrados', A.n, 'Todos los que coinciden, aunque el listado se corte en ' + fmt(CAP)],
    ['OC emitidas', A.oc, 'Órdenes de compra de esos procesos'],
    ['Procesos con monto informado', A.nAmt, ''],
    ['Monto total (CLP)', Math.round(A.sum), 'Sin los montos atípicos'],
    ['Monto mínimo (CLP)', A.min ? Math.round(A.min.m) : '', A.min ? A.min.c : ''],
    ['Monto máximo (CLP)', A.max ? Math.round(A.max.m) : '', A.max ? A.max.c : ''],
    ['Mediana aproximada (CLP)', med ? Math.round(sig3(med)) : '', 'Precisión de 1 %'],
    ['Primer cuartil aproximado (CLP)', q1 ? Math.round(sig3(q1)) : '', ''],
    ['Tercer cuartil aproximado (CLP)', q3 ? Math.round(sig3(q3)) : '', ''],
    ['Percentil 90 aproximado (CLP)', p90 ? Math.round(sig3(p90)) : '', ''],
    ['Promedio (CLP)', A.nAmt ? Math.round(A.sum / A.nAmt) : '', ''],
    ['Organismos distintos', A.org.size, ''], ['Proveedores distintos', A.prov.size, ''],
    ['Concentración: 10 proveedores principales (% del monto)', s10p == null ? '' : +(100 * s10p).toFixed(1), ''],
    ['Concentración: 10 organismos principales (% del monto)', s10o == null ? '' : +(100 * s10o).toFixed(1), ''],
    ['Ítems por proceso (promedio)', A.items.n ? +(A.items.s / A.items.n).toFixed(1) : '', A.items.n ? 'En ' + A.items.n + ' procesos con dato' : ''],
    ['Fecha más antigua', A.fmin != null ? dayStr(A.fmin) : '', 'Publicación o envío de la OC'], ['Fecha más reciente', A.fmax != null ? dayStr(A.fmax) : '', ''],
    ['Procesos con monto atípico (más de $1 billón)', A.out.n, A.out.top.map(x => x.c + ' ' + Math.round(x.m)).join('; ')],
    ['Licitaciones con ficha que informan ofertas', C.nOf, C.nFicha ? 'de ' + C.nFicha + ' licitaciones con ficha' : ''],
    ['Promedio de ofertas por licitación', C.nOf ? +(C.sumOf / C.nOf).toFixed(2) : '', ''],
    ['Licitaciones adjudicadas', C.nAdj, ''],
    ['Plazo medio de publicación a cierre (días corridos)', A.pl.n ? +(A.pl.sum / A.pl.n).toFixed(1) : '', A.pl.n ? 'En ' + A.pl.n + ' licitaciones' : ''],
    ['Plazo medio de cierre a adjudicación (días corridos)', A.pl.nAd ? +(A.pl.sumAd / A.pl.nAd).toFixed(1) : '', 'Según la fecha de adjudicación informada'],
    ['OC sobre monto estimado (%)', A.estm.n ? +(100 * A.estm.moc / A.estm.me).toFixed(1) : '', A.estm.n ? 'En ' + A.estm.n + ' licitaciones en pesos con ambos montos; referencial' : '']]});
  const row4 = (lab, n, s, oc, base) => [lab, n, base ? +(100 * n / base).toFixed(1) : '', Math.round(s), oc == null ? '' : oc];
  const tH = ['Mecanismo o tipo', 'Procesos', '% de procesos', 'Monto OC (CLP)', 'OC emitidas'];
  S.push({name: 'Por mecanismo', headers: tH, rows: ['l-pub', 'l-priv', 'td', 'ca', 'cm', 'cc', 'ot'].filter(k => A.tipo[k]).map(k => row4(TIPO_LAB[k] || MEC[k].n, A.tipo[k][0], A.tipo[k][2], A.tipo[k][3], A.n))
    .concat(Object.keys(A.tp).sort((a, b) => A.tp[b][0] - A.tp[a][0]).map(k => row4('Tipo ' + k + ' · ' + (TIPO_LIC[k] || ''), A.tp[k][0], A.tp[k][2], A.tp[k][3], A.n)))});
  S.push({name: 'Rangos de monto', headers: ['Rango (CLP)', 'Procesos', '% de procesos con monto', 'Monto OC (CLP)', 'OC emitidas'], rows: RANGOS.map((r, k) => row4(r[2], A.rango[k][0], A.rango[k][1], A.rango[k][2], A.nAmt))});
  if(C.nL){
    S.push({name: 'Competencia', headers: ['Indicador', 'Licitaciones', '% del total que informa', 'Monto OC (CLP)', 'OC emitidas'], rows: OFERTAS.map((o, k) => row4(o[2], C.hist[k][0], C.hist[k][1], C.hist[k][2], C.nOf)).concat(
      Object.keys(C.est).map(k => row4('Estado: ' + (+k >= 0 ? D.est[+k] : 'Sin estado'), C.est[k][0], C.est[k][1], C.est[k][2], C.nFicha))) });
    if(A.pl.n) S.push({name: 'Plazos', headers: ['Plazo de publicación a cierre', 'Licitaciones', '% de licitaciones', 'Monto OC (CLP)', 'OC emitidas'], rows: PLAZOS.map((r, k) => row4(r[2], A.pl.hist[k][0], A.pl.hist[k][1], A.pl.hist[k][2], A.pl.n))});
  }
  S.push({name: 'Por región', headers: ['Región', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: REGS.map((r, i) => [r[0], A.reg[i][0], Math.round(A.reg[i][1]), A.reg[i][2]]).concat(A.reg[16][0] ? [['Sin región', A.reg[16][0], Math.round(A.reg[16][1]), A.reg[16][2]]] : [])});
  S.push({name: 'Por sector', headers: ['Sector', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: topList(A.sec, 'n', 60).map(r => [r.k, r.n, Math.round(r.s), r.oc])});
  S.push({name: 'Rubros', headers: ['Rubro', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: topList(A.rub, 's', 60).map(r => [r.k, r.n, Math.round(r.s), r.oc])});
  S.push({name: 'Organismos', headers: ['Cód. organismo', 'Organismo', 'Sector', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: topList(A.org, 's', 100).map(r => { const o = D.org[r.k]; return [o[0], o[1], o[2], r.n, Math.round(r.s), r.oc]; })});
  S.push({name: 'Unidades de compra', headers: ['Cód. unidad', 'Unidad de compra', 'Organismo', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: topList(A.uni, 's', 100).map(r => { const u = D.uni[r.k], o = D.org[r.v[3]]; return [u[1], u[2], o ? o[1] : '', r.n, Math.round(r.s), r.oc]; })});
  S.push({name: 'Proveedores', headers: ['RUT', 'Proveedor', 'Procesos', 'Monto OC (CLP)'], rows: topList(A.prov, 's', 100).map(r => { const p = D.prov[r.k]; return [p[0], p[1], r.n, Math.round(r.s)]; })});
  S.push({name: 'Productos', headers: ['Producto', 'Procesos', 'Monto OC de los procesos (CLP)', 'OC emitidas'], rows: topList(A.prd, 'n', 100).map(r => [D.prd[r.k], r.n, Math.round(r.s), r.oc])});
  if(A.cau.size) S.push({name: 'Causales', headers: ['Causal o procedencia', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: topList(A.cau, 'n', 60).map(r => [D.cau[r.k], r.n, Math.round(r.s), r.oc])});
  S.push({name: 'Por mes', headers: ['Mes', 'Procesos', 'Monto OC (CLP)', 'OC emitidas'], rows: [...A.mes.keys()].sort().map(k => [ymLabel(k), A.mes.get(k)[0], Math.round(A.mes.get(k)[1]), A.mes.get(k)[2]])});
  S.push({name: 'Mayores montos', headers: ['ID proceso', 'Mecanismo', 'Título', 'Organismo', 'Monto OC (CLP)', 'Enlace'], rows: A.top.map(x => [x.c, MEC[x.mec].n, x.t, D.org[x.o][1], Math.round(x.m), linkOf(x)])});
  S.push({name: 'Casos de referencia', headers: ['ID licitación', 'Fecha', 'Título', 'Organismo', 'Adjudicado a', 'Monto OC (CLP)', 'N° de ofertas', 'Enlace'],
    rows: cases.list.map(x => [x.c, dayStr(x.f), x.t, D.org[x.o][1], caseProv(x), Math.round(x.m), x.no, linkOf({mec: 'l', c: x.c})])});
  S.push({name: 'Listado', headers: EXP_HDR, rows: exportRows()});
  return S;
}

// ---------- interfaz ----------
const CSS = `
.proc-box{border:1px solid var(--border);margin-bottom:1.4rem;}
.proc-row{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 12px;}
.proc-row input[type=search]{flex:1 1 360px;font-size:15px;padding:12px 16px;border:1px solid var(--cc-navy);border-radius:99px;background:#fff;color:var(--cc-dark);font-family:inherit;box-sizing:border-box;min-width:0;}
.proc-row input[type=search]:focus-visible{outline:3px solid var(--cc-ice);outline-offset:1px;}
.proc-go{font:inherit;font-weight:700;font-size:14px;padding:12px 26px;border-radius:99px;border:0;background:var(--cc-lime);color:var(--cc-dark);cursor:pointer;}
.proc-go:hover{background:var(--cc-navy);color:#fff;} .proc-go:disabled{opacity:.6;cursor:wait;}
.proc-ex{font-size:12px;color:var(--text-secondary);margin:0 0 12px;display:flex;gap:6px 8px;flex-wrap:wrap;align-items:center;}
.proc-ex button{font:inherit;font-size:12px;padding:3px 11px;border-radius:99px;border:1px solid var(--border);background:#fff;color:var(--cc-navy);cursor:pointer;}
.proc-ex button:hover{background:var(--cc-mist);}
.proc-mecs{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin:0 0 12px;}
.proc-mec{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--border);border-radius:14px;padding:9px 11px;background:#fff;cursor:pointer;}
.proc-mec:has(input:checked){border-color:var(--c);box-shadow:inset 0 0 0 1px var(--c);background:#F7F9FD;}
.proc-mec input{margin-top:3px;accent-color:var(--c);}
.proc-mec b{display:block;font-size:12.5px;color:var(--cc-dark);} .proc-mec small{display:block;font-size:10.5px;color:var(--text-secondary);line-height:1.35;}
.proc-filters{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:0 0 6px;}
.proc-filters .filter-field input[type=text],.proc-filters .filter-field select{min-width:170px;}
.proc-filters .filter-field input[type=number]{min-width:130px;}
.proc-clr{font:inherit;font-weight:700;font-size:14px;padding:12px 22px;border-radius:99px;border:1px solid var(--cc-navy);background:#fff;color:var(--cc-navy);cursor:pointer;}
.proc-clr:hover{background:var(--cc-mist);}
.proc-sub{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);margin:14px 0 8px;}
.proc-hint{font-size:12px;color:var(--cc-navy);margin:2px 0 6px;min-height:0;} .proc-hint:empty{display:none;}
.proc-opt{font-size:12px;color:var(--text-secondary);display:flex;gap:6px;align-items:center;margin:2px 0 8px;}
.proc-status{font-size:12.5px;color:var(--cc-navy);margin:10px 0;min-height:18px;}
.proc-bar{height:6px;border-radius:99px;background:#EDF1F7;overflow:hidden;margin-top:6px;} .proc-bar i{display:block;height:100%;background:var(--cc-royal);width:0;transition:width .2s;}
.proc-err{color:#B3261E;font-size:13px;}
.proc-sum{display:flex;gap:10px 18px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin:6px 0 6px;}
.proc-sum-n{font-size:15px;color:var(--cc-dark);} .proc-sum-n b{font-size:18px;}
.proc-chips{display:flex;gap:6px;flex-wrap:wrap;}
.proc-chip{display:inline-flex;gap:6px;align-items:center;font-size:11.5px;padding:3px 10px;border-radius:99px;background:#F3F6FB;color:var(--cc-dark);}
.proc-chip i{width:9px;height:9px;border-radius:50%;background:var(--c);display:inline-block;}
.proc-dl{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:6px 0 10px;}
.proc-tw{max-height:none;overflow-x:auto;}
.proc-tbl{font-size:12px;} .proc-tbl td{vertical-align:top;padding:7px 8px;} .proc-tbl th{padding:7px 8px;white-space:nowrap;}
.proc-tbl th.sortable{cursor:pointer;} .proc-tbl td.num,.proc-tbl th.num{text-align:right;white-space:nowrap;}
.proc-r{cursor:pointer;} .proc-r.open td{background:#F3F7FF;}
.proc-tag{display:inline-block;font-size:10.5px;font-weight:700;color:#fff;background:var(--c);border-radius:99px;padding:2px 9px;white-space:nowrap;}
.proc-id{white-space:nowrap;} .proc-t{min-width:260px;max-width:420px;}
.proc-tbl mark{background:var(--cc-lime);color:var(--cc-dark);padding:0 1px;border-radius:3px;}
.pf-s{font-size:11px;color:var(--text-secondary);}
.proc-f td{background:#F8FAFE;padding:14px 16px!important;white-space:normal;}
.pf-wrap{display:grid;gap:12px;} .pf-sec h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--cc-navy);}
.pf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px 18px;}
.pf{display:flex;flex-direction:column;gap:1px;font-size:12.5px;} .pf-w{grid-column:1/-1;} .pf-k{font-size:10.5px;color:var(--text-secondary);} .pf-v{color:var(--cc-dark);overflow-wrap:anywhere;}
.pf-actions{display:flex;gap:10px;flex-wrap:wrap;} .proc-lnk{font-size:12px;font-weight:700;padding:6px 14px;border-radius:99px;background:var(--cc-mist);color:var(--cc-navy);text-decoration:none;} .proc-lnk:hover{background:var(--cc-lime);color:var(--cc-dark);}
.proc-pager{display:flex;gap:14px;align-items:center;justify-content:center;margin:12px 0 2px;font-size:12.5px;color:var(--text-secondary);}
.proc-pager button{font:inherit;font-size:12.5px;padding:6px 14px;border-radius:99px;border:1px solid rgba(0,50,162,.35);background:#fff;color:var(--cc-navy);cursor:pointer;} .proc-pager button:disabled{opacity:.4;cursor:default;}
.proc-h2{font-size:16px;margin:1.6rem 0 6px;color:var(--cc-dark);}
.an-warn{background:#FFF6E5;border:1px solid #E8C26A;border-radius:12px;padding:10px 14px;font-size:12.5px;color:var(--cc-dark);margin:8px 0 12px;}
.an-warn a{color:var(--cc-navy);font-weight:700;}
.an-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px;margin:10px 0 14px;}
.an-k{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:#fff;}
.an-kl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);font-weight:700;}
.an-kv{font-size:19px;font-weight:700;color:var(--cc-navy);margin:3px 0 2px;line-height:1.15;overflow-wrap:anywhere;}
.an-ks{font-size:11px;color:var(--text-secondary);overflow-wrap:anywhere;} .an-ks a{color:var(--cc-navy);}
.an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:12px;margin:0 0 14px;}
.an-p{border:1px solid var(--border);border-radius:14px;padding:12px 14px;background:#fff;min-width:0;}
.an-p.an-w{grid-column:1/-1;}
.an-p h3{margin:0 0 8px;font-size:13px;color:var(--cc-dark);}
.an-sub{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);font-weight:700;margin:12px 0 6px;}
.an-note{font-size:11px;color:var(--text-secondary);margin:8px 0 0;line-height:1.45;} .an-note a{color:var(--cc-navy);}
.an-bars{display:grid;gap:5px;}
.an-b{display:grid;grid-template-columns:minmax(90px,36%) 1fr minmax(104px,auto) 26px;gap:8px;align-items:center;font-size:11.5px;border-radius:8px;padding:2px 2px;}
.an-b[data-org],.an-b[data-prov],.an-rg{cursor:pointer;} .an-b:hover,.an-rg:hover{background:var(--cc-mist);}
.an-bl{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25;overflow-wrap:anywhere;color:var(--cc-dark);}
.an-bt{height:10px;min-width:50px;background:#EDF1F7;border-radius:99px;overflow:hidden;} .an-bt i{display:block;height:100%;border-radius:99px;}
.an-bv{text-align:right;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums;line-height:1.25;} .an-bv b{display:block;color:var(--cc-dark);font-size:12px;} .an-bv small{display:block;font-size:10.5px;}
.an-tools{display:flex;gap:6px 10px;flex-wrap:wrap;align-items:center;margin:0 0 8px;} .an-tools:empty{display:none;}
.an-tl{font-size:11px;color:var(--text-secondary);display:inline-flex;gap:5px;align-items:center;}
.an-sel,.an-lim{font:inherit;font-size:11.5px;padding:3px 6px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--cc-dark);max-width:150px;}
.an-inv{font:inherit;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid rgba(0,50,162,.35);background:#fff;color:var(--cc-navy);cursor:pointer;white-space:nowrap;} .an-inv:hover{background:var(--cc-mist);}
.an-dl{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(0,50,162,.3);border-radius:50%;background:#fff;color:var(--cc-navy);cursor:pointer;padding:0;} .an-dl:hover:not(:disabled){background:var(--cc-lime);color:var(--cc-dark);} .an-dl:disabled{opacity:.6;cursor:wait;font-size:11px;}
.an-help{font-size:11.5px;color:var(--text-secondary);margin:0 0 10px;line-height:1.5;} .an-dl-ex{display:inline-flex;vertical-align:middle;color:var(--cc-navy);}
.an-tip{position:fixed;z-index:10000;display:none;max-width:340px;background:var(--cc-navy,#00233B);color:#fff;font-size:12px;line-height:1.45;padding:9px 12px;border-radius:10px;box-shadow:0 6px 22px rgba(0,35,59,.35);pointer-events:none;}
.an-tip b{color:#fff;} .an-tip>b{display:block;margin-bottom:3px;font-size:12.5px;overflow-wrap:anywhere;} .an-tip-h{margin-top:4px;font-size:11px;color:var(--cc-lime,#D0FF66);}
.an-map{display:grid;gap:2px;}
.an-rg{display:grid;grid-template-columns:minmax(120px,40%) 74px 1fr 26px;align-items:center;gap:8px;font-size:11.5px;padding:1px 4px;border-radius:8px;}
.an-rl{color:var(--cc-dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;}
.an-rt{display:flex;justify-content:center;} .an-rt i{display:block;height:15px;border-radius:5px;border:1px solid rgba(0,50,162,.25);}
.an-rv{color:var(--text-secondary);white-space:nowrap;} .an-rs{font-size:11px;color:var(--text-secondary);margin-top:6px;}
.an-tbl td,.an-tbl th{font-size:11.5px;}
.an-list{border:1px solid var(--border);border-radius:14px;padding:0 14px;background:#fff;margin:6px 0 8px;}
.an-list>summary{cursor:pointer;font-weight:700;font-size:13px;color:var(--cc-navy);padding:12px 0;list-style:none;} .an-list>summary::-webkit-details-marker{display:none;}
.an-list>summary::before{content:'▸ ';} .an-list[open]>summary::before{content:'▾ ';}
.an-list[open]{padding-bottom:12px;}
@media (max-width:640px){.an-grid{grid-template-columns:1fr}.an-b{grid-template-columns:1fr 26px;}.an-bl{grid-column:1/-1;grid-row:1}.an-bt{grid-column:1;grid-row:2}.an-dl{grid-column:2;grid-row:2}.an-bv{grid-column:1/-1;grid-row:3;text-align:left}.an-rg{grid-template-columns:minmax(90px,36%) 56px 1fr 26px}}
@media (max-width:640px){.proc-go{width:100%}.proc-filters .filter-field{flex:1 1 100%}.proc-filters .filter-field input,.proc-filters .filter-field select{width:100%}}
`;
function injectCss(){ if(document.getElementById('procCss')) return; const s = document.createElement('style'); s.id = 'procCss'; s.textContent = CSS; document.head.appendChild(s); }
function mb(bytes){ return bytes >= 1e6 ? (bytes / 1e6).toFixed(0) + ' MB' : Math.max(1, Math.round(bytes / 1e3)) + ' KB'; }
function init(host){
  injectCss();
  host.innerHTML = `<section class="block proc-box" id="procBox">
    <h2><span class="sec-icon"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>Buscador de procesos de compra</h2>
    <p class="block-note" id="procNote">Busca licitaciones, tratos directos, compras ágiles y otros procesos por título, descripción, rubro, producto o ID. Cada resultado se abre con sus antecedentes: organismo, unidad, proveedores, fechas, montos y el enlace a Mercado Público.</p>
    <div class="proc-row"><input type="search" id="procQ" placeholder="Ej.: mantención aire acondicionado" autocomplete="off" aria-label="Qué quieres buscar"><button type="button" class="proc-go" id="procGo">Buscar</button><button type="button" class="proc-clr" id="procClr" title="Borra el texto, los filtros y los resultados, y vuelve a la configuración inicial">Limpiar búsqueda</button></div>
    <div class="proc-ex" id="procEx"><span>Prueba con:</span>${['mantención aire acondicionado','servicio de aseo','arriendo de camionetas','"software de gestión"','capacitación -online'].map(x => `<button type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}<span>· Usa comillas para una frase exacta y el signo menos para excluir una palabra.</span></div>
    <div class="proc-mecs" id="procMecs">${MECS.map(m => `<label class="proc-mec" style="--c:${m.c}"><input type="checkbox" value="${m.k}" ${m.k === 'l' || m.k === 'td' ? 'checked' : ''}><span><b>${esc(m.n)}</b><small id="pm_${m.k}">${esc(m.sub)}</small></span></label>`).join('')}</div>
    <div class="proc-filters">
      <div class="filter-field"><label for="procFrom">Desde</label><select id="procFrom"></select></div>
      <div class="filter-field"><label for="procTo">Hasta</label><select id="procTo"></select></div>
      <div class="filter-field"><label for="procOrg">Organismo o unidad (nombre o RUT)</label><input type="text" id="procOrg" placeholder="Ej.: hospital, municipalidad…" autocomplete="off"></div>
      <div class="filter-field"><label for="procProv">Proveedor (nombre o RUT)</label><input type="text" id="procProv" placeholder="Ej.: 76.123.456-7" autocomplete="off"></div>
      <div class="filter-field"><label for="procReg">Región del comprador</label><select id="procReg"><option value="">Todas</option>${REGS.map((r, i) => `<option value="${i}">${esc(r[0])}</option>`).join('')}</select></div>
      <div class="filter-field"><label for="procMin">Monto mínimo (CLP)</label><input type="number" id="procMin" min="0" step="1" placeholder="Sin mínimo"></div>
      <div class="filter-field"><label for="procMax">Monto máximo (CLP)</label><input type="number" id="procMax" min="0" step="1" placeholder="Sin máximo"></div>
    </div>
    <div class="proc-sub">Filtrar por características del proceso</div>
    <div class="proc-filters">
      <div class="filter-field"><label for="procEst">Estado</label><select id="procEst"><option value="">Todos</option>
        <optgroup label="Licitaciones"><option value="l:Adjudicada">Adjudicada</option><option value="l:Cerrada">Cerrada (sin adjudicar)</option><option value="l:Desierta">Desierta</option><option value="l:Revocada">Revocada</option><option value="l:Suspendida">Suspendida</option><option value="l:sin">Anterior a ene-2025 (sin ficha de bases)</option></optgroup>
        <optgroup label="Órdenes de compra"><option value="o:0">Aceptada</option><option value="o:1">Recepción conforme</option></optgroup></select></div>
      <div class="filter-field"><label for="procTipo">Tipo de licitación</label><select id="procTipo"><option value="">Todos</option><option value="pub">Todas las públicas</option><option value="priv">Todas las privadas</option>
        <optgroup label="Públicas">${['L1','LE','LP','LQ','LR','LS'].map(t => `<option value="${t}">${t} · ${esc(TIPO_LIC[t].replace('Licitación Pública ', ''))}</option>`).join('')}</optgroup>
        <optgroup label="Privadas">${['E2','CO','B2','H2','I2','O1','O2'].map(t => `<option value="${t}">${t} · ${esc(TIPO_LIC[t].replace('Licitación Privada ', '').replace('Licitación Privada', 'general'))}</option>`).join('')}</optgroup></select></div>
      <div class="filter-field"><label for="procCau">Causal de trato directo o procedencia</label><select id="procCau"><option value="">Todas</option></select></div>
      <div class="filter-field"><label for="procSec">Sector del comprador</label><select id="procSec"><option value="">Todos</option></select></div>
      <div class="filter-field"><label for="procRub">Rubro, familia o clase</label><input type="text" id="procRub" placeholder="Ej.: servicios de construcción" autocomplete="off"></div>
      <div class="filter-field"><label for="procId">ID del proceso u OC</label><input type="text" id="procId" placeholder="Ej.: 1113144-77-AG26" autocomplete="off"></div>
      <div class="filter-field"><label for="procNmin">N° de ofertas, mínimo</label><input type="number" id="procNmin" min="0" step="1" placeholder="Sin mínimo"></div>
      <div class="filter-field"><label for="procNmax">N° de ofertas, máximo</label><input type="number" id="procNmax" min="0" step="1" placeholder="Sin máximo"></div>
    </div>
    <p class="proc-hint" id="procHint"></p>
    <label class="proc-opt"><input type="checkbox" id="procSyn" checked> Incluir sinónimos (mantención y mantenimiento, arriendo y arrendamiento, aire acondicionado y climatización…)</label>
    <div class="proc-status" id="procStatus" aria-live="polite"></div>
    <div id="procOut"></div></section>`;
  const $ = id => host.querySelector('#' + id);
  let man = null;
  ensureMan().then(M => {
    man = M;
    const yms = [...new Set(Object.values(M.m).flatMap(o => Object.keys(o)))].sort();
    const opts = yms.map(y => `<option value="${y}">${ymLabel(y)}</option>`).join('');
    $('procFrom').innerHTML = opts; $('procTo').innerHTML = opts;
    $('procFrom').value = yms[0]; $('procTo').value = yms[yms.length - 1];
    MECS.forEach(m => { const o = M.m[m.k]; if(!o) return; const n = Object.values(o).reduce((a, x) => a + x[0], 0), b = Object.values(o).reduce((a, x) => a + x[1], 0);
      const el = $('pm_' + m.k); if(el) el.textContent = m.sub + ' · ' + fmt(n) + ' · ~' + mb(b * 0.3); });
    $('procNote').innerHTML += ` Cubre ${ymLabel(yms[0])} a ${ymLabel(yms[yms.length - 1])}${M.nota ? '. ' + esc(M.nota) : ''}.`;
    const pre = window.PROC_PRESET;   // llegada desde la ficha de un proveedor: busca todos sus procesos en todos los mecanismos
    if(pre && pre.prov){ window.PROC_PRESET = null; $('procProv').value = pre.prov; host.querySelectorAll('#procMecs input').forEach(i => { i.checked = true; }); updateHint(); run(); }
  }).catch(e => { $('procStatus').innerHTML = `<span class="proc-err">${esc(e.message)}</span>`; });
  const CAU_MECS = ['td', 'cc', 'ot'];
  function fillDicSelects(){
    const D = window.PROC_DIC; if(!D) return;
    const cs = $('procCau'), ss = $('procSec'); if(!cs || cs.dataset.f) return; cs.dataset.f = '1';
    cs.innerHTML = '<option value="">Todas</option>' + D.cau.map((c, i) => c ? `<option value="${i}">${esc(c.length > 90 ? c.slice(0, 88) + '…' : c)}</option>` : '').join('');
    ss.innerHTML = '<option value="">Todos</option>' + [...new Set(D.org.map(o => o[2]))].filter(x => x && x !== 'SINDATO').sort().map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  }
  $('procCau').innerHTML = '<option value="">Cargando…</option>'; $('procSec').innerHTML = '<option value="">Cargando…</option>';
  let warmed = false; const warm = () => { if(!warmed){ warmed = true; ensureDic().then(fillDicSelects).catch(() => { warmed = false; }); } };
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { if(document.body.contains(host)) warm(); });
  host.addEventListener('focusin', warm); host.addEventListener('pointerenter', warm, {once: true});
  host.querySelectorAll('#procEx button').forEach(b => b.addEventListener('click', () => { $('procQ').value = b.dataset.q; run(); }));
  $('procGo').addEventListener('click', () => run());
  // Mecanismos a los que aplica cada filtro (null = todos)
  function aplicables(){
    let a = null; const cut = l => { a = a ? a.filter(x => l.includes(x)) : l.slice(); };
    const est = $('procEst').value;
    if(est.startsWith('l:') || $('procTipo').value || $('procNmin').value !== '' || $('procNmax').value !== '') cut(['l']);
    else if(est.startsWith('o:')) cut(['td', 'ca', 'cm', 'cc', 'ot']);
    if($('procCau').value !== '') cut(CAU_MECS);
    return a;
  }
  function updateHint(){
    const a = aplicables(), h = $('procHint'); if(!a){ h.textContent = ''; return; }
    h.textContent = 'Con los filtros elegidos solo se buscan ' + a.map(k => MEC[k].n).join(', ') + '; los demás mecanismos no tienen ese dato.';
  }
  ['procEst', 'procTipo', 'procCau', 'procNmin', 'procNmax'].forEach(id => $(id).addEventListener('change', () => {
    const a = aplicables();
    if(a && !a.some(k => host.querySelector('#procMecs input[value=' + k + ']').checked)){ const i = host.querySelector('#procMecs input[value=' + a[0] + ']'); i.checked = true; }
    updateHint();
  }));
  host.querySelectorAll('#procMecs input').forEach(i => i.addEventListener('change', updateHint));
  $('procClr').addEventListener('click', () => {
    ST.token++; ST.busy = false; ST.res = []; ST.cnt = {}; ST.sum = {}; ST.total = 0; ST.sumAll = 0; ST.capped = false; ST.page = 0; ST.open = new Set(); ST._sorted = null; ST.params = null; ST.A = null; ST.listOpen = false; ST.pv = {}; ST.pn = null; ST._pnFor = null; ST.jobs = null;
    ST.sort = {k: 'sc', dir: -1};
    ['procQ', 'procOrg', 'procProv', 'procMin', 'procMax', 'procRub', 'procId', 'procNmin', 'procNmax'].forEach(id => { $(id).value = ''; });
    ['procReg', 'procEst', 'procTipo', 'procCau', 'procSec'].forEach(id => { $(id).selectedIndex = 0; });
    host.querySelectorAll('#procMecs input').forEach(i => { i.checked = (i.value === 'l' || i.value === 'td'); });
    if(man){ const yms = [...new Set(Object.values(man.m).flatMap(o => Object.keys(o)))].sort(); $('procFrom').value = yms[0]; $('procTo').value = yms[yms.length - 1]; }
    $('procSyn').checked = true; $('procOut').innerHTML = ''; $('procStatus').innerHTML = ''; $('procHint').textContent = ''; $('procGo').disabled = false;
    $('procQ').focus();
  });
  $('procQ').addEventListener('keydown', e => { if(e.key === 'Enter') run(); });
  ['procOrg', 'procProv', 'procMin', 'procMax', 'procRub', 'procId', 'procNmin', 'procNmax'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key === 'Enter') run(); }));
  $('procOut').addEventListener('change', e => {
    if(e.target.id === 'procSort'){ ST.sort = {k: e.target.value, dir: -1}; ST.page = 0; renderResults(); return; }
    const t = e.target, p = t.dataset && t.dataset.pn && ST.pn && ST.pn[t.dataset.pn]; if(!p) return;
    if(t.classList.contains('an-sel')){ const v = pv(p); v.by = t.value; v.inv = false; tipHide(); rerenderPanel(p.key, 'an-sel'); }
    else if(t.classList.contains('an-lim')){ pv(p).lim = +t.value; tipHide(); rerenderPanel(p.key, 'an-lim'); }
  });
  $('procOut').addEventListener('mouseover', e => { const el = e.target.closest('[data-pn][data-ix]'); if(el && !e.target.closest('.an-dl')) tipShow(el, e.clientX, e.clientY); else tipHide(); });
  $('procOut').addEventListener('mousemove', e => { const el = e.target.closest('[data-pn][data-ix]'); if(el && !e.target.closest('.an-dl')) tipShow(el, e.clientX, e.clientY); });
  $('procOut').addEventListener('mouseleave', tipHide);
  $('procOut').addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-pn][data-ix]'); if(el && !e.target.matches('.an-dl')){ const r = el.getBoundingClientRect(); tipShow(el, r.left + 24, r.top); } });
  $('procOut').addEventListener('focusout', tipHide);
  $('procOut').addEventListener('toggle', e => { if(e.target.id === 'procList'){ const op = e.target.open; if(op !== ST.listOpen){ ST.listOpen = op; if(op) renderResults(); } } }, true);
  const aplicaClick = el => {
    if(el.dataset.reg != null){ $('procReg').value = el.dataset.reg; }
    else if(el.dataset.org != null){ $('procOrg').value = el.dataset.org; }
    else if(el.dataset.prov != null){ $('procProv').value = el.dataset.prov; }
    else return false;
    run(); return true;
  };
  $('procOut').addEventListener('keydown', e => { if((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-reg],[data-org],[data-prov]')){ e.preventDefault(); aplicaClick(e.target); } });
  $('procOut').addEventListener('click', e => {
    if(e.target.id === 'procSort') return;
    const dlb = e.target.closest('.an-dl'); if(dlb){ e.stopPropagation(); downloadGroup(dlb); return; }
    const invb = e.target.closest('.an-inv'); if(invb){ const p = ST.pn && ST.pn[invb.dataset.pn]; if(p){ const v = pv(p); v.inv = !v.inv; tipHide(); rerenderPanel(p.key, 'an-inv'); } return; }
    const an_ = e.target.closest('[data-reg],[data-org],[data-prov]'); if(an_ && aplicaClick(an_)) return;
    const th = e.target.closest('th[data-sort]');
    if(th){ const k = th.dataset.sort; ST.sort = {k, dir: ST.sort.k === k ? -ST.sort.dir : (k === 'f' || k === 'mo' ? -1 : 1)}; ST.page = 0; renderResults(); return; }
    const pg = e.target.closest('button[data-pg]'); if(pg){ ST.page += +pg.dataset.pg; renderResults(); $('procOut').scrollIntoView({block: 'start', behavior: 'smooth'}); return; }
    if(e.target.closest('a, .proc-f')) return;
    const tr = e.target.closest('tr.proc-r'); if(tr){ const i = +tr.dataset.i; if(ST.open.has(i)) ST.open.delete(i); else ST.open.add(i); renderResults(); }
  });
  async function run(){
    if(ST.busy){ ST.token++; }
    const my = ++ST.token; ST.busy = true;
    const status = $('procStatus'), go = $('procGo'); go.disabled = true;
    try {
      if(!man) man = await ensureMan();
      const useSyn = $('procSyn').checked;
      const q = parseQuery($('procQ').value, useSyn);
      const P = {q, org: tokens($('procOrg').value), prov: tokens($('procProv').value), reg: $('procReg').value === '' ? -1 : +$('procReg').value,
        min: $('procMin').value === '' ? null : +$('procMin').value, max: $('procMax').value === '' ? null : +$('procMax').value,
        est: null, tipo: $('procTipo').value || null, nmin: $('procNmin').value === '' ? null : +$('procNmin').value, nmax: $('procNmax').value === '' ? null : +$('procNmax').value,
        cau: $('procCau').value === '' || isNaN(+$('procCau').value) ? -1 : +$('procCau').value, sec: $('procSec').value ? norm($('procSec').value) : '', rub: tokens($('procRub').value),
        ids: norm($('procId').value).split(/[\s,;]+/).filter(x => x.length >= 2)};
      const ev = $('procEst').value;
      if(ev.startsWith('o:')) P.est = {k: 'o', v: +ev.slice(2)};
      else if(ev.startsWith('l:')){
        await ensureDic(); fillDicSelects();
        const lab = ev.slice(2), idx = lab === 'sin' ? -1 : window.PROC_DIC.est.findIndex(e => e.indexOf(lab) === 0);
        P.est = {k: 'l', v: idx};
      }
      let mecs = [...host.querySelectorAll('#procMecs input:checked')].map(i => i.value);
      if(!mecs.length){ status.innerHTML = '<span class="proc-err">Elige al menos un mecanismo.</span>'; return; }
      const apl = aplicables(); let omit = [];
      if(apl){ omit = mecs.filter(k => !apl.includes(k)); mecs = mecs.filter(k => apl.includes(k)); }
      if(!mecs.length){ status.innerHTML = '<span class="proc-err">Los filtros elegidos no aplican a los mecanismos marcados. Marca ' + apl.map(k => MEC[k].n).join(', ') + ' o cambia los filtros.</span>'; return; }
      ST.notice = omit.length ? 'No se buscó en ' + omit.map(k => MEC[k].n).join(', ') + ' porque los filtros de estado, tipo, N° de ofertas o causal no existen en esos mecanismos.' : '';
      if(q.empty && !P.org.length && !P.prov.length && P.reg < 0 && P.min == null && P.max == null && !P.est && !P.tipo && P.nmin == null && P.nmax == null && P.cau < 0 && !P.sec && !P.rub.length && !P.ids.length){ status.innerHTML = '<span class="proc-err">Escribe qué buscas o aplica algún filtro.</span>'; return; }
      const from = $('procFrom').value, to = $('procTo').value;
      const jobs = [];
      mecs.forEach(k => { const o = man.m[k] || {}; Object.keys(o).forEach(ym => { if(ym >= from && ym <= to) jobs.push({mec: k, ym, h: o[ym][2], bytes: o[ym][1]}); }); });
      jobs.sort((a, b) => a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : (a.mec < b.mec ? -1 : 1));
      if(!jobs.length){ status.innerHTML = '<span class="proc-err">No hay archivos para ese período y mecanismos.</span>'; return; }
      ST.res = []; ST.cnt = {}; ST.sum = {}; ST.total = 0; ST.sumAll = 0; ST.capped = false; ST.page = 0; ST.open = new Set(); ST._sorted = null; ST.A = newAgg(); ST.listOpen = false; ST.pv = {}; ST._pnFor = null; ST.jobs = jobs; ST.filtTxt = filtSummary(); ST.params = P; ST.t0 = Date.now(); ST.sort = {k: q.groups.length || q.phrases.length ? 'sc' : 'f', dir: -1};
      $('procOut').innerHTML = '';
      status.innerHTML = 'Cargando el índice de búsqueda…';
      await ensureDic();
      const totalB = jobs.reduce((a, j) => a + j.bytes, 0); let doneB = 0;
      const loads = new Map(), get = j => { const k = j.mec + '|' + j.ym; if(!loads.has(k)) loads.set(k, loadShard(j)); return loads.get(k); };
      for(let i = 0; i < jobs.length; i++){
        for(let k = i; k < Math.min(i + 3, jobs.length); k++) get(jobs[k]).catch(() => {});
        const j = jobs[i], key = j.mec + '|' + j.ym;
        status.innerHTML = `Revisando ${esc(MEC[j.mec].n)} · ${ymLabel(j.ym)} (${i + 1} de ${jobs.length}) · ${fmt(ST.total)} coincidencias hasta ahora<div class="proc-bar"><i style="width:${Math.round(100 * doneB / totalB)}%"></i></div>`;
        const sh = await get(j);
        if(my !== ST.token || !document.body.contains(host)) { delete window.PROC_SH[key]; return; }
        matchShard(j, sh, P);
        loads.delete(key); delete window.PROC_SH[key]; doneB += j.bytes;
        await new Promise(r => setTimeout(r, 0));
      }
      if(my !== ST.token) return;
      status.innerHTML = '';
      ST.A.cases = pickCases(ST.A); ST.A.done = true;
      DL_STORE.procBuscador = {headers: EXP_HDR, get rows(){ return exportRows(); }, sheets: anSheets};
      renderResults();
    } catch(e) {
      console.error(e); if(my === ST.token) status.innerHTML = `<span class="proc-err">${esc(e.message)}</span>`;
    } finally { if(my === ST.token){ ST.busy = false; go.disabled = false; } }
  }
}
window.ProcBuscador = {init, _parse: parseQuery, _norm: norm};
})();
