import type { SupabaseClient } from '@supabase/supabase-js'
import { computeBalances, mapAccount, mapBalanceMovement, totalUsd, withBalances } from './accounts'
import { crossCurrencySuggestion, decimalsFor, formatAmount, num, round2, roundFor, toUsd } from './money'
import { PERSON_COLS } from './people'
import { ensureRates, type RateDetail } from './rates'
import type { QuoteMap } from './quotes'
import { DEBT_COLS, DEBT_CTX_COLS, mapDebtContext, readDebts, settledOn, type RawDebtRow } from './shared'
import { groupByPerson, isOpen, porCobrarUsd } from './splits'
import { periodOf, progress, sortRecurring, statusOf } from './recurring'
import { planCerrado, planRollup } from './plans'
import { currentRound, expectedTurnDate, nextAporteDue } from './pasanaku'
import { availableFrom, consumesBalance, isInvestmentAdjustment, monthRange, todayISO } from './transactions'
import {
  carriedInto, comprometidoUsd, dayOfPeriod, disponible, effectiveFromFor, gastoRealCategoria,
  montoEfectivo, needsClosure, periodRange, periodStart, projectedUsd, resolvePeriod,
  type BudgetDebtShare, type BudgetTx, type CommittedRecurring,
} from './budgets'
import type {
  Account, AccountWithBalance, BudgetGeneralProgress, BudgetLineProgress, BudgetsPayload, Category, Currency, PersonWithDebt,
  Person, PendingClosure, RateMap, Recurring, RecurringSplit, RecurringSummary,
  RecurringWithState, SharedSummary, Debt, DebtPlan, DebtPlanWithCuotas,
  DebtWithContext, Pasanaku, PasanakuCobro, PasanakuHistorico, PasanakuWithState, Transaction, TxType,
} from './types'

/**
 * Lecturas de dominio compartidas por las rutas.
 *
 * Viven acá y no dentro de cada `route.ts` porque `/api/finanzas/bootstrap`
 * necesita exactamente lo mismo que las cinco rutas sueltas: sin este archivo,
 * la única forma de servir todo en un viaje sería duplicar la lógica y esperar
 * que las dos copias no se separen con el tiempo.
 *
 * Nada de acá importa `next/*`: `lib/finanzas` entero se compila con tsc para
 * los tests (ver tests/finanzas/run.mjs) y un import de framework lo rompería.
 */

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'
const CATEGORY_COLS = 'id, name, kind, icon, sort_order, archived'
const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description, recurring_id, pasanaku_id'

export interface AccountsPayload {
  accounts: AccountWithBalance[]
  total_usd: number
  rates: RateMap
  rate_list: RateDetail[]
}

/** Cuentas con saldo derivado, más las tasas con que se valuaron. */
export async function loadAccounts(
  supabase: SupabaseClient,
  userId: string,
  quotes?: QuoteMap,
): Promise<AccountsPayload> {
  const [{ rates, rows: rateRows }, { data: accountRows }, { data: txRows }] = await Promise.all([
    ensureRates(supabase, userId, quotes),
    supabase
      .from('fin_accounts')
      .select(ACCOUNT_COLS)
      .eq('user_id', userId)
      .order('sort_order')
      .order('created_at'),
    // Se traen todos los movimientos porque el saldo es derivado: no hay forma
    // de conocerlo sin recorrer la historia completa de cada cuenta. `flow_type`
    // viaja también para `has_value_updates` de acá abajo — no hace falta un
    // segundo viaje a la base solo para eso.
    supabase
      .from('fin_transactions')
      .select('type, account_id, to_account_id, amount, to_amount, flow_type')
      .eq('user_id', userId),
  ])

  const accounts = (accountRows ?? []).map(mapAccount)
  const movements = (txRows ?? []).map(mapBalanceMovement)
  const withBal = withBalances(accounts, movements, rates)

  // Qué cuentas ya tienen una "Actualizar valor" registrada (§7.2): el form de
  // Cuentas usa esto para directamente no ofrecer el toggle "Es inversión" en
  // vez de dejar destildarlo y rechazarlo recién al guardar.
  const accountsById = new Map(accounts.map(a => [a.id, a]))
  const updatedIds = new Set(
    (txRows ?? [])
      .filter(r => isInvestmentAdjustment(
        { type: r.type as TxType, flow_type: r.flow_type as Transaction['flow_type'] },
        accountsById.get(r.account_id as string),
      ))
      .map(r => r.account_id as string),
  )
  const withFlags: AccountWithBalance[] = withBal.map(a => ({ ...a, has_value_updates: updatedIds.has(a.id) }))

  return { accounts: withFlags, total_usd: totalUsd(withFlags), rates, rate_list: rateRows }
}

/** Saldo actual de UNA cuenta — mismo cálculo derivado que `loadAccounts`,
    para cuando una escritura necesita validar sin traer todas las cuentas. */
export async function accountBalance(
  supabase: SupabaseClient,
  userId: string,
  account: Account,
): Promise<number> {
  const { data: txRows } = await supabase
    .from('fin_transactions')
    .select('type, account_id, to_account_id, amount, to_amount')
    .eq('user_id', userId)

  const movements = (txRows ?? []).map(mapBalanceMovement)
  return computeBalances([account], movements).get(account.id) ?? account.initial_balance
}

