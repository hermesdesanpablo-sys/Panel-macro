# Macro Monitor

Panel por país (Brasil, EE.UU., Eurozona, México, Canadá, Colombia, Chile, Japón) + Mundo + Crédito USD + Comparar + agenda.
Cada indicador muestra su nivel y cómo se movió a 1/3/6/12 meses. **Para trabajar en el proyecto, leer `CLAUDE.md`.**
Todo sale de fuentes oficiales gratuitas; los mercados, de Yahoo Finance.

```
api/country.js            → GET /api/country?c=br|us|eu|mx|ca|world  (función serverless Vercel)
api/_lib/sources/*.js     → un adaptador por país (cada fuente falla sola, sin tirar el panel)
api/_lib/calendar.js      → fechas de reuniones de bancos centrales (actualizar 1 vez por año)
src/                      → React + Recharts
scripts/smoke.mjs         → prueba contra las APIs reales
scripts/test-parsers.mjs  → test offline con formatos simulados (+ genera datos de ejemplo de la UI)
```

## Puesta en marcha

1. Claves gratuitas → copiar `.env.example` a `.env`:
   - `FRED_API_KEY`: https://fredaccount.stlouisfed.org/apikeys
   - `BANXICO_TOKEN`: https://www.banxico.org.mx/SieAPIRest/service/v1/token
   (BCB, IBGE, BCE y Bank of Canada no piden clave.)
2. `npm install`
3. **Primero verificar las fuentes**: `node --env-file=.env scripts/smoke.mjs`
   Lista cada KPI con ✓/✗ y el error de cada fuente que falle. Ver "Qué verificar" abajo.
4. Local: `node --env-file=.env scripts/dev-api.mjs` en una terminal y `npm run dev` en otra.
   Para ver la UI sin red: `http://localhost:5173/?mock=1` (datos sintéticos, marcados como tales).
5. Deploy: `vercel` y cargar las dos variables en Project Settings → Environment Variables.
   Las respuestas se cachean 30 min en el edge (`s-maxage=1800`).

## Fuentes por indicador

