/* Asistente IA · panel lateral acoplado (fase 1: búsqueda en normativa y guía de paneles, sin IA generativa).
   Carga perezosa: kb.js (fichas curadas) y ley.js (artículos de la Ley 19.886) solo al abrir el panel. */
(function(){
'use strict';
if(window.__ASISTENTE__) return; window.__ASISTENTE__ = true;

var BASE = (function(){ var s = document.currentScript; return s && s.src ? s.src.replace(/[^\/]*$/, '') : 'data/asistente/'; })();
var VER = (document.currentScript && document.currentScript.src.split('?v=')[1]) || '1';
var URL_R = 'https://bcn.cl/7wHrbo', URL_L = 'https://bcn.cl/C713d1';
var AYUDA = 'https://ayuda.mercadopublico.cl/';
var AI_URL = 'https://mecanismos-de-compra-ai.felipemedinaromero.workers.dev/api/assistant';

/* ---------- utilidades de texto ---------- */
function norm(s){ return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
var STOP = {}; ('de la el en y a los las que un una por para con se del al es lo como cual cuales cuando donde quien me mi mis tu su sus o u e ni no si mas muy ya hay son ser fue sobre entre desde hasta este esta estos estas ese esa eso esto ello puedo puede pueden debo debe deben tiene tienen tengo hacer hace hago quiero necesito dime dice dicen norma segun ley reglamento art articulo').split(' ').forEach(function(w){ STOP[w] = 1; });
var VERB = {licitar:'licitacion', cotizar:'cotizacion', adjudicar:'adjudicacion', fragmentar:'fragmentacion', modificar:'modificacion', subcontratar:'subcontratacion', garantizar:'garantia', pagar:'pago', comprar:'compra', contratar:'contrato', multar:'multa', sancionar:'sancion', inscribir:'inscripcion', publicar:'publicacion', notificar:'notificacion', reclamar:'reclamo', denunciar:'denuncia', evaluar:'evaluacion', ofertar:'oferta', renovar:'renovacion', suspender:'suspension', eliminar:'eliminacion', planificar:'plan', abstener:'abstencion', ceder:'cesion', terminar:'termino', exigir:'exigencia', declarar:'declaracion'};
var ALIAS = {ca:'compra agil', cm:'convenio marco', td:'trato directo', lp:'licitacion publica', oc:'orden de compra', emt:'empresa menor tamano', ds661:'decreto 661', cdp:'certificado disponibilidad presupuestaria', gc:'grandes compras', sie:'subasta inversa electronica', rp:'registro proveedores', bases:'bases'};
function stem(w){
  if(VERB[w]) return VERB[w];
  if(w.length > 6 && /ciones$/.test(w)) w = w.slice(0, -2);
  else if(w.length > 4 && /es$/.test(w) && !/(ie|ue)s$/.test(w)) w = w.slice(0, -2);
  else if(w.length > 3 && /s$/.test(w)) w = w.slice(0, -1);
  return VERB[w] || w;
}
function toks(s){
  var out = [], parts = norm(s).split(' ');
  for(var i = 0; i < parts.length; i++){
    var w = parts[i]; if(!w) continue;
    if(ALIAS[w]){ ALIAS[w].split(' ').forEach(function(x){ if(!STOP[x]) out.push(stem(x)); }); continue; }
    if(STOP[w] && !/^\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/* ---------- índice de búsqueda ---------- */
var KB = null, LEY = null, IDX = null, loading = null, ACC = null;
function load(src){ return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = BASE + src + '?v=' + VER; s.onload = res; s.onerror = function(){ rej(new Error(src)); }; document.head.appendChild(s); }); }
var accP = null;
function accLoad(){ return accP || (accP = load('acciones.js').then(function(){ ACC = window.ASISTENTE_ACC || null; if(ACC) ACC.init({onChange: function(){ paintCtx(); }}); }).catch(function(){ ACC = null; })); }
function restoreLink(){ if(/&cm=/.test(location.hash) || ACC) accLoad().then(function(){ if(ACC) ACC.restoreFromHash(); }); }
function ensure(){
  if(IDX) return Promise.resolve();
  if(loading) return loading;
  loading = Promise.all([load('kb.js'), load('ley.js'), accLoad()]).then(function(){ KB = window.AS_KB; LEY = window.AS_LEY; build(); }).catch(function(e){ loading = null; throw e; });
  return loading;
}
function tf(arr){ var m = {}; arr.forEach(function(t){ m[t] = (m[t] || 0) + 1; }); return m; }
function build(){
  var docs = [], df = {};
  KB.e.forEach(function(x, i){
    var tt = toks(x.t), kk = toks(x.k), aa = toks(x.a.join(' '));
    docs.push({kind: 'kb', i: i, ft: tf(tt), fk: tf(kk), fa: tf(aa), len: tt.length * 3 + kk.length * 2 + aa.length, nt: norm(x.t), nk: norm(x.k)});
  });
  LEY.a.forEach(function(x, i){
    var aa = toks(x[1]);
    docs.push({kind: 'ley', i: i, ft: {}, fk: tf(toks('articulo ' + x[0])), fa: tf(aa), len: aa.length, nt: '', nk: ''});
  });
  docs.forEach(function(d){ var seen = {}; [d.ft, d.fk, d.fa].forEach(function(f){ for(var t in f) seen[t] = 1; }); for(var t in seen) df[t] = (df[t] || 0) + 1; });
  var tot = 0; docs.forEach(function(d){ tot += d.len; });
  IDX = {docs: docs, df: df, N: docs.length, avg: tot / docs.length};
}
function bm(f, len, w){ var k1 = 1.2, b = .6; return w * f * (k1 + 1) / (f + k1 * (1 - b + b * len / IDX.avg)); }
var BOOST = [[/cuando.*(trato directo|contratacion directa)|(causal|caso).*trato directo|trato directo.*(causal|procede|casos)/, 'trato-directo-causales', 30], [/(hasta cuando|plazo|fecha).*\bpac\b|\bpac\b.*(plazo|enero)/, 'pac-contenido', 30], [/(plazo|dias).*(llamado|cierre|licitacion)|(llamado|cierre).*plazo/, 'licitacion-plazos', 20], [/(cuantas|numero).*cotizacion/, 'compra-agil', 20]];
var PANELQ = /panel|pagina|seccion|buscador|dashboard|grafico|donde|como (veo|uso|encuentro|busco)|datos|ficha|explorador|asesor|maestra|copiar enlace|excel/;
function search(q, opts){
  opts = opts || {};
  var qt = toks(q); if(!qt.length) return {kb: [], ley: [], qt: qt};
  var uniq = []; qt.forEach(function(t){ if(uniq.indexOf(t) < 0) uniq.push(t); });
  var nq = norm(q), hash = opts.hash || '';
  var rk = [], rl = [];
  IDX.docs.forEach(function(d){
    var s = 0, hit = 0;
    uniq.forEach(function(t){
      var idf = Math.log(1 + (IDX.N - (IDX.df[t] || 0) + .5) / ((IDX.df[t] || 0) + .5));
      var x = bm(d.ft[t] || 0, d.len, 4) + bm(d.fk[t] || 0, d.len, 3) + bm(d.fa[t] || 0, d.len, 1.2);
      if(x > 0){ hit++; s += idf * x; }
    });
    if(!hit) return;
    s *= (.55 + .45 * hit / uniq.length);
    if(d.kind === 'kb'){
      var e = KB.e[d.i];
      if(uniq.length > 1){ for(var a = 0; a + 1 < uniq.length; a++){ var bg = uniq[a] + ' ' + uniq[a + 1]; if(d.nt.indexOf(bg) >= 0) s += 3; else if(d.nk.indexOf(bg) >= 0) s += 1.5; } }
      if(opts.cat && opts.cat !== 'todo'){ if(e.c !== opts.cat && !(opts.cat === 'norm' && e.c === 'norm')) s *= .35; }
      if(hash && e.g && e.g.some(function(g){ return g[1] && hash.indexOf(g[1].split('&')[0]) === 0 && g[1].length > 1; })) s *= 1.25;
      s *= 1.4;
      for(var bi = 0; bi < BOOST.length; bi++) if(BOOST[bi][1] === e.id && BOOST[bi][0].test(nq)) s += BOOST[bi][2];
      if(e.c === 'panel' && !PANELQ.test(nq) && !(hash && e.g && e.g.some(function(g){ return g[1] && g[1].length > 1 && hash.indexOf(g[1].split('&')[0]) === 0; }))) s *= .6;
      rk.push({s: s, e: e, hit: hit});
    } else {
      rl.push({s: s, i: d.i, hit: hit});
    }
  });
  rk.sort(function(a, b){ return b.s - a.s; }); rl.sort(function(a, b){ return b.s - a.s; });
  return {kb: rk.slice(0, 6), ley: rl.slice(0, 4), qt: uniq, nq: nq};
}
function excerpt(text, qt, n){
  n = n || 460;
  var nt = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), best = -1;
  for(var i = 0; i < qt.length && best < 0; i++){ var t = qt[i]; if(t.length < 4) continue; var p = nt.indexOf(t.slice(0, Math.max(4, t.length - 2))); if(p >= 0) best = p; }
  var st = Math.max(0, best < 0 ? 0 : best - 120);
  if(st > 0){ var sp = text.indexOf(' ', st); if(sp > 0 && sp - st < 40) st = sp + 1; }
  var en = Math.min(text.length, st + n);
  if(en < text.length){ var sp2 = text.lastIndexOf(' ', en); if(sp2 > st + 80) en = sp2; }
  return (st > 0 ? '… ' : '') + text.slice(st, en) + (en < text.length ? ' …' : '');
}

/* ---------- contexto: dónde está el usuario ---------- */
var CTX = [
  [/^#detalle=Convenio%20Marco|^#detalle=Convenio Marco/, 'Convenio Marco', ['¿Debo consultar el catálogo de Convenio Marco antes de licitar?', '¿Qué son las Grandes Compras?', '¿Qué significa «En la maestra vigente»?']],
  [/^#detalle=Compra(%20| )%C3%81gil|^#detalle=Compra(%20| )Ágil/, 'Compra Ágil', ['¿Cuántas cotizaciones se piden en una Compra Ágil?', '¿La Compra Ágil requiere acto administrativo?', '¿Hay que consultar el catálogo en Compra Ágil?']],
  [/^#detalle=Licitaci%C3%B3n|^#detalle=Licitación/, 'Licitaciones', ['¿Qué plazos hay entre el llamado y el cierre de ofertas?', '¿Cuándo se exige comisión evaluadora?', '¿Qué es una oferta temeraria?']],
  [/^#detalle=Trato/, 'Trato o Contratación Directa', ['¿Cuáles son las causales de trato directo?', '¿Qué hay que publicar en un trato directo?', '¿Qué pasa si invoco mal la emergencia?']],
  [/^#detalle=Contrataci%C3%B3n|^#detalle=Contratación/, 'Contratación por Cotización', ['¿Cuándo procede la compra por cotización?', '¿Cuántas cotizaciones se necesitan?']],
  [/^#detalle=Compra(%20| )Coordinada/, 'Compra Coordinada', ['¿Qué es una Compra Coordinada?', '¿Puede la Dirección de Compras representar a mi organismo?']],
  [/^#detalle=/, 'Ficha de un mecanismo', ['¿De dónde salen los datos del panel?', '¿Qué cambió con la Ley 21.634?']],
  [/^#asesor/, 'Asesor estratégico de compras', ['¿Cuándo corresponde una licitación pública?', '¿Qué procedimiento uso bajo 100 UTM?', '¿Debo comprar por Convenio Marco?']],
  [/^#rubro/, 'Buscador de procesos de compra', ['¿Cómo funciona «Copiar enlace»?', '¿Qué es una oferta temeraria?', '¿Qué plazos tiene una licitación?']],
  [/^#proveedores/, 'Proveedores', ['¿Qué inhabilidades tiene un proveedor?', '¿Qué categorías hay en el Registro de Proveedores?', '¿Cuándo se suspende a un proveedor?']],
  [/^#comprador/, 'Explorador por comprador', ['¿Qué es fragmentar compras?', '¿Qué debe publicar un organismo en Mercado Público?']],
  [/^#pac26/, 'Buscador PAC 2026', ['¿Qué contiene el Plan Anual de Compras?', '¿Puedo comprar algo que no está en el PAC?']],
  [/^#pac/, 'Plan Anual de Compras', ['¿Hasta cuándo se publica el PAC?', '¿Puedo comprar algo que no está en el PAC?', '¿Cómo se modifica el PAC?']],
  [/^#presupuesto/, 'Presupuesto 2026', ['¿Qué pasa si adjudico 30% sobre el monto estimado?', '¿Qué contiene el Plan Anual de Compras?']],
  [/^#cfmp/, 'Compras fuera de Mercado Público', ['¿Cuándo se puede comprar fuera del Sistema de Información?', '¿Debo consultar el catálogo de Convenio Marco?']],
  [/^#gore/, 'Gobiernos Regionales', ['¿Qué dice la norma sobre proveedores locales?', '¿Qué es una licitación bajo 500 UTM?']],
  [/^#subasta-inversa/, 'Subasta Inversa Electrónica', ['¿Cómo funciona la Subasta Inversa Electrónica?', '¿Desde cuándo está vigente?']],
  [/^#economia-circular/, 'Economía Circular', ['¿Debo consultar la plataforma de economía circular antes de comprar?']],
  [/^#nuevos/, 'Organismos nuevos incorporados', ['¿Quiénes están sujetos a la Ley de Compras?', '¿Qué cambió con la Ley 21.634?']],
  [/^#?$/, 'Panel principal', ['¿Qué dice la norma sobre la Compra Ágil?', '¿Qué cambió con la Ley 21.634?', '¿Cómo leo las cifras del panel?']]
];
function ctx(){ var ac = ACC && ACC.ctx(); if(ac) return ac; var h = location.hash || ''; for(var i = 0; i < CTX.length; i++) if(CTX[i][0].test(h)) return {label: CTX[i][1], sug: CTX[i][2]}; return {label: 'Panel de Mecanismos de Compra', sug: CTX[CTX.length - 1][2]}; }

/* ---------- interfaz ---------- */
var CSS = '' +
'body.ia-open{margin-right:var(--ia-w,400px)}' +
'body.ia-open .sticky-ribbon{right:var(--ia-w,400px)}' +
'body.ia-open .home-fab{right:calc(var(--ia-w,400px) + 16px)}' +
'.ia-tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:80;display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 9px;border:0;border-radius:12px 0 0 12px;background:var(--cc-dark,#00233B);color:#fff;font:700 12.5px/1 var(--font,Verdana,sans-serif);cursor:pointer;box-shadow:-4px 6px 18px rgba(0,35,59,.28)}' +
'.ia-tab:hover{background:var(--cc-navy,#0032A2)}.ia-tab:focus-visible{outline:3px solid var(--cc-lime,#D0FF66);outline-offset:2px}' +
'.ia-tab span{writing-mode:vertical-rl;letter-spacing:.04em}.ia-tab i{width:24px;height:24px;border-radius:50%;background:var(--cc-lime,#D0FF66);color:var(--cc-dark,#00233B);display:flex;align-items:center;justify-content:center;font:800 11px var(--font,sans-serif);font-style:normal}' +
'body.ia-open .ia-tab{display:none}' +
'.ia-panel{position:fixed;top:0;right:0;bottom:0;width:var(--ia-w,400px);z-index:90;display:none;flex-direction:column;background:#fff;border-left:1px solid var(--border,#DDE3EA);box-shadow:-10px 0 28px rgba(0,35,59,.14);font:12.5px/1.5 var(--font,Verdana,sans-serif);color:var(--cc-dark,#00233B)}' +
'body.ia-open .ia-panel{display:flex}' +
'.ia-grip{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:2}.ia-grip:hover{background:rgba(11,120,204,.25)}' +
'.ia-h{background:var(--cc-dark,#00233B);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;flex:none}' +
'.ia-av{width:30px;height:30px;border-radius:50%;background:var(--cc-lime,#D0FF66);color:var(--cc-dark,#00233B);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:12px;flex:none}' +
'.ia-h b{display:block;font-size:14px}.ia-h small{color:#9fe0ec;font-size:10.5px}' +
'.ia-beta{display:inline-block;background:var(--cc-lime,#D0FF66);color:var(--cc-dark,#00233B);font-size:9px;font-weight:800;border-radius:6px;padding:1px 5px;margin-left:6px;vertical-align:2px}' +
'.ia-x{margin-left:auto;display:flex;gap:6px}.ia-x button{width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;cursor:pointer}.ia-x button:hover{background:rgba(255,255,255,.26)}.ia-x button:focus-visible{outline:2px solid var(--cc-lime,#D0FF66)}' +
'.ia-ctx{background:#EEF4FF;border-bottom:1px solid var(--border,#DDE3EA);padding:7px 14px;font-size:11px;color:var(--cc-navy,#0032A2);flex:none}.ia-ctx b{color:var(--cc-dark,#00233B)}' +
'.ia-cats{display:flex;gap:6px;flex-wrap:wrap;padding:9px 14px 3px;flex:none}' +
'.ia-cat{border:1.5px solid var(--border,#DDE3EA);border-radius:99px;padding:4px 10px;font:700 11px var(--font,sans-serif);color:var(--text-secondary,#3D5466);background:#fff;cursor:pointer}.ia-cat[aria-pressed="true"]{border-color:var(--cc-navy,#0032A2);background:#F3F7FF;color:var(--cc-navy,#0032A2)}.ia-cat:focus-visible{outline:2px solid var(--cc-blue,#0B78CC)}' +
'.ia-m{flex:1;overflow-y:auto;padding:8px 14px 12px;scroll-behavior:smooth}' +
'.ia-u{display:flex;justify-content:flex-end;margin:8px 0 10px}.ia-u div{background:var(--cc-navy,#0032A2);color:#fff;border-radius:16px 16px 4px 16px;padding:8px 12px;max-width:88%;line-height:1.45}' +
'.ia-a{background:#F7F9FD;border:1px solid var(--border,#DDE3EA);border-radius:4px 16px 16px 16px;padding:11px 12px;line-height:1.5;margin-bottom:10px}' +
'.ia-a h4{margin:0 0 6px;font-size:13px;color:var(--cc-dark,#00233B)}.ia-a p{margin:0 0 7px}.ia-a ul,.ia-a ol{margin:0 0 8px;padding-left:18px}.ia-a li{margin:0 0 3px}' +
'.ia-chg{background:#FFF8E5;border:1px solid #F0D79A;border-radius:10px;padding:6px 9px;font-size:11.5px;color:#6B4A07;margin:6px 0 8px}' +
'.ia-src{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.ia-src a{display:inline-flex;gap:5px;align-items:center;background:#fff;border:1px solid var(--border,#DDE3EA);border-radius:99px;padding:3px 9px;font-size:10.5px;color:var(--cc-navy,#0032A2);text-decoration:none}.ia-src a:hover{border-color:var(--cc-navy,#0032A2)}' +
'.ia-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.ia-b{border:1px solid var(--cc-navy,#0032A2);color:var(--cc-navy,#0032A2);background:#fff;border-radius:99px;padding:5px 11px;font:700 11px var(--font,sans-serif);cursor:pointer;text-decoration:none;display:inline-block}.ia-b:hover{background:#F3F7FF}.ia-b.p{background:var(--cc-lime,#D0FF66);border-color:var(--cc-lime,#D0FF66);color:var(--cc-dark,#00233B)}.ia-b:focus-visible{outline:2px solid var(--cc-blue,#0B78CC);outline-offset:1px}' +
'.ia-sub{margin:9px 0 0;padding-top:8px;border-top:1px solid var(--border,#DDE3EA)}.ia-sub h5{margin:0 0 5px;font-size:10.5px;color:var(--text-secondary,#3D5466);text-transform:uppercase;letter-spacing:.04em}' +
'.ia-ley{background:#fff;border:1px solid var(--border,#DDE3EA);border-radius:10px;padding:7px 9px;margin-bottom:6px;font-size:11.5px}.ia-ley b{display:block;font-size:11px;color:var(--cc-navy,#0032A2);margin-bottom:2px}.ia-ley .ia-ex.open{display:block;max-height:260px;overflow:auto;margin:3px 0}.ia-ley button{border:0;background:none;color:var(--cc-blue,#0B78CC);font:700 11px var(--font,sans-serif);cursor:pointer;padding:2px 0}' +
'.ia-tbl{width:100%;border-collapse:collapse;font-size:11px;margin:4px 0 6px}.ia-tbl th{text-align:left;color:var(--text-secondary,#3D5466);font-size:10px;text-transform:uppercase;border-bottom:1px solid var(--border,#DDE3EA);padding:3px 4px}.ia-tbl td{border-bottom:1px solid var(--border,#DDE3EA);padding:4px;vertical-align:top}.ia-tbl .r{text-align:right;white-space:nowrap}.ia-mini{border:1px solid var(--cc-navy,#0032A2);color:var(--cc-navy,#0032A2);background:#fff;border-radius:99px;padding:2px 8px;font:700 10px var(--font,sans-serif);cursor:pointer;white-space:nowrap}' +
'.ia-rel{display:flex;flex-wrap:wrap;gap:5px}.ia-rel button{border:1px solid var(--border,#DDE3EA);background:#fff;border-radius:99px;padding:4px 10px;font:600 11px var(--font,sans-serif);color:var(--cc-navy,#0032A2);cursor:pointer;text-align:left}.ia-rel button:hover{border-color:var(--cc-navy,#0032A2)}' +
'.ia-sug{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 8px;flex:none}.ia-sug button{border:1px solid var(--border,#DDE3EA);border-radius:99px;padding:5px 10px;font:600 11px var(--font,sans-serif);color:var(--cc-navy,#0032A2);background:#fff;cursor:pointer;text-align:left}.ia-sug button:hover{border-color:var(--cc-navy,#0032A2)}' +
'.ia-in{border-top:1px solid var(--border,#DDE3EA);padding:10px 12px;display:flex;gap:8px;align-items:center;flex:none}.ia-in input{flex:1;min-width:0;border:1.5px solid var(--cc-navy,#0032A2);border-radius:99px;padding:9px 14px;font:12px var(--font,sans-serif);color:var(--cc-dark,#00233B);background:#fff}.ia-in input:focus{outline:3px solid rgba(11,120,204,.25)}' +
'.ia-go{width:38px;height:38px;border:0;border-radius:50%;background:var(--cc-lime,#D0FF66);color:var(--cc-dark,#00233B);font-weight:800;cursor:pointer;flex:none}.ia-go:focus-visible{outline:3px solid var(--cc-blue,#0B78CC)}' +
'.ia-ft{padding:0 14px 10px;color:var(--text-secondary,#3D5466);font-size:10px;line-height:1.4;flex:none}.ia-ft details summary{cursor:pointer;color:var(--cc-navy,#0032A2)}.ia-ft details p{margin:4px 0 0}' +
'.ia-typing{color:var(--text-secondary,#3D5466);font-size:11px;padding:4px 2px}' +
'@media (max-width:980px){body.ia-open{margin-right:0}body.ia-open .sticky-ribbon{right:0}body.ia-open .home-fab{right:16px}.ia-panel{width:100vw}.ia-grip{display:none}}' +
'@media print{.ia-tab,.ia-panel{display:none!important}body.ia-open{margin-right:0}}';

var S = {open: false, cat: 'todo', busy: false, w: 400, welcomed: false};
var el = {};
function store(k, v){ try{ if(v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(e){} return null; }
function setW(w){ w = Math.max(340, Math.min(560, Math.round(w))); S.w = w; document.documentElement.style.setProperty('--ia-w', w + 'px'); document.body.style.setProperty('--ia-w', w + 'px'); }

function mount(){
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var tab = document.createElement('button'); tab.className = 'ia-tab'; tab.type = 'button'; tab.setAttribute('aria-label', 'Abrir el Asistente IA'); tab.innerHTML = '<i>IA</i><span>Asistente IA</span>';
  var p = document.createElement('aside'); p.className = 'ia-panel'; p.setAttribute('aria-label', 'Asistente IA'); p.setAttribute('role', 'complementary');
  p.innerHTML =
    '<div class="ia-grip" title="Arrastra para cambiar el ancho" aria-hidden="true"></div>' +
    '<div class="ia-h"><div class="ia-av">IA</div><div><b>Asistente IA<span class="ia-beta">BETA</span></b><small>Normativa · datos · paneles</small></div><div class="ia-x"><button type="button" data-a="clear" title="Nueva conversación" aria-label="Nueva conversación">&#8635;</button><button type="button" data-a="close" title="Cerrar" aria-label="Cerrar el asistente">&#10005;</button></div></div>' +
    '<div class="ia-ctx" id="asCtx" aria-live="polite"></div>' +
    '<div class="ia-cats" role="group" aria-label="Tema de la consulta"></div>' +
    '<div class="ia-m" id="asM" role="log" aria-live="polite"></div>' +
    '<div class="ia-sug" id="asSug"></div>' +
    '<form class="ia-in" id="asF" autocomplete="off"><input id="asQ" type="text" maxlength="300" placeholder="Pregunta sobre normativa, paneles o datos…" aria-label="Escribe tu pregunta"><button class="ia-go" type="submit" aria-label="Enviar">&#10148;</button></form>' +
    '<div class="ia-ft">El asistente prioriza la normativa y la guía local; cuando no encuentra una respuesta, puede pedir apoyo a Workers AI. Confirma el texto oficial y el estado vigente antes de decidir.' +
    '<details><summary>Textos consultados</summary><p id="asVer">Cargando…</p></details></div>';
  document.body.appendChild(tab); document.body.appendChild(p);
  el.tab = tab; el.p = p; el.m = p.querySelector('#asM'); el.q = p.querySelector('#asQ'); el.sug = p.querySelector('#asSug'); el.ctx = p.querySelector('#asCtx'); el.cats = p.querySelector('.ia-cats');
  var cats = [['todo', 'Todo'], ['norm', 'Normativa'], ['conv', 'Convenios y catálogo'], ['pac', 'PAC'], ['panel', 'Paneles y datos']];
  el.cats.innerHTML = cats.map(function(c){ return '<button type="button" class="ia-cat" data-cat="' + c[0] + '" aria-pressed="' + (c[0] === 'todo') + '">' + c[1] + '</button>'; }).join('');
  tab.addEventListener('click', function(){ openP(true); });
  p.addEventListener('click', onClick);
  p.querySelector('#asF').addEventListener('submit', function(ev){ ev.preventDefault(); var v = el.q.value.trim(); if(v){ el.q.value = ''; ask(v); } });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && S.open && !ev.defaultPrevented){ openP(false); try{ el.tab.focus(); }catch(e){} } });
  window.addEventListener('hashchange', function(){ paintCtx(); restoreLink(); });
  window.addEventListener('popstate', paintCtx);
  grip(p.querySelector('.ia-grip'));
  var w = parseInt(store('as_w'), 10); setW(w > 0 ? w : 400);
  if(store('as_open') === '1' && window.innerWidth > 980) openP(true, true);
}
function grip(g){
  var drag = false;
  g.addEventListener('pointerdown', function(e){ drag = true; g.setPointerCapture(e.pointerId); e.preventDefault(); });
  g.addEventListener('pointermove', function(e){ if(drag) setW(window.innerWidth - e.clientX); });
  g.addEventListener('pointerup', function(){ if(drag){ drag = false; store('as_w', String(S.w)); } });
}
function paintCtx(){
  if(!el.ctx) return; var c = ctx();
  el.ctx.innerHTML = '<span aria-hidden="true">&#9678;</span> Estás viendo: <b>' + esc(c.label) + '</b>. ' + (c.acting ? 'Puedes pedirme que filtre, ordene, haga rankings o prepare la descarga de esta tabla.' : 'Tus preguntas se orientan a esta página.');
  if(!S.asked || c.acting || S.actSug){ paintSug(c.sug); S.actSug = !!c.acting; }
}
function paintSug(list){ el.sug.innerHTML = list.map(function(s){ return '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>'; }).join(''); }
function openP(v, silent){
  S.open = v; document.body.classList.toggle('ia-open', v);
  if(!silent) store('as_open', v ? '1' : '0');
  if(v){
    paintCtx();
    ensure().then(function(){
      var ve = document.getElementById('asVer');
      if(ve) ve.innerHTML = 'Reglamento: ' + esc(KB.ref.R) + '. Ley 19.886: ' + esc(KB.ref.L) + '. La versión de la Ley que consultó el asistente figura en la BCN con vigencia hasta el 31-10-2026; si hay una versión posterior, verifícala en <a href="' + URL_L + '" target="_blank" rel="noopener">leychile.cl</a>.';
      welcome();
    }).catch(function(){ if(!S.welcomed){ S.welcomed = true; addA('<p>No pude cargar los textos del asistente. Si abriste solo el archivo HTML, deja la carpeta «data» junto a él.</p>'); } });
    if(!silent) setTimeout(function(){ el.q.focus(); }, 50);
  }
}
function welcome(){
  if(S.welcomed) return; S.welcomed = true;
  addA('<p>Hola. Puedo orientarte con la <b>normativa</b> de compras públicas (Ley 19.886 y su Reglamento, DS 661/2024), con los <b>procedimientos</b> y con cómo usar los <b>paneles</b>. Escribe tu pregunta o elige una sugerencia.</p><p style="margin:0;color:var(--text-secondary,#3D5466);font-size:11px">Para cifras de compras (qué se compró, quién vendió), te llevo al panel que corresponde.</p>');
}
function addU(t){ var d = document.createElement('div'); d.className = 'ia-u'; d.innerHTML = '<div>' + esc(t) + '</div>'; el.m.appendChild(d); scroll(); }
function addA(html, cls){ var d = document.createElement('div'); d.className = 'ia-a' + (cls ? ' ' + cls : ''); d.innerHTML = html; el.m.appendChild(d); scroll(); return d; }
function scroll(){ el.m.scrollTop = el.m.scrollHeight; }

function lines(a){
  var out = '', list = null;
  function close(){ if(list){ out += '</' + list + '>'; list = null; } }
  a.forEach(function(l){
    var m;
    if((m = /^- (.*)$/.exec(l))){ if(list !== 'ul'){ close(); out += '<ul>'; list = 'ul'; } out += '<li>' + esc(m[1]) + '</li>'; }
    else if((m = /^(\d+)\. (.*)$/.exec(l))){ if(list !== 'ol'){ close(); out += '<ol>'; list = 'ol'; } out += '<li>' + esc(m[2]) + '</li>'; }
    else { close(); out += '<p>' + esc(l) + '</p>'; }
  });
  close(); return out;
}
function srcChips(s){
  return s.map(function(x){
    var d = x[0], a = x[1], isNum = /^\d/.test(a);
    var lab = d === 'R' ? (isNum ? 'Reglamento art. ' + a : 'Reglamento, ' + a) : 'Ley 19.886 art. ' + a;
    return '<a href="' + (d === 'R' ? URL_R : URL_L) + '" target="_blank" rel="noopener" title="Abre el texto oficial en leychile.cl (BCN)">' + esc(lab) + '</a>';
  }).join('');
}
function lastQ(){ return S.lastQ || ''; }

function askAI(q){
  var c = ctx();
  var controller = window.AbortController ? new AbortController() : null;
  var timer = controller ? setTimeout(function(){ controller.abort(); }, 12000) : null;
  return fetch(AI_URL, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({query: q, context: 'Pantalla: ' + c.label}),
    signal: controller ? controller.signal : undefined
  }).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(data){
      if(!res.ok || !data.answer) return null;
      return '<p>' + lines(String(data.answer).split(/\r?\n+/).filter(Boolean)) + '</p><div class="ia-chg"><b>Respuesta asistida.</b> Verifica siempre la fuente oficial y no uses esta respuesta como sustituto de la normativa vigente.</div>';
    });
  }).catch(function(){ return null; }).then(function(result){
    if(timer) clearTimeout(timer);
    return result;
  });
}

function answerKB(r, q, mode){
  var e = r.e, h = '<h4>' + esc(e.t) + '</h4>' + lines(e.a);
  if(e.n) h += '<div class="ia-chg"><b>Cambio reciente.</b> ' + esc(e.n) + '</div>';
  if(e.s && e.s.length) h += '<div class="ia-src" aria-label="Fuentes">' + srcChips(e.s) + '</div>';
  var acts = '';
  (e.g || []).forEach(function(g, i){ acts += '<a class="ia-b' + (i === 0 ? ' p' : '') + '" href="' + esc(g[1]) + '" data-go="' + esc(g[1]) + '">' + esc(g[0]) + '</a>'; });
  acts += '<button type="button" class="ia-b" data-a="copy">Copiar respuesta</button>';
  return h + '<div class="ia-act">' + acts + '</div>';
}
function dataLinks(q){
  var core = toks(q).filter(function(t){ return !/^(cuant|orden|compra|licitacion|monto|proveedor|vend|vendido|proceso|trato|agil|mes|ano)/.test(t); });
  var txt = (core.length ? core : toks(q)).join(' ').trim(); if(!txt) return '';
  var b = btoa(unescape(encodeURIComponent(JSON.stringify({q: txt})))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '<div class="ia-sub"><h5>Seguir en los datos</h5><div class="ia-act" style="margin-top:0">' +
    '<a class="ia-b" href="#rubro&b=' + b + '" data-go="#rubro&b=' + b + '">Buscar «' + esc(txt) + '» en procesos de compra</a>' +
    '<a class="ia-b" href="#pac26=' + encodeURIComponent(txt) + '" data-go="#pac26=' + encodeURIComponent(txt) + '">Buscar en el PAC 2026</a>' +
    '<a class="ia-b" href="#proveedores=' + encodeURIComponent(txt) + '" data-go="#proveedores=' + encodeURIComponent(txt) + '">Buscar un proveedor</a></div></div>';
}
function leyBlock(items, qt){
  if(!items.length) return '';
  return '<div class="ia-sub"><h5>En el texto de la Ley 19.886</h5>' + items.map(function(it){
    var a = LEY.a[it.i], ex = excerpt(a[1], qt);
    return '<div class="ia-ley" data-i="' + it.i + '"><b>Ley 19.886 art. ' + esc(a[0]) + '</b><span class="ia-ex">' + esc(ex) + '</span> <button type="button" data-a="full" data-i="' + it.i + '">Ver artículo completo</button> <a href="' + URL_L + '" target="_blank" rel="noopener" style="font-size:10.5px">leychile.cl</a></div>';
  }).join('') + '</div>';
}
var DATAWORDS = /cuant[oa]s? (se )?(compr|gast|vend|facturo|transo|oc)|compraron|compro\b|vendio|vendido|ventas de|ranking|principales proveedores|proveedores de |licitaciones de |procesos de |precios? de |ordenes de compra de |gasto de|\bgasto total/;
var SUF = {bis:'bis', ter:'ter', quater:'quáter', quinquies:'quinquies', sexies:'sexies', septies:'septies', octies:'octies', nonies:'nonies', decies:'decies'};
function artLookup(q){
  var nq = norm(q), m = /\bart(?:iculo)?s?\s*(\d{1,3})(?:\s*(bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?\b/.exec(nq);
  if(!m) return null;
  var num = m[1], suf = m[2] ? SUF[m[2]] : '', key = suf ? num + ' ' + suf : num;
  var wantR = /reglament|decreto|661|\bds\b/.test(nq), wantL = /\bley\b|19886/.test(nq);
  if(!wantR && !wantL){ wantR = true; wantL = true; }
  var res = {key: key, ley: null, kb: []};
  if(wantL){ for(var i = 0; i < LEY.a.length; i++) if(LEY.a[i][0] === key){ res.ley = i; break; } }
  if(wantR && !suf){ KB.e.forEach(function(e){ if(e.s.some(function(x){ return x[0] === 'R' && x[1] === num; })) res.kb.push(e); }); }
  return (res.ley !== null || res.kb.length) ? res : null;
}
function ask(q){
  if(S.busy) return; S.busy = true; S.asked = true; S.lastQ = q;
  addU(q);
  ensure().then(function(){
    var pr = ACC && ACC.handle(q);
    if(pr){ return pr.then(function(html){ if(html){ var dd = addA(html); dd.dataset.q = q; } S.busy = false; paintCtx(); }); }
    var al = artLookup(q);
    if(al){
      var hh = '<h4>Artículo ' + esc(al.key) + '</h4>';
      if(al.kb.length) hh += '<div class="ia-sub" style="border:0;margin:0;padding:0"><h5>Reglamento (DS 661/2024): fichas que citan el artículo ' + esc(al.key) + '</h5><div class="ia-rel">' + al.kb.slice(0, 5).map(function(x){ return '<button type="button" data-open="' + esc(x.id) + '">' + esc(x.t) + '</button>'; }).join('') + '</div><p style="margin:6px 0 0;font-size:11px"><a href="' + URL_R + '" target="_blank" rel="noopener">Texto oficial del Reglamento (leychile.cl)</a></p></div>';
      if(al.ley !== null) hh += leyBlock([{i: al.ley}], toks(q));
      addA(hh); S.busy = false; return;
    }
    var r = search(q, {cat: S.cat, hash: location.hash});
    var top = r.kb[0], html = '', isData = DATAWORDS.test(norm(q));
    var good = top && top.s >= 2.2 && top.hit >= Math.min(2, r.qt.length);
    if(isData && !(good && top.e.c === 'panel')){
      html += '<p>Esa consulta es sobre datos de compras, y la respuesta está en los paneles. Te dejo accesos directos con tus palabras:</p>' + dataLinks(q);
      if(good && top.s >= 40) html += '<div class="ia-sub"><h5>Sobre la parte normativa</h5><div class="ia-rel"><button type="button" data-open="' + esc(top.e.id) + '">' + esc(top.e.t) + '</button></div></div>';
    } else if(good){
      html += answerKB(top, q);
      var rel = r.kb.slice(1, 4).filter(function(x){ return x.s >= top.s * .3 && x.hit >= 1; });
      var leyIt = r.ley.filter(function(x){ return x.s >= 2.5; }).slice(0, 2);
      if(leyIt.length) html += leyBlock(leyIt, r.qt);
      if(rel.length) html += '<div class="ia-sub"><h5>También te puede servir</h5><div class="ia-rel">' + rel.map(function(x){ return '<button type="button" data-open="' + esc(x.e.id) + '">' + esc(x.e.t) + '</button>'; }).join('') + '</div></div>';
      if(isData) html += dataLinks(q);
    } else if(r.ley.length && r.ley[0].s >= 3 && !isData){
      html += '<p>No encontré una ficha específica, pero estos artículos de la ley mencionan lo que preguntas:</p>' + leyBlock(r.ley.slice(0, 3), r.qt);
      if(r.kb.length) html += '<div class="ia-sub"><h5>Fichas relacionadas</h5><div class="ia-rel">' + r.kb.slice(0, 3).map(function(x){ return '<button type="button" data-open="' + esc(x.e.id) + '">' + esc(x.e.t) + '</button>'; }).join('') + '</div></div>';
    } else if(isData){
      html += '<p>Esa consulta es sobre datos de compras, y la respuesta está en los paneles. Te dejo accesos directos con tus palabras:</p>' + dataLinks(q);
    } else {
      return askAI(q).then(function(aiHtml){
        if(aiHtml) html += aiHtml;
        else html += '<p>No encontré una respuesta clara a eso en la normativa ni en la guía de los paneles que tengo cargadas. Prueba con otras palabras (por ejemplo, el nombre del procedimiento o el artículo) o elige un tema arriba.</p>' +
          '<p>Para temas operativos de Mercado Público puedes revisar el <a href="' + AYUDA + '" target="_blank" rel="noopener">centro de ayuda</a>. No quiero inventar una respuesta que no está en el texto.</p>';
        if(r.kb.length) html += '<div class="ia-sub"><h5>Lo más cercano</h5><div class="ia-rel">' + r.kb.slice(0, 3).map(function(x){ return '<button type="button" data-open="' + esc(x.e.id) + '">' + esc(x.e.t) + '</button>'; }).join('') + '</div></div>';
        var d2 = addA(html); d2.dataset.q = q;
        S.busy = false;
      });
    }
    var d = addA(html); d.dataset.q = q;
    S.busy = false;
  }).catch(function(){ addA('<p>No pude cargar los textos del asistente. Intenta de nuevo en un momento.</p>'); S.busy = false; });
}
function openEntry(id){
  var e = KB.e.filter(function(x){ return x.id === id; })[0]; if(!e) return;
  addU(e.t); S.asked = true;
  var d = addA(answerKB({e: e}, e.t)); d.dataset.q = e.t;
}
function plain(node){
  var c = node.cloneNode(true); c.querySelectorAll('.ia-act,.ia-sub').forEach(function(n){ n.remove(); });
  var out = [];
  c.querySelectorAll('h4,p,li,.ia-chg').forEach(function(n){ out.push((n.tagName === 'LI' ? '- ' : '') + n.textContent.trim()); });
  var src = Array.prototype.map.call(node.querySelectorAll('.ia-src a'), function(a){ return a.textContent; });
  if(src.length) out.push('Fuente: ' + src.join('; ') + '. Textos de la BCN (leychile.cl).');
  return out.join('\n');
}
function onClick(ev){
  var t = ev.target;
  var b = t.closest('button,a'); if(!b) return;
  var act = b.dataset.a;
  if(act === 'close'){ openP(false); el.tab.focus(); return; }
  if(act === 'clear'){ el.m.innerHTML = ''; S.welcomed = false; S.asked = false; S.cat = 'todo'; Array.prototype.forEach.call(el.cats.children, function(c){ c.setAttribute('aria-pressed', String(c.dataset.cat === 'todo')); }); paintCtx(); if(KB) welcome(); return; }
  if(b.dataset.cat){ S.cat = b.dataset.cat; Array.prototype.forEach.call(el.cats.children, function(c){ c.setAttribute('aria-pressed', String(c === b)); }); return; }
  if(b.dataset.acc && ACC){ ACC.click(b, function(h){ addA(h); }); return; }
  if(b.dataset.q){ ask(b.dataset.q); return; }
  if(b.dataset.open){ openEntry(b.dataset.open); return; }
  if(act === 'full'){
    var a = LEY.a[+b.dataset.i], box = b.closest('.ia-ley'), ex = box.querySelector('.ia-ex');
    if(b.dataset.open2){ ex.textContent = excerpt(a[1], toks(S.lastQ)); ex.classList.remove('open'); b.textContent = 'Ver artículo completo'; b.dataset.open2 = ''; }
    else { ex.textContent = a[1]; ex.classList.add('open'); b.textContent = 'Ver menos'; b.dataset.open2 = '1'; }
    return;
  }
  if(act === 'copy'){
    var card = b.closest('.ia-a'), txt = plain(card);
    try{ navigator.clipboard.writeText(txt).then(function(){ b.textContent = 'Copiado'; setTimeout(function(){ b.textContent = 'Copiar respuesta'; }, 1800); }); }catch(e){ b.textContent = 'No se pudo copiar'; }
    return;
  }
  if(b.dataset.go){
    var h = b.dataset.go;
    if(h === '#'){ ev.preventDefault(); if(window.goHome) window.goHome(ev); else location.hash = ''; }
    else { ev.preventDefault(); if(location.hash === h){ try{ window.dispatchEvent(new HashChangeEvent('hashchange')); }catch(e){} } else location.hash = h; }
    if(window.innerWidth <= 980) openP(false);
  }
}

window.ASISTENTE = {open: function(){ openP(true); }, close: function(){ openP(false); }, _search: function(q, o){ return ensure().then(function(){ return search(q, o); }); }, _kb: function(){ return KB; }};
function boot(){ mount(); restoreLink(); }
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
