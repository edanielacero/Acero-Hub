# Finanzas — Documento Maestro de Planificación

## Qué es

Sistema personal de gestión financiera y crecimiento patrimonial (no un simple expense tracker). Debe permitir responder rápido: cuánto tengo, cuánto es líquido, cuánto invertido, cuánto gasté/en qué, cuánto puedo gastar, cuánto ahorro/invierto, cuánto reservado para obligaciones, cuánto para crecimiento, cuánto me deben/debo, cómo evoluciona el patrimonio, y si voy avanzando hacia mis objetivos.

Contempla finanzas personales **y** actividad freelance/emprendimientos digitales del usuario.

## Proyecto individual dentro del Hub

- Slug: `finanzas` — Ruta: `/finanzas`
- Mini-app **privada y estrictamente personal** (un solo usuario, sin compartir datos — a diferencia de Expandlogy). Requiere login; el layout (`app/finanzas/layout.tsx`) verifica admin o `project_access` sobre el project row `slug='finanzas'`, igual que el resto del Hub.
- **RLS**: todas las tablas `fin_*` usan el patrón de `trading-journal` (`tj_*`) — `user_id = auth.uid()` directo en tablas raíz, `exists (select 1 from fin_<padre> where ... user_id = auth.uid())` en tablas hijas. Las escrituras pasan por `createAdminClient()` en los route handlers tras verificar `user.id` manualmente (RLS es defensa en profundidad, no el único gate).

## Estado actual (ir actualizando a medida que se completan sprints)

- ✅ **Sprint 1 — Fundación** (cuentas, categorías, tipo de cambio) completado.
- ✅ **Sprint 2 — Transacciones + auto-categorización** completado. `fin_transactions` con el enum completo de 11 tipos y `flow_type` derivado desde el día 1; `fin_category_rules` para las sugerencias por palabra clave; quick-add compartido (`app/finanzas/components/quick-add.tsx`) con 6 flujos (Gasto, Ingreso, Transferencia, Inversión, Retiro, Ajuste); `/finanzas/transacciones` con filtros; los saldos de `/finanzas/cuentas` ahora derivan de `initial_balance + Σ transacciones`, no solo del saldo inicial.
- ⏳ Sprints 3–14 pendientes — ver roadmap completo abajo.

## Principios de diseño (no negociables, guían cualquier decisión de modelado futura)

1. No mezclar patrimonio con flujo de caja.
2. Las transferencias entre cuentas propias no son ingreso ni gasto.
3. Los reembolsos no son ingreso.
4. El dinero por cobrar no es dinero disponible hasta que se recibe.
5. Separar ingreso base de ingreso variable/extraordinario.
6. Separar gasto personal de gasto para generar ingresos (fondo de crecimiento).
7. Separar fondo de emergencia de inversiones.
8. Separar dinero para objetivos futuros.
9. Registrar gastos irregulares — no asumir $0 solo porque no son mensuales.
10. Mantener histórico de tipos de cambio — congelado por transacción, nunca recalcular retroactivamente.
11. Permitir USD y Bs, con totales en ambas monedas.
12. No obligar a que todos los meses sean iguales (ingresos variables, gastos irregulares).
13. Priorizar crecimiento de ingresos, no solo reducción de gastos.

## Decisiones de modelado que resuelven vacíos de la spec original

