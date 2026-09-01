// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { computeBalances, mapAccount, mapBalanceMovement, totalUsd, withBalances } from './accounts.ts'
import { crossCurrencySuggestion, decimalsFor, formatAmount, fromUsd, num, round2, roundFor, toUsd } from './money.ts'
import { PERSON_COLS } from './people.ts'
import { ensureRates, type RateDetail } from './rates.ts'
import type { QuoteMap } from './quotes.ts'
import { DEBT_COLS, DEBT_CTX_COLS, mapDebtContext, readDebts, settledOn, type RawDebtRow } from './shared.ts'
import { groupByPerson, isOpen, porCobrarUsd } from './splits.ts'
import { periodOf, progress, sortRecurring, statusOf } from './recurring.ts'
import { planCerrado, planRollup } from './plans.ts'
import { currentRound, expectedTurnDate, nextAporteDue } from './pasanaku.ts'
import { availableFrom, consumesBalance, freezeConversion, gastoUsd, ingresoUsd, isInvestmentAdjustment, monthRange, todayISO } from './transactions.ts'
import {
  carriedInto, comprometido, dayOfPeriod, disponible, effectiveFromFor, gastoRealCategoria,
  montoEfectivo, needsClosure, nextPeriod, periodRange, periodStart, previousPeriod, resolvePeriod,
  type BudgetDebtShare, type BudgetTx, type CommittedRecurring,
} from './budgets.ts'
import { budgetReservedUsd, computeGoalBalancesByAccountUsd, computeGoalBalancesUsd, computeSavingsByAccount, computeSavingsByAccountUsd, goalReached, pendingSavingsPeriod, proposeAllocation, savableUsd, type GoalTaggedTx } from './savings.ts'
import type {
  Account, AccountWithBalance, AllocationType, BudgetGeneralProgress, BudgetHistoryEntry, BudgetHistoryPayload,
  BudgetLineHistory, BudgetLineProgress, BudgetsPayload, Category, Currency, PersonWithDebt,
  Person, PendingClosure, RateMap, Recurring, RecurringSplit, RecurringSummary,
  RecurringWithState, SharedSummary, Debt, DebtPlan, DebtPlanWithCuotas,
  DebtWithContext, Pasanaku, PasanakuAporte, PasanakuCobro, PasanakuHistorico, PasanakuWithState,
  SavingsClosureProposal, SavingsGoal, SavingsGoalWithBalance, Scope, Transaction, TxType,
} from './types.ts'

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
const SAVINGS_GOAL_COLS = 'id, name, input_currency, allocation_type, allocation_value, target_amount, target_date, is_catchall, sort_order, archived, created_at'
const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, recurring_id, pasanaku_id, savings_goal_id, savings_flow, savings_reason'

export interface AccountsPayload {
  accounts: AccountWithBalance[]
  total_usd: number
  rates: RateMap
  rate_list: RateDetail[]
}

