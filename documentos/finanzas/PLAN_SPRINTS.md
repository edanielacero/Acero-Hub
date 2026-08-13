# Plan — Mini-app Finanzas: roadmap de sprints

## Contexto

El usuario quiere una mini-app de finanzas personales dentro de Acero Hub, en `/finanzas`. Ya existe el scaffold vacío (`app/finanzas/layout.tsx` con auth-gate, `app/finanzas/page.tsx` placeholder, proyecto registrado en Supabase `projects`, ícono/banner en `lib/project-assets.tsx`) — nada de esto se vuelve a tocar salvo el `page.tsx` (Sprint 4).

El usuario entregó una especificación funcional muy extensa (36 secciones) que va mucho más allá de un expense tracker: cuentas multi-moneda con tipo de cambio congelado por transacción, categorías jerárquicas, presupuestos, gastos compartidos/reembolsos, dinero por cobrar, suscripciones recurrentes, objetivos de ahorro, un fondo de crecimiento/experimentos con ROI, un pasanaku con participantes y rondas, un sistema de "bolsillos" conceptuales, reportes comparativos y alertas. Pidió explícitamente que **no se desarrolle nada todavía** — primero definir alcance, resolver ambigüedades, y organizar el trabajo en **sprints ordenados por dependencia** (los sprints sin dependencias van primero).

Este documento es el resultado de esa planificación: investigación del código existente para reutilizar patrones ya validados, resolución de las decisiones de arquitectura que la spec dejaba abiertas, y el desglose de sprints.

**Qué desbloquea la aprobación de este plan**: solo el **Sprint 1**. Cada sprint siguiente se retoma con una revisión/aprobación explícita del usuario después de probar el sprint anterior en el navegador — no se construyen los 14 sprints de corrido sin checkpoints, porque es dinero real y la corrección del modelo importa más que la velocidad.

## Investigación previa (ya verificada, no repetir)

- **RLS**: Finanzas replica el patrón de `tj_*` (trading-journal) — `user_id = auth.uid()` directo en tablas raíz, `exists (select 1 from fin_<padre> where ... user_id = auth.uid())` en tablas hijas. Confirmado leyendo `supabase/trading/schema.sql:140-192`. **No** usar el patrón `exp_*` de Expandlogy (acceso compartido vía tabla tipo `project_access`) — Finanzas es estrictamente de un solo usuario.
- **Balance derivado, no snapshot mutable**: precedente en `lib/trading/capital.ts` (`getCapitalActual`, `getCapitalUpTo`, `buildCapitalTimeline`) y `app/api/trading-journal/sessions/[id]/capital-transactions/route.ts`. Mismo principio aplica a `fin_accounts`.
- **Panel de notificaciones in-app**: ya existe como patrón real y con tabla propia (`tj_notifications`, RLS en `supabase/trading/schema.sql:177-179`) — `app/trading-journal/notifications/page.tsx` + `app/api/trading-journal/notifications/route.ts` son la referencia directa para el Sprint 14.
- **Resend ya está integrado en el Hub**: `lib/resend.ts` (wrapper mínimo, `RESEND_API_KEY` ya configurada en `.env.local`), usado en `app/api/invite/notify/route.ts` y `app/api/invite/send/route.ts`. Sprint 14 reutiliza esto tal cual, no hay que instalar ni configurar nada nuevo.
- **No hay librería de gráficas** en el repo (verificado en `package.json`). Trading-journal construye sus propias gráficas en SVG (`SweetSpotChart`, `MontecarloChart` en `app/trading-journal/[sessionId]/page.tsx` y `.../montecarlo/page.tsx`) — Sprint 12 sigue el mismo patrón en vez de agregar una dependencia nueva.
- **No hay ninguna utilidad existente** de formateo de moneda, multi-currency, o categorías jerárquicas en ningún lado del repo — se construye desde cero en `lib/finanzas/`.
- **`vercel.json` tiene una entrada muerta**: `/api/mundial/sync` (cron diario) apunta a una ruta que ya no existe — quedó de cuando se eliminó la mini-app Mundial y nadie limpió el cron. Sprint 1 ya va a tocar este archivo para agregar el cron de tipo de cambio, así que se aprovecha para borrar esa entrada de paso.
- **Fuentes de tipo de cambio** (verificadas, aprobadas por el usuario):
  - USD/BOB oficial: `GET https://bo.dolarapi.com/v1/dolares/oficial` → `{moneda, casa, nombre, compra, venta, fechaActualizacion}`. Republica el oficial del BCB, actualiza a medianoche. Sin API key.
  - BOB/USDT paralelo: `GET https://paralelo.bo/api/v1/rate` → mediana/compra/venta/spread/timestamp. Promedio de 5 plataformas P2P, actualiza cada 60s. Sin API key.
  - BTC/USDT: API pública de Binance (`/api/v3/ticker/price?symbol=BTCUSDT`) o CoinGecko. Sin key para uso básico.

