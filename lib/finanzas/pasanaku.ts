import { CURRENCIES } from './types'
import { isValidDate } from './transactions'
import type { Pasanaku, PasanakuInput, PasanakuWithState } from './types'

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
 * El aporte que corresponde AHORA — el mismo día del mes que `start_date`,
 * en el mes corriente. A diferencia de `nextAporteDue`, NO salta al mes
 * siguiente cuando el día ya pasó: es la fecha a partir de la cual el aporte
 * de este mes se puede registrar. Antes de que arranque el pasanaku
 * (`start_date` en el futuro) devuelve el arranque mismo.
 */
export function currentAporteDue(startDate: string, todayISO: string): string {
  const [sy, sm] = startDate.split('-').map(Number)
  const [ty, tm] = todayISO.split('-').map(Number)
  const months = Math.max(0, (ty * 12 + (tm - 1)) - (sy * 12 + (sm - 1)))
  return addMonthsClamped(startDate, months)
}

/**
 * ¿Se puede aportar hoy? Sí desde el día en que cae el aporte del mes — antes
 * de esa fecha todavía no hay nada que registrar, y el botón "Aportar" queda
 * bloqueado (pedido del usuario, 2026-08-26).
 *
 * La excepción son los meses atrasados: si arrastrás una ronda anterior sin
 * aportar, se puede aportar en cualquier momento. Sin esto, alguien que se
 * saltó un mes quedaba con la deuda trabada hasta que cayera el día del mes
 * siguiente — justo al revés de lo que hace falta.
 */
export function canAportar(startDate: string, rounds: PasanakuRound[], todayISO: string): boolean {
  if (todayISO >= currentAporteDue(startDate, todayISO)) return true
  const mesHoy = todayISO.slice(0, 7)
  return rounds.some(r => !r.paid && r.period < mesHoy)
}

/**
 * ¿Falta un aporte AHORA mismo? Distinto de `canAportar`, que solo dice si el
 * botón está habilitado (lo está también cuando ya aportaste este mes): acá
 * además tiene que faltar de verdad un aporte — el del mes corriente, una vez
 * que llegó su día, o el de cualquier mes anterior sin marcar.
 *
 * Es lo que decide si la Home muestra el aviso del pasanaku, así que se
 * apaga solo: en cuanto el aporte queda registrado, deja de haber pendiente.
 */
export function aportePendiente(startDate: string, rounds: PasanakuRound[], todayISO: string): boolean {
  const mesHoy = todayISO.slice(0, 7)
  if (rounds.some(r => !r.paid && r.period < mesHoy)) return true
  const esteMes = rounds.find(r => r.period === mesHoy)
  return !!esteMes && !esteMes.paid && todayISO >= currentAporteDue(startDate, todayISO)
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
  if (!input.name || !input.name.trim()) return 'Ponle un nombre'
  // Sin cuenta a propósito: se elige al aportar/recibir, no al crear (mismo
  // criterio que un fijo). Lo que sí hace falta es saber en qué moneda está
  // pensado el aporte — sin eso no hay decimales ni label que mostrar.
  if (!input.currency || !CURRENCIES.includes(input.currency)) return 'Elige una moneda'
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
  if (!isValidDate(input.start_date)) return 'Elige una fecha de inicio'
  return null
}

/** Una ronda del ciclo: el mes que le toca y si ya lo aportaste. */
export interface PasanakuRound {
  /** `'2026-08'` — el mes en el que cae esta ronda. */
  period: string
  /** Número de ronda, desde 1 (`start_date` es la 1). */
  round: number
  /** Lo aportado ese mes, ya en `Pasanaku.currency`. 0 si todavía no. */
  amount: number
  /** Hay al menos un aporte (real o histórico) con fecha de ese mes. */
  paid: boolean
  /** La ronda en la que te toca recibir a vos (`my_slot`). */
  mine: boolean
}

/**
 * El ciclo entero mes a mes: una ronda por puesto (`total_slots`), desde
 * `start_date`. Es lo que contesta "cuánto me falta para terminar", no el
 * historial completo — un aporte fuera del ciclo (anterior al inicio o
 * posterior a la última ronda) no aparece en ninguna fila.
 *
 * Un aporte cuenta para el mes de su FECHA, no para el mes en que se cargó:
 * cargar hoy el aporte de junio marca junio, no el mes corriente. Mismo
 * criterio que el resto de la mini-app, donde la fecha del movimiento manda.
 *
 * Los meses se cuentan sobre enteros de año/mes y no sumando días a un
 * `Date`, por lo mismo que explica `lastMonths` en transactions.ts.
 */
export function pasanakuRounds(
  p: Pick<Pasanaku, 'start_date' | 'total_slots' | 'my_slot'>,
  aportes: { date: string; amount: number }[],
): PasanakuRound[] {
  const [sy, sm] = p.start_date.split('-').map(Number)
  const start = sy * 12 + (sm - 1)

  const porMes = new Map<string, number>()
  for (const a of aportes) {
    const key = a.date.slice(0, 7)
    porMes.set(key, (porMes.get(key) ?? 0) + a.amount)
  }

  return Array.from({ length: Math.max(1, p.total_slots) }, (_, i) => {
    const total = start + i
    const period = `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
    return {
      period,
      round: i + 1,
      amount: porMes.get(period) ?? 0,
      paid: porMes.has(period),
      mine: i + 1 === p.my_slot,
    }
  })
}

/**
 * Las rondas de un pasanaku ya cargado: junta los aportes reales con los
 * históricos, que es lo que mira todo lo que pregunta "¿me falta algún mes?"
 * — la tabla del detalle, el botón "Aportar" de la card y el aviso de la
 * Home. Vive acá para que los tres cuenten lo mismo.
 */
export function roundsOf(p: PasanakuWithState): PasanakuRound[] {
  return pasanakuRounds(p, [
    ...p.aportes.map(a => ({ date: a.date, amount: a.amount_in_currency })),
    ...p.historico.map(h => ({ date: h.date, amount: h.amount })),
  ])
}
