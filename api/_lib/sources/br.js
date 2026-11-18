// Brasil: BCB SGS + BCB Olinda (Focus) + IBGE calendario + Yahoo.
import { getJson, clean, dmyToIso, toDmy, iso, daysAgo, daysAhead, settle, kpi, merge, thin, last, upcoming, valueAt } from '../util.js';
import { equityBlock } from '../yahoo.js';
import { meetingEvents } from '../calendar.js';

const SGS_URL = (code) => `https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?codigoSerie=${code}`;

// Códigos SGS: https://www3.bcb.gov.br/sgspub
export const SGS = {
  selic: 432, // Meta Selic definida pelo Copom (% a.a., diaria)
  selicEfetiva: 1178, // Selic efetiva anualizada base 252
  ipca12m: 13522, // IPCA acumulado 12 meses
  ipcaMes: 433, // IPCA variação mensal
  ptax: 1, // USD/BRL PTAX venda
  reservas: 13621, // Reservas internacionais – total (US$ mi, diária)
  desemprego: 24369, // Taxa de desocupação PNAD Contínua
};

export async function sgs(code, from) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${toDmy(from)}`;
  const j = await getJson(url);
  if (!Array.isArray(j)) throw new Error(`SGS ${code}: respuesta inesperada`);
  return clean(j.map((r) => ({ d: dmyToIso(r.data), v: parseFloat(String(r.valor).replace(',', '.')) })));
}

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';
function olinda(resource, params) {
  const qs = Object.entries({ ...params, $format: 'json' })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return getJson(`${OLINDA}/${resource}?${qs}`);
}

/** Focus anual: mediana de la última encuesta para año actual y 2 siguientes. */
export function parseFocusAnnual(rows) {
  if (!rows.length) return null;
  const lastDate = rows.reduce((m, r) => (r.Data > m ? r.Data : m), '');
  const latest = rows.filter((r) => r.Data === lastDate);
  const years = [...new Set(latest.map((r) => String(r.DataReferencia)))].sort().slice(0, 3);
  const order = ['IPCA', 'Selic', 'Câmbio', 'PIB Total'];
  const labels = { IPCA: 'IPCA (%)', Selic: 'Selic fin de año (%)', 'Câmbio': 'USD/BRL fin de año', 'PIB Total': 'PIB (%)' };
  return {
    title: 'Boletim Focus – medianas',
    asOf: lastDate,
    columns: ['Indicador', ...years],
    rows: order
      .filter((ind) => latest.some((r) => r.Indicador === ind))
      .map((ind) => [labels[ind], ...years.map((y) => latest.find((r) => r.Indicador === ind && String(r.DataReferencia) === y)?.Mediana ?? null)]),
    source: 'BCB – Olinda / ExpectativasMercadoAnuais',
    url: 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/aplicacao#!/recursos',
  };
}

/** Focus Selic por reunión del Copom: trayectoria esperada. */
export function parseFocusSelic(rows) {
  if (!rows.length) return null;
  const lastDate = rows.reduce((m, r) => (r.Data > m ? r.Data : m), '');
  const key = (r) => {
    const [n, y] = r.Reuniao.replace('R', '').split('/');
    return Number(y) * 100 + Number(n);
  };
  const path = rows
    .filter((r) => r.Data === lastDate)
    .sort((a, b) => key(a) - key(b))
    .map((r) => ({ label: r.Reuniao, rate: r.Mediana }));
  return {
    title: 'Selic esperada por reunión del Copom (Focus, mediana)',
    asOf: lastDate,
    kind: 'survey',
    path,
    source: 'BCB – Olinda / ExpectativasMercadoSelic',
    url: 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/aplicacao#!/recursos',
  };
}

/** Calendario IBGE (experimental): próximas divulgaciones relevantes. */
async function ibgeCalendar() {
  const mdY = (d) => {
    const [y, m, dd] = d.toISOString().slice(0, 10).split('-');
    return `${m}-${dd}-${y}`;
  };
  const j = await getJson(`https://servicodados.ibge.gov.br/api/v3/calendario/?qtd=200&de=${mdY(new Date())}&ate=${mdY(daysAhead(60))}`);
  const items = j.items || j || [];
  const re = /IPCA|PIB|Contas Nacionais|PNAD Contínua|Produção Industrial|Pesquisa Mensal de Comércio|Pesquisa Mensal de Serviços/i;
  return items
    .filter((i) => re.test(i.nome_produto || i.titulo || ''))
    .map((i) => ({
      date: dmyToIso(i.data_divulgacao),
      event: `IBGE – ${i.nome_produto || i.titulo}`,
      kind: 'data',
      url: 'https://www.ibge.gov.br/calendario-de-divulgacao.html',
    }));
}

