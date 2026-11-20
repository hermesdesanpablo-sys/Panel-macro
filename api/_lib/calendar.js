// Fechas de decisiones de política monetaria (día del anuncio).
// Verificadas el 18-nov-2026 contra los calendarios oficiales / prensa.
// Revisar una vez al año (los bancos publican el año siguiente a mitad de año).
// Las publicaciones de datos (IPCA, CPI, etc.) se traen en vivo cuando la fuente tiene API.

export const POLICY_MEETINGS = {
  br: {
    label: 'Copom – decisión Selic',
    src: 'https://www.bcb.gov.br/publicacoes/calendarioreunioescopom',
    dates: [
      '2026-12-09',
      '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16',
      '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08',
    ],
  },
  us: {
    label: 'FOMC – decisión Fed funds',
    src: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    // Calendario 2027 revisado el 12-nov-2026: la reunión del 26-27 oct es solo de estrategia.
    dates: [
      '2026-12-09',
      '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09',
      '2027-07-28', '2027-09-15', '2027-11-17',
      '2028-01-26',
    ],
    extra: [{ date: '2027-10-27', event: 'FOMC – reunión de estrategia (sin decisión de tasa)', kind: 'cb' }],
  },
  eu: {
    label: 'BCE – decisión de tasas',
    src: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
    dates: [
      '2026-12-17',
      '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10',
      '2027-07-22', '2027-09-09', '2027-10-28', '2027-12-16',
    ],
  },
  ca: {
    label: 'BoC – decisión tasa overnight',
    src: 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/',
    dates: [
      '2026-12-09',
      '2027-01-27', '2027-03-03', '2027-04-28', '2027-06-02',
      '2027-07-21', '2027-09-08', '2027-10-27', '2027-12-08',
    ],
  },
  mx: {
    label: 'Banxico – anuncio de política monetaria',
    src: 'https://www.banxico.org.mx/publicaciones-y-prensa/calendario-de-publicaciones.html',
    dates: ['2026-12-17'], // 2026 verificado. 2027: Banxico todavía no lo publicó (al 18-nov-2026).
  },
  co: {
    label: 'BanRep – decisión tasa de política',
    src: 'https://www.banrep.gov.co/es/calendario-junta-directiva',
    // La JDBR decide tasa al final de ene, mar, abr, jun, jul, sep, oct y dic.
    // dic-2026 verificado en banrep.gov.co (18-nov-2026). 2027: BanRep todavía no lo publicó.
    dates: ['2026-12-18'],
  },
  ar: {
    // El BCRA no tiene reuniones de política con fecha fija: la agenda de Argentina son publicaciones de datos.
    label: 'INDEC',
    src: 'https://www.indec.gob.ar/indec/web/Calendario-Fecha-0',
    dates: [],
  },
  cl: {
    label: 'BCCh – Reunión de Política Monetaria',
    src: 'https://www.bcentral.cl/web/banco-central/noticias-y-publicaciones/prensa/calendario-de-politica-monetaria-y-financiera',
    // dic-2026 verificado en el calendario oficial. 2027: publicado el 30-sep-2026 pero la página bloquea consultas automáticas; PENDIENTE.
    dates: ['2026-12-15'],
  },
  jp: {
    label: 'BoJ – decisión de política monetaria',
    src: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm',
    // Segundo día de cada reunión (día del anuncio). 2026 y 2027 verificados en boj.or.jp el 18-nov-2026.
    dates: [
      '2026-12-18',
      '2027-01-22', '2027-03-18', '2027-04-28', '2027-06-11',
      '2027-07-22', '2027-09-22', '2027-10-29', '2027-12-17',
    ],
  },
  in: {
    label: 'RBI – decisión del MPC (repo)',
    src: 'https://www.rbi.org.in/Scripts/Annualpolicy.aspx',
    // Último día de cada reunión del MPC (día del anuncio). AF 2026-27 verificado en rbi.org.in el 19-nov-2026. AF 2027-28: PENDIENTE.
    dates: ['2026-12-04', '2027-02-05'],
  },
  pe: {
    label: 'BCRP – Programa Monetario',
    src: 'https://www.bcrp.gob.pe/politica-monetaria.html',
    // El BCRP decide una vez por mes (en general el 2.º jueves), pero su web bloquea consultas automáticas y no se pudo
    // leer el calendario oficial (19-nov-2026): PENDIENTE, no se cargan fechas estimadas.
    dates: [],
  },
};

