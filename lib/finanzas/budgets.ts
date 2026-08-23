import { round2 } from './money'

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
   que precree filas. */

export interface BudgetPeriodRow {
  id: string
  line_id: string
  period: string
  amount_usd: number
}

export interface BudgetExtensionRow {
  period_id: string
  amount_usd: number
}

export interface ResolvedPeriod {
  /** El id de la fila para ESTE período exacto, o `null` si se heredó de otro. */
  periodRowId: string | null
  /** `null` = la línea todavía no tiene ningún monto cargado, ni propio ni heredado. */
  amountUsd: number | null
}

export function resolvePeriod(
  periods: BudgetPeriodRow[], lineId: string, period: string,
): ResolvedPeriod {
  const own = periods.find(p => p.line_id === lineId && p.period === period)
  if (own) return { periodRowId: own.id, amountUsd: own.amount_usd }

  const prior = periods
    .filter(p => p.line_id === lineId && p.period < period)
    .sort((a, b) => (a.period < b.period ? 1 : -1))[0]

  return { periodRowId: null, amountUsd: prior ? prior.amount_usd : null }
}

/** Monto original + la suma de sus ampliaciones (§3.3 del spec). */
export function montoEfectivo(
  periods: BudgetPeriodRow[], extensions: BudgetExtensionRow[], lineId: string, period: string,
): number | null {
  const resolved = resolvePeriod(periods, lineId, period)
  if (resolved.amountUsd == null) return null

  const extended = resolved.periodRowId
    ? extensions.filter(e => e.period_id === resolved.periodRowId).reduce((s, e) => s + e.amount_usd, 0)
    : 0
  return round2(resolved.amountUsd + extended)
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
   cada categoría (ver `loadBudgets`), no vuelve a recorrer transacciones. */

export interface BudgetTx { id: string; category_id: string | null; amount_usd: number; date: string }
export interface BudgetDebtShare { transaction_id: string; principal_usd: number; waived_at: string | null }

export function gastoRealCategoria(
  txs: BudgetTx[], debts: BudgetDebtShare[], categoryId: string, from: string, to: string,
): number {
  const inRange = txs.filter(t => t.category_id === categoryId && t.date >= from && t.date <= to)
  const bruto = inRange.reduce((s, t) => s + t.amount_usd, 0)

  const ids = new Set(inRange.map(t => t.id))
  const repartido = debts
    .filter(d => ids.has(d.transaction_id) && !d.waived_at)
    .reduce((s, d) => s + d.principal_usd, 0)

  return round2(bruto - repartido)
}

/* ─── Comprometido: Fijos pendientes de esa categoría ──────────────────── */

export interface CommittedRecurring {
  category_id: string | null
  active: boolean
  /** Ya convertido a USD con la tasa de HOY (es un estimado, no algo congelado). */
  amountUsd: number
  status: 'pendiente' | 'registrado' | 'vencido' | 'pausado' | 'programado'
}

export function comprometidoUsd(recurring: CommittedRecurring[], categoryId: string): number {
  const pending = recurring.filter(r => r.active && (r.status === 'pendiente' || r.status === 'vencido'))
  return round2(pending.filter(r => r.category_id === categoryId).reduce((s, r) => s + r.amountUsd, 0))
}

/* ─── Carry: un solo salto hacia atrás, no una cadena ──────────────────────
   El `amount_usd` de un cierre YA es el disponible final de ese mes, que a su
   vez ya incluye cualquier carry que ese mes haya recibido. Por eso alcanza
   con mirar el cierre del período inmediato anterior. */

export interface BudgetClosureRow {
  line_id: string
  period: string
  carried: boolean
  amount_usd: number
}

export function carriedInto(closures: BudgetClosureRow[], lineId: string, period: string): number {
  const prev = previousPeriod(period)
  const c = closures.find(x => x.line_id === lineId && x.period === prev)
  return c && c.carried ? c.amount_usd : 0
}

/* ─── Disponible ────────────────────────────────────────────────────────── */

export function disponible(params: {
  montoEfectivoUsd: number | null
  gastoRealUsd: number
  comprometidoUsd: number
  carriedUsd: number
}): number | null {
  if (params.montoEfectivoUsd == null) return null
  return round2(params.montoEfectivoUsd + params.carriedUsd - params.gastoRealUsd - params.comprometidoUsd)
}

/* ─── Barra de ritmo: tick + proyección ────────────────────────────────── */

/** Día de referencia dentro del período: hoy si es el vigente, el último día
    si ya terminó (no hay nada que proyectar en un mes cerrado). */
export function dayOfPeriod(period: string, todayISO: string): { day: number; days: number } {
  const [y, m] = period.split('-').map(Number)
  const days = daysInMonth(y, m)
  const { to } = periodRange(period)
  const isCurrent = todayISO >= period && todayISO <= to
  const day = isCurrent ? Number(todayISO.slice(8, 10)) : days
  return { day, days }
}

/** Regla de tres simple sobre el gasto real llevado hasta hoy. */
export function projectedUsd(gastoRealUsd: number, day: number, days: number): number {
  if (day <= 0) return 0
  return round2((gastoRealUsd / day) * days)
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
