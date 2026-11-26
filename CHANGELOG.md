# Changelog

## 0.22.0 — 2026-11-26 (Cotizaciones verificadas, USDARS de A3, Comparar con cociente y conclusión)
- **Mundo:** la variación del día de TODAS las cotizaciones usa el cierre anterior de Yahoo (`yahooPrevClose`). Además de las monedas, estaban
  mal los futuros (Brent −3,04% vs +1,20%; oro, plata, cobre, soja) y los índices de Asia (Hang Seng, Shanghai, Nifty). Verificado contra
  Yahoo: 59 de 59 coinciden.
- **USDARS:** dólar UST$T de A3 Mercados (stream público de su portada, primer snapshot; `api/_lib/a3.js`). Sin operaciones en el día
  (antes de la apertura) se muestra el A3500 del BCRA del mismo snapshot, rotulado. Historia, año y 12 meses: serie A3500 del BCRA.
- **Índices ajustados por dividendos:** `yahooSeries` usa `adjclose` por defecto (ETF = retorno total). EWZ a 12 meses: −5,8% con dividendos
  vs −9,9% de precio. En índices de precio, monedas y futuros no cambia nada.
- **Comparar:**
  - Cociente entre los ETF MSCI de los dos países (USD, con dividendos) en velas semanales, con media y ±1σ/±2σ de 5 años.
    Endpoint `pair` (`api/_lib/sources/pair.js`).
  - Conclusión con cinco señales (`src/signals.js`), cada una de −1 a +1: valuación relativa (z del cociente) 25%, momentum del cociente
    (13 semanas) 20%, moneda contra el USD (3 meses) 20%, tendencia de la inflación 15% y tendencia de tasas (bono ~2 años) 20%.
    "Long/short" solo con puntaje ≥ ±45 y casi todas las señales en el mismo sentido; si no, "sesgo a favor" o "sin ventaja clara".
    Avisa cuando valuación y momentum se contradicen.
- Verificado: `npm test` OK (cociente, velas, z, señales, A3, variaciones); `npm run build` OK; captura de Brasil vs México con datos reales.

## 0.21.1 — 2026-11-25 (Mundo: variación de monedas; calendario: Japón)
- **Mundo, monedas.** La variación del día estaba mal: se calculaba contra la barra diaria anterior de Yahoo, que en monedas no es el cierre
  anterior que usa Yahoo. USDMXN mostraba +2,17% cuando Yahoo daba +0,95%; USDCLP +2,15% contra +0,52%. Ahora se usa `meta.previousClose`
  de `range=1d` (`yahooPrevClose`), igual que Yahoo. Test agregado.
- **Calendario, Japón** (API del BoJ, sin clave): PPI y SPPI a/a (las variaciones que publica la BoJ) y Tankan manufacturero y no
  manufacturero de grandes empresas. El dato se toma si la serie se actualizó (`LAST_UPDATE`, hora de Tokio) el día del evento o después.
  Verificado: SPPI oct 4,2% (esp. 3,6%), PPI oct 7,1%, Tankan 3T 24 y 35.
- Pendiente: IPC nacional y de Tokio, desempleo, ventas minoristas, producción industrial y PIB de Japón están en e-Stat, que pide un appId gratuito.

## 0.21.0 — 2026-11-25 (Noticias: más regiones, mercado global, Bluesky y duplicados)
- Fuentes nuevas:
  - Mercado global: Financial Times, Investing.com y Seeking Alpha; Reuters, AP y Unusual Whales vía sus cuentas públicas de Bluesky (API abierta).
  - Bancos centrales: BoJ y BoE.
  - Brasil: Valor e InfoMoney; Chile: Diario Financiero; Europa: Euronews; Japón: Japan Times.
  - Google Noticias por país (AR, BR en portugués, MX, CL, CO, Europa, Japón, China), cada búsqueda con su país, para no sesgar hacia Argentina.
- Las fuentes generalistas (Google Noticias, Bluesky, Euronews, Japan Times) solo aportan titulares con tema de mercado. Se descartan "medios"
  que no son noticias (Facebook, Britannica, YouTube…). DAX/STOXX/FTSE solo cuentan en mayúsculas ("Dax Shepard" no es el DAX).