// Publicaciones de inflación y PIB con fecha oficial (calendarios anuales de cada instituto, verificados el 19-nov-2026).
// BR (IBGE) y EE.UU. (FRED) se traen en vivo desde sus APIs; acá van los países sin API de calendario.
export const DATA_RELEASES = {
  ar: {
    src: 'https://www.indec.gob.ar/ftp/cuadros/publicaciones/calendario_2sem2026.pdf',
    // Calendario de difusión INDEC 2.º semestre 2026. 1.er semestre 2027: PENDIENTE (todavía no publicado).
    items: [
      ['2026-11-24', 'INDEC – EMAE de septiembre'],
      ['2026-12-15', 'INDEC – IPC de noviembre'],
      ['2026-12-16', 'INDEC – PIB 3T-2026 (informe de avance del nivel de actividad)'],
      ['2026-12-21', 'INDEC – EMAE de octubre'],
    ],
  },
  eu: {
    src: 'https://www.ecb.europa.eu/press/calendars/statscal/ges/html/sthicp.en.html',
    // Flash y final del HICP: calendario estadístico del BCE (replica el de Eurostat). PIB: comunicado de Eurostat del 30-oct-2026.
    items: [
      ['2026-12-01', 'Eurostat – Inflación (HICP) flash de noviembre'],
      ['2026-12-07', 'Eurostat – PIB y empleo 3T-2026 (estimación regular)'],
      ['2026-12-17', 'Eurostat – Inflación (HICP) final de noviembre'],
      ['2027-01-06', 'Eurostat – Inflación (HICP) flash de diciembre'],
      ['2027-01-19', 'Eurostat – Inflación (HICP) final de diciembre'],
      ['2027-02-02', 'Eurostat – Inflación (HICP) flash de enero'],
      ['2027-02-24', 'Eurostat – Inflación (HICP) final de enero'],
      ['2027-03-02', 'Eurostat – Inflación (HICP) flash de febrero'],
      ['2027-03-17', 'Eurostat – Inflación (HICP) final de febrero'],
      ['2027-04-01', 'Eurostat – Inflación (HICP) flash de marzo'],
      ['2027-04-19', 'Eurostat – Inflación (HICP) final de marzo'],
      ['2027-05-03', 'Eurostat – Inflación (HICP) flash de abril'],
      ['2027-05-20', 'Eurostat – Inflación (HICP) final de abril'],
      ['2027-06-01', 'Eurostat – Inflación (HICP) flash de mayo'],
      ['2027-06-17', 'Eurostat – Inflación (HICP) final de mayo'],
    ],
  },
  mx: {
    src: 'https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_2027.pdf',
    // Calendarios de difusión INEGI 2026 y 1.er semestre 2027 (cal_2026.pdf y cal_2027.pdf).
    items: [
      ['2026-11-23', 'INEGI – PIB 3T-2026 (cifras revisadas)'],
      ['2026-11-23', 'INEGI – IGAE de septiembre'],
      ['2026-11-24', 'INEGI – INPC 1.ª quincena de noviembre'],
      ['2026-12-09', 'INEGI – INPC de noviembre'],
      ['2026-12-23', 'INEGI – INPC 1.ª quincena de diciembre'],
      ['2026-12-23', 'INEGI – IGAE de octubre'],
      ['2027-01-07', 'INEGI – INPC de diciembre'],
      ['2027-01-22', 'INEGI – INPC 1.ª quincena de enero'],
      ['2027-01-25', 'INEGI – IGAE de noviembre'],
      ['2027-01-29', 'INEGI – PIB 4T-2026 (estimación oportuna)'],
      ['2027-02-09', 'INEGI – INPC de enero'],
      ['2027-02-24', 'INEGI – INPC 1.ª quincena de febrero'],
      ['2027-02-24', 'INEGI – PIB 4T-2026 (cifras revisadas) e IGAE de diciembre'],
      ['2027-03-09', 'INEGI – INPC de febrero'],
      ['2027-03-23', 'INEGI – INPC 1.ª quincena de marzo'],
      ['2027-03-24', 'INEGI – IGAE de enero'],
      ['2027-04-08', 'INEGI – INPC de marzo'],
      ['2027-04-22', 'INEGI – INPC 1.ª quincena de abril'],
      ['2027-04-23', 'INEGI – IGAE de febrero'],
      ['2027-04-30', 'INEGI – PIB 1T-2027 (estimación oportuna)'],
      ['2027-05-07', 'INEGI – INPC de abril'],
      ['2027-05-24', 'INEGI – INPC 1.ª quincena de mayo'],
      ['2027-05-24', 'INEGI – PIB 1T-2027 (cifras revisadas) e IGAE de marzo'],
      ['2027-06-09', 'INEGI – INPC de mayo'],
      ['2027-06-24', 'INEGI – INPC 1.ª quincena de junio'],
      ['2027-06-24', 'INEGI – IGAE de abril'],
    ],
  },
  ca: {
    src: 'https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm',
    // Tomadas del "Next release" de los últimos comunicados de The Daily (CPI de oct-2026, PIB de ago-2026).
    // El calendario anual de StatCan (PDF) responde 403 a consultas automáticas: 2027 PENDIENTE.
    items: [
      ['2026-11-30', 'StatCan – PIB por industria de septiembre (y estimación anticipada de octubre)'],
      ['2026-12-14', 'StatCan – IPC de noviembre'],
    ],
  },
  co: {
    src: 'https://www.dane.gov.co/index.php/calendario',
    // Calendario DANE (vista mensual). Las fechas de 2027 se agregan en vivo desde el mismo calendario (co.js).
    items: [['2026-12-07', 'DANE – IPC de noviembre']],
  },
  cl: {
    src: 'https://www.ine.gob.cl/inicio/agendaestadistica',
    // Agenda estadística del INE. PIB trimestral e Imacec (BCCh): su web bloquea consultas automáticas, PENDIENTE.
    items: [['2026-12-07', 'INE – IPC de noviembre']],
  },
  jp: {
    src: 'https://www.stat.go.jp/english/data/cpi/1582.htm',
    // IPC: Statistics Bureau (MIC). PIB: Cabinet Office (https://www.esri.cao.go.jp/en/sna/kouhyou/kouhyou_top.html).
    items: [
      ['2026-11-27', 'MIC – IPC de Tokio de noviembre (preliminar)'],
      ['2026-12-08', 'Cabinet Office – PIB 3T-2026 (2.ª estimación)'],
      ['2026-12-18', 'MIC – IPC nacional de noviembre'],
      ['2026-12-25', 'MIC – IPC de Tokio de diciembre (preliminar)'],
      ['2027-01-22', 'MIC – IPC nacional de diciembre'],
      ['2027-01-29', 'MIC – IPC de Tokio de enero (preliminar)'],
      ['2027-02-15', 'Cabinet Office – PIB 4T-2026 (1.ª estimación)'],
      ['2027-02-19', 'MIC – IPC nacional de enero'],
      ['2027-02-26', 'MIC – IPC de Tokio de febrero (preliminar)'],
      ['2027-03-09', 'Cabinet Office – PIB 4T-2026 (2.ª estimación)'],
      ['2027-03-19', 'MIC – IPC nacional de febrero'],
      ['2027-03-26', 'MIC – IPC de Tokio de marzo (preliminar)'],
      ['2027-06-08', 'Cabinet Office – PIB 1T-2027 (2.ª estimación)'],
    ],
  },
  in: {
    src: 'https://www.mospi.gov.in/uploads/documents/releaseCalender/1793948871564-ARC%202026-27%20updated%20till%20October%202026.pdf',
    // Advance Release Calendar 2026-27 de MOSPI (versión oct-2026). Son fechas PREVISTAS: si el 12 cae fin de semana,
    // MOSPI suele publicar el día hábil siguiente (p.ej. el IPC de agosto salió el 14-sep).
    items: [
      ['2026-11-30', 'MOSPI – PIB 2T AF 2026-27 (jul–sep)'],
      ['2026-12-12', 'MOSPI – IPC de noviembre (fecha prevista)'],
      ['2027-01-07', 'MOSPI – PIB AF 2026-27, 1.ª estimación anticipada'],
      ['2027-01-12', 'MOSPI – IPC de diciembre (fecha prevista)'],
      ['2027-02-12', 'MOSPI – IPC de enero (fecha prevista)'],
      ['2027-02-26', 'MOSPI – PIB 3T AF 2026-27 (oct–dic) y 2.ª estimación anticipada'],
      ['2027-03-12', 'MOSPI – IPC de febrero (fecha prevista)'],
    ],
  },
  // Perú: el calendario del INEI es una imagen y el del BCRP bloquea consultas automáticas. PENDIENTE (sin fechas estimadas).
  pe: { src: 'https://www.inei.gob.pe/calendario/', items: [] },
};

