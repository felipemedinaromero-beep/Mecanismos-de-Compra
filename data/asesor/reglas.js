/* Motor de reglas del Asesor de compras.
   Base normativa: Ley N° 19.886 (texto consolidado BCN al 05-02-2026, con Ley 21.634 y Ley 21.806) y Reglamento DS N° 661/2024 de Hacienda.
   Es una orientación para el comprador: no reemplaza el análisis de cada caso ni los dictámenes de Contraloría ni las directivas e instrucciones de la Dirección de Compras. */
(function(root){
'use strict';
const LEY = 'Ley 19.886', DS = 'DS 661/2024';
const URL_LEY = 'https://bcn.cl/C713d1', URL_DS = 'https://bcn.cl/7wHrbo';
const A = (n, t) => ({n, t});                       // cita: n = norma, t = texto del artículo
const ley = t => A(LEY, t), ds = t => A(DS, t);

/* Tramos por monto (UTM) según arts. 36 y 46 del DS 661 */
const TRAMOS = [
  {k: 0, lim: 100,  nom: 'hasta 100 UTM'},
  {k: 1, lim: 1000, nom: 'más de 100 y hasta 1.000 UTM'},
  {k: 2, lim: 5000, nom: 'más de 1.000 y hasta 5.000 UTM'},
  {k: 3, lim: Infinity, nom: 'más de 5.000 UTM'}
];
function tramoUtm(u){ return u <= 100 ? 0 : (u < 1000 ? 1 : (u < 5000 ? 2 : 3)); }

/* Situaciones especiales que el comprador puede marcar. */
const SITUACIONES = [
  {k: 'urgencia',   t: 'Emergencia, urgencia o imprevisto que no admite esperar',                   ar: 'Trato Directo'},
  {k: 'unico',      t: 'Existe un solo proveedor del bien o servicio, sin sustituto razonable',      ar: 'Trato Directo'},
  {k: 'desierta',   t: 'La licitación pública ya se hizo y quedó sin interesados o sin ofertas admisibles', ar: 'Licitación Privada / Trato Directo'},
  {k: 'confianza',  t: 'Contratación de gran magnitud que exige un proveedor específico por su experiencia y confianza', ar: 'Trato Directo'},
  {k: 'impacto',    t: 'Compra de menos de 30 UTM que privilegia materias de alto impacto social',   ar: 'Trato Directo'},
  {k: 'compat',     t: 'Equipamiento o servicio accesorio que debe ser compatible con lo ya adquirido', ar: 'Trato Directo'},
  {k: 'desprop',    t: 'Servicio de hasta 100 UTM donde un proceso competitivo cuesta desproporcionadamente más', ar: 'Trato Directo'},
  {k: 'especial',   t: 'Servicio de alta especialización, consultoría o asesoría estratégica',       ar: 'Licitación con preselección o Trato Directo'},
  {k: 'seguridad',  t: 'Está en riesgo la seguridad personal de autoridades',                         ar: 'Trato Directo'},
  {k: 'publicidad', t: 'Conocer el proceso licitatorio pondría en riesgo el objeto de la contratación', ar: 'Trato Directo'},
  {k: 'confid',     t: 'Servicio de naturaleza confidencial o que afecta la seguridad o el interés nacional (determinado por ley)', ar: 'Trato Directo / fuera del sistema'},
  {k: 'termino',    t: 'Reemplazo de un contrato terminado anticipadamente por incumplimiento',       ar: 'Compra por Cotización'},
  {k: 'extranjero', t: 'Servicio con persona jurídica extranjera que se ejecuta fuera de Chile',      ar: 'Compra por Cotización'},
  {k: 'estandar',   t: 'Bien o servicio estandarizado, de especificación objetiva, que no está en Convenio Marco', ar: 'Subasta Inversa Electrónica'},
  {k: 'innova',     t: 'La necesidad no tiene un producto o servicio adecuado en el mercado',         ar: 'Contrato para la Innovación'},
  {k: 'dialogo',    t: 'Necesidad pública compleja que exige un diálogo estructurado con proveedores', ar: 'Diálogo Competitivo de Innovación'},
  {k: 'coordina',   t: 'Otros organismos necesitan lo mismo y se quiere agregar demanda',             ar: 'Compra Coordinada'}
];

/* Catálogo de todos los mecanismos: cuándo procede, requisitos clave y artículos. */
const MECANISMOS = [
  {k: 'CM', nom: 'Convenio Marco', cuando: 'Bienes y servicios estandarizados, con demanda regular y transversal, que están en el Catálogo vigente. Obligatorio si el producto está en el Catálogo y el monto supera 100 UTM, salvo que se obtengan condiciones más ventajosas objetivas.',
   req: ['Consultar el Catálogo antes de cualquier otro procedimiento (excepto Compra Ágil).', 'Emitir la orden de compra directamente al proveedor del Catálogo.', 'Sobre 1.000 UTM es Gran Compra: se comunica la intención de compra a todos los proveedores de la categoría, con al menos 10 días hábiles para ofertar.', 'Si obtienes mejores condiciones fuera del Catálogo, debes informarlo a la Dirección de Compras y guardar los antecedentes.'],
   arts: [ley('art. 7 letra d) N° 3; art. 30 letra d); art. 57'), ds('arts. 29, 85, 88, 89, 90, 92')], vig: ''},
  {k: 'CA', nom: 'Compra Ágil', cuando: 'Bienes o servicios de hasta 100 UTM, con al menos tres cotizaciones pedidas por el Sistema. Por regla general con empresas de menor tamaño y proveedores locales.',
   req: ['Solicitar 3 cotizaciones (puedes contratar con menos si no llegan).', 'Si no eliges la de menor precio, fundamentarlo en la orden de compra.', 'No requiere acto administrativo ni consultar el Catálogo de Convenio Marco.', 'Debe ir primero a empresas de menor tamaño y proveedores locales.'],
   arts: [ley('art. 7 letra d) N° 1; art. 56'), ds('arts. 97, 98')], vig: ''},
  {k: 'LP', nom: 'Licitación Pública', cuando: 'Regla general cuando el bien o servicio no está en Convenio Marco y no concurre una causal de excepción. Se grada según el monto.',
   req: ['Bases aprobadas por acto administrativo; puedes usar los Formularios de Bases Tipo.', 'Plazo mínimo de publicación según monto (5, 10, 20 o 30 días corridos).', 'Sobre 1.000 UTM o gran complejidad, evalúa una comisión de al menos 3 funcionarios.', 'Todo se publica en el Sistema de Información.'],
   arts: [ley('art. 7 letra a); art. 5'), ds('arts. 33 a 62')], vig: ''},
  {k: 'LV', nom: 'Licitación Privada', cuando: 'Excepcional: solo si la licitación pública quedó sin interesados o con todas las ofertas inadmisibles. Se usan las mismas bases.',
   req: ['Resolución fundada publicada.', 'Invitar al menos a 3 proveedores adjudicados en negocios similares y no relacionados entre sí.', 'Si cambias las bases, debes volver a licitar públicamente.'],
   arts: [ley('art. 7 letra b); arts. 8 y 8 ter'), ds('arts. 64 a 70')], vig: ''},
  {k: 'TD', nom: 'Trato Directo o Contratación Excepcional Directa con Publicidad', cuando: 'Solo en las causales del art. 8 bis de la Ley (art. 71 del reglamento). Exige acto fundado y publicación.',
   req: ['Acto administrativo fundado de la jefatura superior.', 'Publicar resolución, contrato y orden de compra dentro de 24 horas.', 'Sobre 1.000 UTM en las causales de proveedor único o de confianza: publicar la intención 5 días hábiles antes.', 'Sobre 1.000 UTM en las causales de proveedor único, urgencia o confianza: informe técnico.'],
   arts: [ley('art. 7 letra c); arts. 8 y 8 bis'), ds('arts. 71 a 84')], vig: ''},
  {k: 'CO', nom: 'Compra por Cotización', cuando: 'Solo para reemplazar un contrato terminado anticipadamente (remanente hasta 1.000 UTM) o para servicios con personas jurídicas extranjeras que se ejecutan fuera de Chile.',
   req: ['Mínimo 3 cotizaciones previas, con espacio de negociación.', 'Acto administrativo fundado que acredite la circunstancia.'],
   arts: [ley('art. 7 letra d) N° 2; art. 8 quáter'), ds('arts. 99, 100')], vig: ''},
  {k: 'CC', nom: 'Compra Coordinada', cuando: 'Dos o más organismos agregan demanda mediante un procedimiento competitivo, por sí o representados por la Dirección de Compras, para lograr ahorros y reducir costos de transacción.',
   req: ['Solicitar la representación a la Dirección de Compras, indicando forma y alcance (la Dirección evalúa oportunidad y conveniencia).', 'Se puede aplicar a licitaciones públicas, Grandes Compras, Diálogos Competitivos y Subasta Inversa.'],
   arts: [ds('art. 4 N° 7; art. 35')], vig: ''},
  {k: 'SIE', nom: 'Subasta Inversa Electrónica', cuando: 'Bienes y servicios estandarizados, de objetiva especificación, que no están disponibles en Convenio Marco vigente. Se desarrolla en rondas electrónicas de ofertas a la baja.',
   req: ['Indicar en el llamado y las bases que se aplicará la subasta inversa.', 'Evaluación y calificación previa; solo los admisibles participan en las rondas.', 'Plazo entre la invitación y la subasta: entre 2 y 10 días hábiles.', 'La clasificación de ofertas es automática; no se revela la identidad de los oferentes durante la subasta.'],
   arts: [ley('art. 7 letra d) N° 6'), ds('arts. 101 a 104')], vig: 'En vigencia desde junio de 2025 (18 meses después de publicada la Ley 21.634, según el tercer transitorio del DS 661).'},
  {k: 'INN', nom: 'Contrato para la Innovación', cuando: 'Cuando no existen productos o servicios adecuados o disponibles en el mercado para una necesidad o problema. Puede incluir investigación y desarrollo.',
   req: ['Fase exploratoria con consulta al mercado e informe.', 'Convocatoria y preselección; selección de iniciativas por comisión de al menos 3 funcionarios.', 'La entidad puede costear prototipos aunque el proveedor no sea el adjudicatario final.', 'Seguir las instrucciones de la Dirección y la Política de Compra Pública de Innovación.'],
   arts: [ley('art. 7 letra d) N° 4'), ds('arts. 185 a 194')], vig: 'En vigencia desde junio de 2025.'},
  {k: 'DCI', nom: 'Diálogo Competitivo de Innovación', cuando: 'Necesidad pública compleja en que es imprescindible un diálogo estructurado para conocer y adaptar especificaciones de soluciones disímiles del mercado.',
   req: ['Convocatoria con requisitos, fases y criterios de preselección.', 'Comisión a cargo del diálogo con al menos 3 integrantes, en número impar.', 'Actas y respaldos de todo el diálogo; trato no discriminatorio y confidencialidad de las soluciones.', 'Cierre del diálogo, invitación a ofertas definitivas y evaluación por comisión de al menos 3 funcionarios.'],
   arts: [ley('art. 7 letra d) N° 5'), ds('arts. 195 a 202')], vig: 'En vigencia desde junio de 2025.'},
  {k: 'SPE', nom: 'Servicios personales especializados', cuando: 'Servicios que exigen preparación especial y comprobada competencia técnica (arquitectura y urbanismo, diseño, asesorías estratégicas, asistencia jurídica especializada, capacitación única).',
   req: ['La entidad clasifica y justifica por qué no puede hacerlo con personal propio.', 'Licitación pública en dos fases: preselección por idoneidad técnica y luego ofertas, ranking y negociación (la negociación no puede superar 20 % del monto ofertado).', 'Plazo mínimo de 10 días para ofertas de los preseleccionados.', 'Anteproyectos de arquitectura: comisión de al menos 5 miembros, mayoría arquitectos; criterio económico hasta 25 %.'],
   arts: [ds('arts. 173 a 176; art. 71 N° 7 letra c)')], vig: ''},
  {k: 'EC', nom: 'Economía circular (consulta previa)', cuando: 'Antes de cualquier adquisición de bienes muebles, los organismos del art. 2 N° 1 deben consultar la plataforma de economía circular por bienes de otras entidades que sirvan para la necesidad.',
   req: ['Se puede omitir si, por su naturaleza, el bien no puede reutilizarse ni compartirse.'],
   arts: [ds('art. 28')], vig: ''},
  {k: 'OT', nom: 'Compras fuera del Sistema de Información', cuando: 'Excepcional: contrataciones menores a 3 UTM, caja chica en tratos directos bajo 100 UTM, gastos comunes y consumos básicos, indisponibilidad del Sistema, materias secretas o reservadas, proveedores extranjeros.',
   req: ['Resolución fundada que justifique la compra fuera del Sistema.', 'Publicar igualmente los antecedentes en el Sistema cuando corresponda.'],
   arts: [ds('arts. 114, 115, 116')], vig: ''}
];
const MEC_BY = {}; MECANISMOS.forEach(m => MEC_BY[m.k] = m);

/* Causales de Trato Directo (art. 71 DS / art. 8 bis Ley). */
const CAUSALES = {
  urgencia: {n: '71 N° 3', ley: '8 bis letra c)', t: 'Emergencia, urgencia o imprevisto', reglas: [
    'La jefatura superior dicta un acto fundado: hechos que generan graves perjuicios si no se contrata en plazo breve y motivos por los que no sirve otro procedimiento (art. 74).',
    'El plazo del suministro debe quedar acotado a los hechos que lo motivan (art. 74).',
    'Las circunstancias no pueden ser imputables a la entidad: la falta de gestión oportuna no sirve como urgencia (art. 83).',
    'Publica la resolución y la orden de compra dentro de 24 horas (arts. 77 y 78).',
    'Sobre 1.000 UTM adjunta informe técnico que explique por qué la necesidad no está cubierta por el PAC (art. 80).',
    'La jefatura superior que califique mal esta causal arriesga una multa de 10 a 100 UTM (art. 84).'], arts: ['arts. 71 N° 3, 74, 77, 78, 80, 83, 84']},
  unico: {n: '71 N° 1', ley: '8 bis letra a)', t: 'Proveedor único', reglas: [
    'Solo procede si no hay sustituto ni alternativa razonable para satisfacer la necesidad de forma similar o equivalente (art. 72).',
    'Incluye el caso en que solo el titular de derechos de propiedad intelectual, licencias o patentes puede proveer (art. 72).',
    'Sobre 1.000 UTM publica tu intención de contratar, con el proveedor identificado, durante 5 días hábiles para que otros pidan otro procedimiento (art. 78 y Ley art. 8 bis letra a).',
    'Sobre 1.000 UTM adjunta informe técnico (art. 80).'], arts: ['arts. 71 N° 1, 72, 78, 80']},
  desierta: {n: '71 N° 2', ley: '8 y 8 ter', t: 'Licitación sin interesados', reglas: [
    'Primero licitación pública sin interesados u ofertas admisibles, constancia en acto publicado (art. 73 N° 1).',
    'Luego licitación privada también sin interesados o con ofertas inadmisibles (art. 73 N° 2).',
    'Solo entonces procede el trato directo, con las mismas bases de la licitación pública (Ley art. 8 ter; art. 73).',
    'Si modificas las bases en cualquier etapa, debes volver a una licitación pública.'], arts: ['arts. 69, 70, 71 N° 2, 73']},
  confid: {n: '71 N° 4', ley: '8 bis letra d)', t: 'Servicios confidenciales', reglas: [
    'Solo si la confidencialidad o la seguridad e interés nacional están determinados por ley.',
    'No rige la obligación de publicar resolución y orden de compra del art. 77.',
    'Puede tramitarse fuera del Sistema de Información (art. 115 N° 4) y la información se mantiene en reserva (arts. 114 y 142).'], arts: ['arts. 71 N° 4, 77, 114, 115']},
  confianza: {n: '71 N° 5', ley: '8 bis letra e)', t: 'Magnitud, importancia y confianza', reglas: [
    'Solo para contrataciones sobre 1.000 UTM (art. 75 letra d).',
    'Debe existir un único proveedor con experiencia comprobada que dé seguridad y confianza, y fundamentar que no hay otros capaces de lo mismo (art. 75).',
    'Haber sido proveedor de la entidad no basta para invocarla (art. 75).',
    'Publica tu intención de contratar durante 5 días hábiles (art. 78) y adjunta informe técnico (art. 80).',
    'Una calificación indebida lleva multa de 10 a 100 UTM a la jefatura superior (arts. 84 y Ley art. 35 decies).'], arts: ['arts. 71 N° 5, 75, 78, 80, 84']},
  impacto: {n: '71 N° 6', ley: '8 bis (alto impacto social)', t: 'Menos de 30 UTM con alto impacto social', reglas: [
    'Solo adquisiciones inferiores a 30 UTM (art. 71 N° 6).',
    'Debe privilegiar empresas de menor tamaño (incluidas las lideradas por mujeres), proveedores locales, descentralización o sustentabilidad ambiental (art. 76).',
    'En el acto fundamenta el cumplimiento de esos objetivos y que el precio responde a valores de mercado (art. 76).',
    'Preferentemente con personas naturales, empresas de menor tamaño o proveedores locales (art. 76).'], arts: ['arts. 71 N° 6, 76']},
  compat: {n: '71 N° 7 letra a)', ley: '8 bis letra f)', t: 'Servicios o equipamiento accesorios compatibles', reglas: [
    'Deben ser necesariamente compatibles con modelos, sistemas o infraestructura adquiridos antes y necesarios para un contrato adjudicado.',
    'Sin ellos se afectaría el correcto funcionamiento de ese contrato.'], arts: ['art. 71 N° 7 letra a)']},
  desprop: {n: '71 N° 7 letra b)', ley: '8 bis letra f)', t: 'Costo desproporcionado del proceso competitivo', reglas: [
    'Solo servicios, y con un monto total que no supere 100 UTM.',
    'Elabora un informe con antecedentes objetivos que demuestre el sobrecosto financiero o de recursos humanos de un proceso competitivo, en relación con el valor del servicio.'], arts: ['art. 71 N° 7 letra b)']},
  especial: {n: '71 N° 7 letra c)', ley: '8 bis letra f)', t: 'Servicios de alta especialización', reglas: [
    'El proveedor necesita alto grado de especialización, en aspectos fundamentales para tus funciones, que no puede cubrir el personal propio.',
    'Antes de usar trato directo revisa si procede la licitación pública con preselección para servicios personales especializados (arts. 173 a 175), que es el camino general para esta clase de servicios.'], arts: ['art. 71 N° 7 letra c)', 'arts. 173 a 175']},
  seguridad: {n: '71 N° 7 letra d)', ley: '8 bis letra f)', t: 'Seguridad e integridad de autoridades', reglas: [
    'Es necesario contratar directamente con un proveedor probado que asegure discreción y confianza.'], arts: ['art. 71 N° 7 letra d)']},
  publicidad: {n: '71 N° 7 letra e)', ley: '8 bis letra f)', t: 'Riesgo por el conocimiento público del proceso', reglas: [
    'El conocimiento público que generaría la licitación pondría en serio riesgo el objeto y la eficacia de la contratación.'], arts: ['art. 71 N° 7 letra e)']}
};

/* Bases Tipo de licitación vigentes (chilecompra.cl/bases-tipo, revisadas el 28-10-2026). Uso obligatorio según Dictamen CGR E370752/2023. */
const BT_FUENTE = 'https://www.chilecompra.cl/bases-tipo/';
const BASES_TIPO = [
  {k: 'dc', nom: 'Servicios de data center', act: '17-08-2026', kw: ['data center', 'datacenter', 'centro de datos'], onu: [], pdf: 'http://www.chilecompra.cl/wp-content/uploads/2026/08/Toma-Razon-Resol.-N%C2%B0-29-Contraloria-G-de-la-Republica.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2026/BasesTipo-word/BT-Data-Center-Editable.docx'},
  {k: 'tp', nom: 'Transporte privado de pasajeros y taxi ejecutivo', act: '08-04-2026', kw: ['transporte de pasajeros', 'transporte privado', 'taxi', 'traslado de pasajeros', 'bus de pasajeros', 'transporte de personas'], onu: ['781118'], pdf: 'http://www.chilecompra.cl/wp-content/uploads/2026/08/Toma-de-Razon-Resol.-N-12-Contraloria-G-de-la-Republica.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2026/BasesTipo-word/BT-Transporte-de-pasajeros-2026-Editable.docx'},
  {k: 'vm', nom: 'Adquisición de vehículos motorizados estándar y modificados', act: '23-02-2026', kw: ['vehiculo motorizado', 'automovil', 'camioneta', 'furgon', 'minibus', 'station wagon', 'vehiculos de pasajeros', 'vehiculo de pasajeros', 'ambulancia'], onu: ['2510'], pdf: 'http://www.chilecompra.cl/wp-content/uploads/2026/02/Toma-de-Razon-RES.-N-5-Contraloria-G-de-la-Republica-.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2026/BasesTipo-word/BT_Vehiculos_Motorizados_Editable.docx', soloBien: true},
  {k: 'av', nom: 'Arriendo de vehículos motorizados livianos', act: '22-09-2025', kw: ['arriendo de vehiculo', 'alquiler de vehiculo', 'arriendo de automovil', 'arriendo de camioneta', 'arriendo de flota'], onu: ['781815'], pdf: 'http://www.chilecompra.cl/wp-content/uploads/2025/10/Toma-Razon-CGR-BasesTipo-vehiculos.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2025/Bases+Tipo/BasesTipo-arriendo-vehiculos-editable.docx'},
  {k: 'sg', nom: 'Servicio de seguros generales', act: '22-09-2025', kw: ['seguro', 'poliza', 'polizas'], onu: ['8413'], pdf: 'https://www.chilecompra.cl/wp-content/uploads/2025/10/Toma-Razon-CGR-BasesTipo-seguros-generales.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2025/Bases+Tipo/BasesTipo-seguros-generales-editable.docx'},
  {k: 'cc', nom: 'Servicio de contact center', act: '24-10-2025', kw: ['contact center', 'call center', 'centro de contacto', 'atencion telefonica', 'mesa de ayuda'], onu: [], pdf: 'https://www.chilecompra.cl/wp-content/uploads/2025/10/Bases-Tipo-Contact-Center.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2025/Bases+Tipo/Bases-Tipo-Contact-Center_editable.docx'},
  {k: 'cl', nom: 'Servicio de cloud computing y servicios asociados', act: '29-07-2026', kw: ['cloud', 'computacion en la nube', 'servicios en la nube', 'servicio en la nube', 'hosting en la nube'], onu: [], pdf: 'http://www.chilecompra.cl/wp-content/uploads/2026/07/Toma-Razon-Resol.-N%C2%B0-27-Contraloria-G-de-la-Republica.pdf', word: 'https://d2wcafjlivmshr.cloudfront.net/2026/BasesTipo-word/BT-Cloud-Computing_editable+%281%29.docx'}
];

/* ----------------------------- utilidades ----------------------------- */
const R = (x, d) => { const f = Math.pow(10, d || 0); return Math.round(x * f) / f; };

/* Plan de procedimiento por tramo para la licitación pública (arts. 36, 46, 54, 31, 52, 119, 121). */
function planLicitacion(u, simple){
  const t = tramoUtm(u), p = {tramo: t, req: [], plazos: [], arts: [ds('arts. 36, 37, 41, 45, 46')]};
  if(t === 0){
    p.nom = 'Licitación Pública menor a 100 UTM';
    p.plazos.push('Al menos 5 días corridos entre la publicación y el cierre de ofertas (art. 46).');
    p.req.push('Puede formalizarse solo con orden de compra aceptada, sin contrato (art. 117).');
    p.req.push('Antes, considera Compra Ágil: es más simple y está pensada para este rango (Ley art. 7 letra d N° 1).');
  } else if(t === 1){
    p.nom = 'Licitación Pública de 100 a 1.000 UTM';
    p.plazos.push(simple ? 'Plazo mínimo de 10 días corridos, reducible a 5 si el bien o servicio es de simple y objetiva especificación (art. 46).' : 'Al menos 10 días corridos entre la publicación y el cierre de ofertas (art. 46).');
    p.req.push('Las bases definen si se firma contrato o basta la orden de compra aceptada (art. 41 N° 9 y art. 117, solo bienes y servicios estándar de simple y objetiva especificación).');
    p.req.push('Comisión evaluadora de al menos 3 funcionarios solo si la evaluación es de gran complejidad (art. 54).');
    p.req.push('Garantía de fiel cumplimiento: facultativa y fundada, por el riesgo del contrato (art. 121).');
    p.arts.push(ds('arts. 54, 117, 121'));
  } else if(t === 2){
    p.nom = 'Licitación Pública de 1.000 a 5.000 UTM';
    p.plazos.push(simple ? 'Al menos 20 días corridos, reducibles a 10 si el bien o servicio es de simple y objetiva especificación (art. 46).' : 'Al menos 20 días corridos entre la publicación y el cierre de ofertas (art. 46).');
    p.req.push('Comisión evaluadora de al menos 3 funcionarios públicos, publicada antes de la apertura (art. 54).');
    p.req.push('Garantía de fiel y oportuno cumplimiento obligatoria: 5 % del precio neto ofertado (Ley art. 11; art. 121).');
    p.req.push('Contrato escrito (art. 117). Los pagos se hacen dentro de 30 días corridos desde la factura; las bases pueden fijar hasta 60 por motivos fundados (art. 133).');
    p.arts.push(ds('arts. 54, 117, 121, 133'));
  } else {
    p.nom = 'Licitación Pública sobre 5.000 UTM';
    p.plazos.push('Al menos 30 días corridos entre la publicación y el cierre de ofertas (art. 46).');
    p.plazos.push('El contrato se firma una vez transcurridos 10 días hábiles desde la notificación de la adjudicación (art. 119).');
    p.req.push('Análisis técnico y económico previo a las bases: características, precios y costos del ciclo de vida, con consulta pública abierta si necesitas información de terceros (art. 31).');
    p.req.push('Comisión evaluadora de al menos 3 funcionarios públicos (art. 54).');
    p.req.push('Garantía de seriedad de la oferta solo excepcionalmente por interés público, de hasta 3 % del monto (Ley art. 11; art. 52).');
    p.req.push('Garantía de fiel y oportuno cumplimiento de 5 % del precio neto (Ley art. 11; art. 121).');
    p.req.push('Puedes pedir que la Dirección de Compras te represente en la licitación (art. 35).');
    p.arts.push(ds('arts. 31, 35, 52, 54, 119, 121'));
  }
  p.req.push('Si la adjudicación supera en más de 30 % el monto estimado, explica en el acto las razones técnicas y económicas (art. 32).');
  p.req.push('Las especificaciones deben ser genéricas, sin marcas (o con "o equivalente"), orientadas al desempeño (art. 41 N° 2).');
  return p;
}

/* ----------------------------- motor ----------------------------- */
/* entrada: {montoClp, utm, tipo:'bien'|'servicio', simple:bool, sit:[claves], cm:bool (el producto aparece en Convenio Marco),
             sector:string, cmNombres:[...], demanda:{no, mm}|null, histUtm:{noCm:número (UTM últimos 12 meses por CA/TD/CO), total:número}} */
function recomendar(inp){
  const utm = inp.utm, u = inp.montoClp / utm, t = tramoUtm(u), sit = new Set(inp.sit || []);
  const bien = inp.tipo !== 'servicio';
  const out = {utm, montoUtm: u, tramo: t, tramoNom: TRAMOS[t].nom, pasos: [], alertas: [], alternativas: [], principal: null, causal: null};
  const paso = (titulo, estado, texto, arts, extra) => out.pasos.push(Object.assign({titulo, estado, texto, arts: arts || []}, extra || {}));
  const ffaa = /ffaa|fuerzas armadas|orden y seguridad/i.test(inp.sector || '');
  const bt = inp.bt || [], btNom = bt.map(b => b.nom).join('; ');
  const btTxt = 'Existe Base Tipo de ChileCompra para esto (' + btNom + '). Si vas a licitar, debes usarla: su uso es obligatorio cuando existe para el producto o servicio (Dictamen CGR E370752/2023). Publica el PDF sin cambios; si modificas algo fuera de los anexos deja de ser Base Tipo y pasa a ser Base Modelo. Solo puedes apartarte si sus estipulaciones no se ajustan a las características de lo que necesitas, incluidos los aspectos a evaluar (Dictamen CGR E510048/2024), y debes fundarlo en el acto administrativo.';
  const btArts = [A('Dictamen CGR', 'E370752/2023 y E510048/2024'), ds('art. 38')];
  const btLinks = bt.reduce((a, b) => a.concat([{t: b.nom + ' (PDF)', u: b.pdf}, {t: 'Word editable', u: b.word}]), []);

  // 0. Planificación
  paso('Revisa tu Plan Anual de Compras y la disponibilidad presupuestaria', 'previo',
    'Debes comprar lo que está en tu PAC; si no está, justifica los motivos en el acto que autoriza la compra. Antes de adjudicar necesitas el certificado de disponibilidad presupuestaria.',
    [ley('art. 12'), ds('arts. 5, 27, 166, 169')]);

  // 1. Economía circular (paso previo, art. 28 DS 661)
  let ecTxt = null;
  if(bien){
    if(inp.consumible || inp.noMueble){
      ecTxt = inp.noMueble ? 'La economía circular se consulta para bienes muebles; un terreno, edificio o estructura no lo es, así que la consulta previa no aplica.' : 'Por su naturaleza, este bien (de consumo o de un solo uso) no puede reutilizarse ni compartirse, así que la consulta previa no aplica y puedes seguir con el paso siguiente.';
      paso('Economía circular', 'no aplica', ecTxt, [ds('art. 28')]);
    } else {
      ecTxt = 'Antes de adquirir bienes muebles debes consultar la plataforma de economía circular por si otro organismo tiene uno que sirva a tu necesidad (art. 28). Si no existe o no está disponible, deja constancia con esta frase: "producto no disponible en economía circular", y continúa con el Convenio Marco. Si existe, puedes pedirlo en traspaso en vez de comprar.';
      paso('Economía circular', 'previo', ecTxt, [ds('art. 28')]);
    }
  } else {
    paso('Economía circular', 'no aplica', 'La consulta previa de economía circular rige solo para la adquisición de bienes muebles; en servicios no corresponde.', [ds('art. 28')]);
  }

  // 2. Convenio Marco
  const cmAplica = !!inp.cm && !ffaa;
  let cmTexto, cmEstado;
  const nomCm = inp.cmNombres && inp.cmNombres.length ? inp.cmNombres.join('; ') : 'un convenio vigente';
  const cert = inp.cmCerteza === 'media' ? ' (por la materia del convenio, sin coincidencia exacta con un producto del Catálogo)' : '';
  if(inp.cm){
    cmEstado = 'obligatorio';
    if(u > 100){
      cmTexto = 'Lo que necesitas está en Convenio Marco: ' + nomCm + cert + '. Sobre 100 UTM corresponde comprar por Convenio Marco antes que por cualquier otro procedimiento, salvo que el producto no esté disponible o que obtengas directamente condiciones más ventajosas objetivas y demostrables (plazo de entrega, garantías, calidad o mejor costo-beneficio), que debes informar a la Dirección de Compras y respaldar.';
      if(ffaa) cmTexto += ' Las Fuerzas Armadas y de Orden y Seguridad no están obligadas respecto de los bienes y servicios que determinen sus propias autoridades logísticas.';
    } else {
      cmEstado = 'recomendado';
      cmTexto = 'Lo que necesitas está en Convenio Marco: ' + nomCm + cert + '. Es la primera opción: hasta 100 UTM la Compra Ágil no te obliga a consultar el Catálogo, pero el precio del convenio sirve de tope de referencia y, si es menor que las cotizaciones, conviene comprar por Convenio Marco.';
    }
  } else {
    cmEstado = 'descartado';
    cmTexto = 'Lo que necesitas no está en ningún Convenio Marco vigente, por lo que no corresponde ese procedimiento y se sigue con el que aplica según el monto' + (u > 100 ? ' (sobre 100 UTM, la licitación pública, salvo una causal de trato directo o un mecanismo especial)' : '') + '.';
  }
  paso('Convenio Marco', cmEstado, cmTexto, [ley('art. 30 letra d); art. 57'), ds('arts. 29, 85, 89, 92, 96')]);
  if(bt.length && u > 100) paso('Base Tipo de licitación', 'obligatorio', btTxt, btArts, {links: btLinks});

  // 3. Determinar el procedimiento
  const SC = {
    urgencia: 1, unico: 1, desierta: 1, confianza: 1, impacto: 1, compat: 1, desprop: 1, especial: 1, seguridad: 1, publicidad: 1, confid: 1
  };
  const causalesMarcadas = [...sit].filter(k => SC[k]);

  // Validaciones de coherencia de causales con el monto
  const inval = [];
  if(sit.has('confianza') && u <= 1000) inval.push('La causal de confianza (art. 71 N° 5) solo se aplica a contrataciones superiores a 1.000 UTM (art. 75 letra d); con ' + R(u, 1).toLocaleString('es-CL') + ' UTM no procede.');
  if(sit.has('impacto') && u >= 30) inval.push('La causal de alto impacto social (art. 71 N° 6) es solo para adquisiciones inferiores a 30 UTM; con ' + R(u, 1).toLocaleString('es-CL') + ' UTM no procede.');
  if(sit.has('desprop') && (u > 100 || bien)) inval.push('La causal por costo desproporcionado (art. 71 N° 7 letra b) es solo para servicios que no superen 100 UTM.');
  if(sit.has('termino') && u > 1000) inval.push('La compra por cotización por término anticipado exige que el remanente no supere 1.000 UTM (Ley art. 8 quáter).');
  inval.forEach(x => out.alertas.push({nivel: 'alto', t: x}));
  const causalesOk = causalesMarcadas.filter(k => {
    if(k === 'confianza' && u <= 1000) return false;
    if(k === 'impacto' && u >= 30) return false;
    if(k === 'desprop' && (u > 100 || bien)) return false;
    return true;
  });

  let pr = null;
  const nombreMec = k => MEC_BY[k].nom;

  if(sit.has('confid') && causalesOk.includes('confid')){
    out.causal = 'confid';
    pr = {k: 'TD', nom: 'Trato Directo por servicios confidenciales', porque: 'Marcaste que el servicio es confidencial o afecta la seguridad o el interés nacional por determinación legal.', causal: 'confid'};
  } else if(causalesOk.includes('urgencia')){
    out.causal = 'urgencia';
    pr = {k: 'TD', nom: 'Trato Directo por emergencia, urgencia o imprevisto', porque: 'Marcaste una necesidad impostergable que no admite esperar un procedimiento competitivo.', causal: 'urgencia'};
  } else if(causalesOk.includes('desierta')){
    out.causal = 'desierta';
    pr = {k: 'LV', nom: 'Licitación Privada y, si también queda desierta, Trato Directo', porque: 'La licitación pública previa quedó sin interesados o con ofertas inadmisibles, por lo que corresponde el siguiente escalón con las mismas bases.', causal: 'desierta'};
  } else if(causalesOk.includes('unico')){
    out.causal = 'unico';
    pr = {k: 'TD', nom: 'Trato Directo por proveedor único', porque: 'Marcaste que no existe sustituto ni alternativa razonable.', causal: 'unico'};
  } else if(causalesOk.includes('confianza')){
    out.causal = 'confianza';
    pr = {k: 'TD', nom: 'Trato Directo por magnitud, importancia y confianza', porque: 'Contratación sobre 1.000 UTM con un único proveedor de experiencia comprobada.', causal: 'confianza'};
  } else if(causalesOk.includes('compat')){
    out.causal = 'compat'; pr = {k: 'TD', nom: 'Trato Directo por compatibilidad con lo ya adquirido', porque: 'Es un accesorio o servicio que debe ser compatible con un contrato o equipamiento previo.', causal: 'compat'};
  } else if(causalesOk.includes('desprop')){
    out.causal = 'desprop'; pr = {k: 'TD', nom: 'Trato Directo por costo desproporcionado del proceso competitivo', porque: 'Servicio de hasta 100 UTM en que un proceso competitivo cuesta más de lo razonable.', causal: 'desprop'};
  } else if(causalesOk.includes('seguridad')){
    out.causal = 'seguridad'; pr = {k: 'TD', nom: 'Trato Directo por seguridad de autoridades', porque: 'Está en juego la seguridad e integridad personal de autoridades.', causal: 'seguridad'};
  } else if(causalesOk.includes('publicidad')){
    out.causal = 'publicidad'; pr = {k: 'TD', nom: 'Trato Directo por riesgo en el conocimiento público', porque: 'El proceso licitatorio público pondría en serio riesgo el objeto de la contratación.', causal: 'publicidad'};
  } else if(causalesOk.includes('impacto')){
    out.causal = 'impacto'; pr = {k: 'TD', nom: 'Trato Directo de menos de 30 UTM con alto impacto social', porque: 'Compra menor que privilegia empresas de menor tamaño, proveedores locales, descentralización o sustentabilidad.', causal: 'impacto'};
  } else if(sit.has('termino') && u <= 1000){
    pr = {k: 'CO', nom: 'Compra por Cotización', porque: 'Reemplazas un contrato terminado anticipadamente y el remanente no supera 1.000 UTM.'};
  } else if(sit.has('extranjero')){
    pr = {k: 'CO', nom: 'Compra por Cotización (servicio con persona jurídica extranjera)', porque: 'El servicio se ejecuta fuera de Chile con una persona jurídica extranjera. También puede tramitarse fuera del Sistema si es indispensable (art. 115 N° 5).'};
  } else if(sit.has('innova')){
    pr = {k: 'INN', nom: 'Contrato para la Innovación', porque: 'Marcaste que no existe en el mercado una solución adecuada para la necesidad.'};
  } else if(sit.has('dialogo')){
    pr = {k: 'DCI', nom: 'Diálogo Competitivo de Innovación', porque: 'La necesidad es compleja y requiere conversar con proveedores para precisar la solución.'};
  } else if(sit.has('especial') && bien === false){
    pr = {k: 'SPE', nom: 'Licitación Pública de servicios personales especializados', porque: 'Es el procedimiento general para servicios de alta especialización: preselección por idoneidad técnica y luego ofertas con negociación.', spe: true};
  } else if(cmAplica){
    pr = {k: 'CM', nom: u > 1000 ? 'Gran Compra por Convenio Marco' : 'Compra por Convenio Marco', porque: u > 100 ? 'El producto está en el Catálogo y supera 100 UTM, por lo que la compra por Convenio Marco es obligatoria salvo que no esté disponible o existan condiciones más ventajosas demostrables.' : 'El producto está en el Catálogo: es la primera opción. Abajo tienes la segunda, fuera de Convenio Marco, si el producto no está disponible o consigues condiciones más ventajosas.', gran: u > 1000};
  } else if(sit.has('estandar') && u > 100){
    pr = {k: 'SIE', nom: 'Subasta Inversa Electrónica', porque: 'Es un bien o servicio estandarizado de objetiva especificación que no está en Convenio Marco: la subasta busca bajar el precio en rondas electrónicas.', alt: 'LP'};
  } else if(u <= 100){
    pr = {k: 'CA', nom: 'Compra Ágil', porque: 'Hasta 100 UTM la Ley contempla Compra Ágil: tres cotizaciones por el Sistema, preferentemente a empresas de menor tamaño y proveedores locales, sin acto administrativo.'};
  } else {
    pr = {k: 'LP', nom: planLicitacion(u, !!inp.simple).nom, porque: 'Sin Convenio Marco aplicable ni causal de excepción, la regla general es la licitación pública, graduada según el monto.'};
  }
  out.principal = pr;

  // Detalle del principal
  const mec = MEC_BY[pr.k];
  pr.mec = mec; pr.req = []; pr.plazos = []; pr.arts = mec.arts.slice();
  if(pr.k === 'LP'){
    const p = planLicitacion(u, !!inp.simple); pr.req = p.req; pr.plazos = p.plazos; pr.arts = p.arts;
    if(bt.length){ pr.req = ['Usa la Base Tipo de ChileCompra: ' + btNom + '. Es obligatoria cuando existe para tu producto o servicio (Dictamen CGR E370752/2023), con la salvedad del Dictamen E510048/2024 si no se ajusta a lo que necesitas.'].concat(pr.req); pr.arts = pr.arts.concat(btArts); pr.links = btLinks; }
  } else if(pr.k === 'CM'){
    pr.req = mec.req.slice();
    if(pr.gran) pr.plazos.push('Plazo para recibir ofertas de los proveedores de la categoría: al menos 10 días hábiles (art. 90). Puedes omitir la Gran Compra en caso de emergencia, urgencia o imprevisto calificado por resolución fundada del jefe superior.');
    else pr.req.push('Hasta 1.000 UTM la Dirección de Compras puede fijar criterios obligatorios de selección dentro del Catálogo (ranking de adjudicación o cotizaciones a los proveedores de la categoría): revisa las bases del convenio (art. 89).');
  } else if(pr.k === 'TD' && pr.causal){
    const c = CAUSALES[pr.causal];
    pr.req = c.reglas.slice();
    pr.arts = [ley('arts. 7 letra c) y 8 bis (' + c.ley + ')'), ds(c.arts.join('; ') + '; art. 77')];
    pr.plazos.push('Publicar la resolución, el contrato y la orden de compra en el Sistema dentro de 24 horas (art. 77).');
  } else if(pr.k === 'LV'){
    pr.req = MEC_BY.LV.req.slice(); pr.arts = MEC_BY.LV.arts.slice();
    pr.req.push('Si la licitación privada también queda sin interesados u ofertas admisibles, procede el trato directo con las mismas bases (art. 73).');
  } else {
    pr.req = mec.req.slice();
  }
  if(pr.k === 'SPE'){ pr.arts = mec.arts.slice(); }
  if(pr.vig) pr.vigencia = pr.vig; else if(mec.vig) pr.vigencia = mec.vig;

  // Pasos siguientes según lo que se decidió
  if(pr.k === 'CM') paso('Compra por Convenio Marco', 'obligatorio', 'Emite la orden de compra al proveedor del Catálogo que mejor se ajuste a tu necesidad' + (pr.gran ? ' y realiza la Gran Compra: comunica la intención a todos los proveedores de la categoría, arma el cuadro comparativo con los criterios de las bases del convenio y adjúntalo a la orden de compra.' : '.'), [ds('arts. 89, 90, 91')]);
  else if(pr.k === 'CA') paso('Compra Ágil', 'recomendado', 'Pide al menos tres cotizaciones por el Sistema. Si eliges una que no es la de menor precio, funda la decisión en la orden de compra. No necesitas acto administrativo.', [ley('art. 7 letra d) N° 1; art. 56'), ds('arts. 97, 98')]);
  else paso(pr.nom, 'recomendado', pr.porque, pr.arts);

  // Alternativas
  const alt = (k, texto) => out.alternativas.push({k, nom: nombreMec(k), texto, arts: MEC_BY[k].arts});
  if(pr.k !== 'LP' && u > 100 && !out.causal && pr.k !== 'CM') alt('LP', 'La licitación pública sigue siendo el camino general si ninguna causal de excepción se puede acreditar.');
  if(pr.k !== 'SIE' && u > 100 && bien && !inp.cm) alt('SIE', 'Si el bien es estandarizado y de objetiva especificación, la subasta inversa puede bajar el precio sin la carga de evaluar bases complejas.');
  if(pr.k !== 'CC' && inp.demanda && inp.demanda.no >= 2) alt('CC', 'Hay ' + inp.demanda.no + ' organismos de tu región comprando este producto. Agregar demanda mediante una compra coordinada puede mejorar precio y reducir costos de transacción.');
  if(pr.k === 'CA' && u > 30 && u <= 100 && bien) alt('LP', 'Si estimas compras repetidas durante el año del mismo producto, una licitación única de suministro evita la fragmentación (art. 16).');
  if(sit.has('especial') && pr.k !== 'SPE') alt('SPE', 'Para servicios de alta especialización, la licitación con preselección (arts. 173 a 175) es el camino general; el trato directo exige acreditar la causal del art. 71 N° 7 letra c).');
  if(sit.has('coordina') && pr.k !== 'CC') alt('CC', 'Marcaste que otros organismos necesitan lo mismo: solicita a la Dirección de Compras que te represente.');

  // Escalera de opciones: Convenio Marco -> fuera de Convenio Marco -> excepcional
  const esc = {previo: bien ? ((inp.consumible || inp.noMueble) ? (inp.noMueble ? 'No es un bien mueble: la consulta de economía circular no aplica.' : 'El bien es de consumo: la consulta de economía circular no aplica.') : 'Primero, consulta economía circular. Si no está, "producto no disponible en economía circular".') : 'Servicio: no corresponde la consulta de economía circular.', opciones: []};
  const enCm = !!inp.cm && !ffaa;
  const ecOp = bien && !inp.consumible && !inp.noMueble, off = ecOp ? 1 : 0;
  esc.ecOpcion = ecOp;
  if(ecOp) esc.opciones.push({n: 1, k: 'EC', tag: 'primera opción', titulo: 'Economía circular', texto: 'Los bienes muebles se consultan primero en la plataforma de economía circular, antes de cualquier compra, tengas o no el producto en Catálogo (DS 661, art. 28). Si otro organismo tiene un bien que sirva a tu necesidad, pídelo en transferencia a título gratuito y no compres. Si no existe o no está disponible, deja constancia con esta frase: "producto no disponible en economía circular", y pasa a la opción siguiente.', arts: [ds('art. 28'), A('Ley 21.634', 'art. segundo')], cm: false});
  if(enCm){
    esc.opciones.push({n: 1 + off, k: 'CM', tag: 'prioridad', titulo: u > 1000 ? 'Gran Compra por Convenio Marco' : 'Compra por Convenio Marco', texto: cmTexto, cm: true, arts: [ley('art. 30 letra d)'), ds('arts. 29, 89, 90')]});
  }
  // fuera de Convenio Marco
  const fuera = {n: (enCm ? 2 : 1) + off, k: 'FUERA', tag: enCm ? 'alternativa' : 'recomendado', titulo: enCm ? 'Fuera de Convenio Marco' : 'Procedimiento según el monto', subs: [], arts: [ley('art. 30 letra d); art. 7'), ds('art. 92')]};
  fuera.texto = enCm
    ? 'La norma permite comprar fuera del Convenio Marco si el producto no está disponible o si obtienes condiciones más ventajosas objetivas y demostrables. Debes informarlo a la Dirección de Compras y guardar los antecedentes (art. 92). En ese caso, el procedimiento depende del monto:'
    : 'El producto no está en Convenio Marco, así que el procedimiento depende del monto:';
  if(u <= 100){
    fuera.subs.push({k: 'CA', est: 'procede', nom: 'Compra Ágil', texto: 'Hasta 100 UTM: tres cotizaciones por el Sistema, preferentemente a empresas de menor tamaño y proveedores locales. No necesitas acto administrativo.', arts: [ley('art. 7 letra d) N° 1; art. 56'), ds('arts. 97, 98')]});
  } else {
    fuera.subs.push({k: 'CA', est: 'descartada', nom: 'Compra Ágil', texto: 'El monto (' + R(u, 1).toLocaleString('es-CL') + ' UTM) supera el límite de 100 UTM de este procedimiento.', arts: [ley('art. 7 letra d) N° 1'), ds('art. 97')]});
    const pl = planLicitacion(u, !!inp.simple);
    fuera.subs.push({k: 'LP', est: 'procede', nom: pl.nom, texto: 'Es la regla general sobre 100 UTM. ' + pl.plazos[0], arts: [ley('art. 7 letra a)'), ds('arts. 36, 46')]});
    if(bt.length) fuera.subs.push({k: 'BT', est: 'obligatoria', nom: 'Base Tipo de licitación', texto: btTxt, arts: btArts, links: btLinks});
    if(bien) fuera.subs.push({k: 'SIE', est: sit.has('estandar') ? 'procede' : 'condicional', nom: 'Subasta Inversa Electrónica', texto: sit.has('estandar') ? 'Marcaste que es un bien de especificación objetiva: la subasta baja el precio en rondas electrónicas.' : 'Solo si el bien es estandarizado y de especificación objetiva.', arts: [ley('art. 7 letra d) N° 6'), ds('arts. 101 a 104')]});
  }
  esc.opciones.push(fuera);
  // excepcional: trato directo
  const aplic = ['urgencia', 'unico', 'desierta', 'confianza', 'impacto', 'compat', 'desprop', 'especial', 'seguridad', 'publicidad', 'confid'].filter(k => {
    if(k === 'confianza') return u > 1000;
    if(k === 'impacto') return u < 30;
    if(k === 'desprop') return !bien && u <= 100;
    if(k === 'especial' || k === 'confid') return !bien;
    if(k === 'compat') return true;
    return true;
  });
  esc.opciones.push({n: fuera.n + 1, k: 'TD', tag: 'excepcional', titulo: 'Trato Directo (solo con causal)', texto: 'No reemplaza al procedimiento ordinario: exige una causal del art. 8 bis de la Ley (art. 71 del Reglamento) acreditada en un acto fundado y publicada. Las causales que podrían aplicar a esta compra, por monto y tipo:', causales: aplic.map(k => ({k, n: CAUSALES[k].n, t: CAUSALES[k].t})), arts: [ley('art. 7 letra c); art. 8 bis'), ds('arts. 71 a 84')]});
  out.escalera = esc;

  // Alertas de datos
  const h = inp.hist;
  if(h){
    // Fragmentación: gasto de los últimos 12 meses por CA/TD/CO en este producto, más esta compra
    const acum = (h.noCmUtm || 0) + u;
    if((pr.k === 'CA' || pr.k === 'TD' || pr.k === 'CO') && acum > 100 && u <= 100){
      out.alertas.push({nivel: 'alto', t: 'Riesgo de fragmentación: en los últimos 12 meses tu organismo ya compró este producto por Compra Ágil, Trato Directo o Cotización por ' + R(h.noCmUtm, 0).toLocaleString('es-CL') + ' UTM; con esta compra el total llega a ' + R(acum, 0).toLocaleString('es-CL') + ' UTM, por sobre el límite de 100 UTM de la Compra Ágil. Dividir una necesidad para eludir una licitación pública es contrario a la norma y tiene multa de 10 a 100 UTM.', arts: [ds('art. 16')], accion: 'Consolida la necesidad del año en un solo proceso (licitación de suministro o Convenio Marco) y regístralo en el PAC.'});
    } else if(h.noCmUtm > 100 && (pr.k === 'CA' || pr.k === 'TD')){
      out.alertas.push({nivel: 'medio', t: 'Tu organismo compró este producto por mecanismos simples por ' + R(h.noCmUtm, 0).toLocaleString('es-CL') + ' UTM en 12 meses. Revisa si la necesidad anual justifica un proceso único.', arts: [ds('art. 16')]});
    }
    if(h.totalUtm && tramoUtm(h.totalUtm + u) > t && t < 3){
      out.alertas.push({nivel: 'medio', t: 'Si sumas lo comprado en 12 meses (' + R(h.totalUtm, 0).toLocaleString('es-CL') + ' UTM) con esta compra, el gasto anual del producto queda en el tramo "' + TRAMOS[tramoUtm(h.totalUtm + u)].nom + '", que exige un procedimiento más exigente que el de esta compra aislada.', arts: [ds('arts. 16, 36')], accion: 'Planifica la demanda anual del producto y define el procedimiento sobre ese total.'});
    }
  }
  if(inp.fueraCm && inp.fueraCm > 0 && inp.cm){
    out.alertas.push({nivel: 'medio', t: 'Tu organismo compró este producto fuera de Convenio Marco por $' + Math.round(inp.fueraCm).toLocaleString('es-CL') + ' millones en los últimos 12 meses, existiendo cobertura en el Catálogo. Guarda los antecedentes de las condiciones más ventajosas si fue el caso.', arts: [ley('art. 30 letra d)'), ds('arts. 89, 92')]});
  }
  if(out.causal && (out.causal === 'urgencia' || out.causal === 'confianza' || out.causal === 'unico') && u > 1000){
    out.alertas.push({nivel: 'medio', t: 'Sobre 1.000 UTM, esta causal exige informe técnico (art. 80) y, en proveedor único y confianza, publicar la intención de contratar con 5 días hábiles de anticipación (art. 78).', arts: [ds('arts. 78, 80')]});
  }
  if(u >= 3 && u < 30 && pr.k === 'CA') out.alertas.push({nivel: 'info', t: 'Con menos de 30 UTM también podrías usar Trato Directo si privilegias empresas de menor tamaño, proveedores locales, descentralización o sustentabilidad (art. 71 N° 6). La Compra Ágil sigue siendo la opción por defecto.', arts: [ds('arts. 71 N° 6, 76')]});
  if(bt.length && u <= 100) out.alertas.push({nivel: 'info', t: 'Existe Base Tipo para esto (' + btNom + '). Si decides licitar aunque el monto no supere 100 UTM, debes usar esa Base Tipo (Dictamen CGR E370752/2023).', arts: btArts});
  if(u < 3) out.alertas.push({nivel: 'info', t: 'Las contrataciones inferiores a 3 UTM pueden efectuarse fuera del Sistema de Información (art. 116 letra a), aunque conviene usar igualmente el Sistema por trazabilidad.', arts: [ds('art. 116')]});

  return out;
}

/* Consolidación de la demanda del PAC: pac = {totalClp, n (ítems), meses (cantidad de meses distintos)} */
function consolidar(inp, pac){
  const total = pac.totalClp, u = total / inp.utm, out = {totalClp: total, totalUtm: u, tramo: tramoUtm(u), tramoNom: TRAMOS[tramoUtm(u)].nom, texto: [], alertas: [], arts: []};
  const rec = recomendar(Object.assign({}, inp, {montoClp: total, sit: []}));
  out.rec = rec;
  const varias = pac.n >= 2 || pac.meses >= 2;
  const uTxt = R(u, 1).toLocaleString('es-CL') + ' UTM';
  if(varias) out.texto.push('Tu PAC planifica este producto en ' + pac.n + ' ítem(s) y ' + pac.meses + ' mes(es) distintos. Juntarlos en una sola compra de ' + uTxt + ' ordena la demanda, mejora el poder de negociación y evita fragmentar (DS 661, art. 16).');
  else out.texto.push('Tu PAC planifica este producto por ' + uTxt + '.');
  if(inp.cm){
    out.texto.push('Como el producto está en Convenio Marco, compra el total por ese mecanismo' + (u > 1000 ? ': sobre 1.000 UTM es Gran Compra (comunicas la intención de compra a todos los proveedores de la categoría, con al menos 10 días hábiles para ofertar; DS 661, art. 90), lo que además abre competencia y mejores precios.' : '.'));
    out.texto.push('Para repartir las entregas en los meses que planificaste, suscribe un acuerdo complementario con el proveedor adjudicado: fija oportunidad y forma de entrega, precio y forma de pago, especificaciones, vigencia y efectos de los incumplimientos, sin apartarse de las bases del convenio (DS 661, art. 91).');
    out.texto.push('Con más volumen en una sola orden, pide al proveedor una oferta especial dentro de las bases del convenio (por ejemplo descuento por volumen, despacho o plazos). El precio del Catálogo es el tope de referencia; si obtienes condiciones más ventajosas fuera de él, debes informarlo a la Dirección de Compras (art. 92).');
    out.arts = [ds('arts. 16, 89, 90, 91, 92')];
  } else if(u > 100){
    out.texto.push('Fuera de Convenio Marco corresponde ' + rec.principal.nom + ' por el total, con calendario de entregas parciales en los meses planificados. Una sola licitación de suministro reemplaza varias compras menores.');
    out.arts = [ds('arts. 16, 36, 46')];
  } else {
    out.texto.push('El total no supera 100 UTM: puedes usar una sola Compra Ágil con entregas en los meses planificados.');
    out.arts = [ds('arts. 16, 97')];
  }
  if(varias && inp.montoClp && inp.montoClp / inp.utm <= 100 && u > 100) out.alertas.push({nivel: 'alto', t: 'Cada compra por separado cabría en Compra Ágil (hasta 100 UTM), pero juntas suman ' + uTxt + '. Partirlas para quedar bajo el límite sería fragmentación (DS 661, art. 16; multa de 10 a 100 UTM).'});
  return out;
}

root.AsesorReglas = {consolidar, BASES_TIPO, BT_FUENTE, recomendar, tramoUtm, planLicitacion, TRAMOS, SITUACIONES, MECANISMOS, MEC_BY, CAUSALES, URL_LEY, URL_DS,
  TEXTO_BASE: 'Ley N° 19.886 (texto consolidado BCN, última versión del 05-02-2026, con las modificaciones de las leyes 21.634 y 21.806) y Reglamento DS N° 661/2024 de Hacienda (publicado el 12-12-2024).'};
})(typeof window !== 'undefined' ? window : globalThis);