| País | Indicador | Fuente | Código |
|---|---|---|---|
| 🇧🇷 | Selic meta | BCB SGS | 432 |
| 🇧🇷 | IPCA 12m / mensual | BCB SGS | 13522 / 433 |
| 🇧🇷 | USDBRL PTAX venta | BCB SGS | 1 |
| 🇧🇷 | Reservas (US$ mn) | BCB SGS | 13621 |
| 🇧🇷 | Desocupación PNADC | BCB SGS | 24369 |
| 🇧🇷 | Focus anual (IPCA, Selic, cambio, PIB) | BCB Olinda | ExpectativasMercadoAnuais |
| 🇧🇷 | Selic esperada por reunión Copom | BCB Olinda | ExpectativasMercadoSelic |
| 🇧🇷 | Calendario IBGE | IBGE API v3 | /calendario |
| 🇺🇸 | Fed funds (rango), EFFR | FRED | DFEDTARU, DFEDTARL, EFFR |
| 🇺🇸 | CPI, core CPI, core PCE (a/a calculado) | FRED | CPIAUCSL, CPILFESL, PCEPILFE |
| 🇺🇸 | UST 2Y/10Y, breakeven 5Y, desempleo | FRED | DGS2, DGS10, T5YIE, UNRATE |
| 🇺🇸 | Tasa implícita en futuros | Yahoo | ZQ{mes}{aa}.CBT |
| 🇺🇸 | Calendario de publicaciones | FRED | /releases/dates |
| 🇪🇺 | DFR, €STR | BCE | FM.D.U2.EUR.4F.KR.DFR.LEV, EST.B.EU000A2X2A25.WT |
| 🇪🇺 | HICP y core a/a | BCE | HICP.M.U2.N.000000.4D0.ANR, HICP.M.U2.N.XEF000.4D0.ANR |
| 🇪🇺 | Curva AAA 2Y/10Y y forwards | BCE | YC.B.U2.EUR.4F.G_N_A.SV_C_YM.{SR_2Y,SR_10Y,IF_*} |
| 🇪🇺 | EURUSD referencia | BCE | EXR.D.USD.EUR.SP00.A |
| 🇪🇺 | Desempleo, SPF largo plazo | BCE | LFSI.M.I9.S.UNEHRT.TOTAL0.15_74.T, SPF.Q.U2.HICP.POINT.LT.Q.AVG |
| 🇲🇽 | Tasa objetivo, FIX, Cetes 28, TIIE 28 | Banxico SIE | SF61745, SF43718, SF43936, SF43783 |
| 🇲🇽 | Inflación INPC a/a | Banxico SIE | SP30578 |
| 🇲🇽 | Bono M 3Y / 10Y (subasta) | Banxico SIE | SF43883 / SF44071 |
| 🇲🇽 | Encuesta a especialistas (medianas) | Banxico SIE | SR14659…SR14715 (tasa por trimestre), SR14195, SR14139, SR14146, SR14167, SR14770, SR14777, SR14448, SR14455 |
| 🇧🇷 | Prefijado 2Y/10Y, real 10Y, breakeven 10Y | Tesouro Transparente | PrecoTaxaTesouroDireto.csv (LTN, NTN-F, NTN-B interpoladas) |
| 🇨🇦 | Inflación implícita LP | BoC Valet | BD.CDN.LONG.DQ.YLD − BD.CDN.RRB.DQ.YLD |
| 🇯🇵 | Call O/N, Tankan inflación esperada | BoJ API | FM01 STRDCLUCON, CO TK99F0000204HCQ00000 |
| 🇯🇵 | IPC a/a | BIS | WS_LONG_CPI M.JP.771 |
| 🇯🇵 | JGB 2Y/10Y/30Y | MOF | jgbcme_all.csv + jgbcme.csv |
| 🇨🇦 | Overnight target, CORRA, USDCAD | BoC Valet | V39079, AVG.INTWO, FXUSDCAD |
| 🇨🇦 | GoC 2Y/10Y | BoC Valet | BD.CDN.2YR.DQ.YLD, BD.CDN.10YR.DQ.YLD |
| 🇨🇦 | CPI (a/a calculado), CPI-trim, CPI-median | BoC Valet | V41690973, CPI_TRIM, CPI_MEDIAN |
| 🇨🇴 | Tasa de política | BanRep SDMX | DF_CBR_DAILY_HIST |
| 🇨🇴 | IPC a/a (derivado de la UVR) | BanRep SDMX | DF_UVR_DAILY_HIST |
| 🇨🇴 | IBR overnight / 6M (efectiva) | BanRep SDMX | DF_IBR_DAILY_HIST (IRIBRM00 / IRIBRM06, ER) |
| 🇨🇴 | TES 2Y (interp. 1Y–5Y) y 10Y (prom. mensual) | BanRep SDMX | DF_TES_MONTHLY_HIST (IRGBRY01/05/10) |
| 🇨🇴 | TRM | datos.gov.co (fallback BanRep) | 32sa-8pi3 / DF_TRM_DAILY_HIST |
| 🇨🇴 | IPC (fallback) | FRED (OCDE) | COLCPIALLMINMEI |
| 🇧🇷 | Focus IPCA 12m adelante (historia) | BCB Olinda | ExpectativasMercadoInflacao12Meses |
| 🇺🇸 | Implícita futuros +12m (historia) | Yahoo | ZQ{mes}{aa}.CBT, 1 año |
| 🇪🇺 | Forward 1Y (historia) | BCE | YC.B.U2.EUR.4F.G_N_A.SV_C_YM.IF_1Y |
| todos | Proxy MSCI país (USD) + índice local | Yahoo | EWZ/^BVSP, EUSA/^GSPC, EZU/^STOXX50E, EWW/^MXX, EWC/^GSPTSE, COLO/ICOLCAP.CL, EWJ/^N225 |
| 🇨🇱 | TPM, BCP 2Y/10Y, BCU 10Y, dólar observado, IPC, Imacec, IPSA, EEE, EOF | BCCh BDE (cuadros públicos) | ver `CUADROS` en `cl.js` |
| Sostenibilidad | Cuenta corriente, resultado fiscal y primario, ahorro e inversión, deuda/PBI (historia + proyección a 5 años) | FMI WEO (API SDMX) | ver `WEO` en `sust.js` |
| Sostenibilidad | Balanza comercial, deuda externa, reservas, servicio de deuda externa | Banco Mundial (WDI) | ver `WB` en `sust.js` |
| Crédito USD | Spread EMBI por país (Global, LatAm y 16 países) | Banco Central de la Rep. Dominicana | Serie_Historica_Spread_del_EMBI.xlsx |
| Crédito USD | Bonos soberanos en USD de AR, BR, CL, CO, EC, MX, PA, PE, UY (precio, TIR semestral, duration, spread vs UST) | onvista + FRED | `api/_lib/usd-bonds.json` |
| Mundo | 56 activos: MSCI global y por país, índices de EE.UU., Europa, Asia y América, VIX, Treasuries, 11 monedas, commodities | Yahoo | ver `world.js` |

## Estado, pendientes y credenciales

Ver `CLAUDE.md` (tabla de estado por país, checklist de cuentas y pendientes priorizados).

## Agregar un país

Crear `api/_lib/sources/xx.js` que respete el contrato de payload de `CLAUDE.md`,
registrarlo en `api/country.js` y en `TABS`/`COUNTRIES` de `src/App.jsx`. El comparativo de Mundo lo toma solo
si expone KPIs con keys `policy`, `cpi`, `y2`, `fx`, `exp_rate`, `exp_cpi`.
