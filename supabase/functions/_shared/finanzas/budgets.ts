// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import { round2, roundFor } from './money.ts'
import type { Currency } from './types.ts'

/**
 * Redondeo de un monto en la moneda de la LÍNEA, no en USD.
 *
 * `round2` alcanzaba mientras todo presupuesto fuera fiat, pero uno en BTC
 * (8 decimales) quedaba en cero: 0,0025 BTC redondeado a 2 decimales es 0, y
 * la card mostraba "0 gastado" con la plata ya gastada. Los `*_usd` sí siguen
 * con `round2` — el dólar tiene 2 decimales y punto.
 */
function roundNative(n: number, currency: string): number {
  return roundFor(n, currency as Currency)
}

/**
 * Presupuesto (Sprint 6): montoEfectivo, comprometido, disponible, carry entre
 * meses, proyección de ritmo, y qué meses quedaron sin la pregunta de cierre.
 *
 * Ver documentos/finanzas/sprint_6_presupuesto.md — el rollover NO es una
 * configuración fija (no hay `rollover_mode` acá): es una decisión que se
 * toma una vez por mes, por línea, al cerrarlo (`fin_budget_closures`). Por
 * eso `carriedInto` mira un solo período hacia atrás, no una cadena: el
 * `amount_usd` congelado en el cierre anterior YA incluye lo que ese mes
 * recibió a su vez.
 */

const pad = (n: number) => String(n).padStart(2, '0')

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/** Cualquier fecha ISO → el primer día de su mes ('2026-08-17' → '2026-08-01'). */
export function periodStart(refISO: string): string {
  return `${refISO.slice(0, 7)}-01`
}