- La misma noticia en varios medios (parecido de palabras ≥ 50% en 12 h) se muestra una vez, con "+N fuentes" y la lista al pasar el mouse.
- Filtro nuevo: Reino Unido. Las descripciones con HTML dentro de atributos (InfoMoney) se limpian bien.
- Descartadas: X (API paga; el scraping va contra sus términos), Yahoo Finance (solo queda el feed por ticker, con notas de baja calidad),
  CNBC (403). FT y Valor responden 403 de forma intermitente: quedan como opcionales.
- Con datos reales: 500 titulares; Brasil 50, Japón 42, China 43, Europa 37, Reino Unido 40, Chile 30, México 22. `npm test` y `npm run build` OK.

## 0.20.1 — 2026-11-25 (Acceso: verificación automática)
- El middleware acepta también `Authorization: Basic` (mismo usuario y contraseña, sin crear sesión) para que Claude Code verifique el sitio
  con la credencial guardada como secreto del entorno, sin escribir la contraseña en el repo ni en las notas. Test agregado.

## 0.20.0 — 2026-11-25 (Acceso con usuario y contraseña)
- `middleware.js` (Routing Middleware de Vercel, corre antes de la caché) exige sesión en todo el sitio, incluidas las APIs (401).
  - `/login` es un formulario propio y `/logout` cierra la sesión.
  - Usuarios: una variable de entorno por usuario, `AUTH_PASS_<USUARIO>`. Iniciales: HDSP y JV.
  - El valor puede ser la contraseña (marcada "Sensitive") o un hash PBKDF2 (`node scripts/hash-password.mjs <contraseña>`).
  - Sesión: cookie HttpOnly firmada con HMAC-SHA256, 30 días. Al cambiar una contraseña se cierran todas las sesiones.
  - Sin usuarios configurados, el sitio responde 503: nunca queda abierto por error.
  - En el panel: usuario y "Salir" arriba a la derecha; con la sesión vencida vuelve al ingreso.
- Verificado: `npm test` OK (bloqueo sin usuarios, redirección, API 401, contraseña mala, usuario inexistente, redirección externa bloqueada,
  cookie adulterada o vencida, hash PBKDF2, cierre de sesiones al cambiar la contraseña); `npm run build` OK.

## 0.19.0 — 2026-11-24 (Calendario: México, Chile, Colombia y semana siguiente)
- Calendario económico: inflación de **México** (INEGI; dato de Banxico SIE SP30577/SP30578), **Chile** (INE; consenso = mediana de la EOF
  del BCCh "mes actual"; dato de la BDE F074.IPC.VAR.Z.Z.C.M y EP09) y **Colombia** (DANE; dato calculado con la UVR del BanRep, igual al DANE,
  que se muestra recién a la hora de publicación). Cada publicación tiene dos filas: m/m y a/a. México y Colombia, sin consenso público.
- **Esta semana y la siguiente.** Forex Factory solo publica la semana en curso, así que la siguiente se arma con:
  - EE.UU.: fecha del calendario de FRED, hora oficial de cada organismo y el anterior calculado desde FRED. El consenso aparece cuando Forex
    Factory publica la semana.
  - Licitaciones del Tesoro, América Latina y decisiones de bancos centrales (`POLICY_MEETINGS`).
- Sin Australia (AUD), a pedido de Hermes.
- Verificado con datos reales: Chile IPC oct 0,5% m/m (EOF 0,5%), México INPC oct 0,65% m/m y 3,75% a/a, Colombia IPC oct 0,20% m/m y 6,32% a/a.
  `npm test` OK; `npm run build` OK.

