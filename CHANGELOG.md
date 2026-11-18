# Changelog

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
- Falta: smoke de EE.UU. y México (necesitan `FRED_API_KEY` / `BANXICO_TOKEN`). Calendarios 2027 de Banxico y BanRep
  todavía no publicados.

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
