import type { Currency, Frequency, Person, RateMap, RecurringSplit, Recurring, RecurringStatus, RecurringWithState } from './types'
import { daysBetween, evenSplit, normalizeName } from './splits'
import { crossCurrencySuggestion, round2, roundFor, toUsd } from './money'

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
 * De una fecha completa (el picker único de "primera vez que cae" del
 * formulario) a los campos que persiste la plantilla. El día se guarda TAL
 * CUAL se eligió, sin transformarlo: `periodOf` ya topa `day_of_month` contra
 * el largo real de cada mes/año futuro, así que un 30 elegido en septiembre
 * sigue siendo el 30 en octubre o noviembre (que también lo tienen), y solo
 * se ajusta en febrero (que no). El 31 es el único caso que "llega siempre al
 * final" en todos lados — pero eso sale gratis del mismo tope, porque no hay
 * mes con más de 31 días: no hace falta ningún caso especial para lograrlo.
 */
export function fieldsFromDate(
  fecha: string,
  frequency: Frequency,
): Pick<Recurring, 'day_of_month' | 'month_of_year' | 'starts_on'> {
  const [, month, day] = fecha.split('-').map(Number)
  return {
    day_of_month: day,
    month_of_year: frequency === 'anual' ? month : null,
    starts_on: fecha,
  }
}

/** El inverso de `fieldsFromDate`: qué fecha mostraría el picker al editar una plantilla ya guardada. */
export function dateFromFields(
  r: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year' | 'starts_on'>,
): string {
  const [year] = r.starts_on.split('-').map(Number)
  const month = r.frequency === 'anual' ? (r.month_of_year ?? 1) : Number(r.starts_on.slice(5, 7))
  const day = Math.min(r.day_of_month, lastDayOf(year, month))
  return `${year}-${pad(month)}-${pad(day)}`
}


/**
 * Los períodos que faltan registrar, del más viejo al más nuevo.
 *
 * Un fijo puede arrancar antes de hoy — lo cargaste tarde y querés recuperar
 * los meses que ya pasaron — o después, porque el servicio empieza el mes que
 * viene. `starts_on` es lo que separa los dos casos, y esta función traduce eso
 * a "qué te falta".
 *
 * El tope de 24 evita que un `starts_on` mal tipeado (2019) genere una lista
 * infinita: si hace dos años que no registrás algo, el problema no es la lista.
 */