/** Cuentas con saldo derivado, más las tasas con que se valuaron. */
export async function loadAccounts(
  supabase: SupabaseClient,
  scope: Scope,
  quotes?: QuoteMap,
): Promise<AccountsPayload> {
  const [{ rates, rows: rateRows }, { data: accountRows }, { data: txRows }] = await Promise.all([
    ensureRates(supabase, scope.userId, quotes),
    supabase
      .from('fin_accounts')
      .select(ACCOUNT_COLS)
      .eq('profile_id', scope.profileId)
      .order('sort_order')
      .order('created_at'),
    // Se traen todos los movimientos porque el saldo es derivado: no hay forma
    // de conocerlo sin recorrer la historia completa de cada cuenta. `flow_type`
    // viaja también para `has_value_updates` de acá abajo — no hace falta un
    // segundo viaje a la base solo para eso.
    supabase
      .from('fin_transactions')
      .select('type, account_id, to_account_id, amount, to_amount, flow_type, amount_usd, to_amount_usd, savings_goal_id, savings_flow')
      .eq('profile_id', scope.profileId),
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
  // Cuánto de cada cuenta está apartado como ahorro. Sale de los mismos
  // movimientos etiquetados que alimentan el saldo de cada ahorro — cero datos
  // nuevos que mantener.
  //
  // Se calcula DOS veces a propósito, sobre las mismas filas: el número que se
  // muestra y del que se resta va en la moneda de la cuenta, sin pasar por USD
  // (aportar Bs 700 y ver "Bs 699,99 apartados" es un número que el usuario
  // sabe que está mal), y el de USD queda para comparar cuentas entre sí.
  const etiquetados = (txRows ?? []).map(r => ({
    savings_goal_id: r.savings_goal_id as string | null,
    type: r.type as TxType,
    account_id: r.account_id as string,
    to_account_id: r.to_account_id as string | null,
    amount: num(r.amount),
    to_amount: r.to_amount == null ? null : num(r.to_amount),
    amount_usd: num(r.amount_usd),
    to_amount_usd: r.to_amount_usd == null ? null : num(r.to_amount_usd),
    savings_flow: r.savings_flow as string | null,
  }))
  const ahorradoUsd = computeSavingsByAccountUsd(etiquetados)
  const ahorrado = computeSavingsByAccount(etiquetados)

  const withFlags: AccountWithBalance[] = withBal.map(a => ({
    ...a,
    has_value_updates: updatedIds.has(a.id),
    savings_balance_usd: round2(ahorradoUsd.get(a.id) ?? 0),
    savings_balance: Math.max(0, roundFor(ahorrado.get(a.id) ?? 0, a.currency)),
  }))

  return { accounts: withFlags, total_usd: totalUsd(withFlags), rates, rate_list: rateRows }
}

/**
 * Saldo actual de UNA cuenta y **cuánto de ese saldo está apartado como
 * ahorro** — mismo cálculo derivado que `loadAccounts`, para cuando una
 * escritura necesita validar sin traer todas las cuentas.
 *
 * Los dos números salen del mismo barrido de movimientos: pedirlos por
 * separado serían dos viajes a la base para recorrer exactamente las mismas
 * filas. `savings` viene en la moneda de la cuenta, igual que `balance`, para
 * que se puedan restar sin convertir nada en el llamador.
 */
export async function accountBalance(
  supabase: SupabaseClient,
  scope: Scope,
  account: Account,
  excludeTxId?: string | null,
): Promise<{ balance: number; savings: number }> {
  const { data: txRows } = await supabase
    .from('fin_transactions')
    .select('id, type, account_id, to_account_id, amount, to_amount, amount_usd, to_amount_usd, savings_goal_id, savings_flow')
    .eq('profile_id', scope.profileId)

  const movements = (txRows ?? []).map(mapBalanceMovement)
  const balance = computeBalances([account], movements).get(account.id) ?? account.initial_balance

  // Al EDITAR, la fila que se está reemplazando no cuenta para lo apartado:
  // su efecto viejo ya se revierte del saldo en `availableFrom`, y dejarla
  // acá haría que subir el monto de un retiro se midiera contra una alcancía
  // que ese mismo retiro ya vació.
  const vigentes = excludeTxId ? (txRows ?? []).filter(r => r.id !== excludeTxId) : (txRows ?? [])

  if (!vigentes.some(r => r.savings_goal_id)) return { balance, savings: 0 }

  const ahorrado = computeSavingsByAccount(
    vigentes.map(r => ({
      savings_goal_id: r.savings_goal_id as string | null,
      type: r.type as TxType,
      account_id: r.account_id as string,
      to_account_id: (r.to_account_id as string | null) ?? null,
      amount: num(r.amount),
      to_amount: r.to_amount == null ? null : num(r.to_amount),
      amount_usd: num(r.amount_usd),
      to_amount_usd: r.to_amount_usd == null ? null : num(r.to_amount_usd),
      savings_flow: (r.savings_flow as string | null) ?? null,
    })),
  ).get(account.id) ?? 0

  return { balance, savings: Math.max(0, roundFor(ahorrado, account.currency)) }
}

/**
 * La regla dura: un gasto o una transferencia nunca puede dejar la cuenta de
 * origen en negativo, **ni comerse lo que está apartado como ahorro**. El
 * cliente ya avisa antes (mismo cálculo, ver `consumesBalance`/`availableFrom`
 * en `transactions.ts` — quick-add, RegisterSheet, aporte de pasanaku), pero
 * esto es lo que de verdad lo impide. Vive acá y no en cada `route.ts` porque
 * cinco caminos distintos pueden sacar plata de una cuenta —crear un
 * movimiento, editarlo, registrar un fijo, aportar a un pasanaku y mover un
 * ahorro de cuenta— y los cinco tienen que aplicar exactamente el mismo
 * criterio.
 *
 * El sexto, `POST /savings-goals/[id]/save`, aplica la misma regla por otra
 * vía: mide contra `available_funds`, que es `saldo − apartado` calculado en
 * `loadSavingsGoals` porque el sheet necesita ese desglose por cuenta de todas
 * formas. Mismo tope, un solo viaje a la base en vez de dos.
 *
 * `editing` es el movimiento que se está reemplazando (solo en un PATCH):
 * hay que revertir su efecto viejo antes de medir si el nuevo entra, o toda
 * edición hacia arriba de un gasto ya existente parecería "sin saldo".
 *
 * ## El piso de ahorro
 *
 * Lo apartado (`savings_balance`, § 4.9 de `sprint_7_ahorro.md`) no es plata
 * disponible: es justamente lo que ahorrar significa. Un movimiento común
 * llega hasta `saldo − apartado`; para pasar de ahí hay que **declararlo**
 * como retiro (`savingsFlow: 'retiro'`), y entonces el tope pasa a ser lo
 * apartado. Sin esta regla en el servidor, ahorrar era una decoración del
 * quick-add: registrar un fijo o aportar a un pasanaku se comía los ahorros
 * sin decir una palabra.
 *
 * No aplica a una cuota de deuda cobrada: eso es un `ingreso`, plata que
 * **entra**, y `consumesBalance` ya la deja afuera.
 *
 * Excepción: un `gasto` en una cuenta `is_investment` no es plata saliendo,
 * es "Actualizar valor" bajando el número (§7.2 de `contexto_finanzas.md`) —
 * el mercado puede llevar una cuenta apalancada a negativo sin que eso sea un
 * error. Una transferencia SÍ sigue necesitando saldo real para salir,
 * inversión o no: no se puede retirar más de lo que la cuenta vale.
 */
export async function assertBalance(
  supabase: SupabaseClient,
  scope: Scope,
  account: Account,
  type: TxType,
  amount: number,
  editing?: { type: TxType; account_id: string; amount: number; id?: string } | null,
  savingsFlow?: string | null,
): Promise<string | null> {
  if (!consumesBalance(type) || (type === 'gasto' && account.is_investment)) return null

  const { balance, savings } = await accountBalance(supabase, scope, account, editing?.id)
  const total = availableFrom(balance, editing, account.id)

  // Un retiro o un traslado declarados salen de la ALCANCÍA, no del resto: su
  // tope es lo apartado, acotado por lo que la cuenta realmente tiene. Los dos
  // mueven plata que ya estaba guardada — el retiro la libera, el traslado la
  // cambia de cuenta — así que miden contra el mismo techo.
  const saleDelAhorro = savingsFlow === 'retiro' || savingsFlow === 'traslado'
  const disponible = saleDelAhorro
    ? Math.min(savings, total)
    : Math.max(0, roundFor(total - savings, account.currency))

  if (amount > disponible) {
    if (saleDelAhorro) {
      return `${account.name} tiene ${formatAmount(disponible, account.currency)} apartados en ahorros`
    }
    return savings > 0
      ? `${account.name} tiene ${formatAmount(disponible, account.currency)} disponibles ` +
        `(${formatAmount(savings, account.currency)} están apartados en ahorros)`
      : `${account.name} tiene ${formatAmount(disponible, account.currency)} disponibles`
  }
  return null
}

/**
 * Que la categoría exista y sea de este usuario. `null` es válido: un
 * movimiento sin categoría es legítimo.
 *
 * `account_id` ya se validaba así en todas las rutas, pero `category_id` se
 * insertaba tal cual: la FK acepta la categoría de CUALQUIER usuario y la
 * policy de RLS solo mira `user_id` de la fila que se escribe. Además ataja
 * el caso cotidiano de borrar una categoría con el formulario abierto, que
 * antes moría con el mensaje crudo de Postgres.
 */
export async function assertCategory(
  supabase: SupabaseClient,
  scope: Scope,
  categoryId: string | null | undefined,
): Promise<string | null> {
  if (!categoryId) return null
  const { data } = await supabase
    .from('fin_categories').select('id').eq('profile_id', scope.profileId).eq('id', categoryId).maybeSingle()
  return data ? null : 'La categoría no existe'
}

/**
 * Que el ahorro exista, sea de este usuario y no esté archivado. Mismo
 * patrón que `assertCategory` — un aporte o un retiro necesitan un ahorro
 * vivo al que corresponder.
 *
 * `allowArchived` es para EDITAR un movimiento que ya apuntaba a ese ahorro:
 * si el ahorro se archivó después, rechazar la edición dejaría al movimiento
 * ineditable para siempre — ni siquiera se le podría corregir la descripción.
 * Es exactamente el bug que ya apareció con los fijos y su categoría
 * (`20260824000000_finanzas_fijo_categoria_restrict.sql`): archivar algo no
 * puede congelar la historia que lo referencia. Elegirlo de nuevo desde cero
 * sí se sigue rechazando — para eso el default es `false`.
 */
export async function assertSavingsGoal(
  supabase: SupabaseClient,
  scope: Scope,
  goalId: string,
  opts?: { allowArchived?: boolean },
): Promise<string | null> {
  const { data } = await supabase
    .from('fin_savings_goals').select('id, archived').eq('profile_id', scope.profileId).eq('id', goalId).maybeSingle()
  if (!data) return 'Ese ahorro no existe'
  if (data.archived && !opts?.allowArchived) return 'Ese ahorro está archivado'
  return null
}

export async function loadCategories(supabase: SupabaseClient, scope: Scope): Promise<Category[]> {
  const { data } = await supabase
    .from('fin_categories')
    .select(CATEGORY_COLS)
    .eq('profile_id', scope.profileId)
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
export async function loadPeople(supabase: SupabaseClient, scope: Scope): Promise<PersonWithDebt[]> {
  const [{ data: people }, { data: splits }] = await Promise.all([
    supabase.from('fin_people').select(PERSON_COLS).eq('profile_id', scope.profileId).order('sort_order').order('name'),
    supabase
      .from('fin_debts')
      .select('person_id, amount_usd, settled_tx_id, waived_at')
      .eq('profile_id', scope.profileId),
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
  scope: Scope,
  range: { from: string; to: string } = monthRange(),
): Promise<SharedSummary> {
  const { rows, raw } = await readDebts(supabase, scope)
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
  scope: Scope,
): Promise<DebtPlanWithCuotas[]> {
  const [{ data: planRows }, { data: peopleRows }, { data: cuotaRows }] = await Promise.all([
    supabase
      .from('fin_debt_plans')
      .select(DEBT_PLAN_COLS)
      .eq('profile_id', scope.profileId)
      .order('created_at', { ascending: false }),
    supabase.from('fin_people').select(PERSON_COLS).eq('profile_id', scope.profileId),
    supabase
      .from('fin_debts')
      .select(DEBT_CTX_COLS)
      .eq('profile_id', scope.profileId)
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
  scope: Scope,
): Promise<PasanakuWithState[]> {
  const [{ data: rows }, { data: txRows }, { data: historicoRows }, { rates }] = await Promise.all([
    supabase.from('fin_pasanaku').select(PASANAKU_COLS).eq('profile_id', scope.profileId).order('created_at'),
    supabase
      .from('fin_transactions')
      .select('id, type, date, amount, currency, pasanaku_id')
      .eq('profile_id', scope.profileId)
      .not('pasanaku_id', 'is', null),
    supabase.from('fin_pasanaku_historico').select(PASANAKU_HISTORICO_COLS).eq('profile_id', scope.profileId),
    ensureRates(supabase, scope.userId),
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

    // Con la conversión ya resuelta acá (donde están las tasas), la tabla de
    // meses del detalle suma aportes de distintas cuentas sin volver a
    // convertir nada en el cliente.
    const aportesList: PasanakuAporte[] = aportes
      .map(a => ({
        id: a.id, date: a.date, amount: a.amount, currency: a.currency,
        amount_in_currency: roundFor(
          a.currency === p.currency ? a.amount : (crossCurrencySuggestion(a.amount, a.currency, p.currency, rates) ?? a.amount),
          p.currency,
        ),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))

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
      aportes: aportesList,
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
  'id, name, icon, amount, currency, account_id, category_id, frequency, day_of_month, month_of_year, active, note, starts_on, savings_goal_id, to_account_id'

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
  scope: Scope,
  todayISO: string,
): Promise<RecurringSummary> {
  const [{ data: rows }, { data: splitRows }, { data: hechos }, { data: deudas }] =
    await Promise.all([
      supabase.from('fin_recurring').select(RECURRING_COLS).eq('profile_id', scope.profileId),
      supabase.from('fin_recurring_splits').select(RECURRING_SPLIT_COLS).eq('profile_id', scope.profileId),
      supabase
        .from('fin_transactions')
        .select('id, date, recurring_id')
        .eq('profile_id', scope.profileId)
        .not('recurring_id', 'is', null),
      supabase
        .from('fin_debts')
        .select('amount_usd, settled_tx_id, waived_at, transaction:fin_transactions!fin_debts_transaction_id_fkey(recurring_id)')
        .eq('profile_id', scope.profileId),
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
export async function loadAvailableMonths(supabase: SupabaseClient, scope: Scope): Promise<string[]> {
  const { data } = await supabase.from('fin_transactions').select('date').eq('profile_id', scope.profileId)

  const months = new Set<string>()
  for (const row of data ?? []) months.add((row.date as string).slice(0, 7))

  return [...months].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

export async function loadTransactions(
  supabase: SupabaseClient,
  scope: Scope,
  f: TxFilters,
): Promise<{ data: TxResult | null; error: string | null }> {
  const limit = Math.min(f.limit ?? 200, 500)
  const offset = f.offset ?? 0

  let query = supabase
    .from('fin_transactions')
    .select(`${TX_COLS}, debts:fin_debts!fin_debts_transaction_id_fkey(${DEBT_COLS})`)
    .eq('profile_id', scope.profileId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (f.from) query = query.gte('date', f.from)
  if (f.to) query = query.lte('date', f.to)
  if (f.type) query = query.eq('type', f.type)
  // Una línea de presupuesto con varias categorías manda una lista separada
  // por comas (§ verMovimientos en presupuesto.tsx) — con una sola, se
  // comporta exactamente igual que antes.
  if (f.categoryId) {
    const ids = f.categoryId.split(',').filter(Boolean)
    query = ids.length > 1 ? query.in('category_id', ids) : query.eq('category_id', ids[0])
  }
  if (f.recurringOnly) query = query.not('recurring_id', 'is', null)
  // Una cuenta aparece como origen o como destino de una transferencia.
  if (f.accountId) query = query.or(`account_id.eq.${f.accountId},to_account_id.eq.${f.accountId}`)

  const [{ data, error }, { data: investmentRows }] = await Promise.all([
    query,
    // Para poder sacar las "Actualizar valor" de la lista (ver más abajo):
    // no son un movimiento de cuenta, son un ajuste del valor de la cuenta —
    // no tienen nada que hacer en Movimientos (§7.2 de contexto_finanzas.md).
    supabase.from('fin_accounts').select('id').eq('profile_id', scope.profileId).eq('is_investment', true),
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

const BUDGET_LINE_COLS = 'id, name, input_currency, retroactive, created_on, archived'
const BUDGET_LINE_CATEGORY_COLS = 'line_id, category_id'
const BUDGET_PERIOD_COLS = 'id, line_id, period, amount, amount_usd, exchange_rate'
const BUDGET_EXTENSION_COLS = 'id, period_id, amount, amount_usd, created_at'
const BUDGET_CLOSURE_COLS = 'id, line_id, period, carried, amount, amount_usd'

interface BudgetLineForCalc {
  id: string
  /** Una línea cubre una o más categorías, nunca solapadas con otra línea
      activa (§ fin_budget_line_categories). */
  category_ids: string[]
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
    // Solo USD: sumar montos nativos de líneas en monedas distintas no
    // significaría nada.
    amount_usd: sum(c => c.amount_usd ?? 0),
    extended_usd: sum(c => c.extended_usd),
    carried_usd: sum(c => c.carried_usd),
    spent_usd: sum(c => c.spent_usd),
    committed_usd: sum(c => c.committed_usd),
    available_usd: sum(c => c.available_usd ?? 0),
    // Mismo período para todas — vienen del mismo `currentPeriod`/`today`.
    day_of_period: categories[0].day_of_period,
    days_in_period: categories[0].days_in_period,
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
  scope: Scope,
  today: string,
  precomputed?: { rates: RateMap; recurring: RecurringSummary },
): Promise<BudgetsPayload> {
  const currentPeriod = periodStart(today)

  const [{ data: lineRows }, { data: catRows }] = await Promise.all([
    supabase.from('fin_budget_lines').select(BUDGET_LINE_COLS).eq('profile_id', scope.profileId).eq('archived', false),
    supabase.from('fin_categories').select('id, name, kind, archived').eq('profile_id', scope.profileId),
  ])

  const categoriesById = new Map(
    (catRows ?? []).map(c => [c.id as string, c as { id: string; name: string; kind: string; archived: boolean }]),
  )
  const gastoCategoryIds = new Set(
    (catRows ?? []).filter(c => c.kind === 'gasto' && !c.archived).map(c => c.id as string),
  )

  const lineIds = (lineRows ?? []).map(r => r.id as string)

  if (lineIds.length === 0) {
    const categories_without_line = [...gastoCategoryIds].map(id => ({ id, name: categoriesById.get(id)!.name }))
    return { general: null, categories: [], pending_closures: [], categories_without_line }
  }

  const [{ data: periodRows }, { data: closureRows }, { data: lineCatRows }, ratesResult, recurringResult] = await Promise.all([
    supabase.from('fin_budget_periods').select(BUDGET_PERIOD_COLS).eq('profile_id', scope.profileId).in('line_id', lineIds),
    supabase.from('fin_budget_closures').select(BUDGET_CLOSURE_COLS).eq('profile_id', scope.profileId).in('line_id', lineIds),
    supabase.from('fin_budget_line_categories').select(BUDGET_LINE_CATEGORY_COLS).eq('profile_id', scope.profileId).in('line_id', lineIds),
    precomputed ? null : ensureRates(supabase, scope.userId),
    precomputed ? null : loadRecurring(supabase, scope, today),
  ])

  const rates = precomputed?.rates ?? ratesResult!.rates
  const recurringSummary = precomputed?.recurring ?? recurringResult!

  const categoryIdsByLine = new Map<string, string[]>()
  for (const r of lineCatRows ?? []) {
    const list = categoryIdsByLine.get(r.line_id as string)
    if (list) list.push(r.category_id as string)
    else categoryIdsByLine.set(r.line_id as string, [r.category_id as string])
  }
  // Por nombre y no en el orden que vino: la consulta no lleva ORDER BY, así
  // que Postgres puede devolver las filas en cualquier orden, y el título de
  // la card ("Personal, Salud") cambiaría de una recarga a otra.
  for (const ids of categoryIdsByLine.values()) {
    ids.sort((a, b) => (categoriesById.get(a)?.name ?? '').localeCompare(categoriesById.get(b)?.name ?? ''))
  }

  const lines: BudgetLineForCalc[] = (lineRows ?? []).map(r => ({
    id: r.id as string,
    category_ids: categoryIdsByLine.get(r.id as string) ?? [],
    name: r.name as string | null,
    input_currency: r.input_currency as Currency,
    retroactive: r.retroactive as boolean,
    created_on: r.created_on as string,
  }))

  const linedCategoryIds = new Set(lines.flatMap(l => l.category_ids))
  const categories_without_line = [...gastoCategoryIds]
    .filter(id => !linedCategoryIds.has(id))
    .map(id => ({ id, name: categoriesById.get(id)!.name }))

  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string,
    amount: num(p.amount), amount_usd: num(p.amount_usd), exchange_rate: num(p.exchange_rate),
  }))
  const closures = (closureRows ?? []).map(c => ({
    line_id: c.line_id as string, period: c.period as string, carried: c.carried as boolean,
    amount: num(c.amount), amount_usd: num(c.amount_usd),
  }))

  const periodIds = periods.map(p => p.id)
  const { data: extensionRows } = periodIds.length > 0
    ? await supabase.from('fin_budget_extensions').select(BUDGET_EXTENSION_COLS).eq('profile_id', scope.profileId).in('period_id', periodIds)
    : { data: [] as { period_id: string; amount: number; amount_usd: number; created_at: string }[] }
  const extensions = (extensionRows ?? []).map(e => ({
    period_id: e.period_id as string, amount: num(e.amount), amount_usd: num(e.amount_usd),
    created_at: e.created_at as string,
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
      .select('id, category_id, amount, currency, amount_usd, flow_type, date')
      .eq('profile_id', scope.profileId).eq('type', 'gasto')
      .gte('date', rangeFrom).lte('date', rangeTo),
    supabase
      .from('fin_debts')
      .select('amount, currency, amount_usd, principal_usd, waived_at, transaction:fin_transactions!fin_debts_transaction_id_fkey(id)')
      .eq('profile_id', scope.profileId),
  ])

  // Un gasto de cuenta de inversión ("Actualizar valor") no es plata real
  // saliendo — mismo criterio que excluye reembolsos/transferencias del gasto
  // real de siempre (Sprint 2 §4.4), acá aplicado por categoría.
  const txs: BudgetTx[] = (txRows ?? [])
    .filter(t => t.flow_type !== 'movimiento')
    .map(t => ({
      id: t.id as string, category_id: t.category_id as string | null,
      amount: num(t.amount), currency: t.currency as string,
      amount_usd: num(t.amount_usd), date: t.date as string,
    }))

  const debtRowsTyped = (debtRows ?? []) as unknown as {
    amount: unknown; currency: string; amount_usd: unknown; principal_usd: unknown
    waived_at: string | null; transaction: { id: string } | null
  }[]
  const debts: BudgetDebtShare[] = debtRowsTyped
    .filter(d => d.transaction)
    .map(d => ({
      transaction_id: d.transaction!.id,
      amount: num(d.amount), currency: d.currency,
      amount_usd: num(d.amount_usd), principal_usd: num(d.principal_usd),
      waived_at: d.waived_at,
    }))

  const committedRecurring: CommittedRecurring[] = recurringSummary.recurring.map(r => ({
    category_id: r.category_id,
    active: r.active,
    amount: r.amount,
    currency: r.currency,
    amountUsd: toUsd(r.amount, r.currency, rates),
    status: r.status,
  }))

  /**
   * La tasa que esta línea tiene congelada para un período: la de la fila de
   * ese mes, o la de la que se hereda. Con ella se expresan en moneda nativa
   * los derivados que solo existen en USD (gasto real, comprometido) — nunca
   * con la tasa de hoy, para que el card entero quede a una sola tasa
   * coherente con el monto que el usuario escribió.
   */
  function rateFor(lineId: string, period: string): number {
    const own = periods.find(p => p.line_id === lineId && p.period === period)
    if (own) return own.exchange_rate
    const prior = periods
      .filter(p => p.line_id === lineId && p.period < period)
      .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
    return prior ? prior.exchange_rate : 1
  }

  const namesFor = (ids: string[]) => ids.map(id => categoriesById.get(id)?.name ?? '')

  function progressFor(line: BudgetLineForCalc): BudgetLineProgress {
    const { to } = periodRange(currentPeriod)
    const from = effectiveFromFor(line, currentPeriod)
    const { day, days } = dayOfPeriod(currentPeriod, today)
    const rate = rateFor(line.id, currentPeriod)

    const resolved = resolvePeriod(periods, line.id, currentPeriod)
    const lineExtensions = resolved.periodRowId
      ? extensions.filter(e => e.period_id === resolved.periodRowId)
      : []
    const effective = montoEfectivo(periods, extensions, line.id, currentPeriod, line.input_currency)
    const carried = carriedInto(closures, line.id, currentPeriod)
    const spent = gastoRealCategoria(txs, debts, line.category_ids, from, to, line.input_currency, rate)
    const committed = comprometido(committedRecurring, line.category_ids, line.input_currency, rate)
    const available = disponible({
      montoEfectivoUsd: effective?.amountUsd ?? null,
      gastoRealUsd: spent.amountUsd,
      comprometidoUsd: committed.amountUsd,
      carriedUsd: carried.amountUsd,
    })
    return {
      line_id: line.id,
      category_ids: line.category_ids,
      category_names: namesFor(line.category_ids),
      name: line.name,
      input_currency: line.input_currency,
      exchange_rate: rate,
      retroactive: line.retroactive,
      // El monto nativo sale tal cual de la base: es lo que el usuario
      // escribió, no una reconversión.
      amount: resolved.amount,
      amount_usd: resolved.amountUsd,
      extensions: lineExtensions.map(e => ({ amount: e.amount, amount_usd: e.amount_usd, created_at: e.created_at })),
      extended: roundFor(lineExtensions.reduce((s, e) => s + e.amount, 0), line.input_currency),
      extended_usd: round2(lineExtensions.reduce((s, e) => s + e.amount_usd, 0)),
      carried: carried.amount,
      carried_usd: carried.amountUsd,
      // Nativos sumados directo de los montos guardados, no reconvertidos
      // desde el USD redondeado — ver `gastoRealCategoria`.
      spent: spent.amount,
      spent_usd: spent.amountUsd,
      committed: committed.amount,
      committed_usd: committed.amountUsd,
      // El disponible sí se arma acá con los nativos ya exactos, en vez de
      // convertir el disponible en USD: así "2.435 − 10 = 2.425" cierra
      // clavado en la moneda que el usuario ve.
      available: available == null || effective == null
        ? null
        : roundFor(effective.amount + carried.amount - spent.amount - committed.amount, line.input_currency),
      available_usd: available,
      day_of_period: day,
      days_in_period: days,
    }
  }

  // Cierres pendientes: el disponible que tenía cada mes YA terminado, sin
  // `comprometido` — un mes cerrado no tiene nada "todavía por pasar".
  const pending_closures: PendingClosure[] = []
  for (const line of lines) {
    for (const period of pendingByLine.get(line.id) ?? []) {
      const { to: closeTo } = periodRange(period)
      const from = effectiveFromFor(line, period)
      const periodRate = rateFor(line.id, period)
      const effective = montoEfectivo(periods, extensions, line.id, period, line.input_currency)
      const carried = carriedInto(closures, line.id, period)
      const spent = gastoRealCategoria(txs, debts, line.category_ids, from, closeTo, line.input_currency, periodRate)
      const available = disponible({
        montoEfectivoUsd: effective?.amountUsd ?? null,
        gastoRealUsd: spent.amountUsd,
        comprometidoUsd: 0,
        carriedUsd: carried.amountUsd,
      })
      // `null` = ese mes la línea todavía no tenía ningún monto cargado: nada que cerrar.
      if (available == null || effective == null) continue
      pending_closures.push({
        line_id: line.id,
        category_ids: line.category_ids,
        category_names: namesFor(line.category_ids),
        name: line.name,
        input_currency: line.input_currency,
        period,
        amount: roundFor(effective.amount + carried.amount - spent.amount, line.input_currency),
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

/* ─── Historial mes a mes ──────────────────────────────────────────────────
   `loadBudgets` responde "¿cómo voy este mes?"; esto responde "¿cómo me fue
   los meses anteriores?". Va en su propia ruta y NO en `/bootstrap`: es una
   pantalla que se abre a propósito, y meter dos años de meses en el arranque
   de la app sería pagar en cada apertura algo que casi nunca se mira. */

/** Cuántos meses hacia atrás arma el historial. Mismo tope que `needsClosure`:
    si hace dos años que no se mira, el problema no es el largo de la lista. */
const HISTORY_MAX_MONTHS = 24

export async function loadBudgetHistory(
  supabase: SupabaseClient,
  scope: Scope,
  today: string,
): Promise<BudgetHistoryPayload> {
  const currentPeriod = periodStart(today)

  const [{ data: lineRows }, { data: catRows }] = await Promise.all([
    // A diferencia de `loadBudgets`, acá NO se filtra por `archived`: archivar
    // una línea deja de pedirle cierres (§4.10 del spec), pero lo que ya pasó
    // pasó — borrarlo del historial sería perder los meses que sí se vivieron.
    supabase.from('fin_budget_lines').select(BUDGET_LINE_COLS).eq('profile_id', scope.profileId),
    supabase.from('fin_categories').select('id, name').eq('profile_id', scope.profileId),
  ])

  const lineIds = (lineRows ?? []).map(r => r.id as string)
  if (lineIds.length === 0) return { lines: [], months: [] }

  const nameById = new Map((catRows ?? []).map(c => [c.id as string, c.name as string]))

  const [{ data: periodRows }, { data: closureRows }, { data: lineCatRows }] = await Promise.all([
    supabase.from('fin_budget_periods').select(BUDGET_PERIOD_COLS).eq('profile_id', scope.profileId).in('line_id', lineIds),
    supabase.from('fin_budget_closures').select(BUDGET_CLOSURE_COLS).eq('profile_id', scope.profileId).in('line_id', lineIds),
    supabase.from('fin_budget_line_categories').select(BUDGET_LINE_CATEGORY_COLS).eq('profile_id', scope.profileId).in('line_id', lineIds),
  ])

  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string,
    amount: num(p.amount), amount_usd: num(p.amount_usd), exchange_rate: num(p.exchange_rate),
  }))
  const closures = (closureRows ?? []).map(c => ({
    line_id: c.line_id as string, period: c.period as string, carried: c.carried as boolean,
    amount: num(c.amount), amount_usd: num(c.amount_usd),
  }))

  const periodIds = periods.map(p => p.id)
  const { data: extensionRows } = periodIds.length > 0
    ? await supabase.from('fin_budget_extensions').select(BUDGET_EXTENSION_COLS).eq('profile_id', scope.profileId).in('period_id', periodIds)
    : { data: [] as { period_id: string; amount: number; amount_usd: number }[] }
  const extensions = (extensionRows ?? []).map(e => ({
    period_id: e.period_id as string, amount: num(e.amount), amount_usd: num(e.amount_usd),
  }))

  const categoryIdsByLine = new Map<string, string[]>()
  for (const r of lineCatRows ?? []) {
    const list = categoryIdsByLine.get(r.line_id as string)
    if (list) list.push(r.category_id as string)
    else categoryIdsByLine.set(r.line_id as string, [r.category_id as string])
  }
  for (const ids of categoryIdsByLine.values()) {
    ids.sort((a, b) => (nameById.get(a) ?? '').localeCompare(nameById.get(b) ?? ''))
  }

  const lines = (lineRows ?? []).map(r => ({
    id: r.id as string,
    category_ids: categoryIdsByLine.get(r.id as string) ?? [],
    name: r.name as string | null,
    input_currency: r.input_currency as Currency,
    retroactive: r.retroactive as boolean,
    created_on: r.created_on as string,
    archived: r.archived as boolean,
  }))

  // El piso del historial: el mes en que nació la línea más vieja, o
  // HISTORY_MAX_MONTHS atrás si eso queda todavía más lejos.
  let floor = currentPeriod
  for (let i = 0; i < HISTORY_MAX_MONTHS; i++) floor = previousPeriod(floor)
  let earliest = currentPeriod
  for (const line of lines) {
    const start = periodStart(line.created_on)
    if (start < earliest) earliest = start
  }
  if (earliest < floor) earliest = floor

  // Un solo viaje de gasto/deudas para todo el rango, igual que `loadBudgets`.
  const { from: rangeFrom } = periodRange(earliest)
  const { to: rangeTo } = periodRange(currentPeriod)

  const [{ data: txRows }, { data: debtRows }] = await Promise.all([
    supabase
      .from('fin_transactions')
      .select('id, category_id, amount, currency, amount_usd, flow_type, date')
      .eq('profile_id', scope.profileId).eq('type', 'gasto')
      .gte('date', rangeFrom).lte('date', rangeTo),
    supabase
      .from('fin_debts')
      .select('amount, currency, amount_usd, principal_usd, waived_at, transaction:fin_transactions!fin_debts_transaction_id_fkey(id)')
      .eq('profile_id', scope.profileId),
  ])

  const txs: BudgetTx[] = (txRows ?? [])
    .filter(t => t.flow_type !== 'movimiento')
    .map(t => ({
      id: t.id as string, category_id: t.category_id as string | null,
      amount: num(t.amount), currency: t.currency as string,
      amount_usd: num(t.amount_usd), date: t.date as string,
    }))

  const debtRowsTyped = (debtRows ?? []) as unknown as {
    amount: unknown; currency: string; amount_usd: unknown; principal_usd: unknown
    waived_at: string | null; transaction: { id: string } | null
  }[]
  const debts: BudgetDebtShare[] = debtRowsTyped
    .filter(d => d.transaction)
    .map(d => ({
      transaction_id: d.transaction!.id,
      amount: num(d.amount), currency: d.currency,
      amount_usd: num(d.amount_usd), principal_usd: num(d.principal_usd),
      waived_at: d.waived_at,
    }))

  function rateFor(lineId: string, period: string): number {
    const own = periods.find(p => p.line_id === lineId && p.period === period)
    if (own) return own.exchange_rate
    const prior = periods
      .filter(p => p.line_id === lineId && p.period < period)
      .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
    return prior ? prior.exchange_rate : 1
  }

  // Los totales por mes se acumulan mientras se recorre cada línea: son la
  // suma en USD de lo mismo que ya se calculó, no un segundo cálculo.
  const monthTotals = new Map<string, { budgeted_usd: number; spent_usd: number; result_usd: number }>()

  const out: BudgetLineHistory[] = lines.map(line => {
    const entries: BudgetHistoryEntry[] = []
    let period = periodStart(line.created_on)
    if (period < earliest) period = earliest

    // Hasta el mes ANTERIOR, no hasta el vigente: el mes en curso todavía se
    // está moviendo y su "sobró/se pasó" no es un resultado, es una foto a
    // mitad de camino. Para eso está la pantalla de Presupuesto.
    while (period < currentPeriod) {
      const effective = montoEfectivo(periods, extensions, line.id, period, line.input_currency)
      // Ese mes la línea todavía no tenía monto: no hay nada que contar.
      if (effective == null) { period = nextPeriod(period); continue }

      const { to } = periodRange(period)
      const from = effectiveFromFor(line, period)
      const rate = rateFor(line.id, period)
      const carried = carriedInto(closures, line.id, period)
      const spent = gastoRealCategoria(txs, debts, line.category_ids, from, to, line.input_currency, rate)
      const closure = closures.find(c => c.line_id === line.id && c.period === period)

      const budgeted_usd = round2(effective.amountUsd)
      const spent_usd = round2(spent.amountUsd)
      const result_usd = round2(budgeted_usd + carried.amountUsd - spent_usd)

      entries.push({
        period,
        budgeted: effective.amount,
        budgeted_usd,
        carried_in: carried.amount,
        carried_in_usd: carried.amountUsd,
        spent: spent.amount,
        spent_usd,
        // El nativo se arma con los montos exactos, no reconvirtiendo el USD
        // — mismo criterio que `progressFor`.
        result: roundFor(effective.amount + carried.amount - spent.amount, line.input_currency),
        result_usd,
        carried_out: closure ? closure.carried : null,
        closed: !!closure,
      })

      const acc = monthTotals.get(period) ?? { budgeted_usd: 0, spent_usd: 0, result_usd: 0 }
      acc.budgeted_usd += budgeted_usd
      acc.spent_usd += spent_usd
      acc.result_usd += result_usd
      monthTotals.set(period, acc)

      period = nextPeriod(period)
    }

    return {
      line_id: line.id,
      name: line.name,
      category_ids: line.category_ids,
      category_names: line.category_ids.map(id => nameById.get(id) ?? ''),
      input_currency: line.input_currency,
      archived: line.archived,
      entries: entries.reverse(),
    }
  })

  const months = [...monthTotals.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([period, t]) => ({
      period,
      budgeted_usd: round2(t.budgeted_usd),
      spent_usd: round2(t.spent_usd),
      result_usd: round2(t.result_usd),
    }))

  // Una línea sin ningún mes con monto no aporta nada a la lista.
  return { lines: out.filter(l => l.entries.length > 0), months }
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
  scope: Scope,
  categoryId: string | null,
  date: string,
  amountUsd: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!categoryId || !(amountUsd > 0)) return { ok: true }

  const { data: membership } = await supabase
    .from('fin_budget_line_categories')
    .select('line_id').eq('profile_id', scope.profileId).eq('category_id', categoryId).maybeSingle()
  if (!membership) return { ok: false, error: 'Esa categoría no tiene una línea de presupuesto activa' }

  const { data: line } = await supabase
    .from('fin_budget_lines')
    .select('id, input_currency').eq('profile_id', scope.profileId).eq('id', membership.line_id).eq('archived', false).maybeSingle()
  if (!line) return { ok: false, error: 'Esa categoría no tiene una línea de presupuesto activa' }

  const period = periodStart(date)
  const { data: periodRows } = await supabase
    .from('fin_budget_periods')
    .select('id, line_id, period, amount, amount_usd, exchange_rate').eq('profile_id', scope.profileId).eq('line_id', line.id)
  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string,
    amount: num(p.amount), amount_usd: num(p.amount_usd), exchange_rate: num(p.exchange_rate),
  }))

  const resolved = resolvePeriod(periods, line.id, period)
  let periodId = resolved.periodRowId
  // La tasa que la línea ya tiene congelada — la ampliación se expresa a la
  // misma, para no mezclar dos tasas dentro del mismo mes.
  const inherited = periods.find(p => p.id === resolved.periodRowId)
    ?? periods.filter(p => p.period < period).sort((a, b) => (a.period < b.period ? 1 : -1))[0]
  const rate = inherited ? inherited.exchange_rate : 1

  if (!periodId) {
    if (resolved.amountUsd == null || resolved.amount == null) {
      return { ok: false, error: 'Esa línea todavía no tiene un monto cargado' }
    }
    const { data: created, error: createError } = await supabase
      .from('fin_budget_periods')
      .insert({
        user_id: scope.userId, profile_id: scope.profileId, line_id: line.id, period,
        amount: resolved.amount, amount_usd: resolved.amountUsd, exchange_rate: rate,
      })
      .select('id')
      .single()
    if (createError || !created) return { ok: false, error: createError?.message ?? 'No se pudo registrar el período' }
    periodId = created.id
  }

  const { error } = await supabase
    .from('fin_budget_extensions').insert({
      user_id: scope.userId, profile_id: scope.profileId, period_id: periodId,
      amount: round2(amountUsd / (rate || 1)), amount_usd: round2(amountUsd), exchange_rate: rate,
    })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/* ─── Ahorro (Sprint 7) ───────────────────────────────────────────────────── */

/**
 * De qué cuentas se puede sacar plata para ahorrar, y cuánto de cada una.
 *
 * ⚠️ **Corregido el 2026-08-26.** La primera versión devolvía "lo que ese mes
 * dejó en esa cuenta": el mínimo entre cuánto creció su saldo durante el
 * período y cuánto sigue libre hoy. Suena razonable y es un callejón sin
 * salida:
 *
 * - Una cuenta con plata libre HOY no aparecía si el mes pendiente no la había
 *   tocado. En la demo, Binance tenía 266 USDT libres y el sheet decía que no
 *   había de dónde sacar.
 * - Peor: el propio mensaje de ayuda —"convertí tus bolivianos a USDT y volvé
 *   a registrar el ahorro"— era **imposible de seguir**. La conversión ocurre
 *   hoy, que cae en el mes en curso, no en el mes que se está organizando; por
 *   más que se convirtiera, la cuenta destino nunca sumaba nada al período
 *   pendiente.
 *
 * La plata es fungible. El sobrante del mes es un **monto**, no un lugar: dice
 * cuánto te quedó, no en qué billetera está parado hoy. Así que el tope por
 * cuenta es lo que de verdad hay libre — saldo menos lo ya apartado — y el
 * sobrante del mes queda donde corresponde: como la **sugerencia** de cuánto
 * guardar (§4.3), no como una cerradura sobre de dónde sacarlo.
 */
function availableFundsByAccount(
  accounts: AccountWithBalance[],
): { account_id: string; available: number; currency: Currency }[] {
  return accounts
    .filter(a => !a.archived && !a.is_investment)
    .map(a => ({
      account_id: a.id,
      available: roundFor(Math.max(0, a.balance - a.savings_balance), a.currency),
      currency: a.currency as Currency,
    }))
    .filter(x => x.available > 0)
    .sort((a, b) => b.available - a.available)
}

export interface SavingsGoalsPayload {
  goals: SavingsGoalWithBalance[]
  /** El período vencido más viejo sin repartir, o `null` si no hay ninguno. */
  pending_period: string | null
  /** El sobrante de `pending_period`, ya neto de lo que los fijos guardaron. */
  pending_surplus_usd: number
  /**
   * De qué cuentas se puede sacar para ahorrar, y cuánto: saldo menos lo ya
   * apartado. Es lo que el sheet de "Ahorrar" ofrece como origen, en vez de
   * pedir a secas "de qué cuenta sale".
   */
  available_funds: { account_id: string; available: number; currency: Currency }[]
  /**
   * Lo que el presupuesto del mes en curso reserva. No se puede apartar a
   * ahorros hasta cubrirlo: primero se presupuesta, después se ahorra.
   * Incluye los fijos pendientes, que también tienen que salir de la cuenta.
   */
  budget_reserved_usd: number
  /** De esa reserva, cuánto son presupuestos y cuánto fijos sin presupuesto.
      Sin el desglose, el total no cuadraba con la pantalla de Presupuesto. */
  reserved_in_budgets_usd: number
  reserved_in_recurring_usd: number
  /** La plata libre de todas las cuentas, sumada en USD. */
  free_usd: number
  /** `free_usd − budget_reserved_usd`, nunca negativo: el tope de lo apartable. */
  savable_usd: number
  /**
   * Cuántos presupuestos-mes siguen sin la pregunta de cierre respondida.
   *
   * Mientras haya alguno, NO se puede ahorrar — y no es una regla de estilo:
   * hasta que se decide si el sobrante de cada uno pasa al mes siguiente, los
   * sobres del mes en curso no tienen su carry aplicado y `budget_reserved_usd`
   * sale corto. Ahorrar contra un número que todavía puede crecer es
   * exactamente el problema que este tope vino a resolver.
   */
  budget_pending_closures: number
}

/**
 * Los ahorros con su saldo ya derivado (§4.2 de sprint_7_ahorro.md) y el
 * período pendiente de repartir, si hay alguno. El quick-add necesita la
 * lista en cualquier pantalla para el picker de "a qué ahorro corresponde",
 * así que va en `/bootstrap` desde el día uno — mismo criterio que Presupuesto.
 */
export async function loadSavingsGoals(
  supabase: SupabaseClient,
  scope: Scope,
  today: string,
  precomputed?: { rates: RateMap; budgets?: BudgetsPayload; recurring?: RecurringSummary },
): Promise<SavingsGoalsPayload> {
  const [{ data: goalRows }, ratesResult] = await Promise.all([
    supabase.from('fin_savings_goals').select(SAVINGS_GOAL_COLS).eq('profile_id', scope.profileId).order('sort_order').order('created_at'),
    precomputed ? Promise.resolve(null) : ensureRates(supabase, scope.userId),
  ])
  const rates = precomputed?.rates ?? ratesResult!.rates

  const goals = (goalRows ?? []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    input_currency: r.input_currency as Currency,
    allocation_type: r.allocation_type as AllocationType,
    allocation_value: num(r.allocation_value),
    target_amount: r.target_amount == null ? null : num(r.target_amount),
    target_date: r.target_date as string | null,
    is_catchall: Boolean(r.is_catchall),
    sort_order: num(r.sort_order),
    archived: Boolean(r.archived),
    created_at: r.created_at as string,
  }))

  // El mes pasado, y solo ese. Ya no depende de `fin_savings_closures`: esa
  // tabla la escribía el reparto global, que la Ronda 9 reemplazó, y al dejar
  // de escribirse el mes pendiente quedaba clavado para siempre.
  const pending_period = pendingSavingsPeriod(goals, today)

  if (goals.length === 0) {
    return {
      goals: [], pending_period, pending_surplus_usd: 0, available_funds: [],
      budget_reserved_usd: 0, reserved_in_budgets_usd: 0, reserved_in_recurring_usd: 0,
      free_usd: 0, savable_usd: 0, budget_pending_closures: 0,
    }
  }

  const goalIds = goals.map(g => g.id)
  const [{ data: txRows }] = await Promise.all([
    supabase
      .from('fin_transactions')
      .select('savings_goal_id, type, account_id, to_account_id, amount, to_amount, amount_usd, to_amount_usd, savings_flow, savings_period')
      .eq('profile_id', scope.profileId).in('savings_goal_id', goalIds),
  ])

  const taggedTxs: GoalTaggedTx[] = (txRows ?? []).map(t => ({
    savings_goal_id: t.savings_goal_id as string | null,
    type: t.type as TxType,
    account_id: t.account_id as string,
    to_account_id: t.to_account_id as string | null,
    amount: num(t.amount),
    to_amount: t.to_amount == null ? null : num(t.to_amount),
    amount_usd: num(t.amount_usd),
    to_amount_usd: t.to_amount_usd == null ? null : num(t.to_amount_usd),
    savings_flow: t.savings_flow as string | null,
  }))
  // Qué meses ya tienen un aporte, por ahorro (Ronda 9). Alimenta las dos
  // cosas que se pidieron: esconder el botón "Ahorrar" de un plan cuando su
  // mes ya se guardó, y la tabla de meses del detalle.
  const mesesAhorrados = new Map<string, Set<string>>()
  for (const r of txRows ?? []) {
    const goal = r.savings_goal_id as string | null
    const periodo = r.savings_period as string | null
    if (!goal || !periodo) continue
    if (!mesesAhorrados.has(goal)) mesesAhorrados.set(goal, new Set())
    mesesAhorrados.get(goal)!.add(periodo.slice(0, 10))
  }

  const balances = computeGoalBalancesUsd(taggedTxs)
  // Dónde vive físicamente cada ahorro: lo necesita el traslado (§4.12) para
  // saber de qué cuentas se puede sacar y cuánto.
  const porCuenta = computeGoalBalancesByAccountUsd(taggedTxs)
  // Qué ahorros ya tienen movimientos: bloquea cambiarles la moneda, igual
  // que en una cuenta con transacciones.
  const conMovimientos = new Set(taggedTxs.map(t => t.savings_goal_id).filter((id): id is string => !!id))

  const withBalance: SavingsGoalWithBalance[] = goals.map((g): SavingsGoalWithBalance => {
    const balance_usd = round2(balances.get(g.id) ?? 0)
    const targetAmountUsd = g.target_amount == null ? null : toUsd(g.target_amount, g.input_currency, rates)
    const goal: SavingsGoal = {
      id: g.id, name: g.name, input_currency: g.input_currency,
      allocation_type: g.allocation_type, allocation_value: g.allocation_value,
      target_amount: g.target_amount, target_date: g.target_date,
      is_catchall: g.is_catchall,
      sort_order: g.sort_order, archived: g.archived,
    }
    return {
      ...goal,
      balance: fromUsd(balance_usd, g.input_currency, rates),
      balance_usd,
      goal_reached: goalReached(goal, balance_usd, targetAmountUsd),
      has_movements: conMovimientos.has(g.id),
      created_at: g.created_at,
      saved_periods: [...(mesesAhorrados.get(g.id) ?? [])].sort(),
      by_account: [...porCuenta]
        .filter(([k, v]) => k.startsWith(`${g.id}:`) && v > 0)
        .map(([k, v]) => ({
          account_id: k.slice(g.id.length + 1),
          amount_usd: round2(v),
        }))
        .sort((a, b) => b.amount_usd - a.amount_usd),
    }
  })

  // El sobrante del mes pendiente y dónde quedó su plata: los dos los necesita
  // el sheet de "Ahorrar" de cada plan, así que viajan con los ahorros en vez
  // de costar un viaje aparte por cada card que se abre.
  if (!pending_period) {
    return {
      goals: withBalance, pending_period, pending_surplus_usd: 0, available_funds: [],
      budget_reserved_usd: 0, reserved_in_budgets_usd: 0, reserved_in_recurring_usd: 0,
      free_usd: 0, savable_usd: 0, budget_pending_closures: 0,
    }
  }

  const [pending_surplus_usd, { accounts }] = await Promise.all([
    monthSurplusUsd(supabase, scope, pending_period),
    loadAccounts(supabase, scope),
  ])

  const available_funds = availableFundsByAccount(accounts)
  const free_usd = round2(available_funds.reduce((s, f) => s + toUsd(f.available, f.currency, rates), 0))

  // El presupuesto reserva ANTES que el ahorro. Si el llamador ya los tenía
  // (el bootstrap los pide en el mismo viaje) se reusan; si no, se piden acá
  // — que nadie pueda saltarse la regla por olvidarse de pasarlos.
  const recurringSummary = precomputed?.recurring ?? await loadRecurring(supabase, scope, today)
  const budgets = precomputed?.budgets
    ?? await loadBudgets(supabase, scope, today, { rates, recurring: recurringSummary })

  const reserva = budgetReservedUsd(
    budgets.categories,
    recurringSummary.recurring.map(r => ({
      category_id: r.category_id,
      active: r.active,
      status: r.status,
      amountUsd: toUsd(r.amount, r.currency, rates),
    })),
  )

  const budget_reserved_usd = reserva.total_usd
  const budget_pending_closures = budgets.pending_closures.length

  return {
    goals: withBalance,
    pending_period,
    pending_surplus_usd,
    available_funds,
    budget_reserved_usd,
    reserved_in_budgets_usd: reserva.in_budgets_usd,
    reserved_in_recurring_usd: reserva.in_recurring_usd,
    free_usd,
    // Con cierres sin responder el tope es cero: no es que no te sobre, es
    // que todavía no se sabe cuánto reserva el presupuesto.
    savable_usd: budget_pending_closures > 0 ? 0 : savableUsd(free_usd, budget_reserved_usd),
    budget_pending_closures,
  }
}

/**
 * El sobrante de un mes: ingreso real menos gasto real (§4.1), **menos lo que
 * los fijos de ahorro ya guardaron en ese mismo mes**.
 *
 * Sin esa resta el reparto pedía ahorrar plata ya ahorrada. Un aporte es una
 * `transferencia` (`flow_type: 'movimiento'`), así que `ingresoUsd`/`gastoUsd`
 * ni lo miran: con un fijo de $100 corriendo, al cerrar el mes el reparto
 * proponía repartir el sobrante entero, esos $100 incluidos.
 *
 * Se descuentan **solo los aportes de un fijo** (`recurring_id` no nulo), que
 * desde la Ronda 8 son lo único que puede aportar a mitad de mes. Las
 * transferencias que crea el propio cierre quedan afuera a propósito: nacen
 * con fecha de hoy, que cae en el mes SIGUIENTE al que cierran, y descontarlas
 * arruinaría el sobrante del mes que todavía no terminó. Un traslado tampoco
 * cuenta: no ahorra nada nuevo, solo cambia de cuenta plata ya guardada.
 *
 * Asimetría deliberada, no olvido: un **retiro** sí baja el sobrante, porque
 * es un `gasto` normal para `gastoUsd`. Se puede defender de las dos maneras
 * —romper un ahorro deja menos para guardar el mes que viene— y no se tocó
 * porque no se pidió; queda anotado en §8 del sprint.
 */
async function monthSurplusUsd(supabase: SupabaseClient, scope: Scope, period: string): Promise<number> {
  const { from, to } = periodRange(period)
  const { data: txRows } = await supabase
    .from('fin_transactions')
    .select('type, amount_usd, to_amount_usd, flow_type, savings_goal_id, savings_flow, recurring_id')
    .eq('profile_id', scope.profileId).gte('date', from).lte('date', to)

  const txs = (txRows ?? []).map(t => ({
    type: t.type as TxType, amount_usd: num(t.amount_usd), flow_type: t.flow_type as Transaction['flow_type'],
  }))

  // Lo que llegó, no lo que salió: en un aporte cross-currency son distintos,
  // y lo que quedó guardado es el lado que entró (mismo criterio que
  // `computeGoalBalancesUsd`).
  const yaGuardadoPorFijos = round2((txRows ?? [])
    .filter(t => t.savings_goal_id && t.savings_flow === 'aporte' && t.recurring_id)
    .reduce((s, t) => s + num(t.to_amount_usd ?? t.amount_usd), 0))

  return round2(round2(ingresoUsd(txs) - gastoUsd(txs)) - yaGuardadoPorFijos)
}

/*
 * ── El reparto global se retiró en la Ronda 9 ──
 *
 * Acá vivían `loadSavingsClosureProposal` y `applySavingsClosure`: la pantalla
 * que cerraba el mes entero de una vez, con una cuenta de origen y una de
 * destino para TODOS los ahorros juntos. La reemplazó el botón "Ahorrar" de
 * cada plan (`POST /savings-goals/[id]/save`, §4.13).
 *
 * Se borraron en vez de dejarlas: no eran código muerto inofensivo. Escribían
 * aportes SIN `savings_period`, así que cualquier llamada —desde un cliente
 * viejo, desde un test, desde curl— habría metido plata en un ahorro sin que
 * el mes quedara marcado: el botón del plan seguiría ofreciéndose y la tabla
 * de meses mostraría un guion sobre un mes que sí recibió plata.
 *
 * `fin_savings_closures` queda en la base con lo que se haya escrito, pero ya
 * nadie la lee: `pendingSavingsPeriod` dejó de depender de ella justamente
 * porque, al no escribirse más, dejaba el mes pendiente clavado para siempre.
 */
