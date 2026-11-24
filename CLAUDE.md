# CLAUDE.md — Macro Monitor

Contexto para Claude Code. Leer entero antes de tocar código.

## Qué es

Dashboard macro con un panel por país (Argentina, Brasil, EE.UU., Eurozona, México, Canadá, Colombia, Chile, Perú, Japón, India), una vista
**Mundo** (cuadros tipo terminal + panel lateral "Hoy", tendencias y comparativo entre países), una solapa
**Comparar** (dos países lado a lado), una solapa **Crédito USD** (spread EMBI de América Latina y curvas de los
bonos soberanos en dólares), una solapa **Sostenibilidad** (tres brechas, deuda/PBI y primario que estabiliza la deuda),
una solapa **Noticias** (titulares RSS minuto a minuto con filtros), una solapa **Valuación** (subsolapas Países y Sectores de EE.UU.: ratios, P/E contra su historia y flujos de ETF) y una **Agenda** consolidada (económica y política).
Dueño: Hermes (renta fija / mercado de capitales, Argentina). Idioma de la UI y de los comentarios: español.

Objetivo de cada panel:
1. **Nivel actual**: tasa de política, inflación, expectativas, tasas de mercado, FX, índice (proxy MSCI).
2. **Dinámica**: cómo se movió cada variable a 1/3/6/12 meses (¿sube la inflación? ¿suben las
   expectativas de tasa? ¿se deprecia la moneda?).
3. **Expectativas**: encuesta y/o mercado, hoy y su evolución.
4. **Agenda**: próximas decisiones de banco central y publicaciones de datos.

## Arquitectura