## 0.18.0 — 2026-11-24 (Calendario: dato oficial fuera de EE.UU. y América Latina)
- Calendario económico: dato real desde la fuente oficial para Canadá, Reino Unido y Eurozona (`api/_lib/officialActuals.js`).
  - Canadá (StatCan WDS): IPC m/m y a/a, IPC común/mediana/recortado, empleo, desempleo, PIB m/m y ventas minoristas.
  - Reino Unido (ONS): IPC a/a, núcleo y m/m, PIB m/m y trimestral (1.ª estimación en PN2, revisada en QNA), desempleo y ventas minoristas.
  - Eurozona: HICP final y núcleo (BCE, `updatedAfter`), PIB y desempleo (Eurostat, EA21).
  - Cada dato se toma solo si la fuente lo publicó el día del evento o después: StatCan `releaseTime`, ONS `releaseDate`, BCE `updatedAfter`;
    en Eurostat, el último período con dato tiene que ser el esperado.
  - Verificado contra lo publicado en noviembre: CA IPC 0,2% m/m, mediana 2,0%, desempleo 6,7%; UK IPC 3,6%, núcleo 2,8%, PIB 3T 0,7%;
    EZ HICP final 4,0%, núcleo 2,6%, PIB 3T 0,4%.
- América Latina, que Forex Factory no cubre (`api/_lib/latamCal.js`):
  - Brasil: IPCA e IPCA-15 con fecha del IBGE, consenso = mediana Focus mensual del BCB (Focus no releva el IPCA-15) y dato del SGS 433/7478.
  - Argentina: IPC con fecha del INDEC, consenso = mediana REM del BCRA y dato de la serie 27 del BCRA.
- Sin fuente oficial abierta, quedan "—": flash del HICP (BCE y Eurostat solo tienen el definitivo), PMI y encuestas privadas;
  Japón (e-Stat pide registro); Australia (ABS: falta identificar los datasets); Suiza y China.
- Verificado: `npm test` OK (StatCan, ONS, PMI sin dato, Brasil con Focus); datos reales sin errores; `npm run build` OK.

## 0.17.0 — 2026-11-24 (Calendario económico: dato, consenso y anterior)
- Agenda: nueva subsolapa **Calendario económico** (semana en curso, estilo terminal). La agenda de meses pasa a "Agenda (próximos meses)".
  - Esperado y anterior: planilla semanal pública de Forex Factory, todas las monedas (`api/_lib/sources/cal.js`, endpoint `cal`, caché de 3 min).
  - Dato real de EE.UU.: FRED, con la misma transformación que el titular (35 títulos mapeados). Solo se toma si FRED lo publicó el día del
    evento o después. Michigan queda afuera porque FRED la publica con un mes de atraso. Para el resto de las monedas no hay fuente gratuita
    del dato real: queda "—".
  - Licitaciones del Tesoro de la semana: corte (en FRN, margen de descuento) y bid-to-cover de TreasuryDirect. Esperado = bid-to-cover
    promedio de las 6 anteriores del mismo plazo; anterior = la licitación previa.
  - Filtros por impacto y moneda. Los días anteriores van plegados.
  - Verificado con el 24-nov: Case-Shiller 20 2,6% (esp. 2,7%), FHFA 0,0% (esp. 0,2%) y 5 años con bid-to-cover 2,37 (prom. 2,31).
- Descartadas como fuente del consenso: Bloomberg (Terminal), FinancialJuice (Cloudflare Turnstile), Investing/MarketWatch/Nasdaq (bloquean
  consultas automáticas) y Trading Economics (pago).
- Verificado: `npm test` OK (formato, transformaciones, hora ET, dato viejo de FRED, licitación); `npm run build` OK; capturas en escritorio y celular.

## 0.16.1 — 2026-11-24 (FRED: reintentos)
- En producción, apenas desplegado 0.16.0, una carga del panel de EE.UU. falló en todas las series de FRED: las 21 consultas de la agenda
  salían juntas con las 10 series. Ahora la agenda pide de a 4 y `fredGet` reintenta ante 429/5xx. La siguiente carga había salido bien.

## 0.16.0 — 2026-11-24 (Fed: probabilidades por reunión; agenda de EE.UU. ampliada y licitaciones del Tesoro)
- EE.UU., Expectativas: **probabilidad de la decisión de la Fed en cada reunión**, de dos fuentes lado a lado.
  - Futuros de fed funds (CBOT ZQ vía Yahoo): cálculo propio con el método de CME FedWatch (`api/_lib/fedprobs.js`).
  - Polymarket: mercados "Fed Decision in <mes>?" de la API pública Gamma (sin cuenta ni clave).
  - Al 24-nov: diciembre +25 pb 96% (futuros) y 95% (Polymarket); enero, suba 66% y 54%.