/**
 * La regla dura: un gasto o una transferencia nunca puede dejar la cuenta de
 * origen en negativo. El cliente ya avisa antes (mismo cálculo, ver
 * `consumesBalance`/`availableFrom` en `transactions.ts` — quick-add,
 * RegisterSheet), pero esto es lo que de verdad lo impide. Vive acá y no en
 * cada `route.ts` porque tres rutas distintas pueden dejar una cuenta en
 * rojo — crear un movimiento, editarlo, o registrar un fijo — y las tres
 * tienen que aplicar exactamente el mismo criterio.
 *
 * `editing` es el movimiento que se está reemplazando (solo en un PATCH):
 * hay que revertir su efecto viejo antes de medir si el nuevo entra, o toda
 * edición hacia arriba de un gasto ya existente parecería "sin saldo".
 *
 * Excepción: un `gasto` en una cuenta `is_investment` no es plata saliendo,
 * es "Actualizar valor" bajando el número (§7.2 de `contexto_finanzas.md`) —
 * el mercado puede llevar una cuenta apalancada a negativo sin que eso sea un
 * error. Una transferencia SÍ sigue necesitando saldo real para salir,
 * inversión o no: no se puede retirar más de lo que la cuenta vale.
 */
export async function assertBalance(
  supabase: SupabaseClient,
  userId: string,
  account: Account,
  type: TxType,
  amount: number,
  editing?: { type: TxType; account_id: string; amount: number } | null,
): Promise<string | null> {
  if (!consumesBalance(type) || (type === 'gasto' && account.is_investment)) return null

  const balance = await accountBalance(supabase, userId, account)
  const disponible = availableFrom(balance, editing, account.id)

  if (amount > disponible) {
    return `${account.name} tiene ${formatAmount(disponible, account.currency)} disponibles`
  }
  return null
}

export async function loadCategories(supabase: SupabaseClient, userId: string): Promise<Category[]> {
  const { data } = await supabase
    .from('fin_categories')
    .select(CATEGORY_COLS)
    .eq('user_id', userId)
    .order('kind')
    .order('sort_order')
    .order('name')

  return (data ?? []) as Category[]
}

/**
 * Personas con lo que deben. El cálculo va en el server y no en el cliente
 * porque tanto Compartidos como el picker lo necesitan, y traer todos los
 * splits solo para contarlos sería un viaje entero desperdiciado.
 */
export async function loadPeople(supabase: SupabaseClient, userId: string): Promise<PersonWithDebt[]> {
  const [{ data: people }, { data: splits }] = await Promise.all([
    supabase.from('fin_people').select(PERSON_COLS).eq('user_id', userId).order('sort_order').order('name'),
    supabase
      .from('fin_debts')
      .select('person_id, amount_usd, settled_tx_id, waived_at')
      .eq('user_id', userId),
  ])

  const open = new Map<string, { count: number; usd: number }>()
  for (const s of splits ?? []) {
    if (!isOpen(s)) continue
    const acc = open.get(s.person_id) ?? { count: 0, usd: 0 }
    acc.count += 1
    acc.usd += num(s.amount_usd)
    open.set(s.person_id, acc)
  }

  return (people ?? []).map(p => ({
    ...(p as Person),
    open_count: open.get(p.id)?.count ?? 0,
    open_usd: round2(open.get(p.id)?.usd ?? 0),
  }))
}

/**
 * Todo el panel de Compartidos.
 *
 * `range` llega del cliente cuando se lo puede pasar: "cobrado este mes" se
 * mide contra el mes del usuario, no contra el del servidor, que en Vercel
 * corre en UTC y los días 1 y último del mes no coincide con Bolivia.
 */
export async function loadShared(
  supabase: SupabaseClient,
  userId: string,
  range: { from: string; to: string } = monthRange(),
): Promise<SharedSummary> {
  const { rows, raw } = await readDebts(supabase, userId)
  const today = todayISO()

  const byId = new Map(raw.map(r => [r.id, r]))
  const inMonth = (s: DebtWithContext) => {
    const on = settledOn(byId.get(s.id) ?? { settled: null, waived_at: s.waived_at })
    return on !== null && on >= range.from && on <= range.to
  }

  const abiertos = rows.filter(isOpen)

  const historial = rows
    .filter(s => !isOpen(s))
    .sort((a, b) => {
      const da = settledOn(byId.get(a.id)!) ?? ''
      const db = settledOn(byId.get(b.id)!) ?? ''
      return da < db ? 1 : da > db ? -1 : 0
    })
    .slice(0, 20)

  return {
    por_cobrar_usd: porCobrarUsd(abiertos),
    cobrado_mes_usd: round2(
      rows.filter(s => s.state === 'cobrado' && inMonth(s)).reduce((n, s) => n + s.amount_usd, 0),
    ),
    perdonado_mes_usd: round2(
      rows.filter(s => s.state === 'perdonado' && inMonth(s)).reduce((n, s) => n + s.amount_usd, 0),
    ),
    por_persona: groupByPerson(abiertos, today),
    historial,
  }
}