## Decisiones de alcance ya confirmadas con el usuario (no volver a preguntar)

| Tema | Decisión |
|---|---|
| Fases | Sprints granulares, estrictamente ordenados por dependencia |
| Auto-categorización | Reglas simples por palabra clave, editables. Sin IA en v1 |
| Suscripciones recurrentes | Solo recuerdan — el usuario siempre registra el gasto manualmente, nunca se auto-postea |
| Pasanaku | Modelo completo: participantes, rondas, turno, fechas esperadas |
| Alertas | Panel in-app + email para las importantes (Resend) |
| Apple Wallet con push | Descartado por completo |
| Import CSV de banco/exchange | Nunca — entrada 100% manual |
| Usuarios | Uno solo (el admin) — sin compartir datos |

## Decisión de diseño que resuelve un vacío de la spec original (para tu revisión)

La spec lista 8 tipos de transacción (Ingreso, Gasto, Transferencia, Inversión, Retiro de inversión, Reembolso, Pago de deuda por cobrar, Ajuste de patrimonio) pero también exige que los aportes a objetivos y al pasanaku **no cuenten como gasto de consumo** — un caso que esos 8 tipos no cubren explícitamente.

**Propuesta**: extender el enum `type` con `aporte_objetivo`, `aporte_pasanaku`, `recepcion_pasanaku`, y agregar una columna derivada `flow_type` (`consumo` | `movimiento`) — `consumo` solo cuando `type='gasto'`, todo lo demás es `movimiento`. Los reportes de "gasto real" y "tasa de ahorro" solo suman `flow_type='consumo'`; el patrimonio y la liquidez usan todos los movimientos. Esto es exactamente el mecanismo que la sección 36 de tu spec pide ("Gasto real" vs "Movimiento financiero"), aplicado de forma consistente a pasanaku, objetivos, inversiones y transferencias por igual.

## Otras decisiones de modelado (para tu revisión)

- **Sin tabla `Investment` separada**: se modela con `fin_accounts` (tipos `inversion|cripto|trading`) + `fin_asset_valuations` (snapshots de valuación, porque el valor cambia por mercado, no por transacciones tuyas) + transacciones `inversion`/`retiro_inversion` para los movimientos de efectivo hacia/desde esas cuentas.
- **"Bolsillos" son mayormente derivados, no fondos segregados**: columna `bucket` en `fin_categories` para Vivir/Obligaciones futuras/Crecimiento; el bolsillo Patrimonio se deriva del `type` de la cuenta; el bolsillo Seguridad se deriva del goal `fondo_emergencia`. Cero tablas de saldos por bolsillo — coincide con tu propia aclaración de que es una separación conceptual, no física.
- **Seeds (categorías iniciales, cuentas de patrimonio actual) vía endpoint idempotente + botón en la UI**, no vía migración SQL con tu `user_id` hardcodeado (una migración no puede conocer tu `auth.uid()` de forma limpia).
- **Cron protegido con `Authorization: Bearer $CRON_SECRET`** — patrón nuevo para el Hub (no existía), se usa para `exchange-rates/refresh` (Sprint 1) y `alerts/check` (Sprint 14).

## Roadmap de sprints

14 sprints, cada uno depende solo de sprints anteriores y entrega algo usable en el navegador (no solo modelo de datos).