/** Serie de medianas Focus de un indicador (para ver cómo se movió la expectativa). */
export function focusSeries(rows, indicador) {
  const byDate = new Map();
  for (const r of rows) if (!indicador || r.Indicador === indicador) byDate.set(r.Data, r.Mediana);
  return clean([...byDate].map(([d, v]) => ({ d, v })));
}

export default async function brazil() {
  const errors = [];
  const nextY = String(new Date().getUTCFullYear() + 1);
  const oneYearAgo = iso(daysAgo(400));
  const d = await settle(
    {
      'SGS 432 Selic meta': () => sgs(SGS.selic, daysAgo(730)),
      'SGS 13522 IPCA 12m': () => sgs(SGS.ipca12m, daysAgo(1100)),
      'SGS 433 IPCA m/m': () => sgs(SGS.ipcaMes, daysAgo(400)),
      'SGS 1 PTAX': () => sgs(SGS.ptax, daysAgo(400)),
      'SGS 13621 Reservas': () => sgs(SGS.reservas, daysAgo(400)),
      'SGS 24369 Desocupação': () => sgs(SGS.desemprego, daysAgo(800)),
      'Focus anual': () =>
        olinda('ExpectativasMercadoAnuais', {
          $top: 60,
          $filter: "(Indicador eq 'IPCA' or Indicador eq 'Selic' or Indicador eq 'Câmbio' or Indicador eq 'PIB Total') and baseCalculo eq 0",
          $orderby: 'Data desc',
          $select: 'Indicador,Data,DataReferencia,Mediana',
        }).then((j) => parseFocusAnnual(j.value || [])),
      'Focus anual – historia': () =>
        olinda('ExpectativasMercadoAnuais', {
          $top: 5000,
          $filter: `(Indicador eq 'IPCA' or Indicador eq 'Selic' or Indicador eq 'Câmbio') and DataReferencia eq '${nextY}' and baseCalculo eq 0 and Data ge '${oneYearAgo}'`,
          $orderby: 'Data asc',
          $select: 'Indicador,Data,Mediana',
        }).then((j) => j.value || []),
      'Focus IPCA 12m adelante': () =>
        olinda('ExpectativasMercadoInflacao12Meses', {
          $top: 2000,
          $filter: `Indicador eq 'IPCA' and Suavizada eq 'S' and baseCalculo eq 0 and Data ge '${oneYearAgo}'`,
          $orderby: 'Data asc',
          $select: 'Data,Mediana',
        }).then((j) => focusSeries(j.value || [])),
      'Focus Selic por reunión': () =>
        olinda('ExpectativasMercadoSelic', {
          $top: 40,
          $filter: 'baseCalculo eq 0',
          $orderby: 'Data desc',
          $select: 'Data,Reuniao,Mediana',
        }).then((j) => parseFocusSelic(j.value || [])),
      'Yahoo EWZ/^BVSP': () => equityBlock('EWZ', 'iShares MSCI Brazil (EWZ, USD)', '^BVSP', 'Ibovespa'),
      'IBGE calendario': ibgeCalendar,
    },
    errors
  );

  const selic = d['SGS 432 Selic meta'] || [];
  const ipca = d['SGS 13522 IPCA 12m'] || [];
  const ptax = d['SGS 1 PTAX'] || [];
  const focus = d['Focus anual'];
  const hist = d['Focus anual – historia'] || [];
  const ipca12f = d['Focus IPCA 12m adelante'] || [];
  const selicExp = focusSeries(hist, 'Selic');
  const ipcaNextExp = focusSeries(hist, 'IPCA');
  const fxExp = focusSeries(hist, 'Câmbio');
  const sgsSrc = (code) => ({ source: `BCB SGS ${code}`, url: SGS_URL(code) });
  const focusSrc = { source: 'BCB Olinda – Focus', url: 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/aplicacao#!/recursos' };

  // Tasa real ex-ante: Selic meta deflactada por IPCA esperado 12m adelante (Focus)
  const real = [];
  for (const p of ipca12f) {
    const s = valueAt(selic, p.d);
    if (s) real.push({ d: p.d, v: ((1 + s.v / 100) / (1 + p.v / 100) - 1) * 100 });
  }

  const kpis = [
    kpi({ key: 'policy', group: 'policy', label: 'Selic meta', series: selic, changeDays: 365, ...sgsSrc(432) }),
    kpi({ key: 'real', group: 'policy', label: 'Tasa real ex-ante', series: real, note: 'Selic / (1 + IPCA Focus 12m adelante)', source: 'Cálculo propio (SGS 432 + Focus)' }),
    kpi({ key: 'cpi', group: 'inflation', label: 'IPCA 12m', series: ipca, changeDays: 365, ...sgsSrc(13522) }),
    kpi({ key: 'cpi_m', group: 'inflation', label: 'IPCA último mes', series: d['SGS 433 IPCA m/m'] || [], ...sgsSrc(433) }),
    kpi({ key: 'exp_cpi', group: 'expectations', label: 'IPCA esperado 12m (Focus)', series: ipca12f, ...focusSrc }),
    kpi({ key: 'exp_rate', group: 'expectations', label: `Selic esperada fin ${nextY} (Focus)`, series: selicExp, ...focusSrc }),
    kpi({ key: 'exp_fx', group: 'expectations', label: `USD/BRL esperado fin ${nextY}`, series: fxExp, unit: '', decimals: 2, ...focusSrc }),
    kpi({ key: 'fx', group: 'fx', label: 'USD/BRL (PTAX)', series: ptax, unit: '', decimals: 4, changeDays: 365, ...sgsSrc(1) }),
    kpi({ key: 'reserves', group: 'fx', label: 'Reservas (US$ mn)', series: d['SGS 13621 Reservas'] || [], unit: '', decimals: 0, ...sgsSrc(13621) }),
    kpi({ key: 'unemp', group: 'activity', label: 'Desocupación', series: d['SGS 24369 Desocupação'] || [], ...sgsSrc(24369) }),
    { key: 'mkt_rate', group: 'market', label: 'DI futuro (mercado)', value: null, note: 'Sin API pública gratuita (B3/ANBIMA). Ver CLAUDE.md.', source: 'Pendiente' },
  ];

  return {
    id: 'br',
    name: 'Brasil',
    flag: '🇧🇷',
    currency: 'BRL',
    kpis,
    equity: d['Yahoo EWZ/^BVSP'],
    charts: [
      {
        id: 'policy-vs-cpi',
        title: 'Selic meta vs IPCA 12m',
        unit: '%',
        lines: [
          { key: 'selic', label: 'Selic meta', step: true },
          { key: 'ipca', label: 'IPCA 12m' },
        ],
        data: merge({ selic: thin(selic.filter((p) => p.d >= (ipca[0]?.d || ''))), ipca }),
      },
      { id: 'fx', title: 'USD/BRL – PTAX venta', unit: '', lines: [{ key: 'v', label: 'PTAX' }], data: merge({ v: ptax }) },
      {
        id: 'exp-rate',
        group: 'exp',
        title: `Selic meta vs Selic esperada fin ${nextY} (Focus)`,
        unit: '%',
        lines: [
          { key: 'meta', label: 'Selic meta', step: true },
          { key: 'exp', label: `Esperada fin ${nextY}` },
        ],
        data: merge({ meta: thin(selic.filter((p) => p.d >= oneYearAgo)), exp: selicExp }),
      },
      {
        id: 'exp-cpi',
        group: 'exp',
        title: 'Expectativas de inflación (Focus)',
        unit: '%',
        lines: [
          { key: 'f12', label: 'IPCA 12m adelante' },
          { key: 'fy', label: `IPCA ${nextY}` },
        ],
        data: merge({ f12: ipca12f, fy: ipcaNextExp }),
      },
    ],
    expectations: [focus].filter(Boolean),
    path: d['Focus Selic por reunión'],
    calendar: upcoming([...meetingEvents('br'), ...(d['IBGE calendario'] || [])]),
    errors,
  };
}