- **`flow_type` derivado + `type` extendido**: `fin_transactions.type` ∈ `ingreso, gasto, transferencia, inversion, retiro_inversion, reembolso, pago_deuda_por_cobrar, ajuste_patrimonio, aporte_objetivo, aporte_pasanaku, recepcion_pasanaku`. `flow_type = 'consumo'` solo si `type='gasto'`; todo lo demás es `'movimiento'`. Los reportes de "gasto real" y "tasa de ahorro" solo suman `flow_type='consumo'`; patrimonio/liquidez usan todos los movimientos. Así, aportes a pasanaku y objetivos nunca se cuentan como gasto de consumo, tal como pide la sección de Pasanaku de la spec original.
- **Sin tabla `Investment` separada**: se modela con `fin_accounts` (tipos `inversion|cripto|trading`) + `fin_asset_valuations` (snapshots de valuación — el valor cambia por mercado, no por transacciones propias) + transacciones `inversion`/`retiro_inversion` para los movimientos de efectivo hacia/desde esas cuentas.
- **"Bolsillos" (Vivir / Obligaciones futuras / Seguridad / Crecimiento / Patrimonio) son derivados, no fondos segregados físicamente**: columna `bucket` en `fin_categories` para Vivir/Obligaciones futuras/Crecimiento; el bolsillo Patrimonio se deriva del `type` de la cuenta; el bolsillo Seguridad se deriva del goal `fondo_emergencia`. Cero tablas de saldos por bolsillo.
- **Balance de cuentas derivado, no snapshot mutable** (mismo principio que `lib/trading/capital.ts` en Trading Journal): `saldo = initial_balance + Σ transacciones que afectan la cuenta`. Excepción: cuentas ilíquidas (inversión/cripto/trading) usan la última `fin_asset_valuations.value_usd` si existe, porque su valor lo pone el mercado, no las transacciones propias.
- **Seeds (categorías) vía endpoint idempotente + botón en la UI**, no vía migración SQL con `user_id` hardcodeado.
- **Sin IA para auto-categorización en v1** — reglas simples por palabra clave, editables (`fin_category_rules`).
- **Suscripciones recurrentes nunca auto-postean una transacción** — son solo metadata/recordatorio; el usuario siempre confirma manualmente.
- **Sin CSV import** — entrada 100% manual, el usuario casi no usa banca formal.
- **Sin Apple Wallet** — descartado (requería Apple Developer Program de pago + infraestructura de certificados/push dedicada, desproporcionado para el valor que agrega).

## Tipo de cambio — fuentes (verificadas y en uso desde Sprint 1)

| Par | Fuente | Detalle |
|---|---|---|
| USD → Bs (oficial) | `GET https://bo.dolarapi.com/v1/dolares/oficial` | Republica el oficial del BCB, actualiza a medianoche. Sin API key. Campo usado: `venta`. |
| Bs → USDT (paralelo) | `GET https://paralelo.bo/api/v1/rate` | Promedio de 5 plataformas P2P (Binance/Bybit/OKX/Bitget/ElDorado), actualiza cada 60s. Sin API key. Campo usado: `median`. |
| BTC → USDT | `GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT` | Sin API key para uso básico. Campo usado: `price`. |

El usuario puede fijar un override manual en `/finanzas/tipo-cambio` si alguna fuente falla o si prefiere su propia tasa. El tipo de cambio se congela en cada transacción histórica — nunca se recalcula retroactivamente.

Cron en `vercel.json`: `0 0,12 * * *` → `POST /api/finanzas/exchange-rates/refresh`, autenticado por Vercel automáticamente con `Authorization: Bearer $CRON_SECRET` (reutiliza el `CRON_SECRET` ya existente en el proyecto).

## Categorías iniciales (seed, jerárquicas)

- **Ingresos**: Trabajo principal, Freelance, Bonos, Negocios digitales, Otros
- **Alimentación**: Comida, Desayuno, Restaurantes, Cafés, Postres, Delivery, Otros
- **Transporte**: Gasolina, Taxi, Mantenimiento, Otros
- **Pareja**: Restaurantes, Cafés, Cine, Flores, Regalos, Actividades, Otros
- **Entretenimiento**: Streaming, Cine, Amigos, Fiestas, Otros
- **Salud y bienestar**: Gym, Salud, Cuidado personal, Otros
- **Tecnología/Software**: Claude, APIs, iCloud, Google One, Spotify, Netflix, Dominios, Otros
- **Trabajo/Negocios**: Publicidad, Herramientas, Software, APIs, Freelance, Negocios digitales, Otros
- **Gastos irregulares**: Regalos, Cumpleaños, Viajes, Mantenimiento, Ropa, Compras grandes, Otros
- **Finanzas**: Inversión, Trading, Bitcoin, Comisiones, Otros
- **Reembolsos**: Spotify, TradingView, Otros gastos compartidos

## Perfil financiero de contexto (a la fecha de creación de la app — se carga vía UI, no está hardcodeado en el código)

**Ingresos**: trabajo principal ~$900 USD netos/mes (bruto ~$1000, tras comisiones — usar el neto como ingreso *base* para presupuestar, nunca el bruto ni el variable). Freelance ~$120/mes, variable, no garantizado, nunca justifica subir el gasto fijo automáticamente.

**Patrimonio inicial**: Airtm Earn $1299, Broker trading $980, Bitcoin $900, USDT $30, Efectivo $0, Cuentas bancarias $0 (total ≈ $3209).

