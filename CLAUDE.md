# CLAUDE.md — Macro Monitor

Contexto para Claude Code. Leer entero antes de tocar código.

## Qué es

Dashboard macro con un panel por país (Brasil, EE.UU., Eurozona, México, Canadá, Colombia, Chile, Japón), una vista
**Mundo** (cuadros tipo terminal + panel lateral "Hoy", tendencias y comparativo entre países), una solapa
**Comparar** (dos países lado a lado), una solapa **Crédito USD** (spread EMBI de América Latina y curvas de los
bonos soberanos en dólares) y una **Agenda** consolidada.
Dueño: Hermes (renta fija / mercado de capitales, Argentina). Idioma de la UI y de los comentarios: español.

Objetivo de cada panel:
1. **Nivel actual**: tasa de política, inflación, expectativas, tasas de mercado, FX, índice (proxy MSCI).
2. **Dinámica**: cómo se movió cada variable a 1/3/6/12 meses (¿sube la inflación? ¿suben las
   expectativas de tasa? ¿se deprecia la moneda?).
3. **Expectativas**: encuesta y/o mercado, hoy y su evolución.
4. **Agenda**: próximas decisiones de banco central y publicaciones de datos.

## Arquitectura

```
api/country.js              GET /api/country?c=br|us|eu|mx|ca|co|cl|jp|world|usd  (función serverless Vercel, cache edge 30 min)
api/_lib/util.js            HTTP, fechas, series, kpi(), trend(), spreadSeries(), settle()
api/_lib/yahoo.js           Yahoo Finance: precios, perf, futuros Fed funds (ZQ)
api/_lib/calendar.js        Fechas de reuniones de bancos centrales (estático, revisar 1 vez/año)
api/_lib/sources/<pais>.js  Un adaptador por país. Devuelve el "contrato de payload" (abajo)
api/_lib/sources/usd.js     Crédito USD: EMBI por país (BCRD) + bonos soberanos en USD (onvista) vs Tesoro (FRED). Payload propio
api/_lib/usd-bonds.json     Lista de ISINs en USD por emisor (la genera scripts/discover-usd-bonds.mjs)
api/_lib/xlsx.js            Lector mínimo de .xlsx sin dependencias (zlib), usado para la planilla del EMBI
src/App.jsx                 Tabs, carga en paralelo de todos los países, modo ?mock=1
src/components/Panels.jsx   Kpi, Dynamics, CountryPanel, TrendsTable, WorldPanel (MajorIndices, QuoteCard, BondTiles,
                            MiniTiles, Watchlist), ComparePanel, AgendaList
src/components/Charts.jsx   TimeChart, PathChart, Spark, AreaSpark (Recharts)
src/components/Flag.jsx     Banderas SVG (flagcdn; los emoji de bandera no se ven en Windows)
scripts/smoke.mjs           Prueba contra las APIs REALES (requiere .env)
scripts/test-parsers.mjs    Test offline con fetch simulado + genera src/mock-data.json
scripts/mock-fetch.mjs      fetch falso: imita el FORMATO de cada API con datos sintéticos
scripts/dev-api.mjs         Servidor local de /api (alternativa a `vercel dev`)
scripts/discover-usd-bonds.mjs  Rearma usd-bonds.json (correr cada 2-3 meses o cuando un país emite)
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
| 4b | BCCh API Key Token (**vence ~19-nov-2027**) | Chile por la API oficial (sin token: cuadros públicos) | https://si3.bcentral.cl/Siete/es/Siete/API → Mi Cuenta → Apikey Token | `BCCH_API_TOKEN` | ☐ |
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

Leyenda: ✔ = verificado contra la API real. Al 18-nov-2026 se verificaron con `smoke` BR, EZ, CA, CO y Mundo
(fuentes sin clave) y los tickers ZQ de Yahoo. EE.UU. (FRED) y México (Banxico) verificados con claves el mismo día.

| País | Tasa política | Inflación | Expectativas | Tasas mercado | FX | Índice | Agenda |
|---|---|---|---|---|---|---|---|
| 🇧🇷 | ✔ SGS 432 (cortada en hoy) | ✔ SGS 13522/433 | ✔ Focus anual, Selic por reunión, Focus IPCA 12m; ✔ breakeven 10Y (NTN-F/NTN-B) | ✔ Prefijado 2Y/10Y y real 10Y (Tesouro Direto, interpolado); ❌ DI futuro | ✔ SGS 1 | ✔ EWZ/^BVSP | ✔ Copom + IBGE |
| 🇺🇸 | ✔ FRED | ✔ FRED (a/a calculado) | ✔ ZQ en Yahoo; ✔ breakeven 5Y | ✔ DGS2/10 | ✔ DXY | ✔ EUSA/^GSPC | ✔ FOMC + FRED releases (por ID) |
| 🇪🇺 | ✔ DFR | ✔ HICP (dataset `HICP`, proveedor `4D0`) | ✔ forwards AAA `IF_*`; ✔ SPF LT | ✔ AAA 2Y/10Y | ✔ | ✔ EZU/^STOXX50E | ✅ BCE |
| 🇲🇽 | ✔ SF61745 | ✔ SP30578 | ✔ Encuesta Banxico (trayectoria de tasa, infl. 12m, tabla) | ✔ Cetes/TIIE; ✔ Bono M 3Y/10Y (subasta) | ✔ FIX | ✔ EWW/^MXX | ✔ dic-2026; ❌ 2027 (no publicado) |
| 🇨🇦 | ✔ V39079 | ✔ V41690973; ✔ CPI-trim/median | proxy 2Y − overnight; ✔ breakeven LP (LONG − RRB) | ✔ GoC 2Y/10Y | ✔ | ✔ EWC/^GSPTSE | ✅ BoC |
| 🇨🇴 | ✔ DF_CBR_DAILY_HIST | ✔ IPC derivado de la UVR (DF_UVR_DAILY_HIST); fallback FRED OCDE | proxy IBR 6M − política; ❌ Encuesta BanRep (captcha) | ✔ IBR ON/6M (efectiva); ✔ TES 2Y (interp. 1Y–5Y) y 10Y, mensual | ✔ datos.gov.co 32sa-8pi3; fallback BanRep | ✔ COLO / ICOLCAP.CL | ✔ dic-2026; ❌ 2027 (no publicado) |

| 🇨🇱 | ✔ BDE F022.TPM | ✔ BDE IPC var. 12m | ✔ EEE (inflación 11/23m, TPM por plazo, PIB) y EOF (TPM e inflación 12m); ✔ BCP−BCU 10Y | ✔ BCP 2Y/10Y, BCU 10Y | ✔ dólar observado | ✔ ECH; IPSA mensual (BDE) | ✔ dic-2026; ❌ 2027 (publicado, no accesible) |
| 🇯🇵 | ✔ BoJ call O/N (STRDCLUCON) | ✔ BIS WS_LONG_CPI M.JP.771 | ✔ Tankan infl. 1a; proxy JGB 2Y − call | ✔ MOF JGB 2Y/10Y/30Y | ✔ Yahoo JPY=X | ✔ EWJ/^N225 | ✔ BoJ 2026–2027 |

### Notas de Crédito USD (onvista)
- `https://api.onvista.de/api/v1/bonds/ISIN:<ISIN>/snapshot` (sin clave): `bondsFigures.yieldToMaturity` (ISMA), `modifyDuration`,
  `priceForCalculation` y su fecha; `bondsBaseData.datetimeMaturity`; `bondsIssuer.isoCountry`.
