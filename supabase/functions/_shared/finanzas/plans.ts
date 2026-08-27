// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type { Currency, Debt, DebtWithContext, PlanFrequency } from './types.ts'
import { floorTo, isOpen } from './splits.ts'
import { round2, roundFor } from './money.ts'

const pad = (n: number) => String(n).padStart(2, '0')

/** Último día del mes, para no proponer un 31 de febrero. Copia deliberada de
    la misma función en recurring.ts: son dos plantillas distintas (una fija,
    una de N cuotas finitas) y no vale la pena acoplarlas por dos líneas. */
function lastDayOf(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/**
 * El total a cobrar: capital más un interés simple opcional, aplicado **una
 * sola vez** sobre el capital — no por período, no compuesto.
 *
 * `interestRate` en `null` o `undefined` significa "solo capital": es la
 * respuesta directa a "debo poder cobrar con intereses si quiero o solo el
 * monto del capital de la deuda". No hay un booleano aparte, el campo vacío
 * ya lo dice.
 */
export function planTotal(
  principal: number,
  interestRate: number | null | undefined,
  currency: Currency,
): number {
  if (!interestRate) return roundFor(principal, currency)
  return roundFor(principal + (principal * interestRate) / 100, currency)
}

/**
 * Reparte un total en `n` cuotas iguales. El resto del redondeo va a la
 * **última** cuota, no a la primera.
 *
 * Es el mismo patrón que la división pareja de gastos (Sprint 2 §4.2), con un
 * giro: ahí el resto queda del lado de "vos" porque sos quien paga. Acá no hay
 * "vos" en la lista de cuotas — todas son ajenas — y la última es la que menos
 * duele ajustar por unos centavos porque falta más para que venza.
 */
export function equalInstallments(total: number, n: number, currency: Currency): number[] {
  if (!Number.isFinite(total) || total <= 0 || n < 1) return []
  if (n === 1) return [roundFor(total, currency)]

  const parte = floorTo(total / n, currency)
  const cuotas = Array.from({ length: n - 1 }, () => parte)
  cuotas.push(roundFor(total - parte * (n - 1), currency))
  return cuotas
}

/**
 * La fecha de la cuota `index` (0-based) a partir de `startsOn`.
 *
 * `'mensual'` respeta el mismo tope de fin de mes que ya usa Fijos
 * (`lastDayOf`): un plan que arranca el 31 de enero cae el 28 de febrero, no
 * se corre al 1 de marzo. `'quincenal'` suma 15 días × index; `'semanal'`,
 * 7 días × index. La aritmética de días va en UTC a propósito — evita que un
 * huso horario local corra la fecha un día en el borde de la medianoche.
 */
export function installmentDate(startsOn: string, frequency: PlanFrequency, index: number): string {
  if (frequency === 'mensual') {
    const [y, m, d] = startsOn.split('-').map(Number)
    const total = y * 12 + (m - 1) + index
    const ty = Math.floor(total / 12)
    const tm = (total % 12) + 1
    return `${ty}-${pad(tm)}-${pad(Math.min(d, lastDayOf(ty, tm)))}`
  }

  const days = frequency === 'quincenal' ? 15 : 7
  const [y, m, d] = startsOn.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days * index)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export interface GeneratedInstallment {
  amount: number
  incurred_on: string
}

/**
 * El calendario completo en modo "iguales": `n` cuotas con su monto y fecha,
 * listas para insertarse como filas de `fin_debts`.
 */
export function generateEqualPlan(
  principal: number,
  interestRate: number | null | undefined,
  installments: number,
  frequency: PlanFrequency,
  startsOn: string,
  currency: Currency,
): GeneratedInstallment[] {
  const total = planTotal(principal, interestRate, currency)
  const amounts = equalInstallments(total, installments, currency)
  return amounts.map((amount, i) => ({ amount, incurred_on: installmentDate(startsOn, frequency, i) }))
}

/**
 * Un plan está cerrado cuando **ninguna** de sus cuotas sigue pendiente —
 * derivado de los mismos dos punteros que el estado de cada deuda
 * (`settled_tx_id`, `waived_at`), nunca una columna propia. Mismo principio
 * que el resto de la app: un flag persistido se desincroniza del hecho que
 * describe, un cálculo sobre los datos reales no.
 */
export function planCerrado(cuotas: Pick<Debt, 'settled_tx_id' | 'waived_at'>[]): boolean {
  return cuotas.length > 0 && !cuotas.some(isOpen)
}

export interface PlanRollup {
  total_usd: number
  pagado_usd: number
  pendiente_usd: number
  perdonado_usd: number
}

/** Las cuatro cifras que resumen un plan, a partir de sus cuotas ya cargadas. */
export function planRollup(cuotas: DebtWithContext[]): PlanRollup {
  const sum = (rows: DebtWithContext[]) => round2(rows.reduce((s, c) => s + c.amount_usd, 0))
  return {
    total_usd: sum(cuotas),
    pagado_usd: sum(cuotas.filter(c => c.state === 'cobrado')),
    pendiente_usd: sum(cuotas.filter(c => c.state === 'pendiente')),
    perdonado_usd: sum(cuotas.filter(c => c.state === 'perdonado')),
  }
}