// Calendario político (elecciones y asunciones). kind 'pol'. `tentative`: fecha anunciada pero no firme (se rotula "previsto").
// Verificado el 20-nov-2026 contra organismos electorales y prensa. Revisar cada trimestre.
export const POLITICAL_EVENTS = {
  ar: {
    src: 'https://www.argentina.gob.ar/dine',
    items: [
      // Ley 26.571: PASO el 2.º domingo de agosto. El Gobierno impulsa suspenderlas/eliminarlas para 2027 (sin aprobar al 20-nov-2026).
      { date: '2027-08-08', event: 'Argentina – PASO nacionales', tentative: true, note: 'el Congreso discute suspenderlas' },
      // Código Electoral Nacional, art. 53: cuarto domingo de octubre.
      { date: '2027-10-24', event: 'Argentina – Elecciones generales (presidente, ½ Diputados, ⅓ Senado)' },
      // Art. 96 de la Constitución: segunda vuelta dentro de los 30 días.
      { date: '2027-11-21', event: 'Argentina – Eventual balotaje presidencial' },
    ],
  },
  br: {
    src: 'https://www12.senado.leg.br/radio/1/noticia/2026/01/05/posse-presidencial-em-2027-sera-em-5-de-janeiro-e-governadores-tomam-posse-no-dia-6',
    items: [
      { date: '2027-01-05', event: 'Brasil – Asunción presidencial (EC 111/2021: pasa del 1-ene al 5-ene)' },
      { date: '2027-02-01', event: 'Brasil – Asume el nuevo Congreso' },
    ],
  },
  mx: {
    src: 'https://www.ine.mx/voto-y-elecciones/elecciones-2027/',
    items: [{ date: '2027-06-06', event: 'México – Elección federal intermedia (500 diputados) y locales en todo el país' }],
  },
  co: {
    src: 'https://www.registraduria.gov.co/',
    // Resolución 12338 de la Registraduría (28-oct-2026).
    items: [{ date: '2027-10-31', event: 'Colombia – Elecciones territoriales (gobernadores, alcaldes, asambleas)' }],
  },
  eu: {
    src: 'https://www.info.gouv.fr/actualite/presidentielle-2027-date-a-retenir-et-informations-cles',
    items: [
      // Fechas fijadas por el Consejo de Ministros del 1-jul-2026; el decreto de convocatoria sale antes del 7-feb-2027.
      { date: '2027-04-18', event: 'Francia – Presidencial, 1.ª vuelta', tentative: true, note: 'falta el decreto de convocatoria', flag: 'fr' },
      { date: '2027-05-02', event: 'Francia – Presidencial, 2.ª vuelta', tentative: true, flag: 'fr' },
    ],
  },
  jp: {
    src: 'https://news.web.nhk/newsweb/na/nd-20261016de60274',
    // Proyecto de ley aprobado por el gabinete (oct-2026): prefecturas el 11-abr, municipios el 25-abr.
    items: [
      { date: '2027-04-11', event: 'Japón – Elecciones locales unificadas (gobernadores y asambleas prefecturales)', tentative: true },
      { date: '2027-04-25', event: 'Japón – Elecciones locales unificadas (alcaldes y concejos)', tentative: true },
    ],
  },
};
// Elecciones relevantes todavía sin fecha: se muestran aparte en la Agenda (vista Político).
export const POLITICAL_UNDATED = [
  { cid: 'es', event: 'España – Elecciones generales: la legislatura vence en 2027 (sin convocatoria; se habla de adelanto a la primavera)' },
  { cid: 'it', event: 'Italia – Elecciones generales: vencen en 2027 (fecha sin definir; hipótesis entre primavera y otoño)' },
  { cid: 'in', event: 'India – Elecciones estaduales de 2027 (Uttar Pradesh, Punjab, Uttarakhand, Goa y Manipur a inicios de año; Gujarat y Himachal Pradesh a fin de año): la Comisión Electoral todavía no las convocó' },
];

export function politicalEvents(country) {
  const r = POLITICAL_EVENTS[country];
  return r ? r.items.map((e) => ({ date: e.date, event: `${e.event}${e.tentative ? ' (previsto' + (e.note ? `: ${e.note}` : '') + ')' : ''}`, kind: 'pol', url: r.src, ...(e.flag && { flag: e.flag }) })) : [];
}

export function dataEvents(country) {
  const r = DATA_RELEASES[country];
  return r ? r.items.map(([date, event]) => ({ date, event, kind: 'data', url: r.src })) : [];
}

/** Reuniones de banco central + publicaciones de datos con fecha oficial. */
export function agendaEvents(country) {
  return [...meetingEvents(country), ...dataEvents(country)];
}

export function meetingEvents(country) {
  const m = POLICY_MEETINGS[country];
  if (!m) return [];
  return [
    ...m.dates.map((date) => ({ date, event: m.label, kind: 'cb', url: m.src })),
    ...(m.extra || []).map((e) => ({ ...e, url: m.src })),
  ];
}