| # | Sprint | Depende de | Entrega |
|---|--------|-----------|---------|
| 1 | Fundación: cuentas, categorías, tipo de cambio | — | Patrimonio inicial cargado, categorías sembradas, 3 tasas de cambio en vivo |
| 2 | Transacciones + auto-categorización | 1 | Registro rápido de gastos/ingresos/transferencias con tasa congelada |
| 3 | Ingresos: bruto/neto, base/variable | 1, 2 | Sueldo con comisión, freelance variable, asignación de extraordinarios |
| 4 | Dashboard principal | 1, 2, 3 | Home real: patrimonio, liquidez, resumen del mes (reemplaza el placeholder) |
| 5 | Presupuesto mensual | 1, 2, 3, 4 | Tabla presupuesto vs. gastado por categoría |
| 6 | Personas, compartidos y reembolsos | 1, 2 | Spotify/TradingView compartidos, costo neto tras reembolsos |
| 7 | Recurrentes/suscripciones | 1, 6 | Lista de próximos cobros, registro manual asistido (nunca automático) |
| 8 | Dinero por cobrar | 2, 6 | Calendario de los $957, pagos recibidos |
| 9 | Objetivos (Contadores + fondo emergencia) | 1, 2, 3 | Progreso de metas, target de fondo de emergencia |
| 10 | Fondo de crecimiento y experimentos | 1, 2 | Presupuesto de publicidad con ROI por experimento |
| 11 | Pasanaku | 1, 2 | Aportes/recepción sin contar como gasto ni ingreso |
| 12 | Reportes | 2, 3, 5, 6, 7, 8, 9, 10, 11 | Todas las vistas analíticas + comparaciones MoM y promedios |
| 13 | Bolsillos | 1–12 | Vista de los 5 bolsillos conceptuales |
| 14 | Alertas | 5, 7, 8, 9, 10 | Panel + email + cron diario |

---

### Sprint 1 — Fundación: Cuentas, Categorías y Tipo de cambio

**Dependencias**: ninguna.

**Tablas nuevas**:
- `fin_accounts`: `id, user_id, name, type (efectivo|cuenta_bancaria|ahorro|inversion|cripto|trading|otro), currency (USD|BOB), initial_balance, initial_balance_date, archived, created_at, updated_at`
- `fin_asset_valuations`: `id, account_id→fin_accounts, value_usd, valued_at, source (manual|auto_btc), note, created_at`
- `fin_categories`: `id, user_id, parent_category_id→fin_categories nullable, name, kind (ingreso|gasto), created_at`
- `fin_exchange_rates`: `id, pair (USD_BOB|BOB_USDT|BTC_USDT), rate, source, fetched_at, is_manual_override`

**Código nuevo**:
- `lib/finanzas/accounts.ts`, `lib/finanzas/categories.ts`, `lib/finanzas/currency.ts` (formateo), `lib/finanzas/exchange-rates.ts` (wrappers de las 3 APIs)
- `app/finanzas/cuentas/page.tsx`, `app/finanzas/categorias/page.tsx`, `app/finanzas/tipo-cambio/page.tsx`
- `app/api/finanzas/accounts/route.ts` + `[id]/route.ts` + `[id]/valuations/route.ts`
- `app/api/finanzas/categories/route.ts` + `[id]/route.ts` + `seed/route.ts` (idempotente, siembra las 11 categorías raíz del spec)
- `app/api/finanzas/exchange-rates/route.ts` (GET última tasa + override manual) + `refresh/route.ts` (protegido por `CRON_SECRET`, también invocable manualmente desde la UI)
- `vercel.json`: reemplaza el cron muerto de `/api/mundial/sync` por `0 0,12 * * *` → `/api/finanzas/exchange-rates/refresh`
- `documentos/finanzas/documento_maestro_finanzas.md`: vuelca la spec completa del usuario + este roadmap, seguiendo la convención de doc maestro por mini-app (ver `documentos/expandlogy/documento_maestro_expandlogy.md`)

