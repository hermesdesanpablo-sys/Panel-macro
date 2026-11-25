// Noticias de mercado minuto a minuto: titulares de feeds RSS públicos y de cuentas públicas de Bluesky (sin clave), unificados y
// ordenados por hora. Cada fuente va por separado: si una no responde queda marcada "no disponible" y el resto sigue (no se reporta
// como error del panel, porque algunas, como FinancialJuice, limitan consultas automáticas de forma intermitente).
// Etiquetas por palabras clave (español, portugués e inglés): bancos centrales, datos, mercados, política, y países.
// La misma noticia en varios medios se junta en un solo titular ("+N fuentes").
// X (Twitter): su API es paga y el scraping va contra sus términos; varias cuentas de noticias publican igual en Bluesky (API abierta).
import { getText, getJson } from '../util.js';

const gn = (q, hl, gl, ceid) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
const GN_ES = (gl) => ['es-419', gl, `${gl}:es-419`];

// key, label, topic, url | bsky (cuenta), country: país por defecto si el texto no nombra ninguno, cap: máximo de titulares por fuente,
// finance: solo titulares con tema de mercado (para fuentes generalistas), viaPublisher: Google Noticias (el medio va en el título).
export const FEEDS = [
  // Mercados globales
  { key: 'bbg-mkts', label: 'Bloomberg', topic: 'Mercados', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { key: 'bbg-eco', label: 'Bloomberg', topic: 'Economía', url: 'https://feeds.bloomberg.com/economics/news.rss' },
  { key: 'bbg-pol', label: 'Bloomberg', topic: 'Política', url: 'https://feeds.bloomberg.com/politics/news.rss' },
  { key: 'wsj-mkts', label: 'WSJ', topic: 'Mercados', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { key: 'wsj-world', label: 'WSJ', topic: 'Mundo', url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews' },
  { key: 'mw', label: 'MarketWatch', topic: 'Mercados', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { key: 'ft-mkts', label: 'Financial Times', topic: 'Mercados', url: 'https://www.ft.com/markets?format=rss', optional: true },
  { key: 'inv', label: 'Investing.com', topic: 'Mercados', url: 'https://www.investing.com/rss/news.rss' },
  { key: 'sa', label: 'Seeking Alpha', topic: 'Mercados', url: 'https://seekingalpha.com/market_currents.xml' },
  { key: 'fj', label: 'FinancialJuice', topic: 'Titulares rápidos', url: 'https://www.financialjuice.com/feed.ashx?xy=rss', optional: true, strip: /^FinancialJuice:\s*/i },
  // Bluesky (cuentas públicas; Reuters no tiene RSS abierto)
  { key: 'bs-reuters', label: 'Reuters', topic: 'Bluesky', bsky: 'reuters.com', finance: true },
  { key: 'bs-uw', label: 'Unusual Whales', topic: 'Bluesky', bsky: 'unusualwhales.bsky.social', finance: true },
  { key: 'bs-ap', label: 'AP', topic: 'Bluesky', bsky: 'apnews.com', finance: true },
  // Bancos centrales
  { key: 'fed', label: 'Fed', topic: 'Banco central', url: 'https://www.federalreserve.gov/feeds/press_all.xml', cb: true, country: 'us' },
  { key: 'ecb', label: 'BCE', topic: 'Banco central', url: 'https://www.ecb.europa.eu/rss/press.html', cb: true, country: 'eu' },
  { key: 'boj', label: 'BoJ', topic: 'Banco central', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', cb: true, country: 'jp', cap: 15 },
  { key: 'boe', label: 'BoE', topic: 'Banco central', url: 'https://www.bankofengland.co.uk/rss/news', cb: true, country: 'gb', cap: 15 },
  // Europa y Japón
  { key: 'euronews', label: 'Euronews', topic: 'Europa', finance: true, url: 'https://www.euronews.com/rss?level=vertical&name=business', country: 'eu', cap: 30 },
  { key: 'jt', label: 'Japan Times', topic: 'Japón', finance: true, url: 'https://www.japantimes.co.jp/business/feed/', country: 'jp' },
  { key: 'gn-eu', label: 'Google Noticias', topic: 'Europa', viaPublisher: true, finance: true, country: 'eu', cap: 30,
    url: gn('("European Central Bank" OR "euro zone economy" OR "eurozone inflation" OR "European stocks" OR "Bund yields" OR "German economy")', 'en-GB', 'GB', 'GB:en') },
  { key: 'gn-jp', label: 'Google Noticias', topic: 'Japón', viaPublisher: true, finance: true, country: 'jp', cap: 30,
    url: gn('("Bank of Japan" OR BOJ OR Nikkei OR yen OR JGB)', 'en-US', 'US', 'US:en') },
  { key: 'gn-cn', label: 'Google Noticias', topic: 'China', viaPublisher: true, finance: true, country: 'cn', cap: 25,
    url: gn('(PBOC OR yuan OR "China economy" OR "Hang Seng" OR "Chinese stocks")', 'en-US', 'US', 'US:en') },
  // América Latina: medios locales y Google Noticias por país (cada búsqueda con su propio país, para no sesgar hacia uno)
  { key: 'valor', label: 'Valor Econômico', topic: 'Brasil', url: 'https://valor.globo.com/rss/valor', country: 'br', cap: 40, optional: true },
  { key: 'infomoney', label: 'InfoMoney', topic: 'Brasil', url: 'https://www.infomoney.com.br/feed/', country: 'br' },
  { key: 'gn-br', label: 'Google Noticias', topic: 'Brasil', viaPublisher: true, finance: true, lang: 'pt', country: 'br', cap: 30,
    url: gn('(Ibovespa OR Copom OR Selic OR "dólar" OR Haddad OR "mercado financeiro" OR "juros futuros")', 'pt-BR', 'BR', 'BR:pt-419') },
  { key: 'gn-ar', label: 'Google Noticias', topic: 'Argentina', viaPublisher: true, finance: true, lang: 'es', country: 'ar', cap: 30,
    url: gn('(bonos OR "riesgo país" OR BCRA OR inflación OR dólar OR tasas OR Merval)', ...GN_ES('AR')) },
  { key: 'gn-mx', label: 'Google Noticias', topic: 'México', viaPublisher: true, finance: true, lang: 'es', country: 'mx', cap: 20,
    url: gn('(Banxico OR "peso mexicano" OR BMV OR Hacienda OR inflación OR "tasa de interés")', ...GN_ES('MX')) },
  { key: 'df', label: 'Diario Financiero', topic: 'Chile', url: 'https://www.df.cl/noticias/site/list/port/rss.xml', country: 'cl', cap: 25 },
  { key: 'gn-cl', label: 'Google Noticias', topic: 'Chile', viaPublisher: true, finance: true, lang: 'es', country: 'cl', cap: 15,
    url: gn('("Banco Central de Chile" OR IPSA OR "dólar en Chile" OR Hacienda OR IPC)', ...GN_ES('CL')) },
  { key: 'gn-co', label: 'Google Noticias', topic: 'Colombia', viaPublisher: true, finance: true, lang: 'es', country: 'co', cap: 15,
    url: gn('("Banco de la República" OR TES OR "dólar en Colombia" OR MinHacienda OR inflación)', ...GN_ES('CO')) },
  { key: 'gn-latam-en', label: 'Google Noticias', topic: 'Latin America', viaPublisher: true, finance: true, cap: 25,
    url: gn('(Argentina OR Brazil OR Mexico OR Chile OR Colombia OR Peru) (bonds OR peso OR real OR "central bank" OR economy)', 'en-US', 'US', 'US:en') },
];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
  // Etiquetas HTML respetando comillas (InfoMoney trae <img data-image-caption="<p>…</p>"> dentro de la descripción).
  .replace(/<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

/** RSS 2.0 (o 1.0 con dc:date) → [{ title, link, time (ISO), summary, publisher }]. */
export function parseRss(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const title = decode(tag(b, 'title'));
    const raw = decode(tag(b, 'pubDate') || tag(b, 'dc:date') || '');
    // Investing.com usa "2026-11-25 19:00:44" (UTC, sin zona).
    const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw);
    if (!title || !Number.isFinite(t)) continue;
    out.push({
      title, link: decode(tag(b, 'link')) || null, time: new Date(t).toISOString(),
      summary: decode(tag(b, 'description')).slice(0, 280) || null, publisher: decode(tag(b, 'source')) || null,
    });
  }
  return out;
}

/** Posts de una cuenta pública de Bluesky → mismo formato. El texto del post es el titular; el link, la nota enlazada si la hay. */
export function parseBsky(j, actor) {
  return (j?.feed || []).filter((f) => !f.reason && f.post?.record?.text).map((f) => {
    const p = f.post, rec = p.record, ext = p.embed?.external || rec.embed?.external;
    const text = rec.text.replace(/\s+/g, ' ').trim();
    return {
      title: (ext?.title && text.length < 25 ? ext.title : text).slice(0, 300),
      link: ext?.uri || `https://bsky.app/profile/${actor}/post/${p.uri.split('/').pop()}`,
      time: new Date(rec.createdAt).toISOString(), summary: ext?.title && ext.title !== text ? ext.title.slice(0, 280) : null, publisher: null,
    };
  });
}

// Etiquetas temáticas (se busca en título y resumen, sin distinguir mayúsculas). Palabras completas.
const TOPICS = [
  ['cb', 'Bancos centrales', /\b(fed|fomc|powell|ecb|bce|lagarde|boj|ueda|boe|banxico|copom|selic|bcra|banrep|bcch|bcrp|rbi|pboc|bank of (england|canada|japan)|central bank|banco central|rate (cut|hike|decision)s?|recorte de tasas?|suba de tasas?|corte de juros|alta de juros|taxa de juros|tasa de (inter[eé]s|pol[ií]tica)|monetary policy|pol[ií]tica monet[aá]ria)\b/i],
  ['data', 'Datos', /\b(cpi|ppi|pce|inflation|inflaci[oó]n|infla[cç][aã]o|ipca|gdp|pib|payrolls?|nonfarm|jobless|unemployment|desempleo|desemprego|pmi|retail sales|ventas minoristas|vendas no varejo|ipc|inpc|emae|industrial production|produ[cç][aã]o industrial|trade balance|balanza comercial|balan[cç]a comercial|tankan)\b/i],
  ['mkts', 'Mercados', /\b(stocks?|equit(y|ies)|bonds?|bonos|t[ií]tulos|treasur(y|ies)|yields?|rendimientos?|dollar|d[oó]lar|pesos?|oil|petr[oó]leo|crudo|gold|oro|ouro|nasdaq|s&p|wall street|merval|ibovespa|bolsa|a[cç][oõ]es|juros futuros|nikkei|hang seng|riesgo pa[ií]s|spreads?|embi|ipo|futures?|earnings|yen|euro|yuan|bitcoin|commodit(y|ies)|markets?|mercados?)\b/i],
  ['pol', 'Política', /\b(election|elecci[oó]n|elecciones|elei[cç][aã]o|congress|congreso|congresso|senate|senado|president|presidente|tariffs?|aranceles?|tarifas?|sanctions?|sanciones|government|gobierno|governo|milei|lula|sheinbaum|petro|boric|kast|trump|takaichi|macron|merz)\b/i],
];
// Países del panel (+ China y Reino Unido) con sus nombres y referentes en español, portugués e inglés.
const COUNTRIES = [
  ['ar', /\b(argentin\w*|milei|caputo|bcra|merval|indec|buenos aires)\b/i],
  ['br', /\b(brazil\w*|brasil\w*|lula|haddad|copom|selic|ibovespa|petrobras|ipca|real brasile[ñn]o)\b/i],
  ['mx', /\b(mexic\w*|m[eé]xic\w*|sheinbaum|banxico|pemex)\b/i],
  ['cl', /\b(chile\w*|boric|kast|bcch|codelco|ipsa)\b/i],
  ['co', /\b(colombi\w*|petro|banrep|ecopetrol)\b/i],
  ['pe', /\b(peru\w*|per[uú]\b|bcrp|lima)\b/i],
  ['uy', /\b(uruguay\w*)\b/i],
  ['ec', /\b(ecuador\w*|noboa)\b/i],
  // Sensible a mayúsculas a propósito: "US"/"U.S." pero no el pronombre "us".
  ['us', /(\bUS\b|U\.S\.|\bUnited States\b|EE\.?\s?UU|\bEstados Unidos\b|\bEUA\b|\bFed\b|\bFOMC\b|\bPowell\b|\bTreasur(y|ies)\b|\bWall Street\b|\bTrump\b|\bWhite House\b)/],
  ['eu', /\b(euro ?zone|euro area|eurozona|ecb|bce|lagarde|germany|german|alemania|france|french|francia|italy|italian|italia|spain|espa[nñ]a|bund|european union|uni[oó]n europea)\b/i],
  ['gb', /\b(britain|british|uk|u\.k\.|bank of england|boe|reeves|gilts?|ftse|reino unido)\b/i],
  ['ca', /\b(canad\w*|bank of canada)\b/i],
  ['jp', /\b(japan\w*|jap[oó]n|boj|nikkei|yen|ueda|tokyo|jgb|takaichi)\b/i],
  ['in', /\b(india\w*|rbi|nifty|sensex|modi|rupee|rupia)\b/i],
  ['cn', /\b(china|chinese|chin[oa]s?|beijing|pek[ií]n|pboc|yuan|xi jinping|hong kong|hang seng)\b/i],
];

const MKTS_UPPER = /\b(DAX|STOXX|FTSE|DOW|NYSE|TSX|IPSA|BMV)\b/; // siglas: solo en mayúsculas
export function classify(text) {
  const tags = TOPICS.filter(([, , re]) => re.test(text)).map(([k]) => k);
  if (!tags.includes('mkts') && MKTS_UPPER.test(text)) tags.push('mkts');
  const countries = COUNTRIES.filter(([, re]) => re.test(text)).map(([k]) => k);
  if (!countries.includes('eu') && /\b(DAX|STOXX)\b/.test(text)) countries.push('eu');
  return {
    tags,
    countries,
  };
}

const normTitle = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const STOP = new Set('the a an of to in on for and or with at by from as is are be after over its it this that de la el los las del en y o con por para un una al se su sus que a o os as do da dos das em no na nos nas um uma com por para e'.split(' '));
const words = (s) => new Set(normTitle(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
/** Parecido entre titulares (Jaccard sobre palabras con contenido). */
export function similarity(a, b) {
  const A = a instanceof Set ? a : words(a), B = b instanceof Set ? b : words(b);
  if (A.size < 3 || B.size < 3) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
// "Medios" de Google Noticias que no son noticias.
const NOT_NEWS = /^(facebook|instagram|youtube|tiktok|x|twitter|britannica|wikipedia|reddit|linkedin|pinterest|quora)\b/i;
const MAX_AGE_H = 48;
const MAX_ITEMS = 500;
const DUP_SIM = 0.5; // desde este parecido, dos titulares de 12 h o menos de diferencia se toman como la misma noticia
const DUP_WINDOW = 12 * 3600e3;

/** Une los titulares de todas las fuentes: sin duplicados, últimas 48 h, de la más nueva a la más vieja. */
export function mergeNews(perFeed, now = Date.now()) {
  const seen = new Set();
  const all = [];
  for (const { feed, items: list } of perFeed) {
    let n = 0;
    const sorted = [...list].sort((a, b) => (a.time < b.time ? 1 : -1));
    for (const it of sorted) {
      if (now - Date.parse(it.time) > MAX_AGE_H * 3600e3 || Date.parse(it.time) > now + 15 * 60e3) continue;
      // Google Noticias agrega " - Medio" al final del título: se separa como medio de origen.
      let title = feed.strip ? it.title.replace(feed.strip, '') : it.title, publisher = it.publisher;
      if (feed.viaPublisher) {
        const m = title.match(/^(.*) - ([^-]{2,60})$/);
        if (m) { title = m[1].trim(); publisher = publisher || m[2].trim(); }
      }
      if (publisher && NOT_NEWS.test(publisher)) continue;
      const k = normTitle(title);
      if (!k || seen.has(k)) continue;
      const c = classify(`${title} ${it.summary || ''}`);
      if (feed.finance && !c.tags.length) continue; // fuente generalista: solo temas de mercado
      if (feed.cap && n >= feed.cap) continue;
      seen.add(k);
      n++;
      if (feed.cb && !c.tags.includes('cb')) c.tags.unshift('cb');
      if (feed.country && !c.countries.length) c.countries.push(feed.country);
      all.push({
        id: `${feed.key}:${k.slice(0, 80)}`, title, link: it.link, time: it.time, summary: feed.viaPublisher ? null : it.summary,
        source: feed.viaPublisher && publisher ? `${publisher}` : feed.label, via: feed.viaPublisher ? feed.label : feed.bsky ? 'Bluesky' : null, feed: feed.key,
        lang: feed.lang || 'en', ...c,
      });
    }
  }
  all.sort((a, b) => (a.time < b.time ? 1 : -1));
  // La misma noticia en varios medios: queda el primero que la publicó y se agregan los demás como "también en".
  const out = [];
  const W = new Map(all.map((it) => [it, words(it.title)]));
  for (const it of [...all].reverse()) {
    const t = Date.parse(it.time);
    const dup = out.find((o) => Math.abs(Date.parse(o.time) - t) <= DUP_WINDOW && similarity(W.get(o), W.get(it)) >= DUP_SIM);
    if (dup) {
      (dup.also ||= []).push({ source: it.source, link: it.link });
      for (const c of it.countries) if (!dup.countries.includes(c)) dup.countries.push(c);
      for (const g of it.tags) if (!dup.tags.includes(g)) dup.tags.push(g);
    } else out.push(it);
  }
  return out.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, MAX_ITEMS);
}

async function fetchFeed(f) {
  if (f.bsky) return parseBsky(await getJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${f.bsky}&limit=60&filter=posts_no_replies`, { timeout: 12000 }), f.bsky);
  return parseRss(await getText(f.url, { timeout: 12000 }));
}

export default async function news() {
  const res = await Promise.all(FEEDS.map(async (f) => {
    try {
      return { feed: f, items: await fetchFeed(f), ok: true };
    } catch (e) {
      return { feed: f, items: [], ok: false, error: String(e.message || e).slice(0, 120) };
    }
  }));
  return {
    id: 'news',
    name: 'Noticias',
    items: mergeNews(res),
    sources: res.map((r) => ({ key: r.feed.key, label: r.feed.label, topic: r.feed.topic, ok: r.ok, count: r.items.length, error: r.error || null, optional: !!r.feed.optional })),
    topics: TOPICS.map(([k, label]) => ({ key: k, label })),
    errors: [],
  };
}