const DEBT_PLAN_COLS =
  'id, person_id, concept, principal, currency, interest_rate, installments, frequency, starts_on, note'

/**
 * Los planes de pago con sus cuotas ya resueltas.
 *
 * Cada cuota es una fila de `fin_debts` con `plan_id`: se traen todas de una
 * sola vez y se agrupan en memoria en vez de una consulta por plan — mismo
 * criterio que `loadRecurring` con los movimientos de cada plantilla.
 */
export async function loadDebtPlans(
  supabase: SupabaseClient,
  userId: string,
): Promise<DebtPlanWithCuotas[]> {
  const [{ data: planRows }, { data: peopleRows }, { data: cuotaRows }] = await Promise.all([
    supabase
      .from('fin_debt_plans')
      .select(DEBT_PLAN_COLS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase.from('fin_people').select(PERSON_COLS).eq('user_id', userId),
    supabase
      .from('fin_debts')
      .select(DEBT_CTX_COLS)
      .eq('user_id', userId)
      .not('plan_id', 'is', null)
      .order('plan_installment_no'),
  ])

  const peopleById = new Map((peopleRows ?? []).map(p => [p.id, p as Person]))

  const cuotasByPlan = new Map<string, DebtWithContext[]>()
  for (const row of (cuotaRows ?? []) as unknown as RawDebtRow[]) {
    const mapped = mapDebtContext(row)
    const list = cuotasByPlan.get(row.plan_id!)
    if (list) list.push(mapped)
    else cuotasByPlan.set(row.plan_id!, [mapped])
  }

  return (planRows ?? []).map(r => {
    const plan = {
      ...(r as unknown as DebtPlan),
      principal: num(r.principal),
      interest_rate: r.interest_rate === null ? null : num(r.interest_rate),
    }
    const cuotas = (cuotasByPlan.get(plan.id) ?? [])
      .sort((a, b) => (a.plan_installment_no ?? 0) - (b.plan_installment_no ?? 0))

    return {
      ...plan,
      person: peopleById.get(plan.person_id) ?? { id: plan.person_id, name: '—', sort_order: 0, archived: false },
      ...planRollup(cuotas),
      cerrado: planCerrado(cuotas),
      cuotas,
    }
  })
}

const PASANAKU_COLS =
  'id, name, account_id, currency, contribution_amount, total_slots, my_slot, start_date, archived'

const PASANAKU_HISTORICO_COLS = 'id, pasanaku_id, date, amount, note'

/**
 * Los pasanaku con lo que ya se derivó de sus movimientos.
 *
 * Se traen todos los movimientos con `pasanaku_id` de una sola vez en vez de
 * una consulta por pasanaku, mismo criterio de siempre.
 *
 * `aportes_count`/`total_aportado` suman DOS fuentes: los aportes reales
 * (`fin_transactions`) y los históricos de antes de usar la app
 * (`fin_pasanaku_historico`) — ver §"Aportes de antes de la app" en
 * sprint_5_pasanaku.md.
 *
 * `total_aportado`/`collected_amount` quedan en `Pasanaku.currency` — no en
 * USD — porque es la moneda en la que el usuario piensa el pasanaku
 * (feedback del 2026-08-21). Un movimiento cuya cuenta ya está en esa moneda
 * suma su monto tal cual, sin pasar por ninguna conversión (cero deriva de
 * redondeo); uno de otra moneda se convierte con la tasa de HOY — inevitable
 * ahí, mismo criterio que el patrimonio total (§4.3 de contexto_finanzas.md).
 * Los históricos ya nacen en `Pasanaku.currency` (no tienen cuenta), así que
 * siempre suman directo.
 *
 * `received` NO se guarda: sale de que `collected_amount` (la suma de los
 * cobros de tu turno) haya alcanzado `collection_target`. Cada cobro es un
 * `ingreso` real por jugador — se registran de a uno, no todo el pozo de una
 * sola vez (revisión del 2026-08-21: antes bastaba con que existiera un solo
 * `ingreso`, ahora hace falta juntar la parte de los `total_slots − 1` demás
 * puestos).
 */
export async function loadPasanaku(
  supabase: SupabaseClient,
  userId: string,
): Promise<PasanakuWithState[]> {
  const [{ data: rows }, { data: txRows }, { data: historicoRows }, { rates }] = await Promise.all([
    supabase.from('fin_pasanaku').select(PASANAKU_COLS).eq('user_id', userId).order('created_at'),
    supabase
      .from('fin_transactions')
      .select('id, type, date, amount, currency, pasanaku_id')
      .eq('user_id', userId)
      .not('pasanaku_id', 'is', null),
    supabase.from('fin_pasanaku_historico').select(PASANAKU_HISTORICO_COLS).eq('user_id', userId),
    ensureRates(supabase, userId),
  ])

  const byPasanaku = new Map<string, { id: string; type: TxType; date: string; amount: number; currency: Currency }[]>()
  for (const t of txRows ?? []) {
    const key = t.pasanaku_id as string
    const list = byPasanaku.get(key)
    const entry = {
      id: t.id as string, type: t.type as TxType, date: t.date as string,
      amount: num(t.amount), currency: t.currency as Currency,
    }
    if (list) list.push(entry)
    else byPasanaku.set(key, [entry])
  }

  const historicoByPasanaku = new Map<string, PasanakuHistorico[]>()
  for (const h of (historicoRows ?? []) as unknown as { id: string; pasanaku_id: string; date: string; amount: unknown; note: string | null }[]) {
    const entry: PasanakuHistorico = { id: h.id, pasanaku_id: h.pasanaku_id, date: h.date, amount: num(h.amount), note: h.note }
    const list = historicoByPasanaku.get(h.pasanaku_id)
    if (list) list.push(entry)
    else historicoByPasanaku.set(h.pasanaku_id, [entry])
  }

  const hoy = todayISO()

  return (rows ?? []).map(r => {
    const p = { ...(r as unknown as Pasanaku), contribution_amount: num(r.contribution_amount) }
    const movs = byPasanaku.get(p.id) ?? []
    const aportes = movs.filter(m => m.type === 'gasto')
    // Los cobros de tu turno — uno por jugador, no todo el pozo de una vez.
    const cobrosRaw = movs.filter(m => m.type === 'ingreso').sort((a, b) => (a.date < b.date ? 1 : -1))

    const historico = (historicoByPasanaku.get(p.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : -1))

    const enMoneda = (items: { amount: number; currency: Currency }[]) => items.reduce((s, a) => {
      if (a.currency === p.currency) return s + a.amount
      return s + (crossCurrencySuggestion(a.amount, a.currency, p.currency, rates) ?? a.amount)
    }, 0)

    const aportesEnMoneda = enMoneda(aportes)
    const historicoEnMoneda = historico.reduce((s, h) => s + h.amount, 0)
    const collected_amount = roundFor(enMoneda(cobrosRaw), p.currency)
    // La parte de los OTROS puestos — la tuya te la vas aportando mes a mes
    // como cualquier otra, no hay que "cobrártela" a vos mismo.
    const collection_target = roundFor(p.contribution_amount * (p.total_slots - 1), p.currency)

    const cobros: PasanakuCobro[] = cobrosRaw.map(c => ({ id: c.id, date: c.date, amount: c.amount, currency: c.currency }))

    // Un cobro de otra moneda pasa por dos redondeos independientes (a USD y
    // de vuelta, en dos llamadas separadas a crossCurrencySuggestion — la
    // sugerencia al registrarlo, la conversión acá al sumarlo) y puede perder
    // hasta media unidad de precisión en el camino. Sin tolerancia, un
    // pasanaku ya cobrado del todo podía quedar a centavos de
    // `collection_target` para siempre y `received` no pasar nunca a `true`.
    const unit = 1 / 10 ** decimalsFor(p.currency)
    const tolerance = unit * Math.max(1, cobrosRaw.length)

    return {
      ...p,
      expected_turn: expectedTurnDate(p),
      next_aporte_due: nextAporteDue(p.start_date, hoy),
      current_round: currentRound(p.start_date, hoy),
      received: collected_amount >= collection_target - tolerance,
      received_at: cobrosRaw[0]?.date ?? null,
      aportes_count: aportes.length + historico.length,
      total_aportado: roundFor(aportesEnMoneda + historicoEnMoneda, p.currency),
      historico,
      collected_amount,
      collection_target,
      cobros,
    }
  })
}

/* ─── Movimientos ──────────────────────────────────────────────────────────── */

/** La forma que devuelve el embed de `fin_debts` en la lista de movimientos. */
interface DebtRow {
  id: string
  transaction_id: string
  person_id: string
  amount: number
  currency: Currency
  amount_usd: number
  principal_usd: number
  settled_tx_id: string | null
  settled_margin_tx_id: string | null
  waived_at: string | null
  note: string | null
}

export interface TxFilters {
  from?: string | null
  to?: string | null
  type?: string | null
  accountId?: string | null
  categoryId?: string | null
  sharedOnly?: boolean
  /** Solo movimientos que vienen de un fijo (`recurring_id` no nulo). */
  recurringOnly?: boolean
  limit?: number
  offset?: number
}

export interface TxResult {
  transactions: Transaction[]
  total_gasto_usd: number
  total_ingreso_usd: number
  /** Lo que de ese gasto le toca a otras personas y no está perdonado. */
  total_repartido_usd: number
  /** Bruto menos repartido: lo que realmente te costó. */
  total_gasto_real_usd: number
}


const RECURRING_COLS =
  'id, name, icon, amount, currency, account_id, category_id, frequency, day_of_month, month_of_year, active, note, starts_on'

const RECURRING_SPLIT_COLS = 'id, recurring_id, person_id, amount'

/**
 * Los fijos con su estado en el período vigente.
 *
 * El estado NO se guarda: sale de si existe un movimiento apuntando a la
 * plantilla dentro del período. Se traen todos los movimientos con
 * `recurring_id` de una sola vez en lugar de una consulta por plantilla — son
 * pocas filas y la alternativa es N viajes para pintar una lista.
 */
export async function loadRecurring(
  supabase: SupabaseClient,
  userId: string,
  todayISO: string,
): Promise<RecurringSummary> {
  const [{ data: rows }, { data: splitRows }, { data: hechos }, { data: deudas }] =
    await Promise.all([
      supabase.from('fin_recurring').select(RECURRING_COLS).eq('user_id', userId),
      supabase.from('fin_recurring_splits').select(RECURRING_SPLIT_COLS).eq('user_id', userId),
      supabase
        .from('fin_transactions')
        .select('id, date, recurring_id')
        .eq('user_id', userId)
        .not('recurring_id', 'is', null),
      supabase
        .from('fin_debts')
        .select('amount_usd, settled_tx_id, waived_at, transaction:fin_transactions!fin_debts_transaction_id_fkey(recurring_id)')
        .eq('user_id', userId),
    ])

  const splitsByRec = new Map<string, RecurringSplit[]>()
  for (const r of splitRows ?? []) {
    const row: RecurringSplit = {
      id: r.id,
      recurring_id: r.recurring_id,
      person_id: r.person_id,
      amount: r.amount === null ? null : num(r.amount),
    }
    const list = splitsByRec.get(row.recurring_id)
    if (list) list.push(row)
    else splitsByRec.set(row.recurring_id, [row])
  }

  const datesByRec = new Map<string, string[]>()
  const txByRec = new Map<string, { id: string; date: string }[]>()
  for (const t of hechos ?? []) {
    const key = t.recurring_id as string
    const dates = datesByRec.get(key)
    if (dates) dates.push(t.date)
    else datesByRec.set(key, [t.date])

    const txs = txByRec.get(key)
    if (txs) txs.push({ id: t.id, date: t.date })
    else txByRec.set(key, [{ id: t.id, date: t.date }])
  }

  // Lo que te deben POR CADA FIJO, acumulado entre todos los períodos: si Ana
  // no pagó Spotify de julio y llega agosto, la fila lo tiene que decir.
  const openByRec = new Map<string, number>()
  for (const d of (deudas ?? []) as unknown as {
    amount_usd: unknown; settled_tx_id: string | null; waived_at: string | null
    transaction: { recurring_id: string | null } | null
  }[]) {
    const rec = d.transaction?.recurring_id
    if (!rec || !isOpen(d)) continue
    openByRec.set(rec, (openByRec.get(rec) ?? 0) + num(d.amount_usd))
  }

  const recurring: RecurringWithState[] = (rows ?? []).map(r => {
    const base = {
      ...(r as unknown as Recurring),
      amount: num(r.amount),
      day_of_month: num(r.day_of_month, 1),
      month_of_year: r.month_of_year === null ? null : num(r.month_of_year),
    }
    const { status, due, days_late, pending } = statusOf(base, datesByRec.get(r.id) ?? [], todayISO)
    const { from, to } = periodOf(base, todayISO)

    return {
      ...base,
      splits: splitsByRec.get(r.id) ?? [],
      status,
      due,
      days_late,
      pending,
      registered_tx_id: (txByRec.get(r.id) ?? []).find(t => t.date >= from && t.date <= to)?.id ?? null,
      open_usd: round2(openByRec.get(r.id) ?? 0),
    }
  })

  const ordenados = sortRecurring(recurring)
  return { recurring: ordenados, ...progress(ordenados) }
}

/**
 * Los meses (`'2026-08'`) que tienen al menos un movimiento registrado, del
 * más reciente al más viejo — es lo que puebla el filtro de mes de
 * Movimientos: no tiene sentido ofrecer un mes vacío para elegir.
 */
export async function loadAvailableMonths(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('fin_transactions').select('date').eq('user_id', userId)

  const months = new Set<string>()
  for (const row of data ?? []) months.add((row.date as string).slice(0, 7))

  return [...months].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

export async function loadTransactions(
  supabase: SupabaseClient,
  userId: string,
  f: TxFilters,
): Promise<{ data: TxResult | null; error: string | null }> {
  const limit = Math.min(f.limit ?? 200, 500)
  const offset = f.offset ?? 0

  let query = supabase
    .from('fin_transactions')
    .select(`${TX_COLS}, debts:fin_debts!fin_debts_transaction_id_fkey(${DEBT_COLS})`)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (f.from) query = query.gte('date', f.from)
  if (f.to) query = query.lte('date', f.to)
  if (f.type) query = query.eq('type', f.type)
  if (f.categoryId) query = query.eq('category_id', f.categoryId)
  if (f.recurringOnly) query = query.not('recurring_id', 'is', null)
  // Una cuenta aparece como origen o como destino de una transferencia.
  if (f.accountId) query = query.or(`account_id.eq.${f.accountId},to_account_id.eq.${f.accountId}`)

  const [{ data, error }, { data: investmentRows }] = await Promise.all([
    query,
    // Para poder sacar las "Actualizar valor" de la lista (ver más abajo):
    // no son un movimiento de cuenta, son un ajuste del valor de la cuenta —
    // no tienen nada que hacer en Movimientos (§7.2 de contexto_finanzas.md).
    supabase.from('fin_accounts').select('id').eq('user_id', userId).eq('is_investment', true),
  ])
  if (error) return { data: null, error: error.message }

  const investmentIds = new Set((investmentRows ?? []).map(r => r.id as string))

  let transactions = (data ?? []).map(t => ({
    ...t,
    amount: num(t.amount),
    to_amount: t.to_amount === null ? null : num(t.to_amount),
    exchange_rate: num(t.exchange_rate),
    amount_usd: num(t.amount_usd),
    debts: (((t as { debts?: unknown }).debts ?? []) as DebtRow[]).map(s => ({
      ...s,
      amount: num(s.amount),
      amount_usd: num(s.amount_usd),
      principal_usd: num(s.principal_usd),
    })),
  })) as unknown as (Transaction & { debts: Debt[] })[]

  transactions = transactions.filter(
    t => !isInvestmentAdjustment(t, { is_investment: investmentIds.has(t.account_id) }),
  )

  if (f.sharedOnly) transactions = transactions.filter(t => t.debts.length > 0)

  // Un reembolso (`flow_type = 'movimiento'`) sube el saldo pero no es plata
  // que ganaste: queda fuera de los totales de ingreso. Es la razón de ser de
  // la columna.
  const esConsumo = (t: { flow_type?: string }) => t.flow_type !== 'movimiento'
  const gastos = transactions.filter(t => t.type === 'gasto' && esConsumo(t))

  const total_gasto_usd = round2(gastos.reduce((s, t) => s + t.amount_usd, 0))
  // Los perdonados no se descuentan: perdonar una deuda es hacerse cargo de ella.
  // Se suma `principal_usd`, no `amount_usd`: el margen de un reparto no es
  // costo de nadie, es ganancia — y esa se cuenta recién al cobrarla de
  // verdad (§ debts/settle), no acá. Sumar `amount_usd` dejaría el gasto real
  // negativo antes de haber cobrado un centavo.
  const total_repartido_usd = round2(
    gastos.flatMap(t => t.debts).filter(s => !s.waived_at).reduce((s, x) => s + num(x.principal_usd), 0),
  )

  return {
    data: {
      transactions,
      total_gasto_usd,
      total_ingreso_usd: round2(
        transactions.filter(t => t.type === 'ingreso' && esConsumo(t)).reduce((s, t) => s + t.amount_usd, 0),
      ),
      total_repartido_usd,
      total_gasto_real_usd: round2(total_gasto_usd - total_repartido_usd),
    },
    error: null,
  }
}

/* ─── Presupuesto (Sprint 6) ──────────────────────────────────────────────── */

const BUDGET_LINE_COLS = 'id, category_id, name, input_currency, retroactive, created_on, archived'
const BUDGET_PERIOD_COLS = 'id, line_id, period, amount_usd'
const BUDGET_EXTENSION_COLS = 'id, period_id, amount_usd, created_at'
const BUDGET_CLOSURE_COLS = 'id, line_id, period, carried, amount_usd'

interface BudgetLineForCalc {
  id: string
  category_id: string
  name: string | null
  input_currency: Currency
  retroactive: boolean
  created_on: string
}

/**
 * El tope general ya no es una línea propia (rediseño post-Sprint 6): es la
 * suma de las categorías ya presupuestadas, siempre en USD — cada categoría
 * puede tener su propia moneda de entrada, y sumarlas necesita una unidad
 * común. Sumar los campos ya resueltos de cada `BudgetLineProgress` es
 * exactamente equivalente a recalcular `disponible()` sobre los totales
 * (la fórmula es lineal), así que no hace falta un segundo cálculo.
 */
function sumGeneral(categories: BudgetLineProgress[]): BudgetGeneralProgress | null {
  if (categories.length === 0) return null
  const sum = (f: (c: BudgetLineProgress) => number) => round2(categories.reduce((s, c) => s + f(c), 0))
  return {
    amount_usd: sum(c => c.amount_usd ?? 0),
    extended_usd: sum(c => c.extended_usd),
    carried_usd: sum(c => c.carried_usd),
    spent_usd: sum(c => c.spent_usd),
    committed_usd: sum(c => c.committed_usd),
    available_usd: sum(c => c.available_usd ?? 0),
    // Mismo período para todas — vienen del mismo `currentPeriod`/`today`.
    day_of_period: categories[0].day_of_period,
    days_in_period: categories[0].days_in_period,
    projected_usd: sum(c => c.projected_usd),
  }
}

/**
 * Todo el panel de Presupuesto: el progreso de cada línea en el período
 * vigente, más los cierres de mes que quedaron sin responder.
 *
 * El quick-add necesita esto en CUALQUIER pantalla para poder bloquear un
 * gasto que se pasa del tope — no solo en `/presupuesto` — así que viaja
 * también por `/bootstrap` (Decisiones Técnicas §2.1: la lección de "no
 * olvidarse de sumarlo desde el día uno", justo la que Fijos no siguió la
 * primera vez).
 *
 * `precomputed` es lo que `/bootstrap` ya calculó en el mismo viaje —
 * `loadAccounts` ya corrió `ensureRates`, y `loadRecurring` ya se pidió como
 * hermano en el mismo `Promise.all`. Sin este atajo, cada apertura de la app
 * volvía a traer tasas y fijos por segunda vez solo para este panel. La ruta
 * suelta `GET /api/finanzas/budgets` no tiene nada que reusar y los calcula
 * ella misma, como siempre.
 */
export async function loadBudgets(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  precomputed?: { rates: RateMap; recurring: RecurringSummary },
): Promise<BudgetsPayload> {
  const currentPeriod = periodStart(today)

  const [{ data: lineRows }, { data: catRows }] = await Promise.all([
    supabase.from('fin_budget_lines').select(BUDGET_LINE_COLS).eq('user_id', userId).eq('archived', false),
    supabase.from('fin_categories').select('id, name, kind, archived').eq('user_id', userId),
  ])

  const categoriesById = new Map(
    (catRows ?? []).map(c => [c.id as string, c as { id: string; name: string; kind: string; archived: boolean }]),
  )
  const gastoCategoryIds = new Set(
    (catRows ?? []).filter(c => c.kind === 'gasto' && !c.archived).map(c => c.id as string),
  )

  const lines: BudgetLineForCalc[] = (lineRows ?? []).map(r => ({
    id: r.id as string,
    category_id: r.category_id as string,
    name: r.name as string | null,
    input_currency: r.input_currency as Currency,
    retroactive: r.retroactive as boolean,
    created_on: r.created_on as string,
  }))

  const linedCategoryIds = new Set(lines.map(l => l.category_id))
  const categories_without_line = [...gastoCategoryIds]
    .filter(id => !linedCategoryIds.has(id))
    .map(id => ({ id, name: categoriesById.get(id)!.name }))

  if (lines.length === 0) {
    return { general: null, categories: [], pending_closures: [], categories_without_line }
  }

  const lineIds = lines.map(l => l.id)

  const [{ data: periodRows }, { data: closureRows }, ratesResult, recurringResult] = await Promise.all([
    supabase.from('fin_budget_periods').select(BUDGET_PERIOD_COLS).eq('user_id', userId).in('line_id', lineIds),
    supabase.from('fin_budget_closures').select(BUDGET_CLOSURE_COLS).eq('user_id', userId).in('line_id', lineIds),
    precomputed ? null : ensureRates(supabase, userId),
    precomputed ? null : loadRecurring(supabase, userId, today),
  ])

  const rates = precomputed?.rates ?? ratesResult!.rates
  const recurringSummary = precomputed?.recurring ?? recurringResult!

  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string, amount_usd: num(p.amount_usd),
  }))
  const closures = (closureRows ?? []).map(c => ({
    line_id: c.line_id as string, period: c.period as string, carried: c.carried as boolean, amount_usd: num(c.amount_usd),
  }))

  const periodIds = periods.map(p => p.id)
  const { data: extensionRows } = periodIds.length > 0
    ? await supabase.from('fin_budget_extensions').select(BUDGET_EXTENSION_COLS).eq('user_id', userId).in('period_id', periodIds)
    : { data: [] as { period_id: string; amount_usd: number; created_at: string }[] }
  const extensions = (extensionRows ?? []).map(e => ({
    period_id: e.period_id as string, amount_usd: num(e.amount_usd), created_at: e.created_at as string,
  }))

  // Qué períodos, por línea, terminaron sin la pregunta de cierre respondida.
  const pendingByLine = new Map<string, string[]>()
  let earliestNeeded = currentPeriod
  for (const line of lines) {
    const need = needsClosure(line, closures, today)
    if (need.length > 0) {
      pendingByLine.set(line.id, need)
      if (need[0] < earliestNeeded) earliestNeeded = need[0]
    }
  }

  // Un solo viaje de gasto/deudas que cubre desde el período más viejo sin
  // cerrar hasta el final del período vigente.
  const { from: rangeFrom } = periodRange(earliestNeeded)
  const { to: rangeTo } = periodRange(currentPeriod)

  const [{ data: txRows }, { data: debtRows }] = await Promise.all([
    supabase
      .from('fin_transactions')
      .select('id, category_id, amount_usd, flow_type, date')
      .eq('user_id', userId).eq('type', 'gasto')
      .gte('date', rangeFrom).lte('date', rangeTo),
    supabase
      .from('fin_debts')
      .select('principal_usd, waived_at, transaction:fin_transactions!fin_debts_transaction_id_fkey(id)')
      .eq('user_id', userId),
  ])

  // Un gasto de cuenta de inversión ("Actualizar valor") no es plata real
  // saliendo — mismo criterio que excluye reembolsos/transferencias del gasto
  // real de siempre (Sprint 2 §4.4), acá aplicado por categoría.
  const txs: BudgetTx[] = (txRows ?? [])
    .filter(t => t.flow_type !== 'movimiento')
    .map(t => ({ id: t.id as string, category_id: t.category_id as string | null, amount_usd: num(t.amount_usd), date: t.date as string }))

  const debtRowsTyped = (debtRows ?? []) as unknown as
    { principal_usd: unknown; waived_at: string | null; transaction: { id: string } | null }[]
  const debts: BudgetDebtShare[] = debtRowsTyped
    .filter(d => d.transaction)
    .map(d => ({ transaction_id: d.transaction!.id, principal_usd: num(d.principal_usd), waived_at: d.waived_at }))

  const committedRecurring: CommittedRecurring[] = recurringSummary.recurring.map(r => ({
    category_id: r.category_id,
    active: r.active,
    amountUsd: toUsd(r.amount, r.currency, rates),
    status: r.status,
  }))

  function progressFor(line: BudgetLineForCalc): BudgetLineProgress {
    const { to } = periodRange(currentPeriod)
    const from = effectiveFromFor(line, currentPeriod)
    const { day, days } = dayOfPeriod(currentPeriod, today)

    const resolved = resolvePeriod(periods, line.id, currentPeriod)
    const lineExtensions = resolved.periodRowId
      ? extensions.filter(e => e.period_id === resolved.periodRowId)
      : []
    const extendedUsd = round2(lineExtensions.reduce((s, e) => s + e.amount_usd, 0))
    const effectiveAmount = montoEfectivo(periods, extensions, line.id, currentPeriod)
    const carried = carriedInto(closures, line.id, currentPeriod)
    const spent = gastoRealCategoria(txs, debts, line.category_id, from, to)
    const committed = comprometidoUsd(committedRecurring, line.category_id)
    const available = disponible({
      montoEfectivoUsd: effectiveAmount, gastoRealUsd: spent, comprometidoUsd: committed, carriedUsd: carried,
    })

    return {
      line_id: line.id,
      category_id: line.category_id,
      category_name: categoriesById.get(line.category_id)?.name ?? '',
      name: line.name,
      input_currency: line.input_currency,
      retroactive: line.retroactive,
      amount_usd: resolved.amountUsd,
      extensions: lineExtensions.map(e => ({ amount_usd: e.amount_usd, created_at: e.created_at })),
      extended_usd: extendedUsd,
      carried_usd: carried,
      spent_usd: spent,
      committed_usd: committed,
      available_usd: available,
      day_of_period: day,
      days_in_period: days,
      projected_usd: projectedUsd(spent, day, days),
    }
  }

  // Cierres pendientes: el disponible que tenía cada mes YA terminado, sin
  // `comprometido` — un mes cerrado no tiene nada "todavía por pasar".
  const pending_closures: PendingClosure[] = []
  for (const line of lines) {
    for (const period of pendingByLine.get(line.id) ?? []) {
      const { to: closeTo } = periodRange(period)
      const from = effectiveFromFor(line, period)
      const effectiveAmount = montoEfectivo(periods, extensions, line.id, period)
      const carried = carriedInto(closures, line.id, period)
      const spent = gastoRealCategoria(txs, debts, line.category_id, from, closeTo)
      const available = disponible({ montoEfectivoUsd: effectiveAmount, gastoRealUsd: spent, comprometidoUsd: 0, carriedUsd: carried })
      // `null` = ese mes la línea todavía no tenía ningún monto cargado: nada que cerrar.
      if (available == null) continue
      pending_closures.push({
        line_id: line.id,
        category_id: line.category_id,
        category_name: categoriesById.get(line.category_id)?.name ?? '',
        name: line.name,
        input_currency: line.input_currency,
        period,
        amount_usd: available,
      })
    }
  }

  const categories = lines.map(progressFor)

  return {
    general: sumGeneral(categories),
    categories,
    pending_closures,
    categories_without_line,
  }
}

