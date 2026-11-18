# CLAUDE.md — Macro Monitor

Contexto para Claude Code. Leer entero antes de tocar código.

## Qué es

Dashboard macro con un panel por país (Brasil, EE.UU., Eurozona, México, Canadá, Colombia), una vista
**Mundo** (tendencias y comparativo entre países + mercados globales) y una **Agenda** consolidada.
Dueño: Hermes (renta fija / mercado de capitales, Argentina). Idioma de la UI y de los comentarios: español.

Objetivo de cada panel:
1. **Nivel actual**: tasa de política, inflación, expectativas, tasas de mercado, FX, índice (proxy MSCI).
2. **Dinámica**: cómo se movió cada variable a 1/3/6/12 meses (¿sube la inflación? ¿suben las
   expectativas de tasa? ¿se deprecia la moneda?).
3. **Expectativas**: encuesta y/o mercado, hoy y su evolución.
4. **Agenda**: próximas decisiones de banco central y publicaciones de datos.

## Arquitectura

```
api/country.js              GET /api/country?c=br|us|eu|mx|ca|co|world  (función serverless Vercel, cache edge 30 min)
api/_lib/util.js            HTTP, fechas, series, kpi(), trend(), spreadSeries(), settle()
api/_lib/yahoo.js           Yahoo Finance: precios, perf, futuros Fed funds (ZQ)
api/_lib/calendar.js        Fechas de reuniones de bancos centrales (estático, revisar 1 vez/año)
api/_lib/sources/<pais>.js  Un adaptador por país. Devuelve el "contrato de payload" (abajo)
src/App.jsx                 Tabs, carga en paralelo de todos los países, modo ?mock=1
src/components/Panels.jsx   Kpi, Dynamics, CountryPanel, TrendsTable, WorldPanel, AgendaList
src/components/Charts.jsx   TimeChart, PathChart, Spark (Recharts)
scripts/smoke.mjs           Prueba contra las APIs REALES (requiere .env)
scripts/test-parsers.mjs    Test offline con fetch simulado + genera src/mock-data.json
scripts/mock-fetch.mjs      fetch falso: imita el FORMATO de cada API con datos sintéticos
scripts/dev-api.mjs         Servidor local de /api (alternativa a `vercel dev`)
```

Por qué serverless: los navegadores bloquean (CORS) varias de estas APIs y las claves no pueden ir al
cliente. Mismo patrón que `portfolio-terminal` (Vercel functions que hacen de proxy).

### Contrato de payload (cada adaptador)

```js
{
  id, name, flag, currency,
  kpis: [{ key, group, label, value, unit, decimals, date, source, url, note,
           trend: {m1,m3,m6,m12}, trendUnit: 'pb'|'%', direction: 'up'|'down'|'flat', spark: [{d,v}] }],
  charts: [{ id, title, unit, group?: 'exp', lines: [{key,label,step?}], data: [{d, ...}] }],
  equity: { msci: {ticker,label,series,perf}, local: {...} },
  expectations: [{ title, columns, rows, asOf, source, url }],   // tablas (p.ej. Focus)
  path: { title, kind: 'survey'|'market', path: [{label,rate}], current, source, url, note } | null,
  calendar: [{ date, event, kind: 'cb'|'data', url }],
  errors: [{ source, message }],
}
```

Reglas del contrato:
- `kpi()` calcula solo la tendencia y el sparkline. Para tasas/inflación (`unit '%'`) la variación va en **pb**;
  para niveles (FX, reservas, índices) en **%**.
- Keys que usa la vista Mundo: `policy`, `cpi`, `y2`, `fx`, `exp_rate`, `exp_cpi`. Mantenerlas en todo país nuevo.
- `group` ∈ policy | inflation | expectations | market | fx | activity (ordena la tabla de Dinámica).
- Toda fuente va dentro de `settle()`: si falla, se registra en `errors` y el resto del panel sigue.
- KPI sin fuente todavía: `{ key, group, label, value: null, note, source: 'Pendiente' }`.

## Comandos

```bash
npm install
node --env-file=.env scripts/smoke.mjs            # todas las fuentes reales; o: ... smoke.mjs co br
npm test                                          # offline; debe terminar en "OK"
node --env-file=.env scripts/dev-api.mjs          # API local :3001
npm run dev                                       # Vite :5173 (proxy /api → :3001)
# UI sin red: http://localhost:5173/?mock=1   (datos sintéticos, con cartel "DATOS DE EJEMPLO")
npm run build
```

Después de cambiar un adaptador: correr `npm test` (y actualizar `scripts/mock-fetch.mjs` si cambió el
formato) y `smoke` para ese país.

## Cuentas y credenciales — CHECKLIST PARA HERMES