export function pendingPeriods(
  r: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year' | 'starts_on'>,
  registeredDates: string[],
  todayISO: string,
  max = 24,
): string[] {
  const out: string[] = []
  const [sy, sm] = r.starts_on.split('-').map(Number)
  const [ty, tm] = todayISO.split('-').map(Number)

  if (r.frequency === 'anual') {
    for (let y = sy; y <= ty && out.length < max; y++) {
      const { from, to, due } = periodOf(r, `${y}-01-01`)
      // Un período que todavía no llegó no está "pendiente": está por venir.
      if (due > todayISO && y >= ty) break
      if (!registeredDates.some(d => d >= from && d <= to)) out.push(due)
    }
    return out
  }

  let total = sy * 12 + (sm - 1)
  const fin = ty * 12 + (tm - 1)
  for (; total <= fin && out.length < max; total++) {
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    const { from, to, due } = periodOf(r, `${y}-${String(m).padStart(2, '0')}-01`)
    if (!registeredDates.some(d => d >= from && d <= to)) out.push(due)
  }
  return out
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
  r: Pick<Recurring, 'frequency' | 'day_of_month' | 'month_of_year' | 'active' | 'starts_on'>,
  registeredDates: string[],
  todayISO: string,
): { status: RecurringStatus; due: string; days_late: number; pending: string[] } {
  const actual = periodOf(r, todayISO)

  // Pausado gana sobre registrado: en la lista, un fijo pausado que muestre
  // "Listo" se lee como activo y al día. Lo que le importa al usuario de un
  // pausado es que no se lo van a volver a pedir.
  if (!r.active) return { status: 'pausado', due: actual.due, days_late: 0, pending: [] }

  // Todavía no arrancó: el servicio empieza el mes que viene. No es que esté
  // atrasado, es que no le toca.
  if (r.starts_on > actual.to) {
    const inicio = periodOf(r, r.starts_on)
    return { status: 'programado', due: inicio.due, days_late: 0, pending: [] }
  }

  const pending = pendingPeriods(r, registeredDates, todayISO)
  if (pending.length === 0) {
    // Que no falte nada puede querer decir dos cosas distintas, y confundirlas
    // era un bug: o ya se registró el período vigente, o todavía NO LE TOCA.
    // Solo pasa con los anuales — `pendingPeriods` saltea a propósito el año en
    // curso hasta que llega su fecha (no tiene sentido reclamar en agosto una
    // renovación de noviembre), y sin este chequeo eso caía en "registrado":
    // la pantalla mostraba "Listo ✓" sobre algo que nunca se pagó.
    const registradoEnPeriodo = registeredDates.some(d => d >= actual.from && d <= actual.to)
    if (!registradoEnPeriodo && actual.due > todayISO) {
      return { status: 'programado', due: actual.due, days_late: 0, pending }
    }
    return { status: 'registrado', due: actual.due, days_late: 0, pending }
  }

  // El más viejo sin registrar es el que se propone: si cargaste el fijo tarde,
  // primero se recupera marzo y después abril, no al revés.
  const due = pending[0]
  const late = todayISO > due
  return {
    status: late ? 'vencido' : 'pendiente',
    due,
    days_late: late ? diffDays(due, todayISO) : 0,
    pending,
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
 *
 * Un monto fijo se guarda en la moneda DE LA PLANTILLA (`templateCurrency`),
 * independiente de con qué cuenta termines pagando cada mes (§ RegisterSheet:
 * "a veces pagás Spotify en USD desde una cuenta en Bs"). Si `currency` — la
 * de ESTE pago — es otra, hay que convertir antes de sumar o restar: sin
 * esto, pagar en otra moneda dejaba la parte de cada uno con el número crudo
 * de la plantilla puesto en la moneda equivocada, en vez de lo que de verdad
 * le corresponde al tipo de cambio de hoy.
 */
export function resolveSplits(
  templateSplits: Pick<RecurringSplit, 'person_id' | 'amount'>[],
  amount: number,
  currency: Currency,
  templateCurrency: Currency,
  rates: RateMap,
): { person_id: string; amount: number }[] {
  if (templateSplits.length === 0) return []

  const convert = (n: number) =>
    templateCurrency === currency ? n : (crossCurrencySuggestion(n, templateCurrency, currency, rates) ?? n)

  const fijos = templateSplits.filter(s => s.amount != null)
  const parejos = templateSplits.filter(s => s.amount == null)

  if (parejos.length === 0) {
    return templateSplits.map(s => ({ person_id: s.person_id, amount: roundFor(convert(s.amount!), currency) }))
  }

  // Lo que ya está comprometido en partes fijas sale del reparto antes de
  // dividir; el resto se reparte entre los parejos y vos.
  const comprometido = fijos.reduce((n, s) => n + convert(s.amount ?? 0), 0)
  const aRepartir = Math.max(amount - comprometido, 0)
  const { shares } = evenSplit(aRepartir, parejos.length + 1, currency)

  const out = fijos.map(s => ({ person_id: s.person_id, amount: roundFor(convert(s.amount!), currency) }))
  parejos.forEach((s, i) => out.push({ person_id: s.person_id, amount: shares[i] ?? 0 }))
  return out.filter(s => s.amount > 0)
}


/**
 * Valida el reparto por defecto de una plantilla.
 *
 * A diferencia del de un movimiento, acá `amount` puede ser `null` — eso es una
 * parte pareja. Lo que no puede es ser cero o negativo, ni repetir persona.
 *
 * Existe porque sin esto los dos errores llegaban a la base y volvían como
 * `duplicate key value violates unique constraint "fin_recurring_splits_..."`,
 * que no le dice nada a nadie.
 */
export function validateTemplateSplits(
  splits: { person_id?: string; person_name?: string; amount?: number | null }[] | undefined | null,
  knownPeople?: { id: string; name: string }[],
): { ok: boolean; error?: string } {
  if (!splits || splits.length === 0) return { ok: true }

  const nameById = new Map((knownPeople ?? []).map(p => [p.id, normalizeName(p.name)] as const))
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  for (const s of splits) {
    const id = s.person_id?.trim()
    const name = s.person_name?.trim()

    if (!id && !name) return { ok: false, error: 'Cada parte necesita una persona' }

    if (id) {
      if (seenIds.has(id)) return { ok: false, error: 'Una persona no puede aparecer dos veces en el reparto' }
      seenIds.add(id)
    }
    // La clave por nombre cruza los dos caminos: una fila con el id de Ana y
    // otra con `person_name: "ana"` son la misma persona.
    const key = id ? nameById.get(id) : normalizeName(name!)
    if (key) {
      if (seenNames.has(key)) {
        return { ok: false, error: `${name ?? 'Esa persona'} aparece dos veces en el reparto`.trim() }
      }
      seenNames.add(key)
    }

    // `null` es válido y significa pareja. Cero y negativo, no.
    if (s.amount != null) {
      if (!Number.isFinite(s.amount) || s.amount <= 0) {
        return { ok: false, error: 'Una parte con monto tiene que ser mayor a cero' }
      }
    }
  }

  return { ok: true }
}

/** Pendientes y vencidos primero, después por fecha de vencimiento. */
export function sortRecurring(items: RecurringWithState[]): RecurringWithState[] {
  const rank: Record<RecurringStatus, number> = { vencido: 0, pendiente: 1, programado: 2, registrado: 3, pausado: 4 }
  return [...items].sort((a, b) =>
    rank[a.status] - rank[b.status] || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
}

// Los que todavía no arrancaron no cuentan: no hay nada que registrar. Un
// pausado tampoco: `active` ya los saca del período vigente.
function enPeriodo(items: RecurringWithState[]): RecurringWithState[] {
  return items.filter(r => r.active && r.status !== 'programado')
}

/** "1 de 3 registrados" para el panel de la Home. */
export function progress(items: RecurringWithState[]): { done: number; total: number; pending: number } {
  const activos = enPeriodo(items)
  const done = activos.filter(r => r.status === 'registrado').length
  return { done, total: activos.length, pending: activos.length - done }
}

/**
 * ¿Hace falta la alerta de "Gastos Fijos" en la Home? Es eso, una alerta, no
 * un resumen — así que no basta con que haya fijos: tiene que haber uno que
 * de verdad requiera atención. Vencido cuenta siempre; pendiente solo si cae
 * dentro de los próximos `days` días. Uno que recién vence en 20 días no es
 * urgente todavía, y ya se ve completo en la pantalla de Fijos.
 */
export function needsAttentionSoon(
  items: Pick<RecurringWithState, 'active' | 'status' | 'due'>[], todayISO: string, days = 3,
): boolean {
  return items.some(r => {
    if (!r.active) return false
    if (r.status === 'vencido') return true
    return r.status === 'pendiente' && daysBetween(todayISO, r.due) <= days
  })
}

/**
 * Cuánto suman, en USD, los fijos del período vigente — el monto grande de
 * Gastos Fijos. El monto de cada plantilla nunca se guarda en USD (es lo que
 * cuesta HOY en su moneda), así que se convierte acá con la tasa vigente en
 * vez de con una congelada.
 */
export function monthlyTotalUsd(items: RecurringWithState[], rates: RateMap): number {
  return round2(enPeriodo(items).reduce((sum, r) => sum + toUsd(r.amount, r.currency, rates), 0))
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