**Verificación**: `npm run build` sin errores; en `/finanzas/cuentas` crear las 6 cuentas iniciales (Airtm $1299, Broker $980, Bitcoin $900, USDT $30, Efectivo $0, Bancos $0) y confirmar suma ≈ $3209; en `/finanzas/categorias` sembrar y ver el árbol de 11 categorías; en `/finanzas/tipo-cambio` confirmar que las 3 tasas se traen (o fallan con mensaje claro) y que el override manual persiste.

---

### Sprint 2 — Transacciones + auto-categorización

**Dependencias**: 1.

**Tablas nuevas**:
- `fin_transactions`: `id, user_id, type (ingreso|gasto|transferencia|inversion|retiro_inversion|reembolso|pago_deuda_por_cobrar|ajuste_patrimonio|aporte_objetivo|aporte_pasanaku|recepcion_pasanaku), flow_type (consumo|movimiento), account_id→fin_accounts, to_account_id nullable, category_id nullable, amount, currency, exchange_rate_used, amount_usd, date, description, tags text[], is_shared bool, status (pendiente|completada), notes, created_at, updated_at`
- `fin_category_rules`: `id, user_id, keyword, category_id→fin_categories, priority, created_at`

**Código nuevo**:
- `lib/finanzas/transactions.ts` (`deriveFlowType`, `computeAmountUsd`, `applyToAccountBalance` — tabla de signos por tipo)
- `lib/finanzas/auto-categorize.ts` (match por palabra clave)
- `app/finanzas/transacciones/page.tsx` (lista + filtros), `app/finanzas/components/quick-add.tsx` (drawer: +Gasto, +Ingreso, +Transferencia, +Inversión, +Retiro, +Ajuste)
- `app/api/finanzas/transactions/route.ts` + `[id]/route.ts`, `app/api/finanzas/category-rules/route.ts` + `[id]/route.ts`

**Verificación**: gasto en Bs → `exchange_rate_used`/`amount_usd` grabados y saldo de cuenta baja; transferencia entre 2 cuentas propias → patrimonio total no cambia; regla "Netflix→Tecnología" se sugiere en el quick-add; editar/borrar una transacción recalcula el saldo (derivado, no snapshot).

---

### Sprint 3 — Ingresos: bruto/neto, base/variable

**Dependencias**: 1, 2.

**Cambios**: `fin_categories` +`income_nature (base|variable)`; `fin_transactions` +`income_gross`, `income_commission` (metadata informativa, `amount` sigue siendo el neto real). Tabla nueva `fin_income_allocations`: `id, transaction_id→fin_transactions, bucket (seguridad|obligaciones_futuras|crecimiento|patrimonio|gasto_libre), amount, note` (split de ingreso variable/extraordinario, solo reporting, no mueve dinero real).

**Código nuevo**: `lib/finanzas/income.ts`; extiende quick-add de +Ingreso con bruto/comisión y paso de asignación cuando es variable; `app/api/finanzas/transactions/[id]/allocations/route.ts`.

**Verificación**: sueldo bruto $950/comisión $50/neto $900 se guarda y solo el neto mueve el saldo; freelance queda marcado `variable`; asignar un bono $100 en partes que no sumen $100 se rechaza.

---

### Sprint 4 — Dashboard principal

**Dependencias**: 1, 2, 3.

**Código nuevo**: `lib/finanzas/networth.ts` (patrimonio total/líquido/inversión/cripto/trading), `lib/finanzas/dashboard.ts` (agregados del mes); reemplaza `app/finanzas/page.tsx` (el placeholder actual) por el dashboard real; `app/api/finanzas/dashboard/route.ts`.

**Verificación**: totales del dashboard cuadran a mano con cuentas+transacciones sembradas; registrar un gasto desde el dashboard actualiza los números.

---

### Sprint 5 — Presupuesto mensual

**Dependencias**: 1, 2, 3, 4.

**Tablas nuevas**: `fin_budgets` (`category_id, period YYYY-MM, amount, currency`), `fin_settings` (`user_id PK, ingreso_base_mensual, moneda_principal`).

**Código nuevo**: `lib/finanzas/budgets.ts`; `app/finanzas/presupuesto/page.tsx`, `app/finanzas/configuracion/page.tsx`; `app/api/finanzas/budgets/route.ts` + `[id]`, `app/api/finanzas/settings/route.ts`.

