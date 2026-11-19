# Changelog

## 0.8.0 — 2026-11-19 (Argentina + auditoría de Sostenibilidad)
- **Argentina** (nuevo panel): TAMAR (sin tasa de política del BCRA desde jul-25), pases 1 día, BADLAR, inflación INDEC
  mensual e interanual, REM (inflación 12m con historia, trayectoria mensual esperada, tabla con inflación/núcleo/TAMAR/TC/PIB/
  resultado primario/desempleo), EMBI, A3500 con bandas, reservas, resultado fiscal SPN 12 meses (% PBI) y ARGT. Agenda: IPC 15-dic.
- **Sostenibilidad – auditoría**: columnas de **dato oficial** con fecha y frecuencia (AR mensual, BR mensual, CL/EA/EE.UU.
  trimestral o anual) junto al FMI, lectura con el dato oficial y gráficos mensuales/trimestrales. Hallazgos documentados:
  AR resultado oficial 2025 +1,38% primario / +0,17% financiero (SPN base caja) vs −0,2% FMI (gobierno general, devengado);
  BR deuda 83% (DBGG, BCB) vs 93% FMI (incluye títulos en cartera del BCB); el 105% era la proyección 2031 del FMI.

## 0.7.1 — 2026-11-19 (Sostenibilidad: rechequeo de datos)
- Inflación del FMI (dic/dic y proyección del año siguiente) en el tablero, separada del **crecimiento del PBI nominal**
  (real + deflactor, promedio del año). En el mensaje anterior se rotuló mal como "inflación" el 45,5% de Argentina 2025:
  es crecimiento nominal; la inflación del FMI es 31,5% dic/dic 2025 y 29,5% proyectada 2026.
- Deuda/PBI de los últimos dos años (2023, 2024, 2025) y variación en 2 años; lectura por país con esa evolución.
- Primario que estabiliza la deuda también como promedio de las proyecciones 2026–2031.
- Notas: deuda del FMI = gobierno general (no Administración Central; contrastado con Finanzas: AR 78,1% a dic-25 AC vs
  80,1% GG FMI). Argentina 2023: el ratio salta por la devaluación de diciembre medida contra PBI a precios promedio.

## 0.7.0 — 2026-11-19 (Sostenibilidad)
- **Sostenibilidad** (solapa nueva): modelo de las tres brechas para 11 economías (AR, BR, CL, CO, MX, PE, UY, EE.UU., CA,
  Eurozona, JP). Tablero con cuenta corriente, resultado fiscal y primario, brecha privada (S−I), deuda/PBI actual y a 5 años,
  tasa implícita, crecimiento nominal, primario que estabiliza la deuda y holgura, balanza comercial y reservas.
  Ficha por país con lectura en texto (solo con los números disponibles) y 4 gráficos (tres brechas, ahorro e inversión,
  primario efectivo vs estabilizador, balanza comercial vs cuenta corriente). Trayectoria de deuda/PBI comparada (hasta 3 países).
