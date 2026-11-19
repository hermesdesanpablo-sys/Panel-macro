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
};

export function meetingEvents(country) {
  const m = POLICY_MEETINGS[country];
  if (!m) return [];
  return [
    ...m.dates.map((date) => ({ date, event: m.label, kind: 'cb', url: m.src })),
    ...(m.extra || []).map((e) => ({ ...e, url: m.src })),
  ];
}