```
api/country.js              GET /api/country?c=ar|br|us|eu|mx|ca|co|cl|pe|jp|in|world|usd|sust|val|rank|news  (función serverless Vercel, cache edge 30 min)
api/_lib/util.js            HTTP, fechas, series, kpi(), trend(), spreadSeries(), settle()
api/_lib/yahoo.js           Yahoo Finance: precios, perf, futuros Fed funds (ZQ)
api/_lib/calendar.js        Reuniones de bancos centrales + publicaciones de IPC/PIB con fecha oficial (estático; revisar cada semestre)
api/_lib/bis.js             BIS (sin clave): tasas de política WS_CBPOL y IPC WS_LONG_CPI (Perú, India)
api/_lib/sources/<pais>.js  Un adaptador por país. Devuelve el "contrato de payload" (abajo)
api/_lib/sources/usd.js     Crédito USD: EMBI por país (BCRD) + bonos soberanos en USD (onvista) vs Tesoro (FRED). Payload propio
api/_lib/usd-bonds.json     Lista de ISINs en USD por emisor (la genera scripts/discover-usd-bonds.mjs)
api/_lib/sources/val.js     Valuación: worldperatio (P/E e historia con desvíos) + MSCI (P/E fwd) + iShares (flujos = Δcuotas × NAV)
api/_lib/worldpe.js         Lector de worldperatio.com (P/E diario, serie mensual detailPE_data, tabla de estadísticas por ventana)
api/_lib/msci.js            Lector del factsheet mensual de MSCI (PDF, con unpdf): Div Yld, P/E, P/E Fwd, P/BV
api/_lib/ssga.js            State Street: planilla de productos SPDR (P/E FY1, P/B, crec. EPS…) y NAV/cuotas diarias por ETF
api/_lib/sources/sust.js    Sostenibilidad: FMI WEO (API SDMX) + Banco Mundial (WDI). Payload propio: countries[].rows por año
api/_lib/xlsx.js            Lector mínimo de .xlsx sin dependencias (zlib): readFirstSheet / readSheet(buf, n)
api/_lib/sources/news.js    Noticias: feeds RSS públicos (Bloomberg, WSJ, MarketWatch, Fed, BCE, Google Noticias, FinancialJuice); etiquetas por palabras clave
api/_lib/fedprobs.js        Probabilidades de la Fed por reunión: futuros ZQ (método FedWatch, cálculo propio) y Polymarket (API Gamma)
api/_lib/treasury.js        Licitaciones del Tesoro: cronograma tentativo (PDF) + TreasuryDirect (anunciadas y resultados)
api/_lib/sources/rank.js    Ranking de emisores (8 de LatAm): 5 pilares ponderados, solo datos 2025+, vs spread EMBI
api/_lib/debtcomp.js        Composición de la deuda pública (Banco Mundial QPSD): moneda, residencia del acreedor, vencimientos a 12 meses
api/_lib/ecdebt.js          Ecuador: composición de la deuda con el Boletín de Deuda Pública del Ministerio de Economía (no reporta a QPSD)
src/App.jsx                 Tabs, carga en paralelo de todos los países, modo ?mock=1
src/components/Panels.jsx   Kpi, Dynamics, CountryPanel, TrendsTable, WorldPanel (MajorIndices, QuoteCard, BondTiles,
                            MiniTiles, Watchlist), ComparePanel, AgendaList
src/components/Charts.jsx   TimeChart, PathChart, Spark, AreaSpark (Recharts)
src/components/CountryMenu.jsx  Selector "Países" de la barra superior
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
| 🇺🇸 | ✔ FRED | ✔ FRED (a/a calculado) | ✔ ZQ en Yahoo; ✔ probabilidades por reunión (ZQ con método FedWatch + Polymarket); ✔ breakeven 5Y | ✔ DGS2/10 | ✔ DXY | ✔ EUSA/^GSPC | ✔ FOMC + 21 releases de FRED (por ID) + licitaciones del Tesoro |
| 🇪🇺 | ✔ DFR | ✔ HICP (dataset `HICP`, proveedor `4D0`) | ✔ forwards AAA `IF_*`; ✔ SPF LT | ✔ AAA 2Y/10Y | ✔ | ✔ EZU/^STOXX50E | ✅ BCE |
| 🇲🇽 | ✔ SF61745 | ✔ SP30578 | ✔ Encuesta Banxico (trayectoria de tasa, infl. 12m, tabla) | ✔ Cetes/TIIE; ✔ Bono M 3Y/10Y (subasta) | ✔ FIX | ✔ EWW/^MXX | ✔ dic-2026; ❌ 2027 (no publicado) |
| 🇨🇦 | ✔ V39079 | ✔ V41690973; ✔ CPI-trim/median | proxy 2Y − overnight; ✔ breakeven LP (LONG − RRB) | ✔ GoC 2Y/10Y | ✔ | ✔ EWC/^GSPTSE | ✅ BoC |
| 🇨🇴 | ✔ DF_CBR_DAILY_HIST | ✔ IPC derivado de la UVR (DF_UVR_DAILY_HIST); fallback FRED OCDE | proxy IBR 6M − política; ❌ Encuesta BanRep (captcha) | ✔ IBR ON/6M (efectiva); ✔ TES 2Y (interp. 1Y–5Y) y 10Y diarios (curva cero cupón, Suameca; respaldo: promedio mensual SDMX) | ✔ datos.gov.co 32sa-8pi3; fallback BanRep | ✔ COLO / ICOLCAP.CL | ✔ dic-2026; ❌ 2027 (no publicado) |

| 🇦🇷 | ✔ TAMAR (BCRA 44; sin tasa de política desde jul-25) y pases 1d (150) | ✔ INDEC vía BCRA (27 m/m, 28 a/a) | ✔ REM: 12m (BCRA 29, con historia) + planilla completa (inflación, TAMAR, TC, PIB, fiscal) | ✔ BADLAR; EMBI (BCRD); ❌ curva en pesos | ✔ A3500 + bandas | ✔ ARGT | ✔ IPC INDEC 15-dic-2026 |
| 🇨🇱 | ✔ BDE F022.TPM | ✔ BDE IPC var. 12m | ✔ EEE (inflación 11/23m, TPM por plazo, PIB) y EOF (TPM e inflación 12m); ✔ BCP−BCU 10Y | ✔ BCP 2Y/10Y, BCU 10Y | ✔ dólar observado | ✔ ECH; IPSA mensual (BDE) | ✔ dic-2026; ❌ 2027 (publicado, no accesible) |
| 🇵🇪 | ✔ BIS D.PE | ✔ BIS M.PE.771 (lag ~2 meses) | FMI WEO (dic/dic próximo año); ❌ encuesta BCRP (API bloqueada) | ✔ EMBI; ❌ curva en soles | ✔ Yahoo PEN=X | ✔ EPU; ❌ S&P/BVL sin historia en Yahoo | ❌ BCRP e INEI (sin calendario legible) |
| 🇮🇳 | ✔ BIS D.IN (lag ~1 mes) | ✔ BIS M.IN.771 | FMI WEO (AF abr–mar); proxy 3M − repo | ✔ OCDE vía FRED: call, 3M, 10Y (mensual); ❌ G-sec 10Y diario (CCIL, FBIL, CNBC y Stooq bloquean consultas automáticas; RBI solo fin de mes); ❌ G-sec 2Y | ✔ Yahoo INR=X | ✔ INDA/^NSEI | ✔ RBI MPC AF 26-27; MOSPI (previstas) |
| 🇯🇵 | ✔ BoJ call O/N (STRDCLUCON) | ✔ BIS WS_LONG_CPI M.JP.771 | ✔ Tankan infl. 1a; proxy JGB 2Y − call | ✔ MOF JGB 2Y/10Y/30Y | ✔ Yahoo JPY=X | ✔ EWJ/^N225 | ✔ BoJ 2026–2027 |

### Notas de Crédito USD (onvista)
- `https://api.onvista.de/api/v1/bonds/ISIN:<ISIN>/snapshot` (sin clave): `bondsFigures.yieldToMaturity` (ISMA), `modifyDuration`,
  `priceForCalculation` y su fecha; `bondsBaseData.datetimeMaturity`; `bondsIssuer.isoCountry`.
