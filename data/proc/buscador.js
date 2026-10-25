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
const ST = {token:0, N:null, res:[], cnt:{}, sum:{}, total:0, sumAll:0, capped:false, page:0, sort:{k:'sc', dir:-1}, open:new Set(), params:null, busy:false, q:'', t0:0};
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
    ST.cnt[mec] = (ST.cnt[mec] || 0) + 1; ST.sum[mec] = (ST.sum[mec] || 0) + (mo || 0); ST.total++; ST.sumAll += (mo || 0);
    if(ST.res.length < CAP){
      const r = {mec, ym: job.ym, sc}; for(const k in sh){ const a = sh[k]; if(Array.isArray(a)) r[k] = a[i]; }
      if(sh.fx && sh.fx[i]) r.fx = sh.fx[i];
      ST.res.push(r);
    } else ST.capped = true;
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
const TIPO_LIC = {LE:'Licitación Pública menor a 100 UTM', L1:'Licitación Pública entre 100 y 1.000 UTM', LP:'Licitación Pública entre 1.000 y 2.000 UTM', LQ:'Licitación Pública entre 2.000 y 5.000 UTM',
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
function monedaTxt(r){
  if(r.mec === 'l') return r.mo >= 0 ? D_().mon[r.mo] : '';
  return r.fx ? fmt(r.fx[1]) + ' ' + D_().mon[r.fx[0]] : '';
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
  const rows = idx.slice(ST.page * PAGE, ST.page * PAGE + PAGE).map(ix => {
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
  const cap = ST.capped ? `<p class="cp-cap-note">Hay ${fmt(ST.total)} coincidencias. Se muestran y se descargan las ${fmt(CAP)} más recientes; el recuento y los montos del resumen incluyen todas. Acota la búsqueda para verlas completas.</p>` : '';
  const secs = ((Date.now() - ST.t0) / 1000).toFixed(1);
  const nota = ST.notice ? `<p class="cp-cap-note">${esc(ST.notice)}</p>` : '';
  out.innerHTML = `<div class="proc-sum"><div class="proc-sum-n"><b>${fmt(ST.total)}</b> proceso${ST.total === 1 ? '' : 's'}${ST.sumAll ? ' · <b>$' + fmt(ST.sumAll) + '</b> en OC (CLP)' : ''}</div><div class="proc-chips">${chips}</div></div>
    ${cap}${nota}
    <div class="proc-dl"><label class="pf-s" for="procSort">Ordenar por</label><select id="procSort"><option value="sc"${ST.sort.k === 'sc' ? ' selected' : ''}>Relevancia</option><option value="f"${ST.sort.k === 'f' ? ' selected' : ''}>Más recientes</option><option value="mo"${ST.sort.k === 'mo' ? ' selected' : ''}>Mayor monto</option></select>${typeof dlBtn === 'function' ? dlBtn('procBuscador', 'procesos_de_compra_busqueda.csv', 'Descargar resultados (Excel)') : ''}<span class="pf-s">Búsqueda hecha en ${secs} s · haz clic en una fila para ver todos los antecedentes</span></div>
    <div class="table-wrap proc-tw"><table class="dt proc-tbl"><thead><tr>${th('mec', 'Mecanismo')}${th('c', 'ID')}${th('f', 'Fecha')}${th('t', 'Título y qué se compró')}${th('org', 'Organismo · unidad')}<th>Proveedor</th>${th('mo', 'Monto (CLP)', 'num')}<th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${pg}`;
}
function exportRows(){
  const D = D_();
  return ST.res.map(r => {
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
  'Proveedor(es)','RUT proveedor(es)','Monto OC (CLP)','Monto estimado','Moneda','Estado','N° oferentes','N° OC','Causal / procedencia','Tipo licitación / ID relacionado','Código PAC','Licitación de origen','Productos','Rubro › familia › clase','N° ítems','Enlace Mercado Público'];

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
        <optgroup label="Públicas">${['LE','L1','LP','LQ','LR','LS'].map(t => `<option value="${t}">${t} · ${esc(TIPO_LIC[t].replace('Licitación Pública ', ''))}</option>`).join('')}</optgroup>
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
    ST.token++; ST.busy = false; ST.res = []; ST.cnt = {}; ST.sum = {}; ST.total = 0; ST.sumAll = 0; ST.capped = false; ST.page = 0; ST.open = new Set(); ST._sorted = null; ST.params = null;
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
  $('procOut').addEventListener('change', e => { if(e.target.id === 'procSort'){ ST.sort = {k: e.target.value, dir: -1}; ST.page = 0; renderResults(); } });
  $('procOut').addEventListener('click', e => {
    if(e.target.id === 'procSort') return;
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
      ST.res = []; ST.cnt = {}; ST.sum = {}; ST.total = 0; ST.sumAll = 0; ST.capped = false; ST.page = 0; ST.open = new Set(); ST._sorted = null; ST.params = P; ST.t0 = Date.now(); ST.sort = {k: q.groups.length || q.phrases.length ? 'sc' : 'f', dir: -1};
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
      DL_STORE.procBuscador = {headers: EXP_HDR, get rows(){ return exportRows(); }};
      renderResults();
    } catch(e) {
      console.error(e); if(my === ST.token) status.innerHTML = `<span class="proc-err">${esc(e.message)}</span>`;
    } finally { if(my === ST.token){ ST.busy = false; go.disabled = false; } }
  }
}
window.ProcBuscador = {init, _parse: parseQuery, _norm: norm};
})();