/**
 * Si el quick-add bloqueó un gasto por presupuesto y el usuario eligió
 * "Ampliar", registra la ampliación de ESE mes — materializando antes la fila
 * del período si todavía se heredaba de un mes anterior (§3.3 del spec: sin
 * eso la ampliación no tendría una base clara contra la cual sumarse).
 *
 * Nunca hace fallar el gasto en sí: es contabilidad secundaria de
 * presupuesto, y el llamador (`POST`/`PATCH /transactions`) ya insertó el
 * movimiento real cuando esto corre. Pero tampoco falla en silencio total —
 * devuelve `{ ok: false, error }` para que la respuesta pueda avisar que la
 * ampliación en particular no se guardó, en vez de que la categoría aparezca
 * "pasada de presupuesto" sin ninguna pista de por qué.
 */
export async function applyBudgetExtension(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string | null,
  date: string,
  amountUsd: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!categoryId || !(amountUsd > 0)) return { ok: true }

  const { data: line } = await supabase
    .from('fin_budget_lines')
    .select('id').eq('user_id', userId).eq('category_id', categoryId).eq('archived', false).maybeSingle()
  if (!line) return { ok: false, error: 'Esa categoría no tiene una línea de presupuesto activa' }

  const period = periodStart(date)
  const { data: periodRows } = await supabase
    .from('fin_budget_periods').select('id, line_id, period, amount_usd').eq('user_id', userId).eq('line_id', line.id)
  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string, amount_usd: num(p.amount_usd),
  }))

  const resolved = resolvePeriod(periods, line.id, period)
  let periodId = resolved.periodRowId
  if (!periodId) {
    if (resolved.amountUsd == null) return { ok: false, error: 'Esa línea todavía no tiene un monto cargado' }
    const { data: created, error: createError } = await supabase
      .from('fin_budget_periods')
      .insert({ user_id: userId, line_id: line.id, period, amount_usd: resolved.amountUsd })
      .select('id')
      .single()
    if (createError || !created) return { ok: false, error: createError?.message ?? 'No se pudo registrar el período' }
    periodId = created.id
  }

  const { error } = await supabase
    .from('fin_budget_extensions').insert({ user_id: userId, period_id: periodId, amount_usd: round2(amountUsd) })
  return error ? { ok: false, error: error.message } : { ok: true }
}