- Las tasas son de precios indicativos de bolsas alemanas: bonos con precio de más de 10 días quedan fuera de las curvas.
  En step-up (AR, EC) contrastar la TIR con la fuente local. Spread = TIR − Tesoro de EE.UU. interpolado al plazo (FRED DGS*).
- La búsqueda (`/instruments/query`) devuelve como máximo 10 resultados: el script refina el prefijo del ISIN (CUSIP del emisor).
  Se excluyen los globales en moneda local pagaderos en USD ("RB/DL", "KP/DL") y se deduplica 144A/Reg S por (vencimiento, cupón).
- EMBI: planilla diaria del Banco Central de la Rep. Dominicana (`EMBI_URL` en usd.js + `?v=<timestamp>`: sin eso el CDN le sirve a Vercel la copia del día anterior; ~1 MB,
  historia desde 2007, columnas Global, LATINO, REP DOM y 16 países). Valores en puntos porcentuales → pb. Sin API: se baja
  la planilla en cada request (cache 30 min). Si cambia el encabezado, `parseEmbi` falla con un error claro.

### Notas de Argentina
- BCRA API v4 (sin clave): `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/<id>?desde=&hasta=` (la v3 devuelve 410).
  Ids en `BCRA` (ar.js). La 160 "tasa de política" está discontinuada desde jul-2025.
- REM: el link a `relevamiento-expectativas-mercado-tablas-AAAA-MM.xlsx` se toma de https://www.bcra.gob.ar/relevamiento-expectativas-mercado-rem/
  (secciones por título en la columna B; períodos mensuales como serial de Excel). También hay un `...-historico.xlsx` de URL fija.
- Fiscal: datos.gob.ar series 379.9_SUPERAVIT_017__23_94 (primario) y 379.9_RESULTADO_017__18_38 (financiero), SPN base caja,
  millones de pesos; acumulado 12 meses / PBI nominal del FMI interpolado. Verificado: 2025 = 1,38% y 0,17% del PBI.
- No hay API de la deuda oficial (Finanzas publica PDF/Excel trimestral): en Sostenibilidad queda la del FMI (gobierno general).

### Notas de Sostenibilidad (FMI WEO + Banco Mundial)
- FMI: `https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/<PAISES>.<INDICADORES>.A` (SDMX-JSON 3.0, sin clave).
  La API "DataMapper" de imf.org responde 403 a consultas automáticas: usar esta. Eurozona = `G163`.
  Indicadores: BCA_NGDPD, GGXCNL_NGDP, GGXONLB_NGDP, GGXWDG_NGDP, NGSD_NGDP, NID_NGDP, NGDP, NGDP_RPCH. Desde el año en curso = proyección.
- Banco Mundial: `api.worldbank.org/v2/country/<ISO3;...>/indicator/<código>?format=json` — NE.RSB.GNFS.ZS (balanza bys),
  DT.DOD.DECT.GN.ZS (deuda externa, solo emergentes), FI.RES.TOTL.MO (reservas en meses), DT.TDS.DECT.EX.ZS (servicio de deuda externa).
- Datos oficiales (columnas "Oficial"): AR Hacienda mensual; BR SGS 13762 (DBGG), 5793/5727 (NFSP 12m, positivo = déficit → se invierte);
  CL BCCh F051.D7.PPB.C.Z.Z.T (deuda GC) y F051.G21.PPI.C.Z.Z.T (balance trimestral en % del PBI ANUAL → se suman 4 trimestres);
  EA Eurostat gov_10q_ggdebt / gov_10q_ggnfa (B9 en % del PBI del trimestre → se promedian 4); EE.UU. FRED GFDEGDQ188S y FYFSGDA188S.