**Verificación**: presupuesto Comida = 1400 Bs, gastos en esa categoría bajan el disponible; "copiar mes anterior" duplica filas.

---

### Sprint 6 — Personas, gastos compartidos y reembolsos

**Dependencias**: 1, 2.

**Tablas nuevas**: `fin_people`, `fin_shared_expenses` (Spotify/TradingView: total, mi parte, frecuencia), `fin_shared_expense_participants`, `fin_reimbursements` (esperado/recibido/estado).

**Código nuevo**: `lib/finanzas/shared-expenses.ts` (`computeNetCost`, `pendingReimbursements`); `app/finanzas/personas/page.tsx`, `app/finanzas/compartidos/page.tsx`; rutas API correspondientes.

**Verificación**: Spotify 30 Bs con reembolso esperado 15 Bs; al registrar el reembolso recibido (`type=reembolso`, `flow_type=movimiento`), el costo neto de la categoría baja a 15 Bs y el dashboard de ingresos NO lo cuenta.

---

### Sprint 7 — Recurrentes/suscripciones (solo recordatorio)

**Dependencias**: 1, 6.

**Tablas nuevas**: `fin_recurring_expenses` (monto, frecuencia, próxima fecha, compartida), `fin_recurring_expense_participants`.

**Código nuevo**: `lib/finanzas/recurring.ts`; `app/finanzas/recurrentes/page.tsx` (botón "Registrar pago ahora" pre-llena el quick-add, exige confirmación manual); rutas API.

**Verificación**: Netflix mensual aparece en "próximos"; "registrar pago" crea una transacción real solo tras confirmación, nunca automáticamente.

---

### Sprint 8 — Dinero por cobrar

**Dependencias**: 2, 6.

**Tablas nuevas**: `fin_debts` (`person_id, direction, total_amount, status` — columna `direction` deja espacio a deuda propia futura sin bloquear el MVP), `fin_debt_installments` (`due_date, expected_amount, status, paid_transaction_id`).

**Código nuevo**: `lib/finanzas/debts.ts` (`buildInstallmentSchedule`, `getDebtSummary`); `app/finanzas/deudas/page.tsx`; `app/api/finanzas/debts/route.ts` + `[id]`, `.../installments/[instId]/pay/route.ts` (POST atómico: marca cuota + crea transacción `pago_deuda_por_cobrar`).

**Verificación**: schedule de $957 (9×$100 + $57) generado correctamente; marcar cuota pagada sube liquidez $100, baja "por cobrar" a $857, crea la transacción.

---

### Sprint 9 — Objetivos (Contadores + fondo de emergencia)

**Dependencias**: 1, 2, 3.

**Cambios**: tabla nueva `fin_goals` (`type: ahorro_meta|fondo_emergencia, target_amount, target_date, monthly_contribution`); `fin_transactions` +`goal_id`; `fin_categories` +`is_essential`.

**Código nuevo**: `lib/finanzas/goals.ts` (`getGoalProgress`, `computeEmergencyFundTarget` — retorna "histórico insuficiente" si hay <1 mes de datos en vez de un número engañoso); `app/finanzas/objetivos/page.tsx`; extiende quick-add con "+Aporte a objetivo".

**Verificación**: "Contadores" $1000/año, aporte $84/mes → progreso correcto, transacciones excluidas de "gasto"; fondo de emergencia con <1 mes de histórico muestra mensaje, no un número falso.

---

### Sprint 10 — Fondo de crecimiento y experimentos (ROI)

**Dependencias**: 1, 2.

**Tablas nuevas**: `fin_growth_funds` (presupuesto, ej. "Publicidad"), `fin_growth_experiments` (`revenue_generated, result_note, status`); `fin_transactions` +`growth_experiment_id`.

**Código nuevo**: `lib/finanzas/growth.ts` (`getExperimentROI`, `getFundRemaining`); `app/finanzas/crecimiento/page.tsx`.

**Verificación**: fondo $100, experimentos gastando $65 → restante $35; ROI calculado si hay `revenue_generated`.

---

### Sprint 11 — Pasanaku

**Dependencias**: 1, 2.

