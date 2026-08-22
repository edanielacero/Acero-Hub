import type { SupabaseClient } from '@supabase/supabase-js'
import { computeBalances, mapAccount, mapBalanceMovement, totalUsd, withBalances } from './accounts'
import { formatAmount, num, round2, toUsd } from './money'
import { PERSON_COLS } from './people'
import { ensureRates, type RateDetail } from './rates'
import type { QuoteMap } from './quotes'
import { DEBT_COLS, DEBT_CTX_COLS, mapDebtContext, readDebts, settledOn, type RawDebtRow } from './shared'
import { groupByPerson, isOpen, porCobrarUsd } from './splits'
import { periodOf, progress, sortRecurring, statusOf } from './recurring'
import { planCerrado, planRollup } from './plans'
import { expectedTurnDate } from './pasanaku'
import { availableFrom, consumesBalance, isInvestmentAdjustment, monthRange, todayISO } from './transactions'
import type {
  Account, AccountWithBalance, Category, Currency, PersonWithDebt,
  Person, RateMap, Recurring, RecurringSplit, RecurringSummary,
  RecurringWithState, SharedSummary, Debt, DebtPlan, DebtPlanWithCuotas,
  DebtWithContext, Pasanaku, PasanakuHistorico, PasanakuWithState, Transaction, TxType,
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
 * `received` NO se guarda: sale de que exista un `ingreso` con este
 * `pasanaku_id` — mismo principio que `registered_tx_id` en `loadRecurring`.
 * Se traen todos los movimientos con `pasanaku_id` de una sola vez en vez de
 * una consulta por pasanaku, mismo criterio de siempre.
 *
 * `aportes_count`/`total_aportado_usd` suman DOS fuentes: los aportes reales
 * (`fin_transactions`) y los históricos de antes de usar la app
 * (`fin_pasanaku_historico`) — ver §"Aportes de antes de la app" en
 * sprint_5_pasanaku.md. Los históricos no tienen `amount_usd` congelado (no
 * hubo transacción real que lo congelara), así que se convierten acá con la
 * tasa de HOY — mismo criterio que el patrimonio total (§4.3 de
 * contexto_finanzas.md: una foto del presente, no un dato histórico).
 */
export async function loadPasanaku(
  supabase: SupabaseClient,
  userId: string,
): Promise<PasanakuWithState[]> {
  const [{ data: rows }, { data: txRows }, { data: historicoRows }, { rates }] = await Promise.all([
    supabase.from('fin_pasanaku').select(PASANAKU_COLS).eq('user_id', userId).order('created_at'),
    supabase
      .from('fin_transactions')
      .select('type, date, amount_usd, pasanaku_id')
      .eq('user_id', userId)
      .not('pasanaku_id', 'is', null),
    supabase.from('fin_pasanaku_historico').select(PASANAKU_HISTORICO_COLS).eq('user_id', userId),
    ensureRates(supabase, userId),
  ])

  const byPasanaku = new Map<string, { type: TxType; date: string; amount_usd: number }[]>()
  for (const t of txRows ?? []) {
    const key = t.pasanaku_id as string
    const list = byPasanaku.get(key)
    const entry = { type: t.type as TxType, date: t.date as string, amount_usd: num(t.amount_usd) }
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

  return (rows ?? []).map(r => {
    const p = { ...(r as unknown as Pasanaku), contribution_amount: num(r.contribution_amount) }
    const movs = byPasanaku.get(p.id) ?? []
    const aportes = movs.filter(m => m.type === 'gasto')
    // Puede haber más de una recepción si el pasanaku sigue rotando después de
    // tu turno — se muestra la más reciente.
    const recepciones = movs.filter(m => m.type === 'ingreso').sort((a, b) => (a.date < b.date ? 1 : -1))

    const historico = (historicoByPasanaku.get(p.id) ?? []).sort((a, b) => (a.date < b.date ? 1 : -1))
    const historicoUsd = historico.reduce((s, h) => s + toUsd(h.amount, p.currency, rates), 0)

    return {
      ...p,
      expected_turn: expectedTurnDate(p),
      received: recepciones.length > 0,
      received_at: recepciones[0]?.date ?? null,
      aportes_count: aportes.length + historico.length,
      total_aportado_usd: round2(aportes.reduce((s, a) => s + a.amount_usd, 0) + historicoUsd),
      historico,
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