- Diferencias esperables FMI vs oficial: perímetro (gobierno general vs nacional/central), base caja vs devengado (intereses
  capitalizables), y definición de deuda (el FMI incluye en Brasil todos los títulos del Tesoro en cartera del BCB: 93% vs DBGG 83%).
- Tres brechas: CC = resultado fiscal + (S − I) privado. Intereses netos = primario − total. i = intereses·(1+g)/d₋₁;
  primario que estabiliza = d₋₁·(i − g)/(1 + g). Con inflación alta y deuda en USD (Argentina) la fórmula en moneda local
  no captura el efecto cambiario (se avisa en la UI). El test offline verifica que la identidad cierre todos los años.

### Notas de composición de la deuda y ranking de emisores
- QPSD (Banco Mundial, `api.worldbank.org/v2/country/<ISO3;…>/indicator/DP.DOD.<X>.CR.<SECTOR>.Z1?source=20&mrnev=1`): X = DECT total,
  DECF moneda extranjera, DECN moneda local, DECD acreedores residentes, DECX no residentes, DSTC corto plazo, y `DLTC.CR.L1` (largo plazo
  que vence en ≤1 año). SECTOR: GG / CG / BC. Se usa CG; Chile solo tiene BC. Un indicador inexistente para un sector responde 400.
  Solo se combinan componentes del mismo trimestre que el total. Sin datos: India (no reporta), Eurozona (sin agregado).
- Ecuador (`ecdebt.js`): página `finanzas.gob.ec/deuda-publica-nueva-metodologia/` → links `download.php?id=` ("Base de Datos Boletín de Deuda
  <Mes> <Año>" y "Perfil Vencimientos CP Externa Interna <Mes> <Año>"; redirigen a economicoproductivo.gob.ec). Base: hoja "1." (sheet2,
  miles de USD: Total Deuda Externa / Interna, DEUDA PÚBLICA TOTAL, PIB NOMINAL). Perfil CP: hoja "16." (sheet17), fila "CAPITAL DEUDA
  EXTERNA + INTERNA", se suman los 12 primeros meses. ~2 meses de atraso; ~12 s de descarga. Dolarizado → 100% "moneda extranjera".
- Otras fuentes confirmadas para el ranking (20-nov-2026): WGI `GOV_WGI_<GE|RL|CC|RQ|PV|VA>.EST?source=3` (2025); IDS
  `DT.DOD.DSTC.IR.ZS` (deuda externa de corto plazo / reservas, solo emergentes, 2024; sin Chile ni Uruguay); FMI WEO `GGR_NGDP`
  (ingresos) para intereses/recaudación; BoC-BoE Sovereign Default Database (`bankofcanada.ca/wp-content/uploads/2026/10/BoC-BoE-Database-2026.xlsx`,
  hoja 2 "Debt_2026.csv": monto en default en USD M por país, año y acreedor; usar umbral de monto: Perú arrastra montos chicos de la era Brady).
- Sin fuente gratuita: calificaciones crediticias (pagas); base de tenedores del FMI (Arslanalp-Tsuda) sin descarga actualizada.
- Ranking (`rank.js`): universo AR BR CL CO MX PE UY EC; pesos fiscal 25 / composición 25 / externo 20 / institucional 15 / historial 15
  (Hermes, 20-nov-2026). **Regla: solo datos con fecha ≥ 2025** (`MIN_YEAR`); sin dato reciente el indicador queda vacío. Min–max contra el
  grupo (≥3 países con dato). Historial: años desde el último año con ≥ USD 1.000 M en default comercial (bonos, préstamos, deuda local, otros
  privados), tope 30; los atrasos con "otros acreedores oficiales" no cuentan (BR 2022, MX 2024 no son defaults de mercado).
  La URL de la base BoC-BoE cambia cada año (`BOC_URL`): actualizarla con cada edición (sale en octubre).

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
- TES diario: Suameca (`api/_lib/suameca.js`), API REST pública del BanRep: `.../estadisticaEconomicaRestService/consultaInformacionSerie?idSerie=<id>`.
  Curva cero cupón en pesos 15272 (1Y), 15273 (5Y), 15274 (10Y); UVR 15275–15277. Se carga una vez por semana (~1 semana de atraso).
  El servidor no manda el certificado intermedio (GeoTrust EV RSA CA G2): se agrega ese intermedio público en el código (vence 2-jul-2030).
  En un entorno con proxy, probar con `NODE_USE_ENV_PROXY=1`.
