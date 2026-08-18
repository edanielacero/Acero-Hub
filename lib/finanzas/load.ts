import type { SupabaseClient } from '@supabase/supabase-js'
import { mapAccount, mapBalanceMovement, totalUsd, withBalances } from './accounts'
import { num, round2 } from './money'
import { PERSON_COLS } from './people'
import { ensureRates, type RateDetail } from './rates'
import type { QuoteMap } from './quotes'
import { SPLIT_COLS, readSplits, settledOn } from './shared'
import { groupByPerson, isOpen, porCobrarUsd } from './splits'
import { periodOf, progress, sortRecurring, statusOf } from './recurring'
import { monthRange, todayISO } from './transactions'
import type {
  AccountWithBalance, Category, Currency, PersonWithDebt,
  Person, RateMap, RecentSplit, Recurring, RecurringSplit, RecurringSummary,
  RecurringWithState, SharedSummary, Split, SplitWithContext, Transaction,
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

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'
const CATEGORY_COLS = 'id, name, kind, emoji, sort_order, archived'
const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description, recurring_id'

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
    // de conocerlo sin recorrer la historia completa de cada cuenta.
    supabase
      .from('fin_transactions')
      .select('type, account_id, to_account_id, amount, to_amount')
      .eq('user_id', userId),
  ])

  const accounts = (accountRows ?? []).map(mapAccount)
  const movements = (txRows ?? []).map(mapBalanceMovement)
  const withBal = withBalances(accounts, movements, rates)

  return { accounts: withBal, total_usd: totalUsd(withBal), rates, rate_list: rateRows }
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
    supabase.from('fin_people').select(PERSON_COLS).eq('user_id', userId).order('name'),
    supabase
      .from('fin_splits')
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
  const { rows, raw } = await readSplits(supabase, userId)
  const today = todayISO()

  const byId = new Map(raw.map(r => [r.id, r]))
  const inMonth = (s: SplitWithContext) => {
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
    condonado_mes_usd: round2(
      rows.filter(s => s.state === 'condonado' && inMonth(s)).reduce((n, s) => n + s.amount_usd, 0),
    ),
    por_persona: groupByPerson(abiertos, today),
    historial,
    repartos_recientes: buildRecent(rows),
  }
}

/**
 * Los últimos 3 repartos distintos, para el "Repetir reparto" del quick-add.
 *
 * Se derivan de los splits que la misma respuesta ya trajo — sin tabla de
 * plantillas, que es el Sprint 8. Para Spotify y TradingView, los dos casos
 * reales de hoy, alcanza y sobra.
 */
function buildRecent(rows: SplitWithContext[], limit = 3): RecentSplit[] {
  const byTx = new Map<string, SplitWithContext[]>()
  for (const s of rows) {
    const list = byTx.get(s.transaction_id)
    if (list) list.push(s)
    else byTx.set(s.transaction_id, [s])
  }

  const out: RecentSplit[] = []
  const seen = new Set<string>()

  // `rows` ya viene del gasto más nuevo al más viejo.
  for (const s of rows) {
    const group = byTx.get(s.transaction_id)
    if (!group) continue
    byTx.delete(s.transaction_id)

    const key = group.map(g => g.person_id).sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)

    const people: Person[] = group
      .map(g => g.person)
      .sort((a, b) => a.name.localeCompare(b.name))

    out.push({
      label: group[0].transaction.description?.trim() || 'Sin descripción',
      people,
      even: new Set(group.map(g => g.amount.toFixed(8))).size === 1,
    })
    if (out.length >= limit) break
  }

  return out
}

/* ─── Movimientos ──────────────────────────────────────────────────────────── */

/** La forma que devuelve el embed de `fin_splits` en la lista de movimientos. */
interface SplitRow {
  id: string
  transaction_id: string
  person_id: string
  amount: number
  currency: Currency
  amount_usd: number
  settled_tx_id: string | null
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
  limit?: number
  offset?: number
}