| # | Qué | Para qué | Dónde se crea | Variable / lugar | Estado |
|---|---|---|---|---|---|
| 1 | Repo GitHub | Historial y deploy | github.com/new | — | ☐ |
| 2 | Proyecto Vercel (cuenta existente) | Hosting + funciones | `vercel link` o importar repo | — | ☐ |
| 3 | FRED API key | EE.UU. completo; IPC Colombia fallback | https://fredaccount.stlouisfed.org/apikeys | `FRED_API_KEY` | ☐ |
| 4 | Banxico SIE token | México completo | https://www.banxico.org.mx/SieAPIRest/service/v1/token | `BANXICO_TOKEN` | ☐ |
| 5 | (opcional) Token de app datos.gov.co | Evita rate limit de la TRM | https://www.datos.gov.co/profile/edit/developer_settings | `SOCRATA_APP_TOKEN` (no implementado aún) | ☐ |
| 6 | (opcional) LSEG / Trading Economics | DI futuro, OIS, swaps, TES, encuestas | Conectores ya usados por Hermes | a definir | ☐ |

Sin cuenta: BCB (SGS/Olinda), IBGE, BCE, Bank of Canada (Valet), BanRep (SDMX), Yahoo.

Cómo cargarlas:
- Local: copiar `.env.example` → `.env` y completar. **`.env` está en .gitignore; no commitear.**
- Vercel: Project → Settings → Environment Variables (Production y Preview) → redeploy.
- Hermes completa la columna Estado. Nunca pegar claves en este archivo.

## Cómo seguimos (handoff desde claude.ai, 18-nov-2026)

El proyecto se armó en una conversación de claude.ai y se continúa acá, en Claude Code.
Repo: `hermesdesanpablo-sys/Panel-macro` (**público**: nunca commitear `.env` ni claves). Cuenta GitHub a usar: **hermesdesanpablo-sys**
(no `Hermeslatin` ni la org `Latin-Securities`).

### Conexiones que faltan

| Conexión | Para qué | Quién | Estado |
|---|---|---|---|
| GitHub `hermesdesanpablo-sys` ↔ Claude Code | Trabajar y pushear desde Claude Code | Hermes | ☐ |
| Vercel ↔ repo `hermesdesanpablo-sys/Panel-macro` | Deploy automático en cada push a `main` | Hermes | ☐ |
| `FRED_API_KEY` en `.env` y en Vercel | EE.UU. + IPC Colombia de respaldo | Hermes | ☐ |
| `BANXICO_TOKEN` en `.env` y en Vercel | México | Hermes | ☐ |
| (opcional) Conector LSEG en Claude | DI futuro, OIS, swaps, TES/Mbono | Hermes | ☐ |
| (opcional) Base de datos chica en Vercel (KV/Postgres) + cron | Fotos diarias para historia de expectativas | Claude Code, con OK de Hermes | ☐ |

### Próximos pasos, en orden

1. `npm install` y `npm test` (debe dar OK sin red).
2. Con `.env` completo: `node --env-file=.env scripts/smoke.mjs` y arreglar todo lo ⚠ de la tabla de abajo.
   Registrar en `CHANGELOG.md` qué códigos se confirmaron o cambiaron.
3. Completar los calendarios faltantes (Banxico 2027, BanRep dic-2026 y 2027).
4. Deploy en Vercel y revisar los 7 paneles con datos reales.
5. Decidir con Hermes sobre las fotos diarias (pendiente 6) y sobre LSEG (pendiente 7).

## Estado por país

Leyenda: ✅ implementado y testeado offline · ⚠ implementado, código/ID **sin verificar contra la API real** · ❌ pendiente

**Nada se probó todavía contra las APIs reales** (el entorno donde se escribió no tenía salida a internet).
Primera tarea en Claude Code: correr `smoke` y arreglar lo que falle. Las filas ⚠ son las más probables de fallar.