**Dinero por cobrar**: $957 USD, pagos esperados ~$100/mes × 9 meses + $57 el mes 10.

**Pasanaku**: aporte 300 Bs/mes.

**Objetivo "Contadores"**: meta $1000 USD/año, aporte mensual ~$84.

**Gastos conocidos** (montos provisionales, se ajustan con datos reales — ver "Datos pendientes" abajo): Alimentación ~1400 Bs/mes (semana) + ~1000 Bs/mes (fin de semana) + postres ~500 Bs/mes; Gym 500 Bs/mes; Barbería 110 Bs/mes; Transporte ~400 Bs/mes (gasolina 100 + taxi 300); Suscripciones: Spotify 30 Bs, Netflix 100 Bs, iCloud $10, Google One $3, Claude $20, tokens Claude ~$5, dominios ~$5/mes equivalente. Spotify y TradingView son compartidos (reembolsados parcialmente por amigos/otra persona).

### Datos pendientes de completar (no bloquean el desarrollo, se completan usando la app real)

Precio de huevos/avena/frutillas, costo café/restaurante/cine para dos, costo actividades con pareja, costo mensual de cuidado personal, monto exacto de reembolsos de Spotify/TradingView, promedio de salidas con amigos/viajes/mantenimiento, objetivo exacto del fondo de emergencia, presupuesto inicial de publicidad/experimentos.

## Roadmap de sprints

14 sprints, estrictamente ordenados por dependencia — cada uno depende solo de sprints ya completados y entrega algo usable en el navegador. **Cada sprint se retoma con revisión/aprobación explícita del usuario**, no se construyen todos de corrido.

| # | Sprint | Depende de | Entrega |
|---|--------|-----------|---------|
| 1 | Fundación: cuentas, categorías, tipo de cambio | — | Patrimonio inicial cargado, categorías sembradas, 3 tasas de cambio en vivo |
| 2 | Transacciones + auto-categorización | 1 | Registro rápido de gastos/ingresos/transferencias con tasa congelada |
| 3 | Ingresos: bruto/neto, base/variable | 1, 2 | Sueldo con comisión, freelance variable, asignación de extraordinarios |
| 4 | Dashboard principal | 1, 2, 3 | Home real: patrimonio, liquidez, resumen del mes |
| 5 | Presupuesto mensual | 1, 2, 3, 4 | Tabla presupuesto vs. gastado por categoría |
| 6 | Personas, compartidos y reembolsos | 1, 2 | Spotify/TradingView compartidos, costo neto tras reembolsos |
| 7 | Recurrentes/suscripciones | 1, 6 | Lista de próximos cobros, registro manual asistido |
| 8 | Dinero por cobrar | 2, 6 | Calendario de los $957, pagos recibidos |
| 9 | Objetivos (Contadores + fondo emergencia) | 1, 2, 3 | Progreso de metas, target de fondo de emergencia |
| 10 | Fondo de crecimiento y experimentos | 1, 2 | Presupuesto de publicidad con ROI por experimento |
| 11 | Pasanaku | 1, 2 | Aportes/recepción sin contar como gasto ni ingreso |
| 12 | Reportes | 2, 3, 5, 6, 7, 8, 9, 10, 11 | Todas las vistas analíticas + comparaciones MoM y promedios |
| 13 | Bolsillos | 1–12 | Vista de los 5 bolsillos conceptuales |
| 14 | Alertas | 5, 7, 8, 9, 10 | Panel + email + cron diario |

El detalle completo de tablas/rutas/verificación por sprint vive en el plan aprobado: `/Users/danielacero/.claude/plans/bien-aqui-tengo-una-prancy-squirrel.md` (fuera del repo, en el directorio de planes de Claude Code).

## Archivos de referencia reutilizados

- `lib/supabase-server.ts` — `createClient`/`createAdminClient`
- `lib/trading/capital.ts` — patrón de balance derivado
- `app/api/trading-journal/sessions/[id]/capital-transactions/route.ts` — patrón de validación + escritura
- `app/api/trading-journal/notifications/route.ts` / `app/trading-journal/notifications/page.tsx` — patrón de panel de alertas (Sprint 14)
- `app/api/invite/notify/route.ts` + `lib/resend.ts` — patrón de envío de email (Sprint 14, ya integrado en el Hub)
- `app/trading-journal/[sessionId]/page.tsx` (`SweetSpotChart`, `MontecarloChart`) — patrón de gráficas SVG propias, sin librería externa (Sprint 12)