export interface TxResult {
  transactions: Transaction[]
  total_gasto_usd: number
  total_ingreso_usd: number
  /** Lo que de ese gasto le toca a otras personas y no está condonado. */
  total_repartido_usd: number
  /** Bruto menos repartido: lo que realmente te costó. */
  total_gasto_real_usd: number
}


const RECURRING_COLS =
  'id, name, emoji, amount, account_id, category_id, frequency, day_of_month, month_of_year, active, note'

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
  const [{ data: rows }, { data: splitRows }, { data: hechos }, { data: accountRows }, { data: deudas }] =
    await Promise.all([
      supabase.from('fin_recurring').select(RECURRING_COLS).eq('user_id', userId),
      supabase.from('fin_recurring_splits').select(RECURRING_SPLIT_COLS).eq('user_id', userId),
      supabase
        .from('fin_transactions')
        .select('id, date, recurring_id')
        .eq('user_id', userId)
        .not('recurring_id', 'is', null),
      supabase.from('fin_accounts').select('id, currency').eq('user_id', userId),
      supabase
        .from('fin_splits')
        .select('amount_usd, settled_tx_id, waived_at, transaction:fin_transactions!fin_splits_transaction_id_fkey(recurring_id)')
        .eq('user_id', userId),
    ])

  const currencyById = new Map((accountRows ?? []).map(a => [a.id, a.currency as Currency]))

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
    const { status, due, days_late } = statusOf(base, datesByRec.get(r.id) ?? [], todayISO)
    const { from, to } = periodOf(base, todayISO)

    return {
      ...base,
      splits: splitsByRec.get(r.id) ?? [],
      currency: currencyById.get(base.account_id) ?? 'USD',
      status,
      due,
      days_late,
      registered_tx_id: (txByRec.get(r.id) ?? []).find(t => t.date >= from && t.date <= to)?.id ?? null,
      open_usd: round2(openByRec.get(r.id) ?? 0),
    }
  })

  const ordenados = sortRecurring(recurring)
  return { recurring: ordenados, ...progress(ordenados) }
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
    .select(`${TX_COLS}, splits:fin_splits!fin_splits_transaction_id_fkey(${SPLIT_COLS})`)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (f.from) query = query.gte('date', f.from)
  if (f.to) query = query.lte('date', f.to)
  if (f.type) query = query.eq('type', f.type)
  if (f.categoryId) query = query.eq('category_id', f.categoryId)
  // Una cuenta aparece como origen o como destino de una transferencia.
  if (f.accountId) query = query.or(`account_id.eq.${f.accountId},to_account_id.eq.${f.accountId}`)

  const { data, error } = await query
  if (error) return { data: null, error: error.message }

  let transactions = (data ?? []).map(t => ({
    ...t,
    amount: num(t.amount),
    to_amount: t.to_amount === null ? null : num(t.to_amount),
    exchange_rate: num(t.exchange_rate),
    amount_usd: num(t.amount_usd),
    splits: ((t.splits ?? []) as unknown as SplitRow[]).map(s => ({
      ...s,
      amount: num(s.amount),
      amount_usd: num(s.amount_usd),
    })),
  })) as unknown as (Transaction & { splits: Split[] })[]

  if (f.sharedOnly) transactions = transactions.filter(t => t.splits.length > 0)

  // Un reembolso (`flow_type = 'movimiento'`) sube el saldo pero no es plata
  // que ganaste: queda fuera de los totales de ingreso. Es la razón de ser de
  // la columna.
  const esConsumo = (t: { flow_type?: string }) => t.flow_type !== 'movimiento'
  const gastos = transactions.filter(t => t.type === 'gasto' && esConsumo(t))

  const total_gasto_usd = round2(gastos.reduce((s, t) => s + t.amount_usd, 0))
  // Los condonados no se descuentan: perdonar una deuda es hacerse cargo de ella.
  const total_repartido_usd = round2(
    gastos.flatMap(t => t.splits).filter(s => !s.waived_at).reduce((s, x) => s + num(x.amount_usd), 0),
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
