/* Compra Ágil por tramo de monto: descarga de las OC con todo el detalle (upd47).
   No trae datos propios: lee los archivos mensuales data/proc/ca_<aaaa-mm>.js y los diccionarios data/proc/dic.js, uno por mes, y los descarta.
   Cada OC se clasifica con el mismo criterio del panel: monto (CLP) dividido por la UTM del mes de la OC.
   Excel: hasta CAP_X OC (las de mayor monto) en hojas de HOJA filas. CSV: todas las OC de la selección, sin tope. */
(function(){
  'use strict';
  const PB = 'data/proc/', CAP_X = 200000, HOJA = 100000;
  const TR = ['Hasta 10 UTM', 'Más de 10 y hasta 30 UTM', 'Más de 30 y hasta 100 UTM', 'Más de 100 UTM'];
  const MESN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const HEAD = ['N° OC', 'Fecha de envío', 'Título', 'Organismo', 'Código organismo', 'Sector', 'Unidad de compra', 'Comuna de la unidad', 'Región del comprador', 'Proveedor', 'RUT proveedor',
    'Rubro (N1)', 'Rubro (N1 › N2 › N3)', 'Monto (CLP)', 'UTM del mes (CLP)', 'Monto en UTM', 'Tramo', 'Enlace a la OC'];
  const fmt = n => Number(n).toLocaleString('es-CL');
  const ver = () => (typeof DATA !== 'undefined' && DATA.generado) ? '?v=' + DATA.generado : '';
  const ymLab = ym => MESN[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
  let busy = false;

  function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => { s.remove(); res(); }; s.onerror = () => { s.remove(); rej(new Error('No se pudo leer ' + src)); }; document.head.appendChild(s); }); }
  function prog(msg){
    let p = document.getElementById('catrProg');
    if(!p){ p = document.createElement('div'); p.id = 'catrProg'; p.setAttribute('role', 'status'); p.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;background:#00233B;color:#fff;padding:12px 20px;border-radius:14px;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:92vw;display:none'; document.body.appendChild(p); }
    if(msg == null){ p.style.display = 'none'; return; } p.textContent = msg; p.style.display = 'block';
  }
  const dayStr = f => { if(f == null || f < 0) return ''; const d = new Date(Date.UTC(2024, 0, 1 + f)); return String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear(); };
  const link = c => 'https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC=' + encodeURIComponent(c);
  const tramoOf = (m, utm) => { const u = m / utm; return u <= 10 ? 0 : u <= 30 ? 1 : u <= 100 ? 2 : 3; };
  const csvCell = v => { if(v == null) return ''; const s = String(v); return /[",;\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  async function run(spec, el){
    if(busy) return; busy = true; const orig = el ? el.innerHTML : '';
    try {
      const ex = window.MEC_EXTRA, meses = ex.ca.meses.slice(spec.i0, spec.i1 + 1);
      prog('Cargando los diccionarios (la primera vez demora unos segundos)…');
      if(!window.PROC_MAN) await loadScript(PB + 'man.js' + ver());
      if(!window.PROC_DIC) await loadScript(PB + 'dic.js' + ver());
      if(!window.AS_CAT) await loadScript('data/asesor/cat.js' + ver());
      const D = window.PROC_DIC, man = window.PROC_MAN.m.ca || {}, utmT = window.AS_CAT.utm;
      const utmK = Object.keys(utmT).sort((a, b) => { const x = a.split('-'), y = b.split('-'); return (+x[0] - +y[0]) || (+x[1] - +y[1]); });
      const utmDe = ym => { const k = +ym.slice(0, 4) + '-' + (+ym.slice(5)); return utmT[k] || utmT[utmK[utmK.length - 1]]; };
      const xlsx = spec.fmt === 'xlsx', todos = spec.t < 0;
      const rows = [], parts = [];
      let total = 0, leidos = 0, sinArchivo = [];
      const cabecera = '﻿' + HEAD.map(csvCell).join(';') + '\r\n';
      if(!xlsx) parts.push(cabecera);
      const prune = () => { if(rows.length > CAP_X * 2){ rows.sort((a, b) => b[13] - a[13]); rows.length = CAP_X; } };
      for(let k = 0; k < meses.length; k++){
        const ym = meses[k], h = man[ym] && man[ym][2];
        if(!h){ sinArchivo.push(ym); continue; }
        prog('Leyendo OC… mes ' + (k + 1) + ' de ' + meses.length + ' (' + ymLab(ym) + ')' + (total ? ' · ' + fmt(total) + ' OC encontradas' : ''));
        const key = 'ca|' + ym; window.PROC_SH = window.PROC_SH || {};
        await loadScript(PB + 'ca_' + ym + '.js?v=' + h);
        const sh = window.PROC_SH[key]; if(!sh){ sinArchivo.push(ym); continue; }
        const utm = utmDe(ym); let buf = [];
        for(let i = 0; i < sh.N; i++){
          const m = sh.m[i], t = tramoOf(m, utm);
          if(!todos && t !== spec.t) continue;
          const o = D.org[sh.o[i]], u = D.uni[sh.u[i]], v = sh.v[i] == null ? -1 : sh.v[i], rb = sh.rb ? sh.rb[i] : -1;
          const r = [sh.c[i], dayStr(sh.f[i]), sh.t ? sh.t[i] : '', o[1], o[0], o[2] || '', u[2], u[5] || '', u[4] != null && u[4] >= 0 ? String(D.reg[u[4]] || '').trim() : '',
            v >= 0 ? D.prov[v][1] : '', v >= 0 ? D.prov[v][0] : '', rb >= 0 ? D.rub[rb].split(' › ')[0] : 'Sin rubro', rb >= 0 ? D.rub[rb] : '', Math.round(m), utm, Math.round(10 * m / utm) / 10, TR[t], link(sh.c[i])];
          total++;
          if(xlsx) rows.push(r); else buf.push(r.map(csvCell).join(';'));
        }
        if(!xlsx && buf.length) parts.push(buf.join('\r\n') + '\r\n');
        if(xlsx) prune();
        delete window.PROC_SH[key]; leidos++;
        await new Promise(r => setTimeout(r, 0));
      }
      if(!total){ prog(null); alert('No se encontraron OC con esa selección.'); return; }
      const sel = (todos ? 'Todos los tramos' : TR[spec.t]) + ' · ' + ymLab(meses[0]) + (meses.length > 1 ? ' a ' + ymLab(meses[meses.length - 1]) : '');
      const slug = 'compra_agil_' + (todos ? 'todos_los_tramos' : ['hasta_10_utm', '10_a_30_utm', '30_a_100_utm', 'mas_de_100_utm'][spec.t]) + '_' + meses[0] + '_a_' + meses[meses.length - 1];
      if(xlsx){
        prog('Armando el Excel…'); await new Promise(r => setTimeout(r, 30));
        rows.sort((a, b) => b[13] - a[13]); const cortado = rows.length > CAP_X; if(cortado) rows.length = CAP_X;
        const sheets = [];
        for(let s = 0; s * HOJA < rows.length; s++) sheets.push({name: rows.length > HOJA ? 'OC ' + (s + 1) : 'OC', headers: HEAD, rows: rows.slice(s * HOJA, (s + 1) * HOJA)});
        const notas = [['Selección', sel], ['Fuente', 'Datos Abiertos ChileCompra, OC de Compra Ágil en estado Recepción Conforme o Aceptada, deduplicadas por código; montos en pesos (CLP).'],
          ['Tramo', 'Monto de la OC (con impuestos) dividido por la UTM del mes en que se envió. Hasta 10 UTM, más de 10 y hasta 30, más de 30 y hasta 100, más de 100.'],
          ['OC de la selección', fmt(total)], ['OC incluidas en este Excel', fmt(rows.length)]];
        if(cortado) notas.push(['Aviso', 'Excel admite una cantidad limitada de filas por archivo: se incluyen las ' + fmt(CAP_X) + ' OC de mayor monto. Para las ' + fmt(total) + ' OC completas usa el botón CSV, o acota los meses.']);
        if(sinArchivo.length) notas.push(['Meses sin archivo', sinArchivo.join(', ')]);
        notas.push(['UTM usadas', meses.map(ym => ymLab(ym) + ': $' + fmt(utmDe(ym))).join(' | ')], ['Generado', new Date().toLocaleDateString('es-CL')]);
        sheets.push({name: 'Notas', headers: ['Tema', 'Detalle'], rows: notas});
        xlsxSave(await xlsxBlob(sheets), slug + '.xlsx');
        prog('Listo: ' + fmt(rows.length) + ' OC' + (cortado ? ' (de ' + fmt(total) + '; el CSV trae todas)' : '') + '.');
      } else {
        const csv = new Blob(parts, {type: 'text/csv;charset=utf-8;'}), url = URL.createObjectURL(csv), a = document.createElement('a');
        a.href = url; a.download = slug + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
        prog('Listo: ' + fmt(total) + ' OC en el CSV.');
      }
      setTimeout(() => prog(null), 3500);
    } catch(e){ console.error(e); prog(null); alert('No se pudo generar la descarga: ' + e.message); }
    finally { busy = false; if(el) el.innerHTML = orig; }
  }
  window.CA_TRAMOS = {run, TR, CAP_X};
})();
