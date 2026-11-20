// Noticias de mercado minuto a minuto: titulares de feeds RSS públicos (sin clave), unificados y ordenados por hora.
// Cada fuente va por separado: si una no responde queda marcada "no disponible" y el resto sigue (no se reporta como error del
// panel, porque algunas, como FinancialJuice, limitan consultas automáticas de forma intermitente).
// Etiquetas por palabras clave (español e inglés): bancos centrales, datos, mercados, política, y países del panel.
import { getText } from '../util.js';

export const FEEDS = [
  { key: 'bbg-mkts', label: 'Bloomberg', topic: 'Mercados', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  { key: 'bbg-eco', label: 'Bloomberg', topic: 'Economía', url: 'https://feeds.bloomberg.com/economics/news.rss' },
  { key: 'bbg-pol', label: 'Bloomberg', topic: 'Política', url: 'https://feeds.bloomberg.com/politics/news.rss' },
  { key: 'wsj-mkts', label: 'WSJ', topic: 'Mercados', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { key: 'wsj-world', label: 'WSJ', topic: 'Mundo', url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews' },
  { key: 'mw', label: 'MarketWatch', topic: 'Mercados', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { key: 'fed', label: 'Fed', topic: 'Banco central', url: 'https://www.federalreserve.gov/feeds/press_all.xml', cb: true },
  { key: 'ecb', label: 'BCE', topic: 'Banco central', url: 'https://www.ecb.europa.eu/rss/press.html', cb: true },
  {
    key: 'gn-latam', label: 'Google Noticias', topic: 'América Latina', lang: 'es', viaPublisher: true,
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(bonos OR "riesgo país" OR "banco central" OR inflación OR dólar OR tasas) when:1d') + '&hl=es-419&gl=AR&ceid=AR:es-419',
  },
  {
    key: 'gn-latam-en', label: 'Google News', topic: 'Latin America', viaPublisher: true,
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(Argentina OR Brazil OR Mexico OR Chile OR Colombia OR Peru) (bonds OR peso OR "central bank" OR economy) when:1d') + '&hl=en-US&gl=US&ceid=US:en',
  },
  { key: 'fj', label: 'FinancialJuice', topic: 'Titulares rápidos', url: 'https://www.financialjuice.com/feed.ashx?xy=rss', optional: true, strip: /^FinancialJuice:\s*/i },
];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

/** RSS 2.0 → [{ title, link, time (ISO), summary, publisher }]. */
export function parseRss(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const title = decode(tag(b, 'title'));
    const t = Date.parse(decode(tag(b, 'pubDate') || tag(b, 'dc:date') || ''));
    if (!title || !Number.isFinite(t)) continue;
    out.push({
      title, link: decode(tag(b, 'link')) || null, time: new Date(t).toISOString(),
      summary: decode(tag(b, 'description')).slice(0, 280) || null, publisher: decode(tag(b, 'source')) || null,
    });
  }
  return out;
}

// Etiquetas temáticas (se busca en título y resumen, sin distinguir mayúsculas). Palabras completas.
const TOPICS = [
  ['cb', 'Bancos centrales', /\b(fed|fomc|powell|ecb|bce|lagarde|boj|ueda|banxico|copom|selic|bcra|banrep|bcch|bcrp|rbi|boe|bank of (england|canada|japan)|central bank|banco central|rate (cut|hike|decision)s?|recorte de tasas?|suba de tasas?|tasa de (inter[eé]s|pol[ií]tica)|monetary policy|pol[ií]tica monetaria)\b/i],
  ['data', 'Datos', /\b(cpi|ppi|pce|inflation|inflaci[oó]n|gdp|pib|payrolls?|nonfarm|jobless|unemployment|desempleo|pmi|retail sales|ventas minoristas|ipc|ipca|emae|industrial production|trade balance|balanza comercial)\b/i],
  ['mkts', 'Mercados', /\b(stocks?|equit(y|ies)|bonds?|bonos|treasur(y|ies)|yields?|rendimientos?|dollar|d[oó]lar|pesos?|oil|petr[oó]leo|crudo|gold|oro|nasdaq|s&p|dow|wall street|merval|ibovespa|riesgo pa[ií]s|spreads?|embi|ipo|futures?)\b/i],
  ['pol', 'Política', /\b(election|elecci[oó]n|elecciones|congress|congreso|senate|senado|president|presidente|tariffs?|aranceles?|sanctions?|sanciones|government|gobierno|milei|lula|sheinbaum|petro|boric|trump)\b/i],
];
// Países del panel (+ China) con sus nombres y referentes en español e inglés.
const COUNTRIES = [
  ['ar', /\b(argentin\w*|milei|caputo|bcra|merval|indec|buenos aires)\b/i],
  ['br', /\b(brazil\w*|brasil\w*|lula|haddad|copom|selic|ibovespa|petrobras)\b/i],
  ['mx', /\b(mexic\w*|m[eé]xic\w*|sheinbaum|banxico|pemex)\b/i],
  ['cl', /\b(chile\w*|boric|bcch|codelco)\b/i],
  ['co', /\b(colombi\w*|petro|banrep|ecopetrol)\b/i],
  ['pe', /\b(peru\w*|per[uú]\b|bcrp|lima)\b/i],
  ['uy', /\b(uruguay\w*)\b/i],
  ['ec', /\b(ecuador\w*|noboa)\b/i],
  // Sensible a mayúsculas a propósito: "US"/"U.S." pero no el pronombre "us".
  ['us', /(\bUS\b|U\.S\.|\bUnited States\b|EE\.?\s?UU|\bEstados Unidos\b|\bFed\b|\bFOMC\b|\bPowell\b|\bTreasur(y|ies)\b|\bWall Street\b|\bTrump\b|\bWhite House\b)/],
  ['eu', /\b(euro ?zone|euro area|eurozona|ecb|bce|lagarde|germany|alemania|france|francia|italy|italia|spain|espa[nñ]a)\b/i],
  ['ca', /\b(canad\w*|bank of canada)\b/i],
  ['jp', /\b(japan\w*|jap[oó]n|boj|nikkei|yen|ueda|tokyo)\b/i],
  ['in', /\b(india\w*|rbi|nifty|sensex|modi|rupee|rupia)\b/i],
  ['cn', /\b(china|chinese|chin[oa]s?|beijing|pek[ií]n|pboc|yuan|xi jinping|hong kong)\b/i],
];

export function classify(text) {
  return {
    tags: TOPICS.filter(([, , re]) => re.test(text)).map(([k]) => k),
    countries: COUNTRIES.filter(([, re]) => re.test(text)).map(([k]) => k),
  };
}

const normTitle = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const MAX_AGE_H = 48;
const MAX_ITEMS = 400;

/** Une los titulares de todas las fuentes: sin duplicados (mismo título), últimas 48 h, de la más nueva a la más vieja. */
export function mergeNews(perFeed, now = Date.now()) {
  const seen = new Set();
  const items = [];
  for (const { feed, items: list } of perFeed) {
    for (const it of list) {
      if (now - Date.parse(it.time) > MAX_AGE_H * 3600e3 || Date.parse(it.time) > now + 15 * 60e3) continue;
      // Google Noticias agrega " - Medio" al final del título: se separa como medio de origen.
      let title = feed.strip ? it.title.replace(feed.strip, '') : it.title, publisher = it.publisher;
      if (feed.viaPublisher) {
        const m = title.match(/^(.*) - ([^-]{2,60})$/);
        if (m) { title = m[1].trim(); publisher = publisher || m[2].trim(); }
      }
      const k = normTitle(title);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const c = classify(`${title} ${it.summary || ''}`);
      if (feed.cb && !c.tags.includes('cb')) c.tags.unshift('cb');
      items.push({
        id: `${feed.key}:${k.slice(0, 80)}`, title, link: it.link, time: it.time, summary: feed.viaPublisher ? null : it.summary,
        source: feed.viaPublisher && publisher ? `${publisher}` : feed.label, via: feed.viaPublisher ? feed.label : null, feed: feed.key,
        lang: feed.lang || 'en', ...c,
      });
    }
  }
  return items.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, MAX_ITEMS);
}

export default async function news() {
  const res = await Promise.all(FEEDS.map(async (f) => {
    try {
      const list = parseRss(await getText(f.url, { timeout: 12000 }));
      return { feed: f, items: list, ok: true };
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