**Tabla nueva**: `fin_pasanakus` (nombre, monto de aporte, participantes, rondas, fechas, frecuencia, `my_turn_position`, `expected_receive_amount`, estado); `fin_transactions` +`pasanaku_id`.

**Código nuevo**: `lib/finanzas/pasanaku.ts` (`getTotalContributed`, `getTotalReceived`, `getNextContributionDate`, `getNextReceptionDate` — todo derivado); `app/finanzas/pasanaku/page.tsx`; extiende quick-add con "+Aporte"/"+Recepción" de pasanaku.

**Verificación**: 3 aportes de 300 Bs → total 900 Bs, excluido del "gasto del mes"; recepción sube liquidez sin mover "ingreso".

---

### Sprint 12 — Reportes

**Dependencias**: 2, 3, 5, 6, 7, 8, 9, 10, 11.

**Código nuevo**: `lib/finanzas/reports.ts` (gastos por categoría/mes, ingresos por fuente, evolución de patrimonio vía `fin_asset_valuations` histórico, compartidos, reembolsos pendientes, deudas por cobrar, recurrentes, irregulares, experimentos, `comparisonMoM`, `averageNMonths`, `oportunidades`); `app/finanzas/components/charts.tsx` (SVG propio, sin dependencia nueva — mismo patrón que `SweetSpotChart`/`MontecarloChart` de trading-journal); `app/finanzas/reportes/page.tsx`; `app/api/finanzas/reports/[type]/route.ts`.

**Verificación**: con dataset de 2 meses, gastos por categoría cuadra con las transacciones; comparación MoM calcula bien el delta; promedio de 3 meses no rompe con <3 meses de datos.

---

### Sprint 13 — Bolsillos

**Dependencias**: 1–12.

**Cambios**: `fin_categories` +`bucket (vivir|obligaciones_futuras|crecimiento)` + backfill de las 11 categorías raíz.

**Código nuevo**: `lib/finanzas/buckets.ts` (`aggregateByBucket`); `app/finanzas/bolsillos/page.tsx` + widget en el dashboard; `app/api/finanzas/buckets/route.ts`.

**Verificación**: suma de los 5 bolsillos de un mes reconcilia con los totales del dashboard/reportes del mismo periodo.

---

### Sprint 14 — Alertas (panel + email + cron)

**Dependencias**: 5, 7, 8, 9, 10.

**Tabla nueva**: `fin_alerts` (`type` — 9 tipos del spec, `severity: info|warning`, `payload jsonb`, `is_emailed`, `read`).

**Código nuevo**: `lib/finanzas/alerts.ts` (un evaluador puro por tipo, idempotente por periodo+tipo+entidad); `app/finanzas/alertas/page.tsx` (mismo patrón visual que `app/trading-journal/notifications/page.tsx`); `app/api/finanzas/alerts/route.ts` (GET/PATCH), `.../check/route.ts` (POST, corre evaluadores, envía email vía `lib/resend.ts` para `severity='warning'`, protegido por `CRON_SECRET`); `vercel.json` cron diario `0 9 * * *`; badge de no leídas en `app/finanzas/layout.tsx`.

**Verificación**: forzar `/api/finanzas/alerts/check` con presupuesto excedido → aparece en panel + llega email; correr de nuevo no duplica; sin `CRON_SECRET` el endpoint rechaza.

## Archivos críticos de referencia

- `lib/supabase-server.ts` — `createClient`/`createAdminClient`, usados en todas las rutas nuevas
- `lib/trading/capital.ts` — patrón de balance derivado
- `app/api/trading-journal/sessions/[id]/capital-transactions/route.ts` — patrón de validación + escritura
- `app/api/trading-journal/notifications/route.ts` y `app/trading-journal/notifications/page.tsx` — patrón de panel de alertas
- `app/api/invite/notify/route.ts` — patrón de envío de email con `lib/resend.ts`
- `supabase/trading/schema.sql` — RLS de referencia (líneas 140-192)
- `supabase/schema.sql` — schema base del Hub (`profiles`, `projects`, `project_access`)
- `app/finanzas/layout.tsx` — auth-gate ya existente, no se toca