| País | Tasa política | Inflación | Expectativas | Tasas mercado | FX | Índice | Agenda |
|---|---|---|---|---|---|---|---|
| 🇧🇷 | ✅ SGS 432 | ✅ SGS 13522/433 | ✅ Focus anual, Selic por reunión; ⚠ Focus IPCA 12m (`ExpectativasMercadoInflacao12Meses`), historia anual | ❌ DI futuro | ✅ SGS 1 | ✅ EWZ/^BVSP | ✅ Copom; ⚠ IBGE API calendario |
| 🇺🇸 | ✅ FRED | ✅ FRED (a/a calculado) | ⚠ ZQ en Yahoo (strip + historia +12m); ✅ breakeven 5Y | ✅ DGS2/10 | ✅ DXY | ✅ EUSA/^GSPC | ✅ FOMC + FRED releases |
| 🇪🇺 | ✅ DFR | ✅ HICP | ⚠ forwards AAA `IF_*`; ⚠ SPF LT | ✅ AAA 2Y/10Y | ✅ | ✅ EZU/^STOXX50E | ✅ BCE |
| 🇲🇽 | ✅ SF61745 | ⚠ SP30578 | ❌ Encuesta Banxico (IDs) | ✅ Cetes/TIIE; ❌ Mbono 10Y | ✅ FIX | ✅ EWW/^MXX | ⚠ solo dic-2026; ❌ 2027 |
| 🇨🇦 | ✅ V39079 | ⚠ V41690973; ✅ CPI-trim/median | proxy 2Y − overnight | ✅ GoC 2Y/10Y | ✅ | ✅ EWC/^GSPTSE | ✅ BoC |
| 🇨🇴 | ⚠ flujo descubierto en catálogo | ⚠ flujo descubierto; fallback FRED OCDE | proxy IBR 6M − política; ❌ Encuesta BanRep | ⚠ IBR (elección de serie); ❌ TES | ⚠ datos.gov.co 32sa-8pi3; fallback BanRep | ⚠ GXG / ICOLCAP.CL | ❌ fechas JDBR |

### Notas de Colombia (BanRep SDMX)

- Endpoint: `https://totoro.banrep.gov.co/nsi-jax-ws/rest/data/ESTAT,<FLOW>,1.0/all/ALL/?startPeriod=<AAAA>`
  con `Accept: application/vnd.sdmx.genericdata+xml;version=2.1`. **Solo XML** (JSON/CSV → 406, según reportes de terceros).
- Flujos confirmados por documentación: `DF_TRM_DAILY_HIST`, `DF_IBR_DAILY_HIST`, `DF_DTF_DAILY_HIST`.
- La tasa de política y el IPC se **descubren** buscando por nombre en `/dataflow/ESTAT/all/latest`.
  Cuando `smoke` muestre el ID correcto, fijarlo en `.env` (`BANREP_FLOW_POLICY`, `BANREP_FLOW_CPI`) o en `BANREP_FLOWS`.
- IBR trae varias series (plazos × nominal/efectiva). Si la regex de `SERIES_PICK` no encuentra el plazo,
  el error lista las claves disponibles: copiar la clave correcta a `BANREP_IBR_ON` / `BANREP_IBR_6M`.
- `startPeriod` solo respeta el año; el filtro fino de fechas se hace del lado del cliente.

## Pendientes priorizados

1. **Correr `smoke` y arreglar los ⚠** (códigos de serie, flujos BanRep, tickers Yahoo `ZQ…CBT` y `ICOLCAP.CL`).
2. Calendarios: fechas 2027 de Banxico y JDBR (dic-2026 y 2027) en `api/_lib/calendar.js`. Fuentes:
   https://www.banxico.org.mx/publicaciones-y-prensa/calendario-de-publicaciones.html ·
   https://www.banrep.gov.co/es/calendario-junta-directiva (la JDBR decide al final de ene, mar, abr, jun, jul, sep, oct y dic).
3. México: IDs SIE de la Encuesta de Expectativas (`SIE_EXPECTATIONS` en `mx.js`) y del Mbono 10Y.
4. Colombia: Encuesta mensual de expectativas de BanRep (Excel → parser o carga manual), TES 10Y.
5. Agenda de datos para MX (INEGI), CA (StatCan), CO (DANE), EZ (Eurostat): hoy solo hay BR (IBGE) y EE.UU. (FRED).
6. Persistir snapshots diarios (p.ej. Vercel KV / Postgres + cron) para tener historia propia de variables
   que la fuente no guarda (strip de futuros completo, forwards por plazo, encuestas).
7. Si se conecta LSEG: adaptador `lseg` para DI futuro, OIS (USD/EUR/CAD), swaps TIIE/IBR y TES/Mbono.

## Convenciones

- Español en UI, comentarios y commits. Fechas ISO internas (`yyyy-mm-dd`); en UI `fmtDate`.
- Series siempre `[{d, v}]` ordenadas asc (`clean()`).
- Gráficos: **nunca dos ejes Y**. Máximo 3 series por gráfico (paleta validada para daltonismo: `--series-1..3`).
- Cada número muestra su fuente (`source` + `url`). Los cálculos propios se rotulan "Cálculo propio".
- No inventar datos: si no hay fuente, KPI `n/d` con `source: 'Pendiente'` y nota de por qué.
- Las claves solo en variables de entorno.

## Registro

Ver `CHANGELOG.md`. Agregar una entrada por cada sesión de trabajo (qué cambió, qué se verificó y qué falta).