- Variables opcionales para sobreescribir: `BANREP_FLOW_POLICY`, `BANREP_IBR_ON`, `BANREP_IBR_6M`.
- `startPeriod` solo respeta el año; el filtro fino de fechas se hace del lado del cliente.

### Notas de la Fed y el Tesoro
- FedWatch (`fedWatch`): la tasa previa a cada reunión sale del contrato del mes anterior si ese mes no tiene reunión (si no, de la posterior
  de la reunión anterior; para la primera, la EFFR spot). La posterior sale del contrato del mes siguiente si no tiene reunión; si no, se despeja
  del promedio del mes. Movimientos de 25 pb, repartidos entre los dos más cercanos. Incluye prima por plazo: en reuniones lejanas exagera.
- Polymarket: `gamma-api.polymarket.com/events?closed=false&tag_slug=fed-rates`, eventos "Fed Decision in <Mes>?" (mercados 50+/25 bps
  decrease, No change, 25/50+ bps increase). Precio del "Sí" = probabilidad; se normaliza a 100%. Solo lectura, sin cuenta.
- Tesoro: `home.treasury.gov/system/files/221/Tentative-Auction-Schedule.pdf` (se lee con unpdf) y `treasurydirect.gov/TA_WS/securities/upcoming|auctioned?format=json`.
  Se emparejan por fecha + tipo (Note/Bond/TIPS/FRN) + plazo original (`originalSecurityTerm`: las reaperturas figuran como "9-Year 8-Month").

### Notas de la Agenda
- `calendar.js`: `POLICY_MEETINGS` (bancos centrales) y `DATA_RELEASES` (IPC y PIB) con la fuente de cada calendario;
  `agendaEvents(id)` une ambos. En vivo: BR (API del IBGE, nombres completos: "Índice Nacional de Preços ao Consumidor Amplo" = IPCA,
  "... Amplo 15" = IPCA-15), EE.UU. (FRED releases) y CO (vista mensual del DANE, `parseDaneMonth`).
- Fuentes de las fechas estáticas: INDEC `ftp/cuadros/publicaciones/calendario_<N>sem<AAAA>.pdf`; INEGI
  `contenidos/saladeprensa/doc/cal_<AAAA>.pdf`; BCE `press/calendars/statscal/ges/html/sthicp.en.html` (HICP flash/final);
  StatCan "Next release" de cada comunicado de The Daily; MIC `stat.go.jp/english/data/cpi/1582.htm`; Cabinet Office
  `esri.cao.go.jp/en/sna/kouhyou/kouhyou_top.html`; RBI `Scripts/Annualpolicy.aspx`; MOSPI Advance Release Calendar (PDF).
- No se cargan fechas estimadas: si un calendario no se puede leer (BCRP, INEI, BCCh), queda vacío y anotado como pendiente.
- Político: `POLITICAL_EVENTS` (kind `pol`, `tentative` → "previsto") y `POLITICAL_UNDATED` (sin fecha). `country.js` los agrega
  a cada país fuera del tope de 20 eventos. Revisar cada trimestre (PASO 2027 en discusión; decreto de Francia antes del 7-feb-2027).

### Notas de Valuación (iShares)
- P/E y P/B: `blackrock.com/varnish-api/.../api/v2/get-product-data?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&userType=individual&portfolioId=<id>&component=fundamentalsAndRisk`.
- NAV y cuotas diarias: `.../api/v1/get-fund-document?...&portfolioId=<id>&component=fundDownload` (SpreadsheetML, hojas Holdings,
  Historical, Performance, Distributions; ~3 MB, se lee solo el principio de Historical). IDs en `FUNDS` (val.js), del buscador
  `ishares.com/us/product-screener/product-screener-v3.1.jsn`.
- Algunos ETF pasan semanas sin creaciones ni rescates (p.ej. EEM): flujo 0 es dato real, no error.
- P/E forward: factsheet mensual de MSCI (`msci.com/documents/10199/255599/msci-<pais>-index-net.pdf`; México:
  `msci-mexico-index-usd-net.pdf`; EM: `msci-emerging-markets-index-usd-net.pdf`) con Div Yld, P/E, P/E Fwd y P/BV a fin de mes del
  país y de dos comparables. Se lee con `unpdf`; si cambia el formato, `parseMsciText` falla con un error claro.
