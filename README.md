# Mecanismos de Compra ChileCompra

Panel de todas las órdenes de compra públicas de Chile (enero de 2025 a octubre de 2026; octubre es parcial), clasificadas por mecanismo de contratación: Convenio Marco, Licitación Pública, Licitación Privada, Trato o Contratación Directa, Compra Ágil, Compra Coordinada y Contratación por Cotización, según la Ley N° 19.886 y su Reglamento (modificados por la Ley N° 21.634).

El panel es un archivo HTML autocontenido (`index.html`): no necesita servidor ni build, y con GitHub Pages activado se abre directamente en el navegador.

## Contenido

El panel principal muestra KPIs generales, participación por mecanismo (N° de OC y monto), evolución mensual y una ficha por mecanismo con su definición legal, cita normativa, principales proveedores y organismos, y distribución regional. Cada ficha enlaza a proveedores y organismos en Datos Abiertos ChileCompra.

El Explorador de transacciones por comprador permite elegir un organismo comprador entre los que tienen al menos una OC en el período, filtrar por período y por mecanismo, y revisar su evolución mensual, distribución por mecanismo, principales rubros de compra, principales proveedores (con concentración de gasto y recurrencia mensual) y el listado de transacciones.

## Datos y metodología

Fuente: Datos Abiertos ChileCompra, Descarga masiva por URL de Órdenes de Compra (`datos-abiertos.chilecompra.cl/descargas`), archivos mensuales de enero de 2025 a octubre de 2026. Cada mes se reemplaza completo con la última descarga: una OC que deja de aparecer en el archivo (cancelada o eliminada) se considera inexistente. El último mes puede ser parcial: el archivo llega con un día de rezago y el panel lo indica como «parcial».

Las cifras se calculan a nivel de Orden de Compra, deduplicadas por código de OC, incluyendo solo las órdenes en estado Recepción Conforme o Aceptada. El mecanismo de contratación se determina a partir de los campos `EsCompraAgil`, `EsTratoDirecto`, `DescripcionTipoOC` y `ProcedenciaOC`. Los montos en pesos chilenos se convierten a dólares (USD) usando el dólar observado promedio de cada mes (Banco Central de Chile); los montos en UF y EUR se muestran aparte, sin convertir.

La metodología completa, con el detalle exacto de cada regla de clasificación y los tipos de cambio usados, está descrita al final del panel.

## Actualizar el panel

El archivo se genera con un script en Python que lee los CSV mensuales de Datos Abiertos, agrega las cifras por mecanismo y por organismo comprador, y arma el HTML final embebiendo los datos agregados como JSON. Para actualizarlo hay que volver a descargar los CSV mensuales, correr la agregación y regenerar `index.html` y los archivos de `data/`; los scripts no están incluidos en este repositorio.

## Licencia y atribución

Los datos provienen de Datos Abiertos ChileCompra y son de acceso público. Este repositorio solo contiene la visualización derivada de esos datos.
