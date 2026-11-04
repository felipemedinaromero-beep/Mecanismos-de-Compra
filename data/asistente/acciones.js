/* Asistente IA · acciones sobre el detalle de convenio marco (fase 2, sin IA generativa).
   Reconoce instrucciones en lenguaje natural con reglas y las ejecuta sobre el estado que ya usa la página (CMOC):
   filtrar, ordenar, limitar, cambiar de pestaña, abrir un convenio, rankings y resúmenes calculados con los datos cargados.
   No modifica index.html: envuelve funciones existentes (cmocFiltrar, cmocProdFiltrar, cmocRender, cmocOpen, cmocClose). */
(function(){
'use strict';
if(window.ASISTENTE_ACC) return;

function norm(s){ return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function fmt(n){ return Math.round(n).toLocaleString('es-CL'); }
function money(v){ return v >= 1e9 ? '$' + (v / 1e9).toLocaleString('es-CL', {maximumFractionDigits: 1}) + ' mil M' : '$' + fmt(v / 1e6) + ' M'; }
function pct(a, b){ return b > 0 ? (100 * a / b).toLocaleString('es-CL', {maximumFractionDigits: 1}) + '%' : '—'; }

var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var NUM = {un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,quince:15,veinte:20,treinta:30,cuarenta:40,cincuenta:50,cien:100};

/* ---------- estado propio de la vista (orden / límite / filtro de maestra) ---------- */
var V = {sort: null, top: null, maestra: null};
var HIST = {}, hid = 0;
var hooks = {change: function(){}};
var orig = {};

function pageOk(){ return typeof CMOC !== 'undefined' && typeof window.cmocRender === 'function' && typeof window.cmocFiltrar === 'function'; }
function cm(){ if(!pageOk() || !CMOC.sel || !window.CM_OC || !CM_OC[CMOC.sel]) return null; return {code: CMOC.sel, d: CM_OC[CMOC.sel]}; }
function nombreConv(code){ try{ return cmocNombre(code); }catch(e){ return code; } }

var SORTKEY = {
  prod: {monto: function(p){ return p[2]; }, noc: function(p){ return p[1]; }, nombre: function(p){ return p[0]; }},
  oc: {monto: function(o){ return o[4]; }, fecha: function(o){ return o[1]; }, items: function(o){ return o[6]; }}
};
function post(arr, tab){
  var r = arr;
  if(tab === 'prod' && V.maestra === 'si') r = r.filter(function(p){ return p[3] === 1; });
  if(V.sort && V.sort.tab === tab && SORTKEY[tab][V.sort.key]){
    var f = SORTKEY[tab][V.sort.key], dir = V.sort.dir === 'asc' ? 1 : -1;
    r = r.slice().sort(function(a, b){ var x = f(a), y = f(b); return x < y ? -dir : x > y ? dir : 0; });
  }
  if(V.top && V.top.tab === tab) r = r.slice(0, V.top.n);
  return r;
}
function viewActive(tab){ tab = tab || CMOC.tab; return !!((V.sort && V.sort.tab === tab) || (V.top && V.top.tab === tab) || (V.maestra && tab === 'prod')); }
function viewText(){
  var t = [], tab = CMOC.tab;
  if(V.maestra === 'si' && tab === 'prod') t.push('solo productos que sí están en la maestra');
  if(V.sort && V.sort.tab === tab){ var nm = {monto: 'monto', noc: 'N° de OC', nombre: 'nombre', fecha: 'fecha', items: 'ítems'}[V.sort.key]; t.push('ordenado por ' + nm + (V.sort.key === 'nombre' ? (V.sort.dir === 'asc' ? ' (A a Z)' : ' (Z a A)') : (V.sort.dir === 'asc' ? ' (menor a mayor)' : ' (mayor a menor)'))); }
  if(V.top && V.top.tab === tab) t.push('primeros ' + V.top.n);
  return t.join(' · ');
}
function paintBar(){
  var sec = document.getElementById('cmocSec'); if(!sec) return;
  var old = sec.querySelector('.ia-viewbar'); if(old) old.remove();
  if(!viewActive()) return;
  var host = sec.querySelector('.cmoc-tools') || sec.querySelector('.cmoc-tabs'); if(!host) return;
  var b = document.createElement('div'); b.className = 'ia-viewbar';
  b.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#F3F7FF;border:1px solid #BBD0F5;border-radius:10px;padding:6px 10px;margin:6px 0;font-size:12px;color:#0032A2';
  b.innerHTML = '<span><b>Vista del asistente:</b> ' + esc(viewText()) + '</span><button type="button" class="dl-btn" onclick="ASISTENTE_ACC.clearView()">Quitar orden y límite</button>';
  host.parentNode.insertBefore(b, host);
}
function patch(){
  if(window.__ACC_PATCHED || !pageOk() || typeof window.cmocProdFiltrar !== 'function') return !!window.__ACC_PATCHED;
  orig.F = window.cmocFiltrar; orig.P = window.cmocProdFiltrar; orig.R = window.cmocRender; orig.O = window.cmocOpen; orig.C = window.cmocClose;
  window.cmocFiltrar = function(d){ return post(orig.F(d), 'oc'); };
  window.cmocProdFiltrar = function(d){ return post(orig.P(d), 'prod'); };
  window.cmocRender = function(soft){ var r = orig.R(soft); try{ paintBar(); }catch(e){} return r; };
  window.cmocOpen = function(code){ V = {sort: null, top: null, maestra: null}; var r = orig.O(code); hooks.change(); return r; };
  window.cmocClose = function(){ V = {sort: null, top: null, maestra: null}; var r = orig.C(); hooks.change(); return r; };
  window.__ACC_PATCHED = true; return true;
}
function setView(v){ V = v; }
function rerender(){ window.cmocRender(); try{ var h = document.getElementById('cmocHost'); if(h && h.scrollIntoView) h.scrollIntoView({behavior: 'smooth', block: 'start'}); }catch(e){} hooks.change(); }

/* ---------- instantáneas para «Deshacer» ---------- */
function snap(){
  return JSON.stringify({c: {tab: CMOC.tab, q: CMOC.q, pq: CMOC.pq, mes: CMOC.mes, est: CMOC.est, soloFalta: CMOC.soloFalta, page: CMOC.page}, v: V});
}
function restore(s){ var o = JSON.parse(s); Object.keys(o.c).forEach(function(k){ CMOC[k] = o.c[k]; }); V = o.v; rerender(); }

/* ---------- interpretación ---------- */
function numWord(t){ if(t == null) return null; if(/^\d+$/.test(t)) return +t; return NUM[t] || null; }
function topN(n){
  var m, re1 = /\b(?:top|los|las|primeros|primeras|mejores|principales)\s+(\d+|[a-z]+)\b/g;
  while((m = re1.exec(n))){ var v = numWord(m[1]); if(v) return v; }
  m = n.match(/\b(\d+|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte|treinta|cuarenta|cincuenta|cien)\s+(?:primer\w+|proveedores|organismos|productos|oc|ordenes|compradores|clientes|mayores)\b/);
  if(m){ var w = numWord(m[1]); if(w) return w; }
  return null;
}
function parseMes(n, meses){
  var m = n.match(/\b(20\d\d)\s+(0?[1-9]|1[0-2])\b/);
  if(m){ var k = m[1] + '-' + ('0' + m[2]).slice(-2); return {key: k}; }
  m = n.match(/\b(0?[1-9]|1[0-2])\s+(20\d\d)\b/);
  if(m){ return {key: m[2] + '-' + ('0' + m[1]).slice(-2)}; }
  for(var i = 0; i < 12; i++){
    var re = new RegExp('\\b' + MESES[i] + '(?:\\s+(?:de|del))?(?:\\s+(20\\d\\d))?\\b');
    var mm = n.match(re); if(mm || (i === 8 && /\bsept\b/.test(n))){
      var mn = ('0' + (i + 1)).slice(-2);
      if(mm && mm[1]) return {key: mm[1] + '-' + mn};
      var cand = meses.filter(function(x){ return x.slice(5) === mn; });
      if(cand.length === 1) return {key: cand[0]};
      return {ambiguous: cand, mes: MESES[i], none: !cand.length};
    }
  }
  return null;
}
function mesLabel(k){ return MESES[+k.slice(5) - 1] + ' ' + k.slice(0, 4); }

function matchEstado(n, d){
  var res = [];
  (d.est || []).forEach(function(e, i){
    var ts = norm(e).split(' ').filter(function(t){ return t.length > 3; });
    if(ts.length && ts.every(function(t){ return n.indexOf(t.slice(0, 5)) >= 0; })) res.push(i);
  });
  return res;
}

/* Devuelve null si la frase no es una acción; si lo es, una promesa con el HTML de la respuesta. */
function handle(q){
  patch();
  var n = norm(q);
  if(!n) return null;
  var ctx = cm();
  var normaLike = /\b(ley|reglamento|articulo|art|norma|normativa|decreto|plazo|plazos|garantia|garantias|bases|licitacion|licitaciones|trato directo|causal|causales|sancion|sanciones|multa|multas|ds 661|21634|19886)\b/.test(n) && !/(maestra|filtro|filtros|ordena|\btop\b|descarga|excel|proveedores|organismos|monto|productos|\boc\b|ordenes)/.test(n);

  // 1) abrir un convenio por nombre o código
  var codeM = n.match(/\b2239\s*(\d+)\s*lr\s*(\d+)\b/);
  var openV = ctx ? /\b(abre|abrir|abreme|llevame|lleva|vamos a|ve a|ir a|cambia a|cambiar a|entra a|entrar a|quiero revisar|revisa)\b/.test(n) : /\b(abre|abrir|abreme|llevame|lleva|vamos a|ve a|ir a|cambia a|cambiar a|entra a|entrar a|quiero revisar|quiero ver|revisar|revisa|muestrame|mostrar|ver)\b/.test(n);
  var mentionsConv = /\b(convenio|convenios|cm)\b/.test(n);
  if(codeM || (openV && mentionsConv && !/\b(normativa|ley|reglamento|articulo)\b/.test(n))){
    if(!(ctx && /\b(este|esta|actual)\b/.test(n))) return openConvenio(n, codeM);
  }

  // 2) acciones sobre el convenio abierto
  var verbAct = /\b(filtra|filtrar|filtrame|ordena|ordenar|ordename|limpia|limpiar|quita|quitar|borra|borrar|elimina|reinicia|resetea|descarga|descargar|baja|bajar|exporta|exportar|excel|xlsx|csv|top|primeros|primeras|busca|buscar|solo|solamente|deja|dejame|muestrame|muestra|mostrar|dime|identifica|cuantos|cuantas|cuanto|resumen|resumeme|total|que proveedores|que organismos|ranking)\b/.test(n);
  var strong = /(maestra|sin coincidencia|filtros|ordena\w* por|\btop \d+|(la|esta) tabla|excel|descarga|proveedores que concentran|mayor monto)/.test(n);
  if(normaLike) return null;
  if(!ctx){
    if(strong && verbAct && pageOk() && /\b(filtra|ordena|limpia|descarga|top|maestra|sin coincidencia|proveedores que|mayor monto)/.test(n)){
      return Promise.resolve(needConvenio());
    }
    return null;
  }

  // 2.0) copiar enlace de la vista
  if(ctx && /\b(copia|copiar|dame|genera|generar|comparte|compartir|pasame|obtener|quiero)\b.{0,25}\b(enlace|link|url|vinculo)\b|\b(enlace|link|url)\b.{0,20}\b(vista|tabla|convenio|filtros?)\b/.test(n)){
    return Promise.resolve('<p>Este enlace abre el convenio con los filtros, el orden y la pestaña que ves ahora. Quien lo reciba verá la misma vista.</p><div class="ia-act"><button type="button" class="ia-b" data-acc="link">Copiar enlace</button></div>');
  }

  // 2a) interpretación: requiere IA
  if(/(esta concentracion|estos resultados|estos datos|esta tabla|este convenio).*(riesgo|conclusion|interpret|recomend|tendencia)|(riesgo|conclusion|recomend|interpret|tendencia).*(esta concentracion|estos resultados|estos datos|esta tabla)/.test(n)){
    return Promise.resolve('<p>Interpretar riesgos o sacar conclusiones requiere un modelo de IA, que esta versión todavía no incluye. Lo que sí puedo hacer es entregarte las cifras exactas para que las analices: pídeme «resumen», «los 5 proveedores con más monto» o «los 5 organismos con más OC».</p>');
  }

  var d = ctx.d, snapshot = snap(), done = [], notes = [], tabWanted = null, did = false;
  var meses = Array.from(new Set(d.oc.map(function(o){ return o[1].slice(0, 7); }))).sort();
  var nProd = (d.prod || []).length, conMae = (d.prod || []).some(function(p){ return p[3] !== -1; });
  var wantDl = /\b(descarga|descargar|baja|bajar|exporta|exportar|excel|xlsx|csv)\b/.test(n);

  // 2b) limpiar
  if(/\b(limpia|limpiar|quita|quitar|borra|borrar|elimina|eliminar|reinicia|resetea|restablece|resetear)\w*\s+(todos\s+)?(los\s+)?(filtros?|busquedas?|orden)/.test(n) || /\bsin filtros\b/.test(n) || /\bempezar de nuevo\b/.test(n)){
    CMOC.q = ''; CMOC.pq = ''; CMOC.mes = ''; CMOC.est = ''; CMOC.soloFalta = false; CMOC.page = 0; V = {sort: null, top: null, maestra: null};
    rerender(); did = true; done.push('Quité todos los filtros, el orden y el límite.');
    return Promise.resolve(card(snapshot, done, summaryLine(ctx), false));
  }

  // 2c) rankings y resúmenes (se calculan, no cambian la tabla)
  var ent = /\b(proveedores|vendedores)\b/.test(n) ? 'prov' : /\b(organismos|compradores|clientes|instituciones|municipalidades)\b/.test(n) ? 'org' : null;
  var rank = ent && (/\b(mayor|mayores|top|principal|principales|concentr\w*|ranking|mas|primeros|cinco|diez|\d+)\b/.test(n)) && !/\b(filtra|busca|buscar)\b/.test(n);
  if(rank) return Promise.resolve(rankCard(ctx, ent, n));
  if(/\b(cuantos|cuantas|cuanto|resumen|resumeme|total|cifras)\b/.test(n) && /\b(oc|ordenes|productos|proveedores|organismos|monto|convenio|tabla|vista|resumen|cifras)\b/.test(n)){
    return Promise.resolve('<p>' + esc('Esto es lo que muestra la vista actual de ' + nombreConv(ctx.code) + ':') + '</p>' + kpiList(ctx));
  }

  // 2d) acciones que cambian la vista
  var mFalta = /\bno\s+(esta|estan|figura|figuran|aparece|aparecen|existe|existen|hay|coincide|coinciden|tienen|tiene|estan presentes)\b.{0,30}\bmaestra/.test(n) || /\bsin coincidencia\b/.test(n) || /\bfuera de (la )?maestra\b/.test(n) || /\b(faltan|falta|faltantes)\b.{0,12}\bmaestra/.test(n) || /\bmaestra\b.{0,25}\bno\s+(esta|estan|figura|figuran|coincide)/.test(n) || /\bno\s+(estan\s+)?(incluidos?|cargados?)\b.{0,20}\bmaestra/.test(n);
  var mSi = !mFalta && (/\b(si|que si)\s+(esta|estan|figuran?|aparecen?)\b.{0,25}\bmaestra/.test(n) || /\ben la maestra( vigente)?\b/.test(n) && /\b(solo|solamente|que)\b/.test(n));
  if(mFalta){
    if(!conMae){ return Promise.resolve('<p>Este convenio no tiene datos de la maestra cargados, así que no puedo saber qué productos faltan. Los demás filtros sí funcionan.</p>'); }
    CMOC.tab = 'prod'; CMOC.soloFalta = true; V.maestra = null; CMOC.page = 0; did = true;
    done.push('Activé «Solo los que no están en la maestra».');
  } else if(mSi){
    if(!conMae){ return Promise.resolve('<p>Este convenio no tiene datos de la maestra cargados.</p>'); }
    CMOC.tab = 'prod'; CMOC.soloFalta = false; V.maestra = 'si'; CMOC.page = 0; did = true;
    done.push('Dejé solo los productos que sí están en la maestra.');
  }
  if(/\b(todos los meses|cualquier mes|sin mes)\b/.test(n)){ CMOC.mes = ''; CMOC.tab = 'oc'; did = true; done.push('Mostré todos los meses.'); }
  else {
    var pm = /\b(mes|en|durante|del mes|de)\b/.test(n) || MESES.some(function(m){ return n.indexOf(m) >= 0; }) || /\b20\d\d\b/.test(n) ? parseMes(n, meses) : null;
    if(pm && !mFalta){
      if(pm.ambiguous && !pm.none){
        return Promise.resolve('<p>' + esc(pm.mes.charAt(0).toUpperCase() + pm.mes.slice(1) + ' aparece en más de un año en este convenio. ¿Cuál quieres?') + '</p><div class="ia-rel">' + pm.ambiguous.map(function(k){ return '<button type="button" data-q="' + esc('solo ' + mesLabel(k)) + '">' + esc(mesLabel(k)) + '</button>'; }).join('') + '</div>');
      }
      if(pm.none){ return Promise.resolve('<p>' + esc('No hay OC en ' + pm.mes + ' en este convenio. Meses disponibles: ' + meses.map(mesLabel).join(', ') + '.') + '</p>'); }
      if(meses.indexOf(pm.key) < 0){ return Promise.resolve('<p>' + esc('No hay OC en ' + mesLabel(pm.key) + ' en este convenio. Meses disponibles: ' + meses.map(mesLabel).join(', ') + '.') + '</p>'); }
      CMOC.mes = pm.key; CMOC.tab = 'oc'; CMOC.page = 0; did = true; done.push('Filtré por ' + mesLabel(pm.key) + ' en las órdenes de compra.');
    }
  }
  var es = /\b(estado|estados|aceptadas?|recepcion conforme|cobrad\w+|cancelad\w+|enviad\w+|recibid\w+)\b/.test(n) ? matchEstado(n, d) : [];
  if(es.length === 1){ CMOC.est = String(es[0]); CMOC.tab = 'oc'; CMOC.page = 0; did = true; done.push('Filtré por estado «' + d.est[es[0]] + '».'); }
  else if(/\b(todos los estados)\b/.test(n)){ CMOC.est = ''; did = true; done.push('Mostré todos los estados.'); }

  // pestaña
  if(!mFalta && !mSi && !done.length){
    if(/\bproductos?\b/.test(n) && !/\b(oc|ordenes)\b/.test(n)) tabWanted = 'prod';
    else if(/\b(ordenes de compra|ordenes|oc)\b/.test(n) && !/\bproductos?\b/.test(n)) tabWanted = 'oc';
  }
  var tabNow = tabWanted || CMOC.tab;

  // texto libre
  var tm = null;
  var raw = String(q).replace(/[«»"“”]/g, '').trim();
  var m1 = raw.match(/(?:busca(?:r)?(?:me)?|filtra(?:r)?(?:me)?\s+por|que\s+(?:contengan?|incluyan?|digan?|tengan?))\s+(.+)$/i);
  var m3 = raw.match(/\bdel\s+(proveedor|organismo)\s+(.+)$/i);
  if(m3){ tm = m3[2]; tabWanted = 'oc'; tabNow = 'oc'; }
  else if(m1 && !done.length && !mFalta && !mSi){ tm = m1[1]; }
  if(tm){
    tm = tm.replace(/\s+(y|e)\s+(descarga|ordena|dejame|deja|muestra).*$/i, '').replace(/[.?!]+$/, '').trim();
    if(tm && !/^(los|las|el|la|esto|eso)$/i.test(tm)){
      if(tabNow === 'prod'){ CMOC.pq = tm; done.push('Busqué «' + tm + '» entre los productos.'); }
      else { CMOC.q = tm; done.push('Busqué «' + tm + '» en las órdenes de compra.'); }
      CMOC.page = 0; did = true;
    }
  }

  // orden y límite
  var sortKey = null, dir = 'desc';
  if(/\b(ordena\w*|ordenad\w*|clasifica\w*)\b.*\b(monto|importe|valor|gasto|plata|dinero)\b|\b(mayor|mayores|menor|menores|mas alto|mas bajo)\w*\s+(monto|importe|gasto)\b|\bmonto\b.*\b(mayor|menor)\b|\b(mas caros?|mas costosos?|mas barat\w+)\b/.test(n)) sortKey = 'monto';
  else if(/\b(mas comprados?|mas vendidos?|mas oc|mas ordenes|mayor (numero|cantidad) de (oc|ordenes)|por (numero|cantidad) de (oc|ordenes)|por n oc|por oc)\b/.test(n)) sortKey = tabNow === 'prod' ? 'noc' : 'items';
  else if(/\b(por fecha|mas recientes?|mas antiguas?|mas antiguos?|cronologic\w*)\b/.test(n)) sortKey = 'fecha';
  else if(/\b(por nombre|alfabet\w*|de la a a la z)\b/.test(n)) sortKey = 'nombre';
  if(/\b(menor|menores|ascendente|mas bajo|mas barat\w+|mas antiguas?|mas antiguos?|de la a a la z|a z|menos)\b/.test(n)) dir = 'asc';
  if(sortKey === 'nombre') dir = /\b(z a|descendente|inversa)\b/.test(n) ? 'desc' : 'asc';
  if(sortKey === 'fecha' && /\bmas recientes?\b/.test(n)) dir = 'desc';
  var tn = topN(n);
  if(/\bmas (alto|baja|bajos|altos)\b/.test(n)) tn = tn;
  if(tn && !sortKey && !V.sort) sortKey = tabNow === 'prod' ? 'monto' : 'monto';
  if(sortKey && !SORTKEY[tabNow][sortKey]){
    notes.push('En la pestaña de ' + (tabNow === 'prod' ? 'productos' : 'órdenes de compra') + ' no se puede ordenar por eso.');
    sortKey = null; tn = tn;
  }
  if(sortKey){ V.sort = {key: sortKey, dir: dir, tab: tabNow}; done.push('Ordené ' + (tabNow === 'prod' ? 'los productos' : 'las órdenes') + ' por ' + ({monto: 'monto', noc: 'N° de OC', nombre: 'nombre', fecha: 'fecha', items: 'ítems'}[sortKey]) + ' (' + (sortKey === 'nombre' ? (dir === 'asc' ? 'A a Z' : 'Z a A') : dir === 'asc' ? 'menor a mayor' : 'mayor a menor') + ').'); did = true; CMOC.page = 0; }
  if(tn){ V.top = {n: tn, tab: tabNow}; done.push('Dejé solo los ' + tn + ' primeros.'); did = true; CMOC.page = 0; }

  if(tabWanted && CMOC.tab !== tabWanted){ CMOC.tab = tabWanted; CMOC.page = 0; did = true; done.push('Cambié a la pestaña «' + (tabWanted === 'prod' ? 'Productos comprados' : 'Órdenes de compra') + '».'); }
  else if(!tabWanted && did && (mFalta || mSi)){ /* ya cambió a productos */ }

  if(!did && !wantDl){ return null; }
  if(did) rerender();
  return Promise.resolve(card(snapshot, done, did ? summaryLine(ctx) : '', wantDl, notes));
}

/* ---------- respuestas ---------- */
function viewCount(ctx){
  var d = ctx.d;
  if(CMOC.tab === 'prod'){ var p = window.cmocProdFiltrar(d); return {n: p.length, unit: 'producto(s)', total: (d.prod || []).length, key: 'cmocProd', file: 'productos_' + ctx.code.toLowerCase() + '.xlsx'}; }
  var o = window.cmocFiltrar(d); return {n: o.length, unit: 'OC', total: d.oc.length, key: 'cmocOc', file: 'oc_' + ctx.code.toLowerCase() + '.xlsx'};
}
function summaryLine(ctx){
  var v = viewCount(ctx);
  var extra = (CMOC.tab === 'prod' && (ctx.d.prod || []).length >= 4000) ? ' (el listado incluye los 4.000 productos con más OC)' : '';
  return '<p><b>' + fmt(v.n) + '</b> ' + v.unit + (v.n !== v.total ? ' de ' + fmt(v.total) : '') + ' en la vista actual' + extra + '.</p>';
}
function kpiList(ctx){
  var d = ctx.d, o = orig.F ? orig.F(d) : window.cmocFiltrar(d);
  var monto = o.reduce(function(s, x){ return s + (x[4] || 0); }, 0);
  var orgs = new Set(o.map(function(x){ return x[2]; })).size, provs = new Set(o.map(function(x){ return x[3]; })).size;
  var faltan = (d.prod || []).filter(function(p){ return p[3] === 0; }).length;
  var li = ['<li><b>' + fmt(o.length) + '</b> OC' + (o.length !== d.oc.length ? ' (de ' + fmt(d.oc.length) + ' del convenio)' : '') + ' · ' + esc(d.periodo || '') + '</li>',
    '<li>Monto: <b>' + money(monto) + '</b></li>',
    '<li><b>' + fmt(orgs) + '</b> organismos y <b>' + fmt(provs) + '</b> proveedores</li>',
    '<li><b>' + fmt((d.prod || []).length) + '</b> productos distintos' + ((d.prod || []).some(function(p){ return p[3] !== -1; }) ? ', de los cuales <b>' + fmt(faltan) + '</b> no tienen coincidencia en la maestra' : '') + '</li>'];
  return '<ul>' + li.join('') + '</ul><p style="margin:0;font-size:11px;color:var(--text-secondary,#3D5466)">Calculado con los datos cargados al ' + esc(d.gen || '') + '.</p>';
}
function dlButton(key, file, n){
  return '<button type="button" class="ia-b" data-acc="dl" data-key="' + esc(key) + '" data-file="' + esc(file) + '">Descargar Excel (' + fmt(n) + ' filas)</button>';
}
function card(snapshot, done, tail, wantDl, notes){
  var id = ++hid; HIST[id] = snapshot;
  var h = '';
  if(done.length) h += '<p style="margin:0 0 4px"><b>Listo. Esto hice en la página:</b></p><ul class="ia-chg" style="list-style:none">' + done.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  if(notes && notes.length) h += '<p>' + notes.map(esc).join(' ') + '</p>';
  if(tail) h += tail;
  var ctx = cm(), acts = [];
  if(wantDl && ctx){ var v = viewCount(ctx); h += '<p>' + (v.n ? 'Tengo lista la tabla que ves con ' + fmt(v.n) + ' filas. ¿La descargo?' : 'La tabla no tiene filas con estos filtros, no hay nada que descargar.') + '</p>'; if(v.n) acts.push(dlButton(v.key, v.file, v.n)); }
  if(done.length) acts.push('<button type="button" class="ia-b" data-acc="undo" data-id="' + id + '">Deshacer</button>');
  if(done.length && ctx) acts.push('<button type="button" class="ia-b" data-acc="link">Copiar enlace</button>');
  if(acts.length) h += '<div class="ia-act">' + acts.join('') + '</div>';
  return h;
}
function needConvenio(){
  return '<p>Eso lo hago sobre un convenio marco. Dime cuál («abre el convenio de ferretería») o elígelo en la tabla «Gasto por convenio marco» del panel de Convenio Marco, y luego repito la instrucción.</p>' +
    '<div class="ia-rel"><button type="button" data-q="abre el convenio de ferretería">Abrir el convenio de Ferretería</button><button type="button" data-q="abre el convenio de aseo e higiene">Abrir Aseo e Higiene</button></div>';
}

/* ---------- ranking de proveedores u organismos ---------- */
function rankCard(ctx, ent, n){
  var d = ctx.d, o = orig.F ? orig.F(d) : window.cmocFiltrar(d), N = topN(n) || 5;
  var byCount = /\b(mas (oc|ordenes)|mayor (numero|cantidad) de|mas compras|mas frecuentes|por oc)\b/.test(n) && !/\bmonto\b/.test(n);
  var idx = ent === 'prov' ? 3 : 2, names = ent === 'prov' ? d.prov : d.org;
  var agg = {}, total = 0, totalN = 0;
  o.forEach(function(x){ var k = x[idx]; var a = agg[k] || (agg[k] = {k: k, m: 0, n: 0}); a.m += x[4] || 0; a.n++; total += x[4] || 0; totalN++; });
  var arr = Object.keys(agg).map(function(k){ return agg[k]; }).sort(function(a, b){ return byCount ? (b.n - a.n || b.m - a.m) : (b.m - a.m || b.n - a.n); });
  if(!arr.length) return '<p>No hay OC con los filtros actuales, así que no hay ranking que calcular.</p>';
  var top = arr.slice(0, N), sumM = top.reduce(function(s, a){ return s + a.m; }, 0), sumN = top.reduce(function(s, a){ return s + a.n; }, 0);
  var label = ent === 'prov' ? 'proveedores' : 'organismos';
  var rows = top.map(function(a, i){
    var nm = names[a.k][1];
    return '<tr><td>' + (i + 1) + '</td><td>' + esc(nm) + '</td><td class="r">' + money(a.m) + '</td><td class="r">' + pct(a.m, total) + '</td><td class="r">' + fmt(a.n) + '</td><td><button type="button" class="ia-mini" data-acc="ver" data-name="' + esc(nm) + '" title="Filtrar la tabla por este ' + (ent === 'prov' ? 'proveedor' : 'organismo') + '">Ver OC</button></td></tr>';
  }).join('');
  var rk = top.map(function(a, i){ return [i + 1, names[a.k][0], names[a.k][1], a.m, a.m / total, a.n]; });
  try{ setDl('asRank', ['Posición', ent === 'prov' ? 'RUT proveedor' : 'Código organismo', ent === 'prov' ? 'Proveedor' : 'Organismo', 'Monto CLP', 'Participación en el monto', 'N° OC'], rk); }catch(e){}
  var filtros = (o.length !== d.oc.length) ? ' Considera solo las ' + fmt(o.length) + ' OC que hoy deja pasar el filtro de la tabla.' : '';
  return '<p>' + esc('Los ' + top.length + ' ' + label + ' con ' + (byCount ? 'más OC' : 'mayor monto') + ' en ' + nombreConv(ctx.code) + ':') + '</p>' +
    '<table class="ia-tbl"><thead><tr><th>#</th><th>' + (ent === 'prov' ? 'Proveedor' : 'Organismo') + '</th><th class="r">Monto</th><th class="r">% monto</th><th class="r">OC</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p>Entre los ' + top.length + ' suman <b>' + money(sumM) + '</b>, el <b>' + pct(sumM, total) + '</b> del monto filtrado (' + money(total) + ') y el ' + pct(sumN, totalN) + ' de las OC. En total hay ' + fmt(arr.length) + ' ' + label + '.' + esc(filtros) + '</p>' +
    '<p style="margin:0;font-size:11px;color:var(--text-secondary,#3D5466)">Cálculo con las OC del archivo de datos abiertos (al ' + esc(d.gen || '') + '), sin IA. Los montos de convenios en dólares o UF están convertidos a pesos.</p>' +
    '<div class="ia-act"><button type="button" class="ia-b" data-acc="dl" data-key="asRank" data-file="ranking_' + (ent === 'prov' ? 'proveedores' : 'organismos') + '_' + esc(ctx.code.toLowerCase()) + '.xlsx">Descargar este ranking (Excel)</button></div>';
}

/* ---------- abrir un convenio ---------- */
var STOPC = {}; 'de del la el los las en y a un una por para con convenio convenios marco cm abre abrir abreme ve ir vamos llevame lleva muestrame mostrar quiero ver revisar revisa cambia cambiar entra entrar que quiero necesito al'.split(' ').forEach(function(w){ STOPC[w] = 1; });
function openConvenio(n, codeM){
  var onPage = /detalle=Convenio/i.test(decodeURIComponent(location.hash || ''));
  var wait = function(test, ms){ return new Promise(function(res){ var t0 = Date.now(); (function p(){ var v = test(); if(v) return res(v); if(Date.now() - t0 > ms) return res(null); setTimeout(p, 120); })(); }); };
  var snapshot = cm() ? snap() : null;
  return (onPage ? Promise.resolve() : (function(){ location.hash = '#detalle=Convenio%20Marco'; return Promise.resolve(); })())
    .then(function(){ return wait(function(){ return window.MEC_EXTRA && MEC_EXTRA.cm && document.getElementById('cmocHost') && typeof window.cmocOpen === 'function'; }, 9000); })
    .then(function(ok){
      if(!ok) return '<p>No pude abrir el panel de Convenio Marco. Entra desde la portada, en «Convenio Marco», y vuelve a pedírmelo.</p>';
      patch();
      var conv = MEC_EXTRA.cm.conv || [], code = null, cands = [];
      if(codeM){ var want = ('2239-' + codeM[1] + '-lr' + codeM[2]).toLowerCase(); conv.forEach(function(r){ if(r[0].toLowerCase() === want) code = r[0]; }); if(!code) return '<p>' + esc('No encuentro el convenio 2239-' + codeM[1] + '-LR' + codeM[2] + ' en el panel.') + '</p>'; }
      else {
        var ts = n.split(' ').filter(function(t){ return t.length > 2 && !STOPC[t]; });
        if(!ts.length){ return '<p>¿Qué convenio quieres abrir? Dime una palabra de su nombre (por ejemplo «ferretería», «aseo», «combustibles») o su código.</p>'; }
        var sc = conv.map(function(r){ var nm = norm(r[1] + ' ' + r[0]); var s = 0; ts.forEach(function(t){ var st = t.length > 5 ? t.slice(0, t.length - 1) : t; if(nm.indexOf(st) >= 0) s++; }); return {r: r, s: s}; }).filter(function(x){ return x.s > 0; }).sort(function(a, b){ return b.s - a.s || (b.r[2] || 0) - (a.r[2] || 0); });
        if(!sc.length) return '<p>' + esc('No encontré un convenio con «' + ts.join(' ') + '» en su nombre. Prueba con otra palabra o elígelo en la tabla «Gasto por convenio marco».') + '</p>';
        var best = sc[0].s; cands = sc.filter(function(x){ return x.s === best; });
        if(cands.length > 1){
          return '<p>Hay ' + cands.length + ' convenios que calzan. ¿Cuál abro?</p><div class="ia-rel">' + cands.slice(0, 6).map(function(x){ return '<button type="button" data-q="abre el convenio ' + esc(x.r[0]) + '">' + esc(x.r[1] + ' (' + x.r[0] + ')') + '</button>'; }).join('') + '</div>';
        }
        code = cands[0].r[0];
      }
      window.cmocOpen(code);
      return wait(function(){ return window.CM_OC && CM_OC[code] ? CM_OC[code] : (CMOC.err ? {err: 1} : null); }, 15000).then(function(dd){
        if(!dd || dd.err) return '<p>' + esc('Abrí ' + nombreConv(code) + ' (' + code + '), pero no hay detalle de OC publicado para ese convenio todavía.') + '</p>';
        var id = ++hid; HIST[id] = snapshot || null;
        return '<p style="margin:0 0 4px"><b>Listo. Abrí el convenio:</b></p><ul class="ia-chg" style="list-style:none"><li>' + esc(nombreConv(code) + ' (' + code + ')') + '</li></ul>' + kpiList({code: code, d: dd}) +
          '<p>Ahora puedes pedirme, por ejemplo: «productos que no están en la maestra», «los 5 proveedores con más monto», «ordena por monto y deja los 10 primeros» o «descarga la tabla».</p>';
      });
    });
}

/* ---------- enlace a la vista (convenio + filtros) ---------- */
var BASE_HASH = '#detalle=Convenio%20Marco';
function b64e(str){ return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(t){ t = t.replace(/-/g, '+').replace(/_/g, '/'); while(t.length % 4) t += '='; return decodeURIComponent(escape(atob(t))); }
function stateObj(){
  var o = {c: CMOC.sel, t: CMOC.tab};
  if(CMOC.q) o.q = CMOC.q; if(CMOC.pq) o.p = CMOC.pq; if(CMOC.mes) o.m = CMOC.mes; if(CMOC.est !== '') o.e = CMOC.est; if(CMOC.soloFalta) o.f = 1;
  if(V.sort) o.s = [V.sort.key, V.sort.dir, V.sort.tab]; if(V.top) o.k = [V.top.n, V.top.tab]; if(V.maestra) o.v = V.maestra;
  return o;
}
function linkFor(){
  return location.origin + location.pathname + location.search + BASE_HASH + '&cm=' + b64e(JSON.stringify(stateObj()));
}
function cleanStr(x){ return typeof x === 'string' ? x.slice(0, 200) : ''; }
function readState(tok){
  var o; try{ o = JSON.parse(b64d(tok)); }catch(e){ return null; }
  if(!o || typeof o !== 'object' || typeof o.c !== 'string' || !/^2239-\d+-LR\d+$/i.test(o.c)) return null;
  var st = {c: o.c, t: o.t === 'prod' ? 'prod' : 'oc', q: cleanStr(o.q), p: cleanStr(o.p), m: /^20\d\d-(0[1-9]|1[0-2])$/.test(o.m || '') ? o.m : '', e: /^\d{1,2}$/.test(String(o.e == null ? '' : o.e)) ? String(o.e) : '', f: o.f ? 1 : 0, s: null, k: null, v: o.v === 'si' ? 'si' : null};
  if(Array.isArray(o.s) && (o.s[2] === 'prod' || o.s[2] === 'oc') && SORTKEY[o.s[2]][o.s[0]] && (o.s[1] === 'asc' || o.s[1] === 'desc')) st.s = {key: o.s[0], dir: o.s[1], tab: o.s[2]};
  if(Array.isArray(o.k) && typeof o.k[0] === 'number' && o.k[0] > 0 && o.k[0] <= 10000 && (o.k[1] === 'prod' || o.k[1] === 'oc')) st.k = {n: Math.floor(o.k[0]), tab: o.k[1]};
  return st;
}
function waitFor(test, ms){ return new Promise(function(res){ var t0 = Date.now(); (function p(){ var v = test(); if(v) return res(v); if(Date.now() - t0 > ms) return res(null); setTimeout(p, 120); })(); }); }
var restoring = null;
function restoreFromHash(){
  var m = (location.hash || '').match(/^#detalle=Convenio(?:%20| )Marco&cm=([A-Za-z0-9_-]+)$/);
  if(!m){ restoring = null; return Promise.resolve(false); }
  if(restoring === m[1]) return Promise.resolve(false);
  var st = readState(m[1]); if(!st) return Promise.resolve(false);
  restoring = m[1];
  return waitFor(function(){ return window.MEC_EXTRA && MEC_EXTRA.cm && document.getElementById('cmocHost') && typeof window.cmocOpen === 'function'; }, 12000).then(function(ok){
    if(!ok){ restoring = null; return false; }
    patch();
    var code = null; (MEC_EXTRA.cm.conv || []).forEach(function(r){ if(r[0].toLowerCase() === st.c.toLowerCase()) code = r[0]; });
    if(!code){ restoring = null; return false; }
    window.cmocOpen(code);
    return waitFor(function(){ return window.CM_OC && CM_OC[code] ? CM_OC[code] : (CMOC.err ? {err: 1} : null); }, 20000).then(function(d){
      if(!d || d.err){ restoring = null; return false; }
      CMOC.tab = st.t; CMOC.q = st.q; CMOC.pq = st.p; CMOC.mes = st.m; CMOC.est = st.e; CMOC.soloFalta = !!st.f; CMOC.page = 0;
      V = {sort: st.s, top: st.k, maestra: st.v};
      rerender();
      try{ history.replaceState(null, '', location.pathname + location.search + BASE_HASH); }catch(e){}
      restoring = null; return true;
    });
  });
}
function copyLink(b, say){
  var url = linkFor();
  var done = function(){ b.textContent = 'Enlace copiado'; setTimeout(function(){ b.textContent = 'Copiar enlace'; }, 2200); };
  var fail = function(){ say('<p>No pude copiar automáticamente. Copia este enlace:</p><input type="text" readonly value="' + esc(url) + '" style="width:100%;font-size:11px;padding:6px;border:1px solid #DCE4F2;border-radius:8px" onclick="this.select()">'); };
  try{ navigator.clipboard.writeText(url).then(done, fail); }catch(e){ fail(); }
}

/* ---------- clics de los botones de las respuestas ---------- */
function click(b, say){
  var a = b.dataset.acc;
  if(a === 'undo'){
    var s = HIST[+b.dataset.id];
    if(!s){ say('<p>No tengo guardado el estado anterior de esa acción.</p>'); return; }
    if(!cm()){ say('<p>Ya no hay un convenio abierto para deshacer.</p>'); return; }
    restore(s); b.disabled = true; b.textContent = 'Deshecho'; say('<p>Volví al estado anterior de la tabla.</p>' + summaryLine(cm()));
    return;
  }
  if(a === 'link'){ if(cm()) copyLink(b, say); else say('<p>Abre un convenio para generar el enlace.</p>'); return; }
  if(a === 'dl'){
    var key = b.dataset.key, file = b.dataset.file;
    try{
      if(typeof downloadXlsx !== 'function' || typeof DL_STORE === 'undefined' || !DL_STORE[key]){ say('<p>No pude preparar la descarga. Usa el botón «Descargar» que está bajo la tabla.</p>'); return; }
      var orgTxt = b.textContent; b.textContent = 'Generando…';
      Promise.resolve(downloadXlsx(key, file, null)).then(function(){ b.textContent = orgTxt; });
    }catch(e){ say('<p>No pude generar el archivo. Usa el botón «Descargar» que está bajo la tabla.</p>'); }
    return;
  }
  if(a === 'ver'){
    if(!cm()) return;
    var snapshot = snap(); CMOC.q = b.dataset.name; CMOC.tab = 'oc'; CMOC.page = 0; rerender();
    var id = ++hid; HIST[id] = snapshot;
    say('<p>' + esc('Filtré la tabla de órdenes de compra por «' + b.dataset.name + '».') + '</p>' + summaryLine(cm()) + '<div class="ia-act"><button type="button" class="ia-b" data-acc="undo" data-id="' + id + '">Deshacer</button></div>');
  }
}

function ctxInfo(){
  var c = cm();
  if(!c || !/detalle=Convenio/i.test(decodeURIComponent(location.hash || ''))) return null;
  return {label: 'Convenio marco · ' + nombreConv(c.code) + ' (' + c.code + ')', sug: [
    c.d.prod && c.d.prod.some(function(p){ return p[3] === 0; }) ? 'Productos que no están en la maestra' : 'Resumen de este convenio',
    'Los 5 proveedores con más monto', 'Ordena por monto y deja los 10 primeros', 'Limpia los filtros', 'Copiar enlace a esta vista', 'Descarga la tabla en Excel'], acting: true};
}

window.ASISTENTE_ACC = {
  init: function(o){ hooks.change = (o && o.onChange) || hooks.change; patch(); },
  handle: handle, click: click, ctx: ctxInfo, patch: patch, restoreFromHash: restoreFromHash, _link: function(){ return linkFor(); },
  clearView: function(){ V = {sort: null, top: null, maestra: null}; if(pageOk()) rerender(); },
  _view: function(){ return V; }
};
})();
