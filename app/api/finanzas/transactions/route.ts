import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { applyBudgetExtension, assertBalance, assertCategory, assertSavingsGoal, loadTransactions } from '@/lib/finanzas/load'
import { flowTypeFor, freezeConversion, isValidSavingsFlow, isValidSavingsReason, savingsFlowForType, validateInput } from '@/lib/finanzas/transactions'
import type { Account, Currency, TransactionInput } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, savings_goal_id, savings_flow, savings_reason'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

export async function GET(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const q = new URL(request.url).searchParams
  const { data, error } = await loadTransactions(supabase, scope, {
    from: q.get('from'),
    to: q.get('to'),
    type: q.get('type'),
    accountId: q.get('account_id'),
    categoryId: q.get('category_id'),
    sharedOnly: q.get('shared') === '1',
    recurringOnly: q.get('recurring') === '1',
    limit: num(q.get('limit'), 200),
    offset: num(q.get('offset'), 0),
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const input: Partial<TransactionInput> = {
    type: body.type,
    date: body.date,
    account_id: body.account_id,
    to_account_id: body.to_account_id ?? null,
    category_id: body.category_id ?? null,
    amount: num(body.amount, NaN),
    to_amount: body.to_amount == null ? null : num(body.to_amount),
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
    budget_extension_usd: body.budget_extension_usd == null ? undefined : num(body.budget_extension_usd),
  }

  // Cuentas y tasas no dependen entre sí — van juntas en un solo viaje.
  const [{ data: accountRows }, { rates }] = await Promise.all([
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId),
    ensureRates(supabase, userId),
  ])

  const accountsById = new Map<string, Account>(
    (accountRows ?? []).map(r => {
      const a = mapAccount(r)
      return [a.id, a]
    }),
  )

  const check = validateInput(input, accountsById)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  // La moneda sale de la cuenta, nunca del cliente.
  const account = accountsById.get(input.account_id!)!
  const currency = account.currency

  const categoryError = await assertCategory(supabase, scope, input.category_id)
  if (categoryError) return NextResponse.json({ error: categoryError }, { status: 400 })

  const frozen = freezeConversion(input.amount!, currency, rates)

  // El lado que LLEGA se congela igual que el que sale: sin esto, la comisión
  // (lo que salió menos lo que entró) había que calcularla con la tasa de hoy
  // y se movía sola con el paralelo — la misma transferencia mostraría otra
  // comisión cada mes. Solo aplica entre monedas distintas.
  const toAccount = input.type === 'transferencia' && input.to_account_id
    ? accountsById.get(input.to_account_id)
    : undefined
  const frozenTo = toAccount && input.to_amount != null
    ? freezeConversion(input.to_amount, toAccount.currency, rates)
    : null

  // Ahorro (Sprint 7, revisado el 2026-08-26): la etiqueta es OPCIONAL y
  // explícita. Un movimiento es "de ahorro" porque lo dijiste, no porque pasó
  // por cierta cuenta — una cuenta puede tener plata libre y plata apartada
  // mezcladas, y antes cualquier gasto desde ahí quedaba obligado a elegir un
  // ahorro y un motivo que muchas veces no correspondían.
  //
  // El motivo solo se pide si de verdad estás sacando plata de un ahorro que
  // etiquetaste: sin etiqueta no hay retiro del que justificarse.
  let savingsGoalId: string | null = null
  let savingsFlow: string | null = null
  let savingsReason: string | null = null

  const goalId = typeof body.savings_goal_id === 'string' && body.savings_goal_id ? body.savings_goal_id : null
  if (goalId) {
    // Por esta ruta un ahorro solo puede SALIR (Ronda 8). La plata entra a un
    // ahorro por dos caminos, los dos deliberados y periódicos: un fijo de
    // ahorro y el reparto del cierre mensual. Romperlo, en cambio, pasa en el
    // momento y sin plan — por eso vive acá, en el gasto que lo rompe.
    //
    // Y una transferencia común es solo plata cambiando de billetera: no toca
    // ningún ahorro. Para mover un ahorro de cuenta está el traslado, en la
    // pantalla de Ahorros, que mueve los dos lados a la vez.
    if (input.type !== 'gasto') {
      return NextResponse.json({
        error: input.type === 'ingreso'
          ? 'Un ingreso no aporta a un ahorro por acá: la plata entra a un ahorro con un fijo de ahorro o en el reparto de fin de mes'
          : 'Una transferencia solo mueve saldo disponible. Para mover un ahorro de cuenta, usá "Mover de cuenta" en Ahorros',
      }, { status: 400 })
    }

    const goalError = await assertSavingsGoal(supabase, scope, goalId)
    if (goalError) return NextResponse.json({ error: goalError }, { status: 400 })
    savingsGoalId = goalId

    // La dirección la declara el tipo, y para un gasto es siempre un retiro.
    // Se sigue rechazando una dirección declarada que lo contradiga, en vez
    // de pisarla en silencio.
    const implicita = savingsFlowForType(input.type!)
    const declarada = isValidSavingsFlow(body.savings_flow) ? body.savings_flow : null
    if (implicita && declarada && declarada !== implicita) {
      return NextResponse.json(
        { error: `Un ${input.type} no puede ser un ${declarada} de un ahorro` },
        { status: 400 },
      )
    }
    savingsFlow = implicita

    // El motivo es el justificativo de romper un ahorro.
    if (!isValidSavingsReason(body.savings_reason)) {
      return NextResponse.json({ error: 'Elige por qué retiras del ahorro' }, { status: 400 })
    }
    savingsReason = body.savings_reason
  }

  // El saldo se mide recién acá, no antes: el tope depende de si esto es un
  // retiro declarado (gasta de la alcancía) o un movimiento común (que no
  // puede tocarla). Ver el "piso de ahorro" en `assertBalance`.
  const balanceError = await assertBalance(supabase, scope, account, input.type!, input.amount!, null, savingsFlow)
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const { data, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId, profile_id: profileId,
      type: input.type,
      // El cliente nunca manda `flow_type`: lo decide el server según el tipo
      // y la cuenta (ver `flowTypeFor`).
      flow_type: flowTypeFor(input.type!, account),
      date: input.date,
      account_id: input.account_id,
      to_account_id: input.type === 'transferencia' ? input.to_account_id : null,
      category_id: input.type === 'transferencia' ? null : input.category_id,
      amount: input.amount,
      currency,
      to_amount: input.type === 'transferencia' ? input.to_amount : null,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      to_amount_usd: frozenTo?.amount_usd ?? null,
      to_exchange_rate: frozenTo?.exchange_rate ?? null,
      description: input.description,
      savings_goal_id: savingsGoalId,
      savings_flow: savingsFlow,
      savings_reason: savingsReason,
    })
    .select(TX_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Si el quick-add bloqueó por presupuesto y el usuario eligió "Ampliar", la
  // ampliación se registra recién ahora que el gasto ya se guardó de verdad —
  // es contabilidad secundaria, nunca motivo de que el gasto en sí falle. Pero
  // si falla igual, no queda muda: viaja en la respuesta para que el cliente
  // pueda avisar, en vez de que la categoría aparezca "pasada" sin explicación.
  let budgetExtensionError: string | undefined
  if (input.type === 'gasto' && input.budget_extension_usd) {
    const result = await applyBudgetExtension(supabase, scope, input.category_id ?? null, input.date!, input.budget_extension_usd)
    if (!result.ok) budgetExtensionError = result.error
  }

  return NextResponse.json({ transaction: { ...data, debts: [] }, budget_extension_error: budgetExtensionError }, { status: 201 })
}