- Agenda de EE.UU.: de 7 a 21 publicaciones de FRED: ADP, subsidios por desempleo, ECI, productividad, Michigan, producción industrial,
  bienes durables, balanza comercial, viviendas, Empire State, Filadelfia y resultado fiscal. Tope de 45 eventos para EE.UU.
- **Licitaciones del Tesoro** (`api/_lib/treasury.js`): notas, bonos, TIPS y FRN, sin letras.
  - Cronograma tentativo del Tesoro (PDF, ~3 meses).
  - TreasuryDirect: monto y hora de cierre de las anunciadas, y corte y bid-to-cover de las ya licitadas.
  - En la Agenda aparecen con la etiqueta "Licitación".
- Verificado: `npm test` OK (FedWatch con una tira sintética, Polymarket, cronograma, anunciadas y resultados); datos reales sin errores; `npm run build` OK.

## 0.15.2 — 2026-11-20 (Colombia: TES diario)
- Colombia: TES 10Y y 2Y pasan del promedio mensual (SDMX) a la curva cero cupón **diaria** del BanRep, leída de Suameca, su API de estadísticas
  (`api/_lib/suameca.js`). BanRep la carga una vez por semana: al 20-nov, el último dato es del 13-nov (12,94%). El promedio mensual queda de respaldo.
  - El servidor de Suameca no envía el certificado intermedio: se agrega el intermedio público de DigiCert y la cadena se verifica completa.
- India: sin fuente diaria utilizable para el G-sec 10Y. CCIL (Akamai), FBIL (reCAPTCHA), CNBC (403) y Stooq (verificación con JavaScript)
  bloquean consultas automáticas, y el RBI publica solo datos de fin de mes. Sigue el promedio mensual de la OCDE.
- Verificado: `npm test` OK (mock de Suameca y test de fecha diaria); datos reales sin errores; `npm run build` OK.

## 0.15.1 — 2026-11-20 (Bonos a 10 años: tipo de dato y fecha)
- Mundo, "Bonos a 10 años": cada cuadro muestra qué tipo de dato es y de qué fecha (Mercado / Cierre / Subasta / Prom. mensual).
  Antes no se veía y se mezclaban cierres oficiales del día anterior, una subasta y promedios mensuales.
- EE.UU. 10Y pasa de FRED DGS10 (cierre H.15 del día hábil anterior: mostraba 5,04% el 20-nov con el mercado en 4,91%)
  a Yahoo ^TNX intradiario, la misma fuente que el 30Y.
- México: la variación es contra la subasta anterior (antes decía "1 mes").

## 0.15.0 — 2026-11-20 (Noticias y selector de países)
- Nueva solapa **Noticias**: titulares minuto a minuto de feeds RSS públicos, unificados y ordenados por hora (`api/_lib/sources/news.js`).
  - Fuentes: Bloomberg (mercados, economía, política), WSJ (mercados, mundo), MarketWatch, comunicados de la Fed y del BCE,
    Google Noticias (búsquedas de finanzas de América Latina en español e inglés, con el medio de origen) y FinancialJuice.
  - Filtros por tema (bancos centrales, datos, mercados, política), por país o América Latina, por fuente y búsqueda de texto.
    Etiquetas automáticas por palabras clave. Se resaltan los titulares nuevos desde la actualización anterior.
  - Se actualiza cada minuto con la solapa abierta (caché de 60 s). Una fuente caída queda "no disponible" sin cortar el resto.
  - Sin Reuters: no tiene feed público (solo con LSEG).
- Los países pasan a un selector **Países** en la barra superior (menú desplegable con teclado), para liberar espacio.
- Verificado: `npm test` OK (mocks de los 11 feeds, deduplicación, medio de Google, prefijo de FinancialJuice, fuente caída);
  datos reales: 11/11 fuentes, ~380 titulares; `npm run build` OK; capturas en escritorio y celular.