/** El primer y último día del mes de un período. */
export function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number)
  return { from: period, to: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` }
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) + 1
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) - 1
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}

/* ─── Monto vigente ─────────────────────────────────────────────────────────
   Solo se guarda una fila de `fin_budget_periods` por mes que alguien tocó.
   Si no hay una para el período pedido, se hereda la más reciente anterior —
   así "editable mes a mes con el mes pasado de default" no necesita un cron
   que precree filas.

   Cada fila guarda el monto NATIVO (el que el usuario escribió, en la moneda
   de la línea) y su equivalente en USD congelado a la tasa de ese momento —
   mismo criterio que `fin_transactions`. El nativo es lo que se muestra y
   nunca se mueve; el USD es lo que permite comparar y sumar entre líneas de
   distinta moneda. */

export interface BudgetPeriodRow {
  id: string
  line_id: string
  period: string
  /** El monto tal cual se escribió, en la moneda de la línea. */
  amount: number
  /** Su equivalente en USD, congelado al escribirlo. Nunca se recalcula. */
  amount_usd: number
}

export interface BudgetExtensionRow {
  period_id: string
  amount: number
  amount_usd: number
}

export interface ResolvedPeriod {
  /** El id de la fila para ESTE período exacto, o `null` si se heredó de otro. */
  periodRowId: string | null
  /** `null` = la línea todavía no tiene ningún monto cargado, ni propio ni heredado. */
  amount: number | null
  amountUsd: number | null
}

export function resolvePeriod(
  periods: BudgetPeriodRow[], lineId: string, period: string,
): ResolvedPeriod {
  const own = periods.find(p => p.line_id === lineId && p.period === period)
  if (own) return { periodRowId: own.id, amount: own.amount, amountUsd: own.amount_usd }

  const prior = periods
    .filter(p => p.line_id === lineId && p.period < period)
    .sort((a, b) => (a.period < b.period ? 1 : -1))[0]

  return {
    periodRowId: null,
    amount: prior ? prior.amount : null,
    amountUsd: prior ? prior.amount_usd : null,
  }
}

/**
 * Monto original + la suma de sus ampliaciones (§3.3 del spec), en las dos
 * denominaciones: la nativa (lo que se muestra) y la de USD (lo que se
 * compara). Las dos se suman por separado sobre valores ya congelados —
 * nunca se convierte una en la otra acá.
 */
export function montoEfectivo(
  periods: BudgetPeriodRow[], extensions: BudgetExtensionRow[], lineId: string, period: string,
  lineCurrency = 'USD',
): { amount: number; amountUsd: number } | null {
  const resolved = resolvePeriod(periods, lineId, period)
  if (resolved.amountUsd == null || resolved.amount == null) return null

  const own = resolved.periodRowId
    ? extensions.filter(e => e.period_id === resolved.periodRowId)
    : []
  return {
    amount: roundNative(resolved.amount + own.reduce((s, e) => s + e.amount, 0), lineCurrency),
    amountUsd: round2(resolved.amountUsd + own.reduce((s, e) => s + e.amount_usd, 0)),
  }
}

/* ─── Retroactividad de la primera línea ────────────────────────────────── */

export interface BudgetLineLike {
  id: string
  created_on: string
  retroactive: boolean
}

/** Desde qué fecha cuenta el gasto de un período para esta línea: el día 1 del
    mes salvo que sea el período de creación y se haya elegido "arrancar desde
    hoy" (§3.1 del spec) — esa elección es fija para siempre. */
export function effectiveFromFor(line: BudgetLineLike, period: string): string {
  const { from } = periodRange(period)
  const isCreationPeriod = periodStart(line.created_on) === period
  return isCreationPeriod && !line.retroactive ? line.created_on : from
}

/* ─── Gasto real por categoría ──────────────────────────────────────────────
   Mismo criterio que `gasto_real_usd` de Deudas (Sprint 2 §4.4): bruto menos
   lo repartido con otras personas, sin restar lo condonado — perdonar una
   deuda es hacerse cargo de ella.

   El tope general ya no es una línea propia (rediseño post-Sprint 6): es la
   SUMA de las categorías presupuestadas, no un cálculo independiente sobre
   todas las transacciones — por eso esta función ya no admite `categoryId:
   null`. Quien arma el general suma los `BudgetLineProgress` ya resueltos de
   cada categoría (ver `loadBudgets`), no vuelve a recorrer transacciones.

   Una línea puede cubrir varias categorías a la vez (§ rediseño
   multi-categoría) — nunca se solapan entre líneas activas, así que sumar
   el gasto de todas las de esta línea nunca cuenta el mismo gasto dos veces. */

export interface BudgetTx {
  id: string
  category_id: string | null
  /** El monto tal cual se cargó, en `currency`. */
  amount: number
  currency: string
  amount_usd: number
  date: string
}
export interface BudgetDebtShare {
  transaction_id: string
  /** Lo repartido, en la moneda de la deuda. */
  amount: number
  currency: string
  amount_usd: number
  principal_usd: number
  waived_at: string | null
}

/**
 * Cuánto se gastó de verdad en una categoría, en las dos denominaciones.
 *
 * El USD es la suma de los `amount_usd` congelados — la unidad en la que
 * todo se puede comparar. El nativo NO se reconstruye desde ese USD: se
 * suman los montos nativos de las transacciones que ya están en la moneda
 * de la línea, porque `amount_usd` está redondeado a centavos y volver
 * atrás pierde precisión (un centavo de dólar son ~12 centavos de Bs, así
 * que un gasto de 10 Bs volvía como 9,99). Solo las transacciones en OTRA
 * moneda se convierten, que ahí no hay alternativa.
 *
 * `lineCurrency`/`lineRate` son los de la línea: su moneda y su tasa
 * congelada (USD por 1 unidad nativa).
 */
export function gastoRealCategoria(
  txs: BudgetTx[], debts: BudgetDebtShare[], categoryIds: string[], from: string, to: string,
  lineCurrency = 'USD', lineRate = 1,
): { amount: number; amountUsd: number } {
  const ownIds = new Set(categoryIds)
  const inRange = txs.filter(t => t.category_id != null && ownIds.has(t.category_id) && t.date >= from && t.date <= to)
  const ids = new Set(inRange.map(t => t.id))
  const activos = debts.filter(d => ids.has(d.transaction_id) && !d.waived_at)

  const brutoUsd = inRange.reduce((s, t) => s + t.amount_usd, 0)
  const repartidoUsd = activos.reduce((s, d) => s + d.principal_usd, 0)

  // Misma moneda → el número exacto que se escribió. Otra moneda → no queda
  // más que convertir su USD con la tasa de la línea.
  const nativo = (usd: number, amount: number, currency: string) =>
    currency === lineCurrency ? amount : toNative(usd, lineRate, lineCurrency)

  const bruto = inRange.reduce((s, t) => s + nativo(t.amount_usd, t.amount, t.currency), 0)
  const repartido = activos.reduce((s, d) => {
    // `principal_usd` casi siempre iguala a `amount_usd`; cuando no (hubo
    // recargo al repartir), se toma la misma proporción sobre el nativo.
    const proporcion = d.amount_usd > 0 ? d.principal_usd / d.amount_usd : 1
    return s + nativo(d.principal_usd, d.amount * proporcion, d.currency)
  }, 0)

  return { amount: roundNative(bruto - repartido, lineCurrency), amountUsd: round2(brutoUsd - repartidoUsd) }
}

/* ─── Comprometido: Fijos pendientes de esa categoría ──────────────────── */

export interface CommittedRecurring {
  category_id: string | null
  active: boolean
  /** El monto de la plantilla, en su propia moneda. */
  amount: number
  currency: string
  /** Ya convertido a USD con la tasa de HOY (es un estimado, no algo congelado). */
  amountUsd: number
  status: 'pendiente' | 'registrado' | 'vencido' | 'pausado' | 'programado'
}

/** Igual que `gastoRealCategoria`: el nativo sale del monto de la plantilla
    cuando la moneda coincide, no de reconvertir el USD. */
export function comprometido(
  recurring: CommittedRecurring[], categoryIds: string[], lineCurrency = 'USD', lineRate = 1,
): { amount: number; amountUsd: number } {
  const ownIds = new Set(categoryIds)
  const scoped = recurring.filter(
    r => r.active && (r.status === 'pendiente' || r.status === 'vencido')
      && r.category_id != null && ownIds.has(r.category_id),
  )
  return {
    amount: roundNative(scoped.reduce(
      (s, r) => s + (r.currency === lineCurrency ? r.amount : toNative(r.amountUsd, lineRate, lineCurrency)), 0), lineCurrency),
    amountUsd: round2(scoped.reduce((s, r) => s + r.amountUsd, 0)),
  }
}

/* ─── Carry: un solo salto hacia atrás, no una cadena ──────────────────────
   El `amount_usd` de un cierre YA es el disponible final de ese mes, que a su
   vez ya incluye cualquier carry que ese mes haya recibido. Por eso alcanza
   con mirar el cierre del período inmediato anterior. */

export interface BudgetClosureRow {
  line_id: string
  period: string
  carried: boolean
  /** El disponible congelado, en la moneda de la línea. */
  amount: number
  amount_usd: number
}

/** Lo que el mes anterior dejó, en las dos denominaciones: la nativa (para
    mostrar) y la de USD (para comparar), ambas ya congeladas al cerrar. */
export function carriedInto(
  closures: BudgetClosureRow[], lineId: string, period: string,
): { amount: number; amountUsd: number } {
  const prev = previousPeriod(period)
  const c = closures.find(x => x.line_id === lineId && x.period === prev)
  return c && c.carried ? { amount: c.amount, amountUsd: c.amount_usd } : { amount: 0, amountUsd: 0 }
}

/* ─── Disponible ──────────────────────────────────────────────────────────
   Se calcula en USD, siempre: el gasto real sale de transacciones que ya
   vienen congeladas en USD (cada una con SU tasa del día en que se cargó),
   así que USD es la única unidad en la que todo eso se puede sumar sin
   inventar conversiones.

   Para MOSTRARLO en la moneda de la línea está `toNative`, que usa la tasa
   congelada de esa línea — no la de hoy. Así el card entero queda expresado
   a una sola tasa coherente, y el monto que el usuario escribió sigue siendo
   exactamente el que él escribió. */

export function disponible(params: {
  montoEfectivoUsd: number | null
  gastoRealUsd: number
  comprometidoUsd: number
  carriedUsd: number
}): number | null {
  if (params.montoEfectivoUsd == null) return null
  return round2(params.montoEfectivoUsd + params.carriedUsd - params.gastoRealUsd - params.comprometidoUsd)
}

/**
 * Un valor derivado en USD, expresado en la moneda de la línea con la tasa
 * que esa línea congeló. `rate` sigue la convención de toda la app
 * (`freezeRate`): USD por 1 unidad nativa, de modo que
 * `amount_usd = amount × rate` — así que volver a nativo es dividir.
 */
export function toNative(usd: number, rate: number, currency = 'USD'): number {
  if (!Number.isFinite(rate) || rate <= 0) return roundNative(usd, currency)
  return roundNative(usd / rate, currency)
}

/* ─── Día del período: para el tick de la barra ────────────────────────── */

/** Día de referencia dentro del período: hoy si es el vigente, el último día
    si ya terminó. Alimenta el tick de "deberías estar acá" de `budgetBarView`. */
export function dayOfPeriod(period: string, todayISO: string): { day: number; days: number } {
  const [y, m] = period.split('-').map(Number)
  const days = daysInMonth(y, m)
  const { to } = periodRange(period)
  const isCurrent = todayISO >= period && todayISO <= to
  const day = isCurrent ? Number(todayISO.slice(8, 10)) : days
  return { day, days }
}

/** Cómo se quiere ver el progreso de un presupuesto — configurable en
    Ajustes, aplica igual en Presupuesto y en la Home. */
export type BudgetViewMode = 'gastado' | 'disponible'

export interface BudgetBarView {
  /** El número grande a mostrar: gastado o disponible, según el modo. */
  value: number
  /** Relleno de la barra, 0–100. */
  fillPct: number
  /** Dónde va la marca de "deberías estar acá hoy", en la misma escala que `fillPct`. */
  tickPct: number
  /** Ya se pasó del tope — mismo criterio en los dos modos. */
  over: boolean
  /** Si la barra debería verse en alerta. En "gastado" es acercarse o pasarse
      del tope; en "disponible" es lo opuesto — que quede poco o nada. */
  danger: boolean
}

/**
 * Los cuatro números que arma cualquier card de presupuesto (general, por
 * categoría, o el hero de la Home), ya resueltos según el modo elegido —
 * así la UI solo pinta, no decide.
 *
 * En "gastado" la barra arranca vacía y se llena a medida que gastás (el
 * tope de siempre). En "disponible" arranca LLENA — representa la plata que
 * todavía tenés — y se va vaciando a medida que gastás; por eso ahí la marca
 * del día también se invierte: si vas al ritmo esperado, tiene que quedar
 * exactamente lo que la marca señala, no lo que ya se gastó.
 */
export function budgetBarView(params: {
  mode: BudgetViewMode
  spentUsd: number
  availableUsd: number
  capacityUsd: number
  spent: number
  available: number
  day: number
  days: number
}): BudgetBarView {
  const { mode, spentUsd, availableUsd, capacityUsd, spent, available, day, days } = params
  const dayPct = days > 0 ? (day / days) * 100 : 0
  const over = capacityUsd > 0 && spentUsd > capacityUsd
  const clamp = (n: number) => Math.min(100, Math.max(0, n))

  if (mode === 'disponible') {
    const fillPct = round2(clamp(capacityUsd > 0 ? (availableUsd / capacityUsd) * 100 : 0))
    return { value: available, fillPct, tickPct: round2(clamp(100 - dayPct)), over, danger: over || fillPct <= 15 }
  }

  const fillPct = round2(clamp(capacityUsd > 0 ? (spentUsd / capacityUsd) * 100 : 0))
  return { value: spent, fillPct, tickPct: round2(clamp(dayPct)), over, danger: over || fillPct >= 85 }
}

/* ─── Cierres pendientes ────────────────────────────────────────────────── */

/**
 * Los períodos ya terminados de una línea que todavía no tienen fila en
 * `fin_budget_closures` — la ausencia ES la pregunta pendiente (§3.4 y §4.5
 * del spec). Tope de 24 igual que `pendingPeriods` de Fijos: si hace dos años
 * que no se cierra nada, el problema no es la lista.
 */
export function needsClosure(
  line: { id: string; created_on: string },
  closures: { line_id: string; period: string }[],
  todayISO: string,
  max = 24,
): string[] {
  const out: string[] = []
  let p = periodStart(line.created_on)
  const current = periodStart(todayISO)
  while (p < current && out.length < max) {
    if (!closures.some(c => c.line_id === line.id && c.period === p)) out.push(p)
    p = nextPeriod(p)
  }
  return out
}

/* ─── Validación ────────────────────────────────────────────────────────── */

export function validateBudgetAmount(amount: unknown): string | null {
  const n = typeof amount === 'number' ? amount : NaN
  if (!Number.isFinite(n) || n <= 0) return 'El monto debe ser mayor a cero'
  return null
}

/** `period` siempre como 'YYYY-MM-01' — el primer día del mes, nunca otro. */
export function isValidPeriod(period: unknown): period is string {
  return typeof period === 'string' && /^\d{4}-\d{2}-01$/.test(period)
}