- Fuentes: FMI WEO por la API SDMX oficial (historia desde 2005 y proyecciones a 2031) y Banco Mundial (WDI).
- Ajustes: el BCCh pasó a la API oficial con token (#5). Menú en una fila.

## 0.6.0 — 2026-11-19 (Crédito USD con EMBI + Chile)
- **Chile** (nuevo panel): TPM, IPC, BCP 2Y/10Y, BCU 10Y, compensación inflacionaria 10Y, dólar observado, Imacec, IPSA,
  ECH; expectativas de la EEE (inflación 11/23 meses, TPM por plazo, PIB) y de la EOF (TPM e inflación 12m), con trayectoria
  de TPM esperada y tabla. Fuente: cuadros públicos de la BDE del Banco Central de Chile (sin credenciales). Agenda: RPM 15-dic-2026.
- **Crédito USD** (solapa nueva): spread **EMBI** de la planilla diaria del Banco Central de la Rep. Dominicana (Global,
  América Latina y 16 países): ranking con variaciones a 1d/1m/3m/12m/en el año, rango de 12 meses, rendimiento en USD
  aproximado (UST 7Y + spread) e historia comparada desde 2007. Debajo, curvas de los bonos soberanos en USD (onvista)
  con TIR propia en base semestral para bullets y TIR de onvista convertida para amortizables/step-up.
- `api/_lib/xlsx.js`: lector de .xlsx sin dependencias. Tests de TIR, duration y del parser del EMBI (planilla simulada).
- Menú en una sola fila (con scroll horizontal si no entra).

## 0.5.1 — 2026-11-19
- Mundo: íconos para cada commodity (en cuadros, panel "Hoy" y desempeño); "Bonos a 10 años **en moneda local**" con nota
  (es el costo de financiarse en moneda propia, no deuda en USD).
- Menú más compacto (entra en una línea a 1440 px).

## 0.5.0 — 2026-11-18 (Mundo tipo terminal + Comparar)
- **Mundo** reorganizado en cuadros: índices principales (bandera, código, último y variación del día; "ver los 12"),
  MSCI ACWI e índice dólar con número grande y área de 12 meses, cuadros de bonos a 10 años de los 7 países + UST 30Y
  (color según la tasa sube/baja), commodities y riesgo. **Panel lateral "Hoy"** fijo con los 56 activos (Último, Var, Var %).
  Debajo: World vs EM vs LatAm, Tendencias, Comparativo y Desempeño por grupo (año y 12 meses).
- **Comparar** (solapa nueva): elegir dos países (se recuerdan en el navegador), tabla lado a lado con variaciones a 3 y
  12 meses y diferencia en pb, y 6 gráficos superpuestos (política, inflación, bono 2Y y 10Y, moneda y MSCI en base 100).
- API: cada KPI trae `prevChange`/`prevDate` (variación contra la observación anterior); Mundo trae `cc`, `code`,
  `featured` y `d1abs` por activo.
- Verificado: `npm test`, build, capturas de escritorio y móvil sin errores ni scroll horizontal.

## 0.4.0 — 2026-11-18 (rediseño + Japón + datos faltantes)
- **UI**: tema negro, tipografía Inter (sin monoespaciada), KPIs con valor grande, sparkline y chips de variación a 1/3/12 meses
  (flecha y fondo por dirección, par divergente azul↔rojo validado contra la superficie #111). Tablas con encabezados,
  alineación y espaciado uniformes; banderas SVG (los emoji no se veían en Windows); pestañas con scroll en móvil.
- **Japón** (nuevo): BoJ API (call O/N, Tankan), BIS (IPC), MOF (curva JGB), Yahoo (USD/JPY, EWJ/^N225), agenda BoJ 2026–27.
- **Mundo**: de 21 a 56 activos (MSCI por país, Nasdaq/Dow/Russell, DAX/CAC/FTSE/Hang Seng/Shanghai/KOSPI/Nifty, Ibovespa/IPC/TSX/COLCAP,
  Treasuries 5Y/30Y, GBP/JPY/CNY/CLP/ARS, WTI, plata). Tasas con variación en pb. Gráfico World vs EM vs LatAm (base 100).
  Consultas a Yahoo limitadas a 8 en paralelo.
- **Sin "n/d"**: Brasil prefijado 2Y/10Y, real 10Y y breakeven (Tesouro Direto); México encuesta Banxico (trayectoria de tasa,
  inflación 12m, tabla) y Bonos M 3Y/10Y; Canadá breakeven LP; Colombia TES 2Y. Se quitaron las tarjetas sin fuente posible
  (encuesta BanRep: captcha; Merval: sin historia).
- Verificado: `smoke` de los 8 paneles sin errores ni KPIs vacíos; `npm test` OK; capturas en escritorio y móvil sin errores de consola.

## 0.3.0 — 2026-11-18 (primera sesión en Claude Code)
Primera corrida de `smoke` contra las APIs reales (fuentes sin clave: BR, EZ, CA, CO, Mundo).
- **Eurozona – HICP**: el dataset `ICP` del BCE quedó congelado en dic-2025 (el panel mostraba inflación de hace 11 meses).
  Pasado al dataset `HICP` con proveedor `4D0`: `HICP.M.U2.N.000000.4D0.ANR` y `HICP.M.U2.N.XEF000.4D0.ANR` (oct-2026: 4,0% / 2,6%).
- **Colombia**:
  - Tasa de política: flujo fijado en `DF_CBR_DAILY_HIST` (antes se descubría por nombre).
  - IPC: BanRep SDMX no tiene IPC. Ahora se deriva de la UVR (`DF_UVR_DAILY_HIST`), contrastado con el DANE ene–oct 2025
    (coincide al centésimo). FRED/OCDE queda de respaldo. Test unitario de `ipcFromUvr`.
  - IBR: claves reales `CO.IRIBRM{00,06}._Z._Z._Z.ER.D` (efectiva anual, comparable con la tasa de política).
  - Nuevo KPI TES 10Y (`DF_TES_MONTHLY_HIST`, `IRGBRY10`, promedio mensual) en lugar de "Pendiente".
  - MSCI Colombia: `GXG` fue renombrado `COLO` (también en Mundo). `ICOLCAP.CL` confirmado (BVC).
  - Agenda: JDBR 18-dic-2026.
- **Brasil**: SGS 432 trae la Selic meta cargada hasta la próxima reunión (fecha futura); `sgs()` ahora corta en hoy.
- Mock de BanRep actualizado al formato real de claves; `npm test` exige agenda para Colombia.
- Verificado OK contra la API real: todo BR (incl. Focus IPCA 12m e IBGE), EZ (forwards `IF_*`, SPF), CA (V41690973),
  CO, Mundo y tickers ZQ de Yahoo.
- Con claves: smoke de EE.UU. y México OK (FRED y Banxico SIE: todos los KPI con fuente).
- EE.UU. agenda: `/fred/releases/dates` tardaba ~17 s en frío (timeout) y se cortaba en 1000 filas; ahora se consulta
  `/fred/release/dates` por release (IDs fijos en `FRED_RELEASES`, ~0,4 s c/u).
- UI revisada con datos reales (dev local): sin errores de consola.
- Falta: calendarios 2027 de Banxico y BanRep (no publicados). Bono 2Y de BR/MX/CO en el comparativo (hoy n/d).

## 0.2.0 — 2026-11-18
- Colombia: tasa de política e IPC (BanRep SDMX con descubrimiento de flujos), IBR overnight/6M,
  TRM (datos.gov.co, fallback BanRep), GXG/ICOLCAP. Proxy de expectativa: IBR 6M − tasa de política.
- Capa de **dinámica**: cada KPI trae variación a 1/3/6/12 meses, dirección a 3 meses y sparkline de 13 meses.
  Tabla "Dinámica" por país y "Tendencias" entre países en la vista Mundo.
- Historia de expectativas: Focus IPCA 12m adelante y Selic/IPCA/USD-BRL fin del año próximo (BR),
  tasa implícita en el contrato ZQ a +12m (EE.UU.), forward 1Y de la curva AAA y SPF de largo plazo (EZ),
  2Y − overnight (CA).
- Agenda: Banxico 17-dic-2026; FOMC 2027 revisado (26-27 oct = reunión de estrategia, sin decisión).
- CLAUDE.md con arquitectura, contrato de payload, checklist de cuentas y pendientes.
- Verificado: tests offline (`npm test`) y render con datos sintéticos. **Sin verificar contra APIs reales.**

## 0.1.0 — 2026-11-18
- Primera versión: BR, US, EZ, MX, CA + Mundo + Agenda. Funciones serverless Vercel, React + Recharts.
