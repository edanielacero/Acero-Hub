import type { Currency, Person, RecurringSplit, Recurring, RecurringStatus, RecurringWithState } from './types'
import { evenSplit } from './splits'
import { roundFor } from './money'

/** Último día del mes, para no proponer un 31 de febrero. */
function lastDayOf(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * El período vigente de una plantilla en una fecha dada.
 *
 * Mensual → el mes de `ref`. Anual → el año de `ref`.
 *
 * `due` es cuándo cae dentro de ese período, topeado contra el largo del mes:
 * una plantilla configurada el 31 cae el 28 en febrero, no se pierde ni se
 * corre a marzo.
 */
export function periodOf(
  r: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year'>,
  refISO: string,
): { from: string; to: string; due: string } {
  const [year, month] = refISO.split('-').map(Number)

  if (r.frequency === 'anual') {
    const m = r.month_of_year ?? 1
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      due: `${year}-${pad(m)}-${pad(Math.min(r.day_of_month, lastDayOf(year, m)))}`,
    }
  }

  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDayOf(year, month))}`,
    due: `${year}-${pad(month)}-${pad(Math.min(r.day_of_month, lastDayOf(year, month)))}`,
  }
}

/**
 * Estado de una plantilla en su período vigente.
 *
 * `registrado` **no se guarda**: es que exista un movimiento apuntando a esta
 * plantilla dentro del período. Un flag persistido se desincroniza del hecho
 * que describe; un puntero, no. Es el mismo principio que los estados de las
 * deudas del Sprint 2.
 */
export function statusOf(
  r: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year' | 'active'>,
  registeredDates: string[],
  todayISO: string,
): { status: RecurringStatus; due: string; days_late: number } {
  const { from, to, due } = periodOf(r, todayISO)

  // Pausado gana sobre registrado: en la lista, un fijo pausado que muestre
  // "Listo" se lee como activo y al día. Lo que le importa al usuario de un
  // pausado es que no se lo van a volver a pedir.
  if (!r.active) return { status: 'pausado', due, days_late: 0 }

  if (registeredDates.some(d => d >= from && d <= to)) {
    return { status: 'registrado', due, days_late: 0 }
  }

  // `vencido` solo cuando la fecha ya pasó. Antes de eso está pendiente y no
  // hay nada que reclamar: Spotify del 5 no está "atrasado" el día 2.
  const late = todayISO > due
  return {
    status: late ? 'vencido' : 'pendiente',
    due,
    days_late: late ? diffDays(due, todayISO) : 0,
  }
}

function diffDays(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * El reparto concreto para una instancia, resolviendo las partes parejas.
 *
 * Una parte con `amount` en null significa "pareja": se calcula con el monto de
 * ESTE mes, no con el que tenía la plantilla el día que la creaste. Así, si
 * Spotify sube de $11.99 a $12.99, a cada uno le toca un poco más sin que
 * tengas que acordarte de editar el reparto.
 *
 * Las partes con monto fijo mandan tal cual: son las que te dejan cobrar un
 * poco por encima del costo, o invitar vos una parte.
 */
export function resolveSplits(
  templateSplits: Pick<RecurringSplit, 'person_id' | 'amount'>[],
  amount: number,
  currency: Currency,
): { person_id: string; amount: number }[] {
  if (templateSplits.length === 0) return []

  const fijos = templateSplits.filter(s => s.amount != null)
  const parejos = templateSplits.filter(s => s.amount == null)

  if (parejos.length === 0) {
    return templateSplits.map(s => ({ person_id: s.person_id, amount: roundFor(s.amount!, currency) }))
  }

  // Lo que ya está comprometido en partes fijas sale del reparto antes de
  // dividir; el resto se reparte entre los parejos y vos.
  const comprometido = fijos.reduce((n, s) => n + (s.amount ?? 0), 0)
  const aRepartir = Math.max(amount - comprometido, 0)
  const { shares } = evenSplit(aRepartir, parejos.length + 1, currency)

  const out = fijos.map(s => ({ person_id: s.person_id, amount: roundFor(s.amount!, currency) }))
  parejos.forEach((s, i) => out.push({ person_id: s.person_id, amount: shares[i] ?? 0 }))
  return out.filter(s => s.amount > 0)
}

/** Pendientes y vencidos primero, después por fecha de vencimiento. */
export function sortRecurring(items: RecurringWithState[]): RecurringWithState[] {
  const rank: Record<RecurringStatus, number> = { vencido: 0, pendiente: 1, registrado: 2, pausado: 3 }
  return [...items].sort((a, b) =>
    rank[a.status] - rank[b.status] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
}

/** "1 de 3 registrados" para el panel de la Home. */
export function progress(items: RecurringWithState[]): { done: number; total: number; pending: number } {
  const activos = items.filter(r => r.active)
  const done = activos.filter(r => r.status === 'registrado').length
  return { done, total: activos.length, pending: activos.length - done }
}

/** Los nombres de las personas de un reparto, para el resumen de una fila. */
export function splitLabel(
  splits: Pick<RecurringSplit, 'person_id'>[],
  peopleById: Map<string, Person>,
): string {
  return splits
    .map(s => peopleById.get(s.person_id)?.name ?? '?')
    .join(', ')
}