- Las tasas son de precios indicativos de bolsas alemanas: bonos con precio de más de 10 días quedan fuera de las curvas.
  En step-up (AR, EC) contrastar la TIR con la fuente local. Spread = TIR − Tesoro de EE.UU. interpolado al plazo (FRED DGS*).
- La búsqueda (`/instruments/query`) devuelve como máximo 10 resultados: el script refina el prefijo del ISIN (CUSIP del emisor).
  Se excluyen los globales en moneda local pagaderos en USD ("RB/DL", "KP/DL") y se deduplica 144A/Reg S por (vencimiento, cupón).
- EMBI: planilla diaria del Banco Central de la Rep. Dominicana (`EMBI_URL` en usd.js, URL fija sin el `?v=`; ~1 MB,
  historia desde 2007, columnas Global, LATINO, REP DOM y 16 países). Valores en puntos porcentuales → pb. Sin API: se baja
  la planilla en cada request (cache 30 min). Si cambia el encabezado, `parseEmbi` falla con un error claro.

### Notas de Chile (BCCh BDE)
- Fuente principal: API oficial `SieteRestWS.ashx?token=<BCCH_API_TOKEN>&function=GetSeries&timeseries=<código>&firstdate=aaaa-mm-dd`
  (el token lleva `$` y `/`: va codificado en la URL; la respuesta viene en latin-1). El token **vence al año**: con token
  vencido el panel muestra el aviso "token inválido o vencido" y sigue con los cuadros públicos.
- Respaldo sin credenciales: las páginas públicas de cuadros:
  `https://si3.bcentral.cl/Siete/ES/Siete/Cuadro/<CAP>/<MENU>/<CUADRO>` (filas con `data-serie`, fechas en los `<th>`).
  Diarios: año en curso; `?cbFechaDiaria=AAAA` trae otro año. Mensuales: varios años por defecto. Cuadros en `CUADROS` (cl.js).
- EEE (mensual, economistas) y EOF (quincenal, operadores financieros). En la tabla se usa el valor de la fecha exacta de la
  última encuesta (las preguntas por "diciembre de cada año" rotan).
- Si el BCCh cambia el HTML, `parseBdeCuadro` falla con "cuadro sin fechas/series". Alternativa: pedir credenciales de la API.

### Notas de Japón
- BoJ API (sin clave): `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=<DB>&code=<CODE>&startDate=<AAAAMM | AAAA0T>`.
  Trimestral (Tankan, db `CO`) usa `AAAA0T` (T = trimestre); fechas de respuesta `202603` = 3er trimestre.
- El IPC de Japón ya no está en OCDE/FRED (cortado en 2022): se toma del BIS. El BoJ no publica la meta como serie: se usa la call O/N.
- Curva JGB: CSV del MOF (`historical/jgbcme_all.csv` + `jgbcme.csv` del mes en curso).

