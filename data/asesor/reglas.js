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
  {k: 'coordina',   t: 'Otros organismos necesitan lo mismo y se quiere agregar demanda',             ar: 'Compra Coordinada'},
  {k: 'ec_exime',   t: 'Por su diseño, uso o función específica, el bien no puede reutilizarse ni compartirse con otros organismos', ar: 'Exime de la consulta de economía circular'}
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

/* Causales de Trato Directo o Contratación Excepcional Directa con Publicidad.
   Fuentes: Ley 19.886 arts. 8 bis, 8 ter y 60 (texto BCN al 05-02-2026) y DS 661/2024 arts. 71 a 84.
   req = requisitos de fondo; acto = qué debe decir la resolución y quién la dicta; pub = publicidad y plazos; resp = responsabilidad. */
const CAUSALES = {
  unico: {n: '71 N° 1', ley: 'art. 8 bis letra a)', t: 'Proveedor único', arts: ['arts. 71 N° 1, 72, 77, 78, 79, 80'],
    req: ['Solo existe un proveedor del bien o servicio y no hay sustituto ni otra alternativa razonable que satisfaga la necesidad de forma similar o equivalente (art. 72).',
      'También procede cuando la contratación solo puede hacerse con quienes son titulares de derechos de propiedad intelectual, industrial, licencias o patentes (art. 72).'],
    acto: ['Resolución fundada que autoriza el trato directo y aprueba el contrato (Ley art. 8 bis letra a; DS art. 77).',
      'Sobre 1.000 UTM, esa resolución o un acto dictado al efecto debe ponderar iniciar otro procedimiento o explicar por qué se mantiene la causal, después de las solicitudes de otros proveedores (art. 78).'],
    pub: ['Publica en el Sistema los antecedentes básicos del bien o servicio y la identidad del proveedor (art. 78).',
      'Sobre 1.000 UTM, antes de firmar el contrato o emitir la orden de compra, publica tu intención de contratar durante 5 días hábiles para que otros proveedores pidan otro procedimiento; el proveedor afectado puede reclamar (arts. 78 y 79).',
      'Sobre 1.000 UTM, informe técnico firmado por las unidades técnicas, con los hechos documentados y las razones por las que la necesidad no está cubierta por el PAC (art. 80).',
      'Publica resolución, contrato y orden de compra dentro de 24 horas (art. 77).'],
    resp: ['La contratación indebidamente fundada genera responsabilidad administrativa (art. 83).']},
  desierta: {n: '71 N° 2', ley: 'arts. 8 bis letra b) y 8 ter', t: 'Licitación sin interesados', arts: ['arts. 69, 70, 71 N° 2, 73'],
    req: ['Primero, una licitación pública sin interesados o con todas las ofertas inadmisibles, con constancia en un acto administrativo publicado en el Sistema (art. 73 N° 1).',
      'Después, una licitación privada que tampoco tuvo interesados u ofertas admisibles (art. 73 N° 2).',
      'Solo entonces procede el trato directo, con las mismas bases de la licitación pública. Si las bases se modifican en cualquier etapa, hay que volver a una licitación pública (Ley art. 8 ter; DS art. 73).'],
    acto: ['Acto administrativo publicado que deje constancia de cada licitación fallida (art. 73).'], pub: [], resp: []},
  urgencia: {n: '71 N° 3', ley: 'art. 8 bis letra c)', t: 'Emergencia, urgencia o imprevisto', arts: ['arts. 71 N° 3, 74, 77, 78, 80, 83, 84'],
    req: ['Necesidad impostergable. Emergencia es la situación del art. 2 letra b) de la Ley 21.364; urgencia, una necesidad apremiante que solo se satisface en el menor tiempo posible; imprevisto, un hecho externo y fortuito que impide el funcionamiento normal de la entidad (art. 74).',
      'Si no se contrata en plazo breve se generarían graves perjuicios a las personas o al funcionamiento del Estado, y no puede usarse otro procedimiento para evitarlos (Ley art. 8 bis letra c; art. 74).',
      'Las circunstancias no pueden ser imputables a la entidad. No sirve la falta de gestión oportuna para asegurar la continuidad de las prestaciones ni la falta de ejecución de un contrato anterior con las mismas partes (art. 83).'],
    acto: ['Resolución fundada del jefe superior del organismo que califica la situación. Debe contener los hechos que justifican los graves perjuicios y los motivos por los que no sirve otro procedimiento (art. 74).',
      'El plazo del suministro o del servicio se limita a los hechos que lo motivan (art. 74).'],
    pub: ['Publica la resolución en el Sistema, en la sección especial, y en el sitio web del organismo; la orden de compra, dentro de 24 horas (art. 78).',
      'Sobre 1.000 UTM, informe técnico con los hechos documentados y las razones por las que la necesidad no está cubierta por el PAC (art. 80).'],
    resp: ['Si las circunstancias son imputables a la entidad, deben iniciarse las medidas para determinar responsabilidades administrativas (Ley art. 8 bis letra c).',
      'Calificar indebidamente la situación se sanciona al jefe superior con multa de 10 a 100 UTM, sin perjuicio de la validez del contrato (art. 84).']},
  confid: {n: '71 N° 4', ley: 'art. 8 bis letra d)', t: 'Servicios confidenciales', arts: ['arts. 39, 71 N° 4, 77, 114, 115, 142'],
    req: ['Solo servicios (no bienes) de naturaleza confidencial o cuya difusión puede afectar la seguridad o el interés nacional.',
      'La confidencialidad o la afectación de la seguridad e interés nacional deben estar determinadas por ley, no por decisión del organismo.'],
    acto: ['Resolución fundada que autoriza el trato directo; el art. 108 c) exceptúa su publicación en este caso.'],
    pub: ['No rige la publicación de resolución, contrato y orden de compra del art. 77.',
      'Puede tramitarse fuera del Sistema (art. 115 N° 4) y la información se mantiene en reserva (arts. 114 y 142). El acceso a la información se rige por la Ley 20.285 (Ley art. 8 bis letra d).'], resp: []},
  confianza: {n: '71 N° 5', ley: 'art. 8 bis letra e)', t: 'Magnitud, importancia y confianza', arts: ['arts. 71 N° 5, 75, 77, 78, 79, 80, 84'],
    req: ['Solo para contrataciones superiores a 1.000 UTM (Ley art. 8 bis letra e; art. 75 letra d).',
      'Por la magnitud e importancia de la contratación es indispensable recurrir a un proveedor determinado, por la confianza y seguridad que da su experiencia comprobada en lo requerido, y se estima fundadamente que no hay otros que den esa misma seguridad (art. 75 letras a y b).',
      'El producto o servicio debe ser indispensable y necesario para la continuidad del servicio y los fines de la entidad (art. 75 letra c).',
      'No basta que el proveedor sea o haya sido proveedor de la entidad ni que tenga experiencia en ella. La experiencia se pondera en proporción al objeto y no puede vulnerar la libre concurrencia (art. 75).'],
    acto: ['Resolución fundada que autoriza el trato directo, con las circunstancias que justifican la causal; el plazo del contrato se limita a los hechos que lo fundan (art. 75).',
      'La resolución o un acto previo debe ponderar iniciar otro procedimiento o explicar por qué se mantiene la causal, después de las solicitudes de otros proveedores (art. 78).'],
    pub: ['Antes de firmar el contrato o emitir la orden de compra, publica tu intención de contratar durante 5 días hábiles; el proveedor afectado puede reclamar (arts. 78 y 79).',
      'Informe técnico firmado por las unidades técnicas, con los hechos documentados y las razones por las que la necesidad no está cubierta por el PAC (art. 80).',
      'Publica resolución, contrato y orden de compra dentro de 24 horas (art. 77).'],
    resp: ['Calificar indebidamente la situación se sanciona al jefe superior con multa de 10 a 100 UTM, según el art. 35 decies de la Ley (art. 84).']},
  impacto: {n: '71 N° 6', ley: 'art. 60 (y art. 8 bis)', t: 'Menos de 30 UTM con alto impacto social', arts: ['arts. 71 N° 6, 76, 77'],
    req: ['Adquisición inferior a 30 UTM (Ley art. 60; art. 71 N° 6). Con 30 UTM o más la causal no procede.',
      'La compra privilegia materias de alto impacto social: impulso a empresas de menor tamaño (incluidas las lideradas por mujeres), proveedores locales, descentralización o sustentabilidad ambiental (Ley art. 60; art. 76).',
      'Debe realizarse preferentemente con personas naturales, empresas de menor tamaño o proveedores locales (art. 76).'],
    acto: ['La resolución que autoriza la contratación debe expresar que se cumplen esos objetivos, declarar que el precio corresponde a valores de mercado según las características que la motivan y especificar que se enmarca en el alto impacto social (Ley art. 60; art. 76).'],
    pub: ['Publica resolución, contrato y orden de compra dentro de 24 horas (art. 77).'], resp: []},
  compat: {n: '71 N° 7 letra a)', ley: 'art. 8 bis letra f) N° 1°', t: 'Servicios o equipamiento accesorios compatibles', arts: ['art. 71 N° 7 letra a)'],
    req: ['Bienes o servicios accesorios que deben ser necesariamente compatibles con modelos, sistemas, equipamiento o infraestructura tecnológica que la propia entidad adquirió antes.',
      'Son necesarios para ejecutar un contrato ya adjudicado y sin ellos se afectaría su correcto funcionamiento.'],
    acto: ['Resolución fundada que acredite el contrato previo, la compatibilidad necesaria y el riesgo para su funcionamiento.'], pub: [], resp: []},
  desprop: {n: '71 N° 7 letra b)', ley: 'art. 8 bis letra f) N° 2°', t: 'Costo desproporcionado del proceso competitivo', arts: ['arts. 4 N° 9 y 10, 71 N° 7 letra b)'],
    req: ['Solo adquisición de servicios (Ley art. 8 bis letra f N° 2°). Un contrato con bienes y servicios es de suministro si el servicio vale menos del 50% (art. 4 N° 9 y 10).',
      'El monto total de la contratación no supera 100 UTM (art. 71 N° 7 letra b).',
      'Hacer un procedimiento competitivo costaría de forma desproporcionada, en dinero o en horas de personal, en relación con el valor del servicio.'],
    acto: ['Informe de la entidad con antecedentes objetivos y comprobables que acrediten el sobrecosto de un procedimiento competitivo y la desproporción frente al costo del servicio (art. 71 N° 7 letra b).'], pub: [], resp: []},
  especial: {n: '71 N° 7 letra c)', ley: 'art. 8 bis letra f) N° 3°', t: 'Servicios de alta especialización', arts: ['art. 71 N° 7 letra c)', 'arts. 173 a 175'],
    req: ['Solo servicios. El proveedor necesita un alto grado de especialización en la materia, en aspectos fundamentales para las funciones de la entidad, que no puede cubrir el personal propio.',
      'Por ejemplo, consultorías, asesorías o servicios altamente especializados sobre temas clave y estratégicos, o proyectos específicos o singulares de docencia, investigación o extensión (art. 71 N° 7 letra c).',
      'El camino general para servicios personales especializados es la licitación pública con preselección (arts. 173 a 175); la entidad debe expresar por qué clasifica el servicio como especializado y por qué no lo hace personal propio (art. 174).'],
    acto: ['Resolución fundada que acredite la alta especialización y que el personal propio no puede realizarlo.'], pub: [], resp: []},
  seguridad: {n: '71 N° 7 letra d)', ley: 'art. 8 bis letra f)', t: 'Seguridad e integridad de autoridades', arts: ['arts. 39, 71 N° 7 letra d)'],
    req: ['Puede afectarse la seguridad e integridad personal de las autoridades y es necesario contratar directamente con un proveedor probado que asegure discreción y confianza.'],
    acto: ['Resolución fundada que acredite el riesgo y la necesidad del proveedor probado.'],
    pub: ['El art. 39 exceptúa a esta causal de la publicidad de los documentos de la contratación.'], resp: []},
  publicidad: {n: '71 N° 7 letra e)', ley: 'art. 8 bis letra f)', t: 'Riesgo por el conocimiento público del proceso', arts: ['art. 71 N° 7 letra e)'],
    req: ['El conocimiento público que generaría el proceso licitatorio previo pondría en serio riesgo el objeto y la eficacia de la contratación.'],
    acto: ['Resolución fundada que explique cómo la publicidad previa pondría en riesgo el objeto del contrato.'], pub: [], resp: []}
};
Object.keys(CAUSALES).forEach(k => { const c = CAUSALES[k]; c.reglas = [].concat(c.req, c.acto, c.pub, c.resp); });
/* Exigencias que valen para cualquier trato directo (Ley 8 bis y DS 661) */
const COMUN_TD = [
  'Consulta antes el Catálogo de Convenio Marco: si el producto está, corresponde comprarlo ahí salvo que obtengas condiciones más ventajosas demostrables (DS arts. 29, 89 y 92).',
  'Dicta un acto administrativo fundado que autorice el trato directo y adjunta todos los antecedentes en el Sistema de Información (DS art. 33).',
  'La compra debe estar en tu Plan Anual de Compras o debes justificar en el acto por qué no (Ley art. 12; DS arts. 27 y 166).',
  'Publica la resolución, el contrato y la orden de compra en el Sistema dentro de 24 horas, salvo servicios confidenciales (DS art. 77).',
  'Cumple el art. 12 bis de la Ley: registro de quienes participan y declaración de patrimonio e intereses (DS arts. 13 y 82).',
  'Aplica las reglas de garantía de fiel cumplimiento del art. 11 de la Ley (DS arts. 81 y 121) e incluye en el contrato la cláusula de programa de integridad (DS art. 17).',
  'La Dirección de Compras monitorea estos tratos directos y puede dictar instrucciones obligatorias (Ley art. 8 bis; DS art. 82).'
];

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
/* Fecha más temprana que permite un plazo mínimo de la norma, contada desde hoy (sin descontar feriados). */
function fechaMin(pm, hoy){
  const d = new Date(hoy || Date.now()); d.setHours(12, 0, 0, 0);
  if(pm.un === 'corridos') d.setDate(d.getDate() + pm.n);
  else { let k = 0; while(k < pm.n){ d.setDate(d.getDate() + 1); if(d.getDay() !== 0 && d.getDay() !== 6) k++; } }
  let nota = '';
  if(pm.cierre){
    if(d.getDay() === 6) d.setDate(d.getDate() + 2); else if(d.getDay() === 0) d.setDate(d.getDate() + 1);
    if(d.getDay() === 1) nota = ' (después de las 15:00)';
  }
  return {d, nota};
}
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
      ecTxt = inp.noMueble ? 'La economía circular se consulta para bienes muebles; un terreno, edificio o estructura no lo es, así que la consulta previa no aplica.' : 'Por su naturaleza (bien de consumo, de un solo uso o de uso personal, o porque marcaste que no puede reutilizarse ni compartirse), la consulta previa no aplica según el art. 28, inciso segundo, y puedes seguir con el paso siguiente. Si crees que otro organismo podría tener uno que sirva, consúltalo igual.';
      paso('Economía circular', 'no aplica', ecTxt, [ds('art. 28')]);
    } else {
      ecTxt = 'Antes de adquirir bienes muebles debes consultar la plataforma de economía circular por si otro organismo tiene uno que sirva a tu necesidad (art. 28). El Asesor no puede comprobar esa disponibilidad. Si en la plataforma no existe o no está disponible, deja constancia con esta frase: "producto no disponible en economía circular", y sigue con el procedimiento que corresponde según lo que pediste. Si existe, puedes pedirlo en traspaso en vez de comprar.';
      paso('Economía circular', 'previo', ecTxt, [ds('art. 28')]);
    }
  } else {
    paso('Economía circular', 'no aplica', 'La consulta previa de economía circular rige solo para la adquisición de bienes muebles; en servicios no corresponde.', [ds('art. 28')]);
  }

  // 2. Convenio Marco
  const cmAplica = !!inp.cm;
  let cmTexto, cmEstado;
  const nomCm = inp.cmNombres && inp.cmNombres.length ? inp.cmNombres.join('; ') : 'un convenio vigente';
  const cert = inp.cmCerteza === 'media' ? ' (por la materia del convenio, sin coincidencia exacta con un producto del Catálogo)' : '';
  if(inp.cm){
    cmEstado = 'obligatorio';
    if(u > 100){
      cmTexto = 'Lo que necesitas está en Convenio Marco: ' + nomCm + cert + '. Sobre 100 UTM corresponde comprar por Convenio Marco antes que por cualquier otro procedimiento, salvo que el producto no esté disponible o que obtengas directamente condiciones más ventajosas objetivas y demostrables (plazo de entrega, garantías, calidad o mejor costo-beneficio), que debes informar a la Dirección de Compras y respaldar. Si el argumento es el precio, la compra fuera debe quedar efectivamente por debajo del precio del Catálogo.';
    } else {
      cmEstado = 'recomendado';
      cmTexto = 'Lo que necesitas está en Convenio Marco: ' + nomCm + cert + '. Es la primera opción: hasta 100 UTM la Compra Ágil no te obliga a consultar el Catálogo, pero el precio del convenio sirve de tope de referencia y, si es menor que las cotizaciones, conviene comprar por Convenio Marco.';
    }
  } else {
    cmEstado = 'descartado';
    cmTexto = 'Lo que necesitas no está en ningún Convenio Marco vigente, por lo que no corresponde ese procedimiento y se sigue con el que aplica según el monto' + (u > 100 ? ' (sobre 100 UTM, la licitación pública, salvo una causal de trato directo o un mecanismo especial)' : '') + '.';
  }
  if(ffaa && inp.cm) cmTexto += ' Nota: respecto de los bienes y servicios que determine su autoridad logística, la ley no hace obligatoria la suscripción de Convenio Marco para las Fuerzas Armadas y de Orden y Seguridad (Ley 19.886, art. 30; DS 661, art. 96).';
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
  if(sit.has('impacto') && u >= 30) inval.push('La causal de alto impacto social (Ley art. 60; DS art. 71 N° 6) es solo para adquisiciones inferiores a 30 UTM; con ' + R(u, 1).toLocaleString('es-CL') + ' UTM no procede.');
  if(sit.has('desprop') && (u > 100 || bien)) inval.push('La causal por costo desproporcionado (art. 71 N° 7 letra b) es solo para servicios cuyo monto total no supere 100 UTM.');
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
  } else if(sit.has('estandar') && u > 100 && !inp.cm){
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
    pr.arts = [ley('art. 7 letra c); ' + c.ley), ds(c.arts.join('; '))];
    pr.plazos.push('Publicar la resolución, el contrato y la orden de compra en el Sistema dentro de 24 horas (art. 77).');
  } else if(pr.k === 'LV'){
    pr.req = MEC_BY.LV.req.slice(); pr.arts = MEC_BY.LV.arts.slice();
    pr.req.push('Si la licitación privada también queda sin interesados u ofertas admisibles, procede el trato directo con las mismas bases (art. 73).');
  } else {
    pr.req = mec.req.slice();
  }
  if(pr.k === 'SPE'){ pr.arts = mec.arts.slice(); }
  if(pr.vig) pr.vigencia = pr.vig; else if(mec.vig) pr.vigencia = mec.vig;

  /* Plazo mínimo que fija la norma antes de poder decidir (se usa para la fecha más temprana junto al total).
     Solo se informa donde el reglamento fija un plazo; en el resto no se inventa uno. */
  { const tr = tramoUtm(u), sm = !!inp.simple; let pm = null;
    if(pr.k === 'LP'){
      const n = [5, sm ? 5 : 10, sm ? 10 : 20, 30][tr];
      pm = {n, un: 'corridos', que: 'entre la publicación del llamado y el cierre de ofertas', arts: [ds('art. 46')], cierre: true};
    } else if(pr.k === 'CM' && pr.gran){
      pm = {n: 10, un: 'hábiles', que: 'para recibir ofertas de los proveedores de la categoría (Gran Compra)', arts: [ds('art. 90')], cierre: true};
    } else if(pr.k === 'TD' && u > 1000 && (pr.causal === 'unico' || pr.causal === 'confianza')){
      pm = {n: 5, un: 'hábiles', que: 'de publicación de la intención de contratar antes de poder resolver', arts: [ds('art. 78')], cierre: false};
    }
    out.plazoMin = pm;
    if(pm && inp.nd){
      const fm = fechaMin(pm), need = new Date(inp.nd + 'T12:00:00'), fmt = d => d.toLocaleDateString('es-CL', {weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'});
      const dias = Math.round((need - new Date().setHours(12, 0, 0, 0)) / 864e5);
      pm.fecha = fm.d; pm.nota = fm.nota;
      if(fm.d > need){
        const red = !sm && (tr === 1 || tr === 2);
        pm.falla = {
          t: 'Por el monto (' + R(u, 1).toLocaleString('es-CL') + ' UTM) corresponde ' + pr.nom + ', pero la fecha que indicaste (' + fmt(need) + ', en ' + dias + ' días) no alcanza: ' + (pm.cierre ? 'el plazo mínimo de ' + pm.n + ' días ' + pm.un + ' ' + pm.que + ' lo fija el ' + pm.arts[0].t + ' del DS 661 y, publicando hoy, el cierre de ofertas ocurre recién el ' + fmt(fm.d) + fm.nota + '. La adjudicación viene después, tras evaluar las ofertas.' : 'se requieren ' + pm.n + ' días ' + pm.un + ' ' + pm.que + ' (DS 661, ' + pm.arts[0].t + '), por lo que lo más pronto es el ' + fmt(fm.d) + '.') + ' La norma fija el plazo, no el calendario: ajusta la fecha o inicia el proceso con más anticipación.',
          acc: (red ? 'Si el bien o servicio es de simple y objetiva especificación, marca esa opción: el art. 46 permite reducir el plazo mínimo. ' : '') + 'Si existe una urgencia real que no sea imputable a tu entidad, la causal de emergencia, urgencia o imprevisto (art. 74) exige acreditarla en resolución fundada; la falta de planificación no la justifica (art. 83).'
        };
        out.alertas.unshift({nivel: 'alto', t: pm.falla.t, accion: pm.falla.acc, arts: pm.arts});
      } else {
        const resto = Math.round((need - fm.d) / 864e5);
        out.alertas.push({nivel: 'info', t: 'El plazo mínimo de publicación cabe en tu fecha: el cierre de ofertas puede ser desde el ' + fmt(fm.d) + fm.nota + ' y te quedan ' + resto + ' días corridos para evaluar y adjudicar antes del ' + fmt(need) + '. Verifica que ese margen alcance para las consultas, la evaluación y el acto de adjudicación de tus bases (DS 661, art. 58).', arts: pm.arts});
      }
    }
  }

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
  const esc = {previo: bien ? ((inp.consumible || inp.noMueble) ? (inp.noMueble ? 'No es un bien mueble: la consulta de economía circular no aplica.' : 'Por su naturaleza (consumo, un solo uso o uso personal) el bien no se reutiliza ni se comparte: la consulta de economía circular no aplica.') : 'Antes de comprar, consulta economía circular (el Asesor no puede comprobar la disponibilidad). Si no está, deja constancia: "producto no disponible en economía circular", y sigue con el procedimiento que corresponde.') : 'Servicio: no corresponde la consulta de economía circular.', opciones: []};
  const enCm = !!inp.cm;
  const ecOp = bien && !inp.consumible && !inp.noMueble, off = 0;
  esc.ecOpcion = ecOp;
  /* upd29: la economía circular es un paso previo que el Asesor no puede verificar; no es una opción numerada */
  if(enCm){
    esc.opciones.push({n: 1 + off, k: 'CM', tag: 'prioridad', titulo: u > 1000 ? 'Gran Compra por Convenio Marco' : 'Compra por Convenio Marco', texto: cmTexto, cm: true, ahorro: ahorroCm(inp, u), arts: [ley('art. 30 letra d)'), ds('arts. 29, 89, 90, 91')]});
  }
  // fuera de Convenio Marco
  const fuera = {n: (enCm ? 2 : 1) + off, k: 'FUERA', tag: enCm ? 'alternativa' : 'recomendado', titulo: enCm ? 'Fuera de Convenio Marco' : 'Procedimiento según el monto', subs: [], arts: [ley('art. 30 letra d); art. 7'), ds('art. 92')]};
  fuera.texto = enCm
    ? 'La norma permite comprar fuera del Convenio Marco si el producto no está disponible o si obtienes condiciones más ventajosas objetivas y demostrables. Debes informarlo a la Dirección de Compras y guardar los antecedentes (art. 92). ' + REGLA_PRECIO + ' Si sales, el procedimiento depende del monto:'
    : 'El producto no está en Convenio Marco, así que el procedimiento depende del monto:';
  if(u <= 100){
    fuera.subs.push({k: 'CA', est: 'procede', nom: 'Compra Ágil', texto: 'Hasta 100 UTM: tres cotizaciones por el Sistema, preferentemente a empresas de menor tamaño y proveedores locales. No necesitas acto administrativo.', arts: [ley('art. 7 letra d) N° 1; art. 56'), ds('arts. 97, 98')]});
  } else {
    fuera.subs.push({k: 'CA', est: 'descartada', nom: 'Compra Ágil', texto: 'El monto (' + R(u, 1).toLocaleString('es-CL') + ' UTM) supera el límite de 100 UTM de este procedimiento.', arts: [ley('art. 7 letra d) N° 1'), ds('art. 97')]});
    const pl = planLicitacion(u, !!inp.simple);
    fuera.subs.push({k: 'LP', est: 'procede', nom: pl.nom, texto: 'Es la regla general sobre 100 UTM. ' + pl.plazos[0], arts: [ley('art. 7 letra a)'), ds('arts. 36, 46')]});
    if(bt.length) fuera.subs.push({k: 'BT', est: 'obligatoria', nom: 'Base Tipo de licitación', texto: btTxt, arts: btArts, links: btLinks});
    if(bien){
      if(inp.cm) fuera.subs.push({k: 'SIE', est: 'descartada', nom: 'Subasta Inversa Electrónica', texto: 'No procede: el producto está en Convenio Marco vigente y la subasta inversa solo se usa para bienes y servicios estandarizados que no están disponibles en él.' + (inp.cmCerteza === 'media' ? ' La coincidencia con el convenio es por su materia; solo si compruebas que el producto exacto no está en el Catálogo podría reevaluarse.' : ''), arts: [ley('art. 7 letra d) N° 6'), ds('arts. 101 a 104')]});
      else fuera.subs.push({k: 'SIE', est: sit.has('estandar') ? 'procede' : 'condicional', nom: 'Subasta Inversa Electrónica', texto: sit.has('estandar') ? 'Marcaste que es un bien de especificación objetiva: la subasta baja el precio en rondas electrónicas.' : 'Solo si el bien es estandarizado y de especificación objetiva.', arts: [ley('art. 7 letra d) N° 6'), ds('arts. 101 a 104')]});
    }
  }
  esc.opciones.push(fuera);
  // excepcional: trato directo
  /* Cada causal se evalúa con lo que se pidió: monto, bien o servicio, Convenio Marco, cuántos proveedores vendieron el producto y palabras del producto.
     aplica = lo que ingresaste la respalda; depende = solo si ocurre un hecho que la entidad debe acreditar; descartada = no calza (se explica por qué). */
  const nProv = (inp.nProv == null ? null : inp.nProv), txt = ' ' + (inp.txt || '') + ' ', seg = inp.seg || '', tieneHist = !!(inp.hist && inp.hist.totalUtm > 0);
  const kw = re => re.test(txt), enCm_ = !!inp.cm;
  const uF = R(u, 1).toLocaleString('es-CL');
  const ev = [];
  /* Cada causal se evalúa con criterios en orden: primero monto y tipo; si uno falla, se descarta de inmediato.
     'ok' = lo que ingresaste lo respalda; 'ver' = hecho que la entidad debe acreditar; 'no' = no calza. */
  const E = (k, crit) => {
    const no = crit.filter(x => x[0] === 'no'), ver = crit.filter(x => x[0] === 'ver');
    const marcada = causalesOk.includes(k);
    let estado = no.length ? 'descartada' : (marcada || (!ver.length) ? 'aplica' : 'depende');
    const motivo = no.length ? no[0][1] : (marcada ? 'La marcaste en el paso 3. Debes acreditar los puntos que siguen.' : 'Calza por monto y tipo; falta acreditar los hechos que siguen.');
    ev.push({k, estado, motivo, crit: no.length ? no.slice(0, 1) : crit});
  };
  const sobre1000 = u > 1000;
  const montoInfo = (lim) => ['ok', 'Monto de ' + uF + ' UTM: ' + lim];
  // N° 1 proveedor único
  { const c = [];
    if(enCm_) c.push(['no', 'El producto está en un Convenio Marco vigente, con varios proveedores: hay alternativa y no hay proveedor único (art. 72).']);
    else if(nProv != null && nProv >= 2) c.push(['no', nProv + ' proveedores distintos vendieron este producto al Estado en los últimos 12 meses; solo aplicaría si ninguno puede sustituir al tuyo (art. 72).']);
    else if(nProv === 1) c.push(['ok', 'Solo 1 proveedor vendió este producto al Estado en los últimos 12 meses.']);
    c.push(['ver', 'Debes acreditar que no existe sustituto ni alternativa razonable que satisfaga la necesidad de forma similar o equivalente (art. 72).']);
    c.push(sobre1000 ? ['ver', 'Sobre 1.000 UTM: publicar la intención de contratar 5 días hábiles e informe técnico (arts. 78 y 80).'] : montoInfo('no exige publicar la intención ni informe técnico (bajo 1.000 UTM).'));
    c.push(['ver', 'Resolución fundada que autoriza el trato directo, con los antecedentes del bien y la identidad del proveedor publicados (Ley art. 8 bis letra a).']);
    E('unico', c); }
  // N° 2 licitación sin interesados
  { const c = [];
    if(enCm_) c.push(['no', 'Con Convenio Marco vigente no corresponde licitar: primero se compra por el convenio.']);
    c.push(['ver', 'Debes tener una licitación pública previa sin interesados o con ofertas inadmisibles, y luego una licitación privada con el mismo resultado (art. 73).']);
    c.push(['ver', 'Las bases de ambas deben ser las mismas; si las modificas, vuelve a licitación pública (Ley art. 8 ter).']);
    E('desierta', c); }
  // N° 3 emergencia, urgencia o imprevisto
  { const c = [];
    c.push(['ver', 'Debes acreditar una necesidad impostergable (emergencia, urgencia o imprevisto) con graves perjuicios si no se contrata en plazo breve (art. 74).']);
    c.push(['ver', 'Las circunstancias no pueden ser imputables a tu entidad ni deberse a falta de gestión oportuna (art. 83).']);
    c.push(['ver', 'Resolución fundada del jefe superior del organismo que califique la situación (Ley art. 8 bis letra c).']);
    if(sobre1000) c.push(['ver', 'Sobre 1.000 UTM: informe técnico (art. 80).']);
    E('urgencia', c); }
  // N° 4 servicios confidenciales
  { const c = [];
    if(bien) c.push(['no', 'Es una causal solo para servicios; esta compra es de un bien.']);
    else if(kw(/reservad|secret|inteligencia|defensa|seguridad nacional|confidencial/)) c.push(['ver', 'Debe existir una ley que declare el servicio confidencial o que su difusión afecta la seguridad o el interés nacional.']);
    else c.push(['no', 'Exige que una ley determine la confidencialidad o la seguridad e interés nacional; nada de lo que pediste lo indica.']);
    E('confid', c); }
  // N° 5 magnitud, importancia y confianza
  { const c = [];
    if(u <= 1000) c.push(['no', 'Solo para contrataciones superiores a 1.000 UTM (art. 75 letra d); esta compra es de ' + uF + ' UTM.']);
    else if(enCm_) c.push(['no', 'Existe Convenio Marco con varios proveedores: no hay un único proveedor de confianza sin competidores.']);
    else {
      c.push(montoInfo('supera 1.000 UTM, como exige la causal.'));
      c.push(['ver', 'Debes acreditar un único proveedor con experiencia comprobada que dé seguridad y confianza, y que no hay otros que den esa misma seguridad' + (nProv != null && nProv >= 2 ? ' (' + nProv + ' proveedores vendieron este producto en 12 meses: deberás explicar por qué ninguno sirve)' : '') + ' (art. 75).']);
      c.push(['ver', 'El producto debe ser indispensable para la continuidad del servicio, y haber sido proveedor de tu entidad no basta (art. 75).']);
      c.push(['ver', 'Publicar la intención de contratar 5 días hábiles e informe técnico (arts. 78 y 80).']);
    }
    E('confianza', c); }
  // N° 6 menos de 30 UTM con alto impacto social
  { const c = [];
    if(u >= 30) c.push(['no', 'Solo para adquisiciones inferiores a 30 UTM (Ley art. 60); esta compra es de ' + uF + ' UTM.']);
    else {
      c.push(montoInfo('es menor que 30 UTM, como exige la causal (Ley art. 60).'));
      c.push(['ver', 'La compra debe privilegiar empresas de menor tamaño (incluidas las lideradas por mujeres), proveedores locales, descentralización o sustentabilidad ambiental (art. 76).']);
      c.push(['ver', 'La resolución debe expresar el cumplimiento de esos objetivos y declarar que el precio responde a valores de mercado (Ley art. 60; art. 76).']);
    }
    E('impacto', c); }
  // N° 7 letra a) compatibilidad
  { const c = [];
    if(tieneHist || ['41', '42', '43', '45', '46', '49', '73'].includes(seg) || kw(/accesorio|repuesto|mantencion|mantenimiento|soporte|licencia|insumo|compatible|actualizacion|upgrade/)) {
      c.push(['ver', 'Debe ser necesariamente compatible con equipamiento, sistemas o infraestructura tecnológica que tu entidad ya adquirió' + (tieneHist ? ' (tu organismo ya compró este producto)' : '') + '.']);
      c.push(['ver', 'Debe ser necesario para ejecutar un contrato ya adjudicado, cuyo funcionamiento se afectaría sin él.']);
    } else c.push(['no', 'Exige tecnología o equipamiento ya adquirido con el que la compra deba ser compatible; no hay indicios en lo que pediste.']);
    E('compat', c); }
  // N° 7 letra b) costo desproporcionado
  { const c = [];
    if(bien) c.push(['no', 'Es solo para adquisición de servicios (Ley art. 8 bis letra f N° 2°; DS art. 71 N° 7 letra b); esta compra es de un bien.']);
    else if(u > 100) c.push(['no', 'El monto total no puede superar 100 UTM (art. 71 N° 7 letra b); esta compra es de ' + uF + ' UTM.']);
    else {
      c.push(['ok', 'Es un servicio por ' + uF + ' UTM, dentro del tope de 100 UTM.']);
      c.push(['ver', 'Debes elaborar un informe con antecedentes objetivos y comprobables del sobrecosto financiero o de recursos humanos de un procedimiento competitivo, frente al costo del servicio.']);
    }
    E('desprop', c); }
  // N° 7 letra c) alta especialización
  { const c = [];
    if(bien) c.push(['no', 'Es solo para servicios; esta compra es de un bien.']);
    else if(['80', '86'].includes(seg) || kw(/asesor|consultor|capacitaci|arquitect|diseno|juridic|estrateg|estudio|auditor|especializ|investigaci|peritaje|traduc/)) {
      c.push(['ok', 'Es una contratación de servicios.']);
      c.push(['ver', 'El proveedor debe necesitar un alto grado de especialización en aspectos fundamentales para tus funciones, que tu personal no puede realizar.']);
      c.push(['ver', 'El camino general es la licitación con preselección (arts. 173 a 175); debes expresar por qué clasificas el servicio como especializado (art. 174).']);
    } else c.push(['no', 'El servicio que pediste no parece exigir alta especialización comprobada.']);
    E('especial', c); }
  // N° 7 letra d) seguridad e integridad de autoridades
  { const c = [];
    if(kw(/seguridad|vigilan|escolta|guardia|blindaj|autoridad/)) c.push(['ver', 'Debe estar en juego la seguridad e integridad personal de autoridades y ser necesario un proveedor probado que asegure discreción y confianza.']);
    else c.push(['no', 'Solo cuando está en juego la seguridad personal de autoridades; nada de lo que pediste lo indica.']);
    E('seguridad', c); }
  // N° 7 letra e) riesgo por conocimiento público
  { const c = [];
    if(kw(/reservad|terreno|inmueble|expropia/)) c.push(['ver', 'Debes acreditar que dar a conocer la licitación pondría en serio riesgo el objeto y la eficacia del contrato.']);
    else c.push(['no', 'Solo si el conocimiento público del proceso pone en riesgo el contrato; nada de lo que pediste lo indica.']);
    E('publicidad', c); }
  const ord = {aplica: 0, depende: 1, descartada: 2};
  ev.sort((p, q) => ord[p.estado] - ord[q.estado]);
  const conN = k => ({k, n: CAUSALES[k].n, t: CAUSALES[k].t, ley: CAUSALES[k].ley});
  const vivas = ev.filter(x => x.estado !== 'descartada').map(x => Object.assign(conN(x.k), {estado: x.estado, motivo: x.motivo, crit: x.crit}));
  const descartadas = ev.filter(x => x.estado === 'descartada').map(x => Object.assign(conN(x.k), {estado: x.estado, motivo: x.motivo, crit: x.crit}));
  esc.opciones.push({n: fuera.n + 1, k: 'TD', tag: 'excepcional', titulo: 'Trato Directo (solo con causal)', texto: 'No reemplaza al procedimiento ordinario: exige una causal del art. 8 bis de la Ley o, bajo 30 UTM, el art. 60 (art. 71 del Reglamento), acreditada en un acto fundado y publicado. Cada causal se revisa contra todo lo que exige la norma: primero el monto y el tipo de contratación' + (enCm_ ? ', luego el Convenio Marco' : '') + ' y los proveedores que venden el producto. Estas son las que podrían calzar y las que descarté:', causales: vivas, descartadas, comun: COMUN_TD, arts: [ley('art. 7 letra c); art. 8 bis; art. 60'), ds('arts. 71 a 84')]});
  /* Compra por Cotización: solo dos casos (Ley art. 8 quáter; DS arts. 99 y 100). Siempre visible, con estado según lo marcado. */
  { const c1 = sit.has('termino'), c2 = sit.has('extranjero');
    const uC = R(u, 1).toLocaleString('es-CL');
    const subsC = [
      {k: 'CO1', nom: 'Reemplazo de un contrato terminado anticipadamente',
       est: c1 ? (u <= 1000 ? 'procede' : 'descartada') : (u > 1000 ? 'descartada' : 'condicional'),
       texto: 'Procede cuando un contrato debió resolverse o terminarse anticipadamente por incumplimiento del contratante u otras causales y el remanente no supera 1.000 UTM (DS art. 100 N° 1).' + (u > 1000 ? ' Esta compra es de ' + uC + ' UTM: sobre el tope no procede.' : (c1 ? '' : ' Solo si es tu caso; márcalo en el paso 3.'))},
      {k: 'CO2', nom: 'Servicio con persona jurídica extranjera que se ejecuta fuera de Chile',
       est: bien ? 'descartada' : (c2 ? 'procede' : 'condicional'),
       texto: bien ? 'Es solo para convenios de prestación de servicios; esta compra es de un bien (DS art. 100 N° 2).' : 'Convenios de prestación de servicios con personas jurídicas extranjeras que deban ejecutarse fuera del territorio nacional (DS art. 100 N° 2).' + (c2 ? '' : ' Solo si es tu caso; márcalo en el paso 3.')}
    ];
    const viva = subsC.some(x => x.est === 'procede');
    esc.opciones.push({n: esc.opciones.length + 1, k: 'CO', tag: viva ? 'recomendado' : 'excepcional', titulo: 'Compra por Cotización (solo en dos casos)',
      texto: 'No reemplaza al procedimiento ordinario. Abre un espacio de negociación con un mínimo de tres cotizaciones previas, sin los requisitos de la licitación (DS art. 99). Las circunstancias que la justifican deben constar en un acto administrativo fundado (DS art. 100).' + (enCm && u > 100 ? ' Sobre 100 UTM el art. 89 del reglamento exige consultar el Catálogo de Convenio Marco antes de licitar, tratar directo u otro procedimiento especial, salvo Compra Ágil: confirma con la Dirección de Compras cómo se aplica en tu caso.' : ''),
      subs: subsC, arts: [ley('art. 7 letra d) N° 2; art. 8 quáter'), ds('arts. 99, 100')]});
  }
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
  if(inp.cm && u > 100) out.alertas.push({nivel: 'medio', t: 'Si te apartas del Convenio Marco por mejores condiciones y estas apuntan al precio, la compra fuera debe quedar efectivamente por debajo del precio vigente del Catálogo para lo mismo, con despacho e IVA. Documenta el cotejo con una captura del Catálogo con fecha y las ofertas recibidas; si no bajas el precio, compra por Convenio Marco.', arts: [ds('arts. 89, 92')], accion: 'Antes de decidir, pide la oferta especial del proveedor del convenio o un acuerdo complementario: puede igualar o mejorar el precio de afuera sin salir del Catálogo.'});
  if(inp.fueraCm && inp.fueraCm > 0 && inp.cm){
    out.alertas.push({nivel: 'medio', t: 'Tu organismo compró este producto fuera de Convenio Marco por $' + Math.round(inp.fueraCm).toLocaleString('es-CL') + ' millones en los últimos 12 meses, existiendo cobertura en el Catálogo. Guarda los antecedentes de las condiciones más ventajosas si fue el caso.', arts: [ley('art. 30 letra d)'), ds('arts. 89, 92')]});
  }
  if(out.causal && (out.causal === 'urgencia' || out.causal === 'confianza' || out.causal === 'unico') && u > 1000){
    out.alertas.push({nivel: 'medio', t: 'Sobre 1.000 UTM, esta causal exige informe técnico (art. 80) y, en proveedor único y confianza, publicar la intención de contratar con 5 días hábiles de anticipación (art. 78).', arts: [ds('arts. 78, 80')]});
  }
  if(u >= 3 && u < 30 && pr.k === 'CA') out.alertas.push({nivel: 'info', t: 'Con menos de 30 UTM también podrías usar Trato Directo si privilegias empresas de menor tamaño, proveedores locales, descentralización o sustentabilidad, y lo fundas en la resolución junto con que el precio es de mercado (Ley art. 60; DS arts. 71 N° 6 y 76). La Compra Ágil sigue siendo la opción por defecto.', arts: [ley('art. 60'), ds('arts. 71 N° 6, 76')]});
  if(bt.length && u <= 100) out.alertas.push({nivel: 'info', t: 'Existe Base Tipo para esto (' + btNom + '). Si decides licitar aunque el monto no supere 100 UTM, debes usar esa Base Tipo (Dictamen CGR E370752/2023).', arts: btArts});
  if(u < 3) out.alertas.push({nivel: 'info', t: 'Las contrataciones inferiores a 3 UTM pueden efectuarse fuera del Sistema de Información (art. 116 letra a), aunque conviene usar igualmente el Sistema por trazabilidad.', arts: [ds('art. 116')]});

  return out;
}

/* Consolidación de la demanda del PAC: pac = {totalClp, n (ítems), meses (cantidad de meses distintos)} */
/* Ahorro y eficiencia dentro del Convenio Marco: ofertas especiales, acuerdo complementario, cotización (datos: cmahorro.js). */
const REGLA_PRECIO = 'Si el motivo para salir del Convenio Marco es el precio, la compra fuera debe quedar efectivamente por debajo del precio vigente en el Catálogo para lo mismo (misma cantidad y especificación, con despacho e IVA incluidos). Deja documentado el cotejo: captura del precio del Catálogo con fecha y las ofertas recibidas. Si no logras un precio menor, corresponde comprar por Convenio Marco.';
function ahorroCm(inp, u){
  const D = root.AS_CMAH && root.AS_CMAH.cm;
  if(!D || !inp.cmIds || !inp.cmIds.length) return [];
  const monto = inp.montoClp || 0, fm = x => '$' + Math.round(x).toLocaleString('es-CL');
  const res = [];
  inp.cmIds.forEach((id, i) => {
    const d = D[id]; if(!d) return;
    const L = [];
    if(d.dcto){
      let t = 'Ofertas especiales: los proveedores pueden publicar descuentos con vigencia de ' + d.dcto.vig + ' y ' + d.dcto.min + '. Antes de emitir la orden de compra revisa en la Tienda si hay una vigente; si no la hay, puedes pedirle al proveedor que publique una.';
      if(d.dcto.pct && monto > 0) t += ' Con ese mínimo de ' + d.dcto.pct + '% ahorrarías al menos ' + fm(monto * d.dcto.pct / 100) + ' sobre ' + fm(monto) + '.';
      L.push({k: 'dcto', t});
    } else if(!d.cot){
      L.push({k: 'dcto', t: 'Este convenio no contempla ofertas especiales con descuento mínimo. El ahorro viene de comparar proveedores y de negociar condiciones dentro de las bases.'});
    }
    if(d.cot) L.push({k: 'cot', t: d.cot});
    if(d.ac){
      let t;
      if(d.ac.tipo === 'no') t = 'Acuerdo complementario: el convenio vigente no lo contempla.';
      else if(d.ac.tipo === 'obligatorio'){
        t = 'Acuerdo complementario: es obligatorio para compras desde ' + (d.ac.desde || 1000).toLocaleString('es-CL') + ' UTM (vigencia ' + d.ac.plazo + '; garantía de fiel cumplimiento no inferior al 5% del monto).' + (u >= (d.ac.desde || 1000) ? ' Tu compra (' + R(u, 0).toLocaleString('es-CL') + ' UTM) lo exige.' : '');
      } else {
        t = 'Acuerdo complementario (opcional' + (d.ac.nota ? ', ' + d.ac.nota : '') + '): puedes suscribirlo con el proveedor adjudicado, con vigencia ' + d.ac.plazo + ' y garantía de fiel cumplimiento no inferior al 5% del monto. Permite pactar entrega por partes, plazos, forma de pago y especificaciones sin apartarse de las bases del convenio, útil en compras recurrentes (DS 661, art. 91).';
        if(d.ac.obligDesde) t += ' Desde ' + d.ac.obligDesde.toLocaleString('es-CL') + ' UTM es obligatorio en ' + d.ac.obligNota.replace(/^obligatorio en /, '') + '.';
      }
      L.push({k: 'ac', t});
    }
    (d.extra || []).forEach(t => L.push({k: 'extra', t}));
    if(u > 1000) L.push({k: 'gran', t: 'Gran Compra: sobre 1.000 UTM comunicas la intención de compra a todos los proveedores de la categoría, con al menos 10 días hábiles para ofertar (art. 90), que es la principal palanca de precio por volumen.'});
    res.push({id, conv: (inp.cmNombres && inp.cmNombres[i]) || id, lineas: L});
  });
  return res;
}

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
    out.texto.push('Con más volumen en una sola orden, pide al proveedor una oferta especial dentro de las bases del convenio (por ejemplo descuento por volumen, despacho o plazos). El precio del Catálogo es el tope de referencia: salir del convenio por precio solo se justifica si lo que contratas fuera queda efectivamente más barato, con el cotejo documentado, y debes informarlo a la Dirección de Compras (art. 92).');
    out.ahorro = ahorroCm(Object.assign({}, inp, {montoClp: total}), u);
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

root.AsesorReglas = {fechaMin, ahorroCm, REGLA_PRECIO, consolidar, BASES_TIPO, BT_FUENTE, recomendar, tramoUtm, planLicitacion, TRAMOS, SITUACIONES, MECANISMOS, MEC_BY, CAUSALES, COMUN_TD, URL_LEY, URL_DS,
  TEXTO_BASE: 'Ley N° 19.886 (texto consolidado BCN, última versión del 05-02-2026, con las modificaciones de las leyes 21.634 y 21.806) y Reglamento DS N° 661/2024 de Hacienda (publicado el 12-12-2024).'};
})(typeof window !== 'undefined' ? window : globalThis);
