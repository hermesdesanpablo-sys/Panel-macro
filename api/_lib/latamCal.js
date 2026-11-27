// Publicaciones de inflación de América Latina para el calendario económico (Forex Factory no las cubre).
// Fecha oficial del instituto, consenso de la encuesta del banco central y dato oficial:
// - Brasil: IBGE (fecha en vivo), Focus del BCB (mediana mensual del IPCA para ese mes), SGS 433 (IPCA m/m) y 7478 (IPCA-15 m/m; sin consenso).
// - Argentina: INDEC (calendario oficial, estático), REM del BCRA (mediana del IPC del mes), BCRA serie 27 (IPC m/m).
import { getJson } from './util.js';
import { sgs } from './sources/br.js';
import { bcra, BCRA, rem } from './sources/ar.js';
import { DATA_RELEASES } from './calendar.js';

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';
const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const pct = (v, dec) => (v == null || !Number.isFinite(v) ? null : `${v.toFixed(dec)}%`);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const surprise = (a, f) => (a == null || f == null ? null : (() => { const diff = +(a - f).toFixed(2); return { diff, unit: '%', dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' }; })());

async function focusMonthly(refMonth, before) {
  const [y, m] = refMonth.split('-');
  const q = new URLSearchParams({
    $filter: `Indicador eq 'IPCA' and DataReferencia eq '${m}/${y}' and baseCalculo eq 0 and Data lt '${before}'`, $orderby: 'Data desc', $top: '1', $format: 'json',
  });
  const j = await getJson(`${OLINDA}/ExpectativaMercadoMensais?${q.toString().replace(/\+/g, '%20')}`);
  return j.value?.[0] || null;
}

/** Brasil: IPCA e IPCA-15 publicados entre `from` y `to` (AAAA-MM-DD). */
export async function brazilInflation(from, to) {
  const mdY = (iso) => { const [y, m, d] = iso.split('-'); return `${m}-${d}-${y}`; };
  const j = await getJson(`https://servicodados.ibge.gov.br/api/v3/calendario/?qtd=100&de=${mdY(from)}&ate=${mdY(to)}`);
  const items = (j.items || j || []).map((i) => ({ name: (i.nome_produto || i.titulo || '').trim(), when: i.data_divulgacao }))
    .filter((i) => /^Índice Nacional de Preços ao Consumidor Amplo( 15)?$/i.test(i.name))
    .filter((i) => { const [d, m, y] = i.when.slice(0, 10).split('/'); const iso = `${y}-${m}-${d}`; return iso >= from && iso <= to; });
  if (!items.length) return [];
  const [ipca, ipca15] = await Promise.all([sgs(433, new Date(Date.now() - 500 * 864e5)), sgs(7478, new Date(Date.now() - 500 * 864e5))]);
  const val = (s, ym) => s.find((p) => p.d.startsWith(ym))?.v ?? null;
  return Promise.all(items.map(async (i) => {
    const [d, m, y] = i.when.slice(0, 10).split('/');
    const date = `${y}-${m}-${d}`;
    const time = new Date(`${date}T${i.when.slice(11, 19) || '12:00:00'}Z`).toISOString(); // IBGE informa la hora en UTC (12:00 = 09:00 de Brasilia)
    const is15 = / 15$/.test(i.name);
    // IPCA: mes anterior a la publicación. IPCA-15: mes de la publicación.
    const ref = is15 ? date.slice(0, 7) : prevMonth(date.slice(0, 7));
    const s = is15 ? ipca15 : ipca;
    const released = Date.parse(time) <= Date.now();
    const actual = released ? val(s, ref) : null;
    const f = is15 ? null : await focusMonthly(ref, date).catch(() => null);
    return {
      id: `br-${is15 ? 'ipca15' : 'ipca'}-${ref}`, time, ccy: 'BRL', flag: 'br', impact: 'high', kind: 'data',
      title: `${is15 ? 'IPCA-15' : 'IPCA'} m/m (${MESES[Number(ref.slice(5)) - 1]})`,
      actual: pct(actual, 2), previous: pct(val(s, prevMonth(ref)), 2),
      forecast: f ? pct(f.Mediana, 2) : null, forecastNote: f ? `Mediana Focus (BCB) del ${f.Data}, ${f.numeroRespondentes} respuestas` : is15 ? 'Focus no releva el IPCA-15' : undefined,
      surprise: surprise(actual, f?.Mediana), actualSrc: actual != null ? `BCB SGS ${is15 ? 7478 : 433}` : undefined,
      url: 'https://www.ibge.gov.br/calendario-de-divulgacao.html',
    };
  }));
}

/** Argentina: IPC de INDEC publicado entre `from` y `to`, con la mediana del REM. */
export async function argentinaInflation(from, to) {
  const items = (DATA_RELEASES.ar?.items || []).filter(([date, ev]) => date >= from && date <= to && /IPC de (\w+)/.test(ev));
  if (!items.length) return [];
  const [ipc, R] = await Promise.all([bcra(BCRA.inflM, new Date(Date.now() - 500 * 864e5)), rem().catch(() => null)]);
  const sec = Object.entries(R?.secciones || {}).find(([k]) => /IPC nivel general/i.test(k))?.[1] || [];
  return items.map(([date, ev]) => {
    const mes = MESES.indexOf(/IPC de (\w+)/.exec(ev)[1].toLowerCase());
    const y = Number(date.slice(0, 4)) - (mes + 1 > Number(date.slice(5, 7)) ? 1 : 0);
    const ref = `${y}-${String(mes + 1).padStart(2, '0')}`;
    const time = new Date(`${date}T16:00:00-03:00`).toISOString();
    const released = Date.parse(time) <= Date.now();
    const actual = released ? ipc.find((p) => p.d.startsWith(ref))?.v ?? null : null;
    const f = sec.find((r) => r.periodo === ref)?.mediana ?? null;
    return {
      id: `ar-ipc-${ref}`, time, ccy: 'ARS', flag: 'ar', impact: 'high', kind: 'data', title: `IPC m/m (${MESES[mes]})`,
      actual: pct(actual, 1), previous: pct(ipc.find((p) => p.d.startsWith(prevMonth(ref)))?.v ?? null, 1),
      forecast: pct(f, 1), forecastNote: f != null ? `Mediana REM (BCRA)${R?.relevamiento ? `, ${R.relevamiento}` : ''}` : undefined,
      surprise: surprise(actual, f), actualSrc: actual != null ? 'BCRA serie 27 (INDEC)' : undefined, url: DATA_RELEASES.ar.src,
    };
  });
}

// ---------- México, Chile y Colombia ----------
import { sie } from './sources/mx.js';
import { bdeApi } from './sources/cl.js';
import { SUA, ipcFromUvr } from './sources/co.js';
import { suameca } from './suameca.js';
import { emeHistory } from './eme.js';

const monthRef = (ev, date) => {
  const mes = MESES.indexOf((/de (\w+)/.exec(ev)?.[1] || '').toLowerCase());
  if (mes < 0) return null;
  const y = Number(date.slice(0, 4)) - (mes + 1 > Number(date.slice(5, 7)) ? 1 : 0);
  return { mes, ref: `${y}-${String(mes + 1).padStart(2, '0')}` };
};
const at = (s, ym) => s.find((p) => p.d.startsWith(ym))?.v ?? null;
/** Dos filas (m/m y a/a) por publicación mensual de IPC. timeLocal: hora oficial con desvío, o null si no se conoce. */
function cpiRows({ id, ccy, flag, date, timeLocal, ref, mes, mom, yoy, dec, forecast, forecastNote, src, url, label = 'IPC' }) {
  const time = new Date(`${date}T${timeLocal || '12:00:00-03:00'}`).toISOString();
  const released = Date.parse(time) <= Date.now();
  const row = (kind, s, f, fNote) => {
    const a = released ? at(s, ref) : null;
    return {
      id: `${id}-${kind}-${ref}`, time, timeKnown: !!timeLocal, ccy, flag, impact: kind === 'mom' ? 'high' : 'medium', kind: 'data',
      title: `${label} ${kind === 'mom' ? 'm/m' : 'a/a'} (${MESES[mes]})`, actual: pct(a, dec), previous: pct(at(s, prevMonth(ref)), dec),
      forecast: pct(f, dec), forecastNote: fNote, surprise: surprise(a, f), actualSrc: a != null ? src : undefined, url,
    };
  };
  return [row('mom', mom, forecast, forecastNote), ...(yoy ? [row('yoy', yoy, null, undefined)] : [])];
}

/** México: INPC mensual (INEGI, 06:00 CDMX). Dato: Banxico SIE (SP30577 m/m, SP30578 a/a). Sin consenso: la encuesta de Banxico no releva la inflación mensual. */
export async function mexicoInflation(from, to) {
  const items = (DATA_RELEASES.mx?.items || []).filter(([d, ev]) => d >= from && d <= to && /INPC de \w+/.test(ev));
  if (!items.length) return [];
  const s = await sie(['SP30577', 'SP30578'], new Date(Date.now() - 500 * 864e5));
  return items.flatMap(([date, ev]) => {
    const r = monthRef(ev, date);
    return r ? cpiRows({ id: 'mx-inpc', ccy: 'MXN', flag: 'mx', date, timeLocal: '06:00:00-06:00', ...r, mom: s.SP30577 || [], yoy: s.SP30578 || [], dec: 2,
      forecastNote: 'La encuesta de Banxico no releva la inflación mensual', src: 'Banxico SIE (INEGI)', url: DATA_RELEASES.mx.src, label: 'INPC' }) : [];
  });
}

/** Chile: IPC (INE, 08:00). Consenso: EOF del BCCh, inflación del "mes actual" de la última encuesta de ese mes. Dato: BCCh (variaciones del INE). */
export async function chileInflation(from, to) {
  const items = (DATA_RELEASES.cl?.items || []).filter(([d, ev]) => d >= from && d <= to && /IPC de \w+/.test(ev));
  if (!items.length) return [];
  if (!process.env.BCCH_API_TOKEN) return []; // sin token de la API del BCCh no hay series de IPC ni EOF (los cuadros públicos no traen la EOF diaria)
  const since = new Date(Date.now() - 500 * 864e5);
  // F074.IPC.VAR.Z.Z.C.M = variación mensual; F074.IPC.IND.Z.EP09.C.M = variación anual (pese al "IND" del código).
  const [mom, yoy, eof] = await Promise.all([bdeApi('F074.IPC.VAR.Z.Z.C.M', since), bdeApi('F074.IPC.IND.Z.EP09.C.M', since), bdeApi('F089.EOF.VII.MA.D', new Date(Date.now() - 120 * 864e5))]);
  return items.flatMap(([date, ev]) => {
    const r = monthRef(ev, date);
    if (!r) return [];
    const f = eof.filter((p) => p.d.startsWith(r.ref) && p.d < date).at(-1);
    return cpiRows({ id: 'cl-ipc', ccy: 'CLP', flag: 'cl', date, timeLocal: '08:00:00-03:00', ...r, mom, yoy, dec: 1,
      forecast: f?.v ?? null, forecastNote: f ? `Mediana EOF (BCCh) del ${f.d}, mes en curso` : 'Sin EOF de ese mes', src: 'BCCh BDE (INE)', url: DATA_RELEASES.cl.src });
  });
}

/** Colombia: IPC (DANE). a/a: serie oficial del BanRep (Suameca 15270); m/m: derivado de la UVR (coincide con el DANE). Ambos se muestran
 *  recién después de la publicación. Consenso: mediana de la EME del BanRep para la inflación mensual del mes de la encuesta. */
export async function colombiaInflation(from, to) {
  const items = (DATA_RELEASES.co?.items || []).filter(([d, ev]) => d >= from && d <= to && /IPC de \w+/.test(ev));
  if (!items.length) return [];
  const since = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);
  const [uvrR, yoyR, eme] = await Promise.all([suameca(SUA.uvr), suameca(SUA.cpi).catch(() => null), emeHistory().catch(() => null)]);
  const uvr = uvrR.series.filter((p) => p.d >= since);
  const fromUvr = ipcFromUvr(uvr);
  const yoy = yoyR?.series?.length ? yoyR.series : fromUvr;
  // m/m de M = UVR(15 de M+2) / UVR(15 de M+1) − 1 (la UVR traslada el IPC del mes anterior entre el 16 y el 15).
  const um = new Map(uvr.map((p) => [p.d, p.v]));
  const d15 = (y, m) => new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
  const mom = fromUvr.map((p) => { const [y, m] = p.d.split('-').map(Number); const a = um.get(d15(y, m + 1)), b = um.get(d15(y, m)); return a && b ? { d: p.d, v: Math.round((a / b - 1) * 10000) / 100 } : null; }).filter(Boolean);
  return items.flatMap(([date, ev]) => {
    const r = monthRef(ev, date);
    // DANE publica el IPC a las 18:00 de Bogotá.
    if (!r) return [];
    const f = eme?.infl.mom.filter((p) => p.d.startsWith(r.ref) && p.d < date).at(-1);
    return cpiRows({ id: 'co-ipc', ccy: 'COP', flag: 'co', date, timeLocal: '18:00:00-05:00', ...r, mom, yoy, dec: 2,
      forecast: f?.v ?? null, forecastNote: f ? `Mediana EME (BanRep) del ${f.d}` : 'Sin EME de ese mes',
      src: 'BanRep Suameca (DANE); m/m calculado con la UVR', url: DATA_RELEASES.co.src });
  });
}