- Historia del P/E: worldperatio.com (`/area/<pais>`): P/E diario sobre un ETF (EWZ, VTI, VGK, EWW…), serie mensual desde 1995 en
  `detailPE_data` (Highcharts) y tabla "Last NY" con μ, σ, desvío y lectura (Fair/Overvalued/Expensive/Undervalued/Cheap).
  No tiene Eurozona (se usa Europa) ni ACWI. Su P/E difiere del de MSCI (ETF vs índice, fecha): se muestran ambos.
- Términos de iShares: datos para uso personal y no comercial.

### Notas de Valuación – Sectores de EE.UU.
- State Street (sin clave): `ssga.com/library-content/products/fund-data/etfs/us/spdr-product-data-us-en.xlsx` (una fila por SPDR;
  columnas por nombre de encabezado) y `.../navhist-us-en-<ticker>.xlsx` (Date, NAV, Shares Outstanding, Total Net Assets; más nuevo primero).
  Página de cada fondo: `ssga.com/us/en/intermediary/etfs/state-street-<sector>-select-sector-spdr-etf-<ticker>`.
- Descartadas: Siblis (mensual; su API gratis solo trae 9 fotos trimestrales), S&P DJI `sp-500-eps-est.xlsx` (403 "Security Controls
  Triggered" a consultas automáticas) y FactSet Earnings Insight (P/E forward por sector solo como imagen).
- Calidad de worldperatio (`wpeQuality` en val.js, `ETF_LAUNCH`): >10% de meses repetidos o ventana anterior al lanzamiento del ETF →
  "Baja calidad". Al 20-nov-2026 todas las series pasan a 5 años; a 10/20 años fallan muchas (sobre todo sectores).
- worldperatio: `/sector/sp-500-<sector>` (base XLK, XLF…) e `/index/sp-500` (SPY), mismo formato que países.

## Pendientes priorizados

1. Deploy en Vercel (cargar `FRED_API_KEY` y `BANXICO_TOKEN` en Settings → Environment Variables).
2. Calendarios: fechas 2027 de Banxico, JDBR y BCCh (el de BCCh está publicado pero la página bloquea consultas automáticas). Fuentes:
   https://www.banxico.org.mx/publicaciones-y-prensa/calendario-de-publicaciones.html ·
   https://www.banrep.gov.co/es/calendario-junta-directiva (la JDBR decide al final de ene, mar, abr, jun, jul, sep, oct y dic).
3. México: Bono M de mercado secundario diario (hoy: subasta primaria).
4. Colombia: Encuesta mensual de expectativas de BanRep (la página tiene captcha → carga manual o LSEG). TES de mercado intradiario (hoy: curva cero cupón diaria del BanRep, con ~1 semana de atraso).
   Argentina: Merval sin historia en Yahoo/Stooq (solo ARGT en Mundo).
5. Valuación: flujos de ARGT/COLO (Global X responde 429); historia del P/E forward (solo LSEG/Datastream).
6. Persistir snapshots diarios (p.ej. Vercel KV / Postgres + cron) para tener historia propia de variables
   que la fuente no guarda (strip de futuros completo, forwards por plazo, encuestas).
7. Si se conecta LSEG: adaptador `lseg` para DI futuro, OIS (USD/EURCAD), swaps TIIE/IBR y TES/Mbono.

## Convenciones

- Español en UI, comentarios y commits. Fechas ISO internas (`yyyy-mm-dd`); en UI `fmtDate`.
- Series siempre `[{d, v}]` ordenadas asc (`clean()`).
- Gráficos: **nunca dos ejes Y**. Máximo 3 series por gráfico (paleta validada para daltonismo: `--series-1..3`).
- Colores de variación: en paneles de país, chips azul (baja) / rojo (sube) con flecha; en Mundo (precios), convención de
  mercado verde (sube) / rojo (baja), siempre con signo. Nunca color solo.
- Monedas: rótulos en formato de ticker de mercado, sin barra: USDMXN = pesos mexicanos por 1 dólar, EURUSD = dólares por
  1 euro. **No usar "USD/MXN"**: para Hermes la barra significa "moneda de adelante por 1 unidad de la de atrás".
- Cada número muestra su fuente (`source` + `url`). Los cálculos propios se rotulan "Cálculo propio".
- No inventar datos: si no hay fuente, KPI `n/d` con `source: 'Pendiente'` y nota de por qué.
- Las claves solo en variables de entorno.

## Registro

Ver `CHANGELOG.md`. Agregar una entrada por cada sesión de trabajo (qué cambió, qué se verificó y qué falta).
