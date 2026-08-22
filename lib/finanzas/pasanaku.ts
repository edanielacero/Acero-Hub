import { CURRENCIES } from './types'
import type { Pasanaku, PasanakuInput } from './types'

/** Último día del mes, para no proponer un 31 de febrero. Mismo criterio que `lib/finanzas/recurring.ts`. */
function lastDayOf(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Suma meses a una fecha ISO, topando el día contra el largo real del mes destino. */
export function addMonthsClamped(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDayOf(ny, nm)))}`
}

/**
 * Cuándo te toca recibir — NUNCA se guarda, se deriva de `start_date` y
 * `my_slot`. Puesto 1 recibe en `start_date`; puesto 4 recibe tres meses
 * después. Mismo principio que el saldo de una cuenta: un dato derivado no se
 * puede desincronizar de la historia que describe.
 */
export function expectedTurnDate(p: Pick<Pasanaku, 'start_date' | 'my_slot'>): string {
  return addMonthsClamped(p.start_date, p.my_slot - 1)
}

/**
 * Cuándo cae el próximo aporte mensual — el mismo día del mes que
 * `start_date`, la próxima ocurrencia a partir de hoy (hoy mismo cuenta como
 * "próximo" si todavía no pasó). NUNCA se guarda, se deriva.
 *
 * A diferencia de `pendingPeriods` en `recurring.ts` (Fijos), acá no se
 * arrastra un historial de meses atrasados sin registrar — el usuario pidió
 * "cuándo se debe pagar el siguiente", en singular, no una lista de mora.
 */
export function nextAporteDue(startDate: string, todayISO: string): string {
  const [sy, sm] = startDate.split('-').map(Number)
  const [ty, tm] = todayISO.split('-').map(Number)
  const months = Math.max(0, (ty * 12 + (tm - 1)) - (sy * 12 + (sm - 1)))
  const due = addMonthsClamped(startDate, months)
  return due < todayISO ? addMonthsClamped(startDate, months + 1) : due
}

/**
 * En qué ronda del pasanaku estamos, contando desde 1 — `start_date` es la
 * ronda 1. Mismo cálculo de meses transcurridos que `nextAporteDue`, pero
 * devolviendo el número de ronda en vez de la fecha. Se topa contra 1: antes
 * de `start_date` no hay ronda "0".
 *
 * Sirve para la barra de progreso "hasta que te toque" (ronda actual / tu
 * puesto) — una aproximación por mes calendario, no un conteo de aportes
 * realmente registrados: mismo criterio que `next_aporte_due`, que tampoco
 * mira si vos en particular ya cargaste el tuyo.
 */
export function currentRound(startDate: string, todayISO: string): number {
  const [sy, sm] = startDate.split('-').map(Number)
  const [ty, tm] = todayISO.split('-').map(Number)
  return Math.max(1, (ty * 12 + (tm - 1)) - (sy * 12 + (sm - 1)) + 1)
}

export function validatePasanaku(input: Partial<PasanakuInput>): string | null {
  if (!input.name || !input.name.trim()) return 'Ponele un nombre'
  // Sin cuenta a propósito: se elige al aportar/recibir, no al crear (mismo
  // criterio que un fijo). Lo que sí hace falta es saber en qué moneda está
  // pensado el aporte — sin eso no hay decimales ni label que mostrar.
  if (!input.currency || !CURRENCIES.includes(input.currency)) return 'Elegí una moneda'
  if (typeof input.contribution_amount !== 'number' || !Number.isFinite(input.contribution_amount) || input.contribution_amount <= 0) {
    return 'El aporte debe ser mayor a cero'
  }
  if (!Number.isInteger(input.total_slots) || (input.total_slots as number) <= 1) {
    return 'Los puestos tienen que ser al menos 2'
  }
  if (!Number.isInteger(input.my_slot) || (input.my_slot as number) < 1) {
    return 'Tu puesto tiene que ser 1 o más'
  }
  if ((input.my_slot as number) > (input.total_slots as number)) {
    return 'Tu puesto no puede ser mayor que el total de puestos'
  }
  if (!input.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) return 'Elegí una fecha de inicio'
  return null
}