### Notas de México (Banxico SIE)
- Límite de consultas: probar IDs de a muchos dispara "Límite de consultas superado" por varios minutos (afecta también a la página).
- Encuesta a especialistas: IDs en los cuadros del SIE CR154 (inflación anual), CR155 (12 meses), CR163 (PIB), CR168 (tasa de
  fondeo por trimestre), CR171 (tipo de cambio). En cada horizonte el orden es Media, Mediana, Q1, Q3, Mín, Máx, Desvío, N.
- Bonos M: solo rendimientos de subasta primaria (SF43883 3Y, SF44071 10Y); el vector de precios diario no expone rendimientos de Bonos M.

### Notas de Brasil (Tesouro Direto)
- CSV público del Tesouro Transparente (~15 MB), ordenado de la fecha más nueva a la más vieja: se lee en streaming y se corta en 13 meses.
- 2Y: LTN interpolada; 10Y: NTN-F interpolada; real 10Y: NTN-B (con y sin cupón). No se extrapola fuera de los vencimientos.

### Notas de Colombia (BanRep SDMX)

- Endpoint: `https://totoro.banrep.gov.co/nsi-jax-ws/rest/data/ESTAT,<FLOW>,1.0/all/ALL/?startPeriod=<AAAA>`
  con `Accept: application/vnd.sdmx.genericdata+xml;version=2.1`. **Solo XML** (JSON/CSV → 406, según reportes de terceros).
- Catálogo (`/dataflow/ESTAT/all/latest`, 33 flujos): CBR (tasa de política), IBR, IR, DTF, TRM, UVR, TES, COLCAP,
  FTD (CDT), MONAGG. **No hay IPC**: se deriva de la UVR (`ipcFromUvr` en `co.js`; IPC a/a de M = UVR(15/M+2)/UVR(15/M−10) − 1,
  coincide con el DANE). La UVR se publica con ~1 mes de adelanto, así que el IPC sale apenas lo publica el DANE.
- Claves: `CO.<SUBJECT>._Z._Z._Z.<UNIDAD>.<FREQ>`. IBR: `IRIBRM{00,01,03,06}` × `ER` (efectiva anual) / `NR` (nominal).
  Se usa ER porque la tasa de política está en efectiva anual. TES: `IRGBRY{01,05,10}`, mensual, en decimal.
- Variables opcionales para sobreescribir: `BANREP_FLOW_POLICY`, `BANREP_IBR_ON`, `BANREP_IBR_6M`.
- `startPeriod` solo respeta el año; el filtro fino de fechas se hace del lado del cliente.

## Pendientes priorizados

1. Deploy en Vercel (cargar `FRED_API_KEY` y `BANXICO_TOKEN` en Settings → Environment Variables).
2. Calendarios: fechas 2027 de Banxico, JDBR y BCCh (el de BCCh está publicado pero la página bloquea consultas automáticas). Fuentes:
   https://www.banxico.org.mx/publicaciones-y-prensa/calendario-de-publicaciones.html ·
   https://www.banrep.gov.co/es/calendario-junta-directiva (la JDBR decide al final de ene, mar, abr, jun, jul, sep, oct y dic).
3. México: Bono M de mercado secundario diario (hoy: subasta primaria).
4. Colombia: Encuesta mensual de expectativas de BanRep (la página tiene captcha → carga manual o LSEG). TES diario (hoy: promedio mensual).
   Argentina: Merval sin historia en Yahoo/Stooq (solo ARGT en Mundo).
5. Agenda de datos para MX (INEGI), CA (StatCan), CO (DANE), EZ (Eurostat): hoy solo hay BR (IBGE) y EE.UU. (FRED).
6. Persistir snapshots diarios (p.ej. Vercel KV / Postgres + cron) para tener historia propia de variables
   que la fuente no guarda (strip de futuros completo, forwards por plazo, encuestas).
7. Si se conecta LSEG: adaptador `lseg` para DI futuro, OIS (USD/EUR/CAD), swaps TIIE/IBR y TES/Mbono.

## Convenciones

- Español en UI, comentarios y commits. Fechas ISO internas (`yyyy-mm-dd`); en UI `fmtDate`.
- Series siempre `[{d, v}]` ordenadas asc (`clean()`).
- Gráficos: **nunca dos ejes Y**. Máximo 3 series por gráfico (paleta validada para daltonismo: `--series-1..3`).
- Colores de variación: en paneles de país, chips azul (baja) / rojo (sube) con flecha; en Mundo (precios), convención de
  mercado verde (sube) / rojo (baja), siempre con signo. Nunca color solo.
- Cada número muestra su fuente (`source` + `url`). Los cálculos propios se rotulan "Cálculo propio".
- No inventar datos: si no hay fuente, KPI `n/d` con `source: 'Pendiente'` y nota de por qué.
- Las claves solo en variables de entorno.

## Registro

Ver `CHANGELOG.md`. Agregar una entrada por cada sesión de trabajo (qué cambió, qué se verificó y qué falta).