## 0.14.2 — 2026-11-20 (Curva del Tesoro robusta)
- Crédito USD: la curva del Tesoro (FRED, 11 series en paralelo) a veces llegaba con menos de 5 plazos por límite de consultas y el
  adaptador la descartaba entera → sin spreads de bonos ni "Rend. USD aprox." (visto en producción el 20-nov: "FRED: curva del Tesoro
  incompleta", respuesta guardada 15 min en el CDN). Ahora: reintento de a una con espera de las series que fallan y respaldo con Yahoo
  (^IRX, ^FVX, ^TNX, ^TYX) para los plazos que sigan faltando.
- `country.js`: si alguna fuente falló, la respuesta se cachea 60 s como máximo (antes, el TTL normal de la solapa).
- Uruguay y Ecuador ya estaban en Crédito USD (EMBI, curvas, ranking): verificado en producción.

## 0.14.1 — 2026-11-20 (EMBI al día; Ecuador con composición propia)
- **EMBI desactualizado en producción**: el CDN del BCRD le servía a Vercel la planilla del día anterior (producción al 18-nov con el
  origen ya al 19-nov, `x-vercel-cache: MISS`). Se agrega `?v=<timestamp>` y `cache: no-store` a la descarga (el sitio del BCRD usa
  `?v=` en sus propios links). Verificado localmente: 19-nov.
- **Ecuador** en Sostenibilidad (todo el tablero) y en la composición de la deuda con **dato propio**: Boletín de Deuda Pública del
  Ministerio de Economía y Finanzas (`ecdebt.js`): base del boletín (hoja "1.", indicador deuda/PIB consolidado) y perfil de vencimientos
  de corto plazo (hoja "16.", capital de los próximos 12 meses). Último mes publicado elegido por el rótulo (los ids no son correlativos).
  Agosto 2026: deuda 50,0% del PIB, 76,8% con acreedores externos, vencimientos a 12 meses 6,9% del PIB (13,8% del total); dolarizado →
  100% en una moneda que no emite.
- Ranking: Ecuador pasa a tener el pilar de composición (antes re-ponderado al 75%). Al 20-nov: 1 Chile 75, 2 Perú 73, 3 Uruguay 70,
  4 Colombia 57, 5 México 51, 6 Brasil 45, 7 Argentina 36, 8 Ecuador 35. Con el min–max, el 100% de Ecuador en moneda extranjera pasa a
  ser el peor valor del grupo y sube el puntaje de composición del resto (p.ej. Argentina 12 → 41).

## 0.14.0 — 2026-11-20 (Ranking de emisores soberanos)
- Crédito USD: **Ranking de emisores** (AR, BR, CL, CO, MX, PE, UY, EC; `c=rank`, caché 1 h). Pilares y pesos acordados con Hermes:
  fiscal 25% (deuda bruta, intereses/ingresos, resultado fiscal), composición 25% (% en moneda extranjera, % con acreedores externos,
  vencimientos a 12 meses), externo 20% (cuenta corriente, reservas/PBI, deuda pública en ME/reservas), institucional 15% (promedio de
  los 6 WGI) e historial 15% (años desde el último default comercial ≥ USD 1.000 M, tope 30; base BoC-BoE 2026; se excluyen atrasos con
  acreedores oficiales). Cada indicador 0–100 contra el grupo (min–max); pilar = promedio; total ponderado (re-ponderado si falta un pilar).
- **Solo datos 2025 o posteriores**: no se usa deuda externa de corto plazo/reservas (último dato 2024). Chile sin residencia del acreedor
  (dato QPSD no creíble); Ecuador sin composición (no reporta a QPSD) → total sobre 75% de los pesos.
- Comparación con el EMBI: ajuste log-lineal del spread contra el puntaje (R² 0,84 al 20-nov) → spread "justificado" y diferencia.
  Gráfico de fundamentos vs spread (escala log) y tabla con el valor y el puntaje de cada indicador.
- Resultado al 20-nov-2026: 1 Chile 71, 2 Perú 65, 3 Uruguay 63, 4 Colombia 55, 5 México 48, 6 Brasil 45, 7 Ecuador 43, 8 Argentina 28.
  Brasil paga 123 pb menos que lo que justifican sus fundamentos; Ecuador 181 pb más; Argentina 81 pb más.
- Tests: puntaje min–max, ajuste del spread, años sin default (umbral, acreedores oficiales), re-ponderación de Ecuador. `mockXlsx` acepta varias hojas.

## 0.13.0 — 2026-11-20 (Composición de la deuda pública)
- Sostenibilidad: tabla **Composición de la deuda pública** (Banco Mundial, Quarterly Public Sector Debt, API fuente 20, trimestral):
  deuda en % del PBI, % en moneda extranjera, % con acreedores no residentes y lo que vence en 12 meses (corto plazo + cuotas de largo
  plazo que vencen en el año), en % del PBI y del total. Gobierno central para todos salvo Chile (solo publica el presupuestario central).
  Verificado en vivo (2026Q2): AR 52% en ME, 34% externos, 29% vence en 12 meses; BR 3% / 12% / 27%; UY 41% / 41% / 6%.
- Advertencias: Chile reporta 2% de acreedores externos con 33% en moneda extranjera (no creíble; se marca); India no reporta a QPSD;
  Eurozona sin agregado; Colombia sin residencia del acreedor; Japón sin moneda.
- `xlsx.js`: `readSheet(buf, n)` para leer cualquier hoja (lo necesita la base de defaults del Banco de Canadá).
- Datos confirmados para el ranking de emisores (sin construirlo todavía): FMI WEO (ingresos → intereses/recaudación), QPSD (composición),
  Banco Mundial IDS (deuda externa de corto plazo / reservas, emergentes), WGI (gobernanza, 6 indicadores, 2025) y BoC-BoE Sovereign
  Default Database 2026 (monto en default por país y año desde 1960, por tipo de acreedor).

## 0.12.2 — 2026-11-20 (China en Valuación; monedas en Mundo)
- Valuación – Países: China (sin panel macro) con iShares MCHI (ratios y flujos), MSCI China (factsheet en USD: P/E 11,96,
  forward 9,32 al 30-oct) y worldperatio (P/E sobre FXI, FTSE China 50; pasa el control de calidad a 5 y 10 años).
- Mundo: USDPEN y USDINR (faltaban desde que se sumaron Perú e India). USDCNY, MCHI y Shanghai ya estaban.
  No se suman CSI 300 ni USDCNH: Yahoo solo devuelve el último dato, sin historia.

## 0.12.1 — 2026-11-20 (Sectores sin Siblis; control de calidad de la historia)
- Sectores: se saca Siblis (mensual) y quedan solo datos directos y diarios de State Street; se suma el PEG (P/E FY1 ÷ crecimiento
  esperado, cálculo propio).
- **Control de calidad de worldperatio** (`wpeQuality`): por serie y ventana se mide el % de meses que repiten el valor anterior y si la
  ventana arranca antes del lanzamiento del ETF base (historia reconstruida que el sitio no documenta). Si falla (>10% repetidos o
  pre-lanzamiento) la lectura pasa a "Baja calidad" con el motivo. Resultado: a 5 años pasan las 25 series; a 10 años fallan AR, CO,
  PE, JP, América Latina y 9 de 12 series de sectores (p.ej. XLP 28% de meses repetidos). La tabla arranca en 5 años.
- **S&P Dow Jones Indices** (`sp-500-eps-est.xlsx`): no se pudo sumar, el sitio responde 403 "Security Controls Triggered" a toda
  consulta automática. **FactSet Earnings Insight**: los P/E forward por sector vienen solo como imagen; no se usa (OCR = datos sucios).
- Dev: el proxy de Vite pasa a `/api/country` (antes `/api` interceptaba el import de `api/_lib/calendar.js` y la UI no cargaba en `npm run dev`).

## 0.12.0 — 2026-11-20 (Valuación: países y sectores de EE.UU.)
- Valuación con dos subsolapas: **Países** (lo anterior) y **Sectores de EE.UU.** (11 sectores del S&P 500 + S&P 500 de referencia).
- Sectores, datos directos: planilla diaria de productos de State Street (`spdr-product-data-us-en.xlsx`): P/E FY1 (forward),
  P/B, crecimiento esperado del EPS 3-5 años, dividendo del índice, SEC 30d, holdings y capitalización promedio. Siblis Research
  (mensual, con *): P/E trailing y forward, crecimiento implícito y crecimiento de las ganancias a 1/3/5 años.
- Sectores, historia: worldperatio (`/sector/sp-500-<sector>` e `/index/sp-500`), misma tabla y gráfico con bandas que países.
- Sectores, flujos: histórico de NAV y cuotas de cada SPDR (`navhist-us-en-<ticker>.xlsx`).
- El gráfico de P/E histórico tiene su propio selector de ventana (5/10/20 años, arranca en 5) independiente de la tabla.
- Verificado en vivo: 12 ETF de sectores con SSGA, worldperatio y flujos; 11 sectores en Siblis; sin errores (solapa en ~6 s, caché 1 h).

## 0.11.1 — 2026-11-20 (Valuación: datos directos primero)
- Primera tabla con los datos de quienes arman índices y fondos: iShares (P/E y P/B del ETF diarios; dividendo 12m, SEC 30d,
  beta y volatilidad 3 años mensuales) y MSCI (P/E, P/E forward, P/BV y dividendo del índice país, mensual). Asterisco en todo
  lo que se publica una vez por mes, con la fecha de cada fuente.
- Segunda tabla: worldperatio contra la propia historia (rangos ±1 y ±2 desvíos). Gráfico del P/E con bandas sombreadas de
  ±1 y ±2 desvíos y el promedio punteado (las bandas son áreas, no series: una sola línea de datos).

## 0.11.0 — 2026-11-20 (P/E histórico con desvíos y P/E forward)
- **Valuación contra la historia** (worldperatio.com, sin clave): P/E diario por país (calculado sobre el ETF), historia mensual
  desde 1995 y, por ventana de 5/10/20 años, promedio, desvío estándar (excluyendo el 10% extremo de cada lado), rango ±1 desvío,
  cuántos desvíos está hoy del promedio y lectura (muy barato / barato / neutral / caro / muy caro). Gráfico del P/E con la banda
  ±1 desvío. Eurozona: worldperatio solo publica Europa (VGK), se avisa. Argentina y Colombia incluidos (ARGT, COLO).
- **P/E forward MSCI**: factsheet mensual en PDF leído con `unpdf` (nueva dependencia, pdf.js empaquetado para serverless):
  dividend yield, P/E, P/E forward y P/BV del índice país; EM y ACWI salen de las filas de comparación. Verificado contra el
  factsheet propio de MSCI EM (P/E 13,68, forward 8,70 al 30-oct-2026: es lo que publica MSCI).
- Solapa reorganizada en tres bloques: valuación, P/E histórico y flujos (iShares). Verificado en vivo: 13 países con worldperatio,
  13 con MSCI, 12 ETF con flujos, sin errores. Test offline con página simulada de worldperatio y un PDF mínimo real.

## 0.10.0 — 2026-11-20 (Valuación y flujos + agenda política)
- **Valuación** (solapa nueva, `c=val`, caché 1 h): por país, el ETF de iShares de referencia con P/E (12 meses), P/B y dividendo
  12m (API de producto de BlackRock, diarios) y **flujos netos** 1 sem / 1 mes / 3 meses / año / 12 meses en USD millones o % de
  los activos, más el flujo acumulado de 12 meses (hasta 3 países). Flujo diario = Δ cuotas en circulación × NAV, de la hoja
  "Historical" de la planilla del fondo (se lee en streaming y se corta en ~300 días). Verificado: 12 ETF sin errores;
  ej. EWZ −54 M de cuotas desde el 22-oct (≈ −USD 1.600 M en el mes).
  - Pendiente: ARGT y COLO (Global X responde 429); P/E forward del índice MSCI (factsheet mensual en PDF: falta OK para
    sumar un lector de PDF); historia del P/E (ver CLAUDE.md).
- **Agenda política** (`POLITICAL_EVENTS`, kind `pol`): AR (PASO 8-ago, generales 24-oct, eventual balotaje 21-nov-2027),
  BR (asunción 5-ene, Congreso 1-feb), MX (intermedia 6-jun), CO (territoriales 31-oct), Francia (presidencial 18-abr y 2-may,
  previsto), Japón (locales unificadas 11 y 25-abr, previsto). Sin fecha: España, Italia, estaduales de India.
  Botones **Todo / Económico / Político** en la Agenda (se recuerda la elección); etiqueta "Político" en color propio.

## 0.9.0 — 2026-11-19 (Perú, India, agenda completa y orden de solapas)
- **Orden de solapas**: Mundo, Crédito USD, Sostenibilidad, Comparar, Agenda y después los países (AR, BR, EE.UU., EZ, MX,
  CA, CO, CL, PE, JP, IN). La barra pasa a dos filas en pantallas anchas (scroll horizontal en celular).
- **Perú** (nuevo panel): tasa de referencia BCRP e IPC (BIS), EMBI (BCRD), USDPEN, EPU, proyecciones del FMI (WEO).
  La API del BCRP responde con un desafío anti-bots a consultas automáticas (19-nov-2026): sin curva en soles ni encuesta.
- **India** (nuevo panel): repo del RBI e IPC (BIS), call, interbancaria 3M y G-sec 10Y (OCDE vía FRED, mensuales),
  proxy 3M − repo, USDINR, INDA/Nifty 50 y proyecciones del FMI (años fiscales abr–mar). India entra en Sostenibilidad.
- **Agenda**: inflación, PIB y decisiones de banco central en todos los países, con fecha oficial:
  - AR: INDEC (PDF 2.º sem. 2026): EMAE, IPC, PIB 3T. EZ: HICP flash y final hasta jun-27 (calendario estadístico del BCE)
    y PIB 3T (Eurostat). MX: INPC quincenal y mensual, PIB oportuno y revisado, IGAE hasta jun-27 (PDF INEGI 2026 y 2027).
  - CA: IPC y PIB (último "Next release" de The Daily). CO: DANE **en vivo** (vista mensual, IPC/PIB/ISE). CL: IPC del INE.
  - JP: IPC nacional y de Tokio (MIC) y PIB (Cabinet Office). IN: decisiones del MPC (RBI) e IPC/PIB previstos (MOSPI).
  - BR: **corregido** — el calendario del IBGE usa nombres completos y el filtro nunca captaba IPCA ni IPCA-15; ahora sí
    (IPCA-15 rotulado "mitad de mes") y ventana de 90 días. EE.UU.: nombres de publicaciones en español.
- Pendiente: Perú (BCRP e INEI sin calendario legible), BCCh (RPM 2027, PIB, Imacec), StatCan 2027, Banxico y BanRep 2027,
  INDEC 1.er sem. 2027.
- Tests: parser del BIS (campos con comas, NaN), parser del DANE, agenda de BR con IPCA/IPCA-15/PIB.

## 0.8.2 — 2026-11-19 (convención de monedas)
- Rótulos de tipo de cambio en formato de ticker sin barra (USDMXN, USDBRL, EURUSD, USDJPY…), coherente con los valores
  (moneda cotizada por 1 unidad de la base). Nota de convención en el panel "Hoy" y en CLAUDE.md.

## 0.8.1 — 2026-11-19 (Recargar)
- Antes el CDN guardaba cada respuesta 30 min (+1 h stale): "Recargar" devolvía la copia. Ahora la caché depende del dato:
  Mundo 60 s sin stale, países 5 min, Crédito USD 15 min, Sostenibilidad 6 h; "Recargar" agrega ?fresh=<ts> (siempre MISS).
- Auto-actualización con la pestaña visible: Mundo cada minuto y la solapa abierta cada 5 minutos.
- La hora de actualización vuelve a verse en el encabezado (hora local).
- Verificado en vista previa: repetido → HIT; con ?fresh → MISS.

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
