import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { crossCurrencySuggestion, formatAmount, fromUsd, num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, isValidDate, todayISO } from '@/lib/finanzas/transactions'
import { assertBalance, assertSavingsGoal } from '@/lib/finanzas/load'
import { computeGoalBalancesByAccountUsd, type GoalTaggedTx } from '@/lib/finanzas/savings'
import type { Currency, TxType } from '@/lib/finanzas/types'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'
const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, savings_goal_id, savings_flow, savings_reason'

/**
 * Mover un ahorro de una cuenta a otra (Ronda 8, §4.12).
 *
 * Vive acá y no en el quick-add porque no es un movimiento del mes: no ganaste
 * ni gastaste nada, solo cambiaste de billetera la plata que ya tenías
 * guardada. Se registra como una `transferencia` con `flow_type: 'movimiento'`
 * —no ensucia ingreso ni gasto real— y con `savings_flow: 'traslado'`, la
 * tercera dirección: mueve lo apartado en las DOS cuentas y deja el saldo del
 * ahorro exactamente donde estaba.
 *
 * El tope no es "lo apartado en la cuenta" sino "lo apartado **de este
 * ahorro** en la cuenta": si en Efectivo hay Bs 500 del auto y Bs 300 de
 * emergencias, del auto se pueden mover 500, no 800.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) ?? {}

  const goalError = await assertSavingsGoal(supabase, userId, id)
  if (goalError) return NextResponse.json({ error: goalError }, { status: 400 })

  const fromId = typeof body.from_account_id === 'string' ? body.from_account_id : ''
  const toId = typeof body.to_account_id === 'string' ? body.to_account_id : ''
  if (!fromId) return NextResponse.json({ error: 'Elige de qué cuenta sale' }, { status: 400 })
  if (!toId) return NextResponse.json({ error: 'Elige a qué cuenta entra' }, { status: 400 })
  if (fromId === toId) {
    return NextResponse.json({ error: 'El origen y el destino no pueden ser la misma cuenta' }, { status: 400 })
  }

  const amount = num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const [{ data: accountRows }, { rates }] = await Promise.all([
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('user_id', userId).in('id', [fromId, toId]),
    ensureRates(supabase, userId),
  ])
  const cuentas = (accountRows ?? []).map(mapAccount)
  const from = cuentas.find(a => a.id === fromId)
  const to = cuentas.find(a => a.id === toId)
  if (!from || !to) return NextResponse.json({ error: 'Esa cuenta no existe' }, { status: 400 })

  // Cuánto de ESTE ahorro vive hoy en la cuenta de origen.
  const { data: txRows } = await supabase
    .from('fin_transactions')
    .select('savings_goal_id, type, account_id, to_account_id, amount, to_amount, amount_usd, to_amount_usd, savings_flow')
    .eq('user_id', userId).eq('savings_goal_id', id)

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
  const enOrigenUsd = computeGoalBalancesByAccountUsd(taggedTxs).get(`${id}:${fromId}`) ?? 0
  const enOrigen = fromUsd(Math.max(0, enOrigenUsd), from.currency as Currency, rates)

  if (amount > enOrigen) {
    return NextResponse.json({
      error: enOrigen <= 0
        ? `Este ahorro no tiene nada guardado en ${from.name}`
        : `De este ahorro hay ${formatAmount(enOrigen, from.currency)} en ${from.name}`,
    }, { status: 400 })
  }

  // Y la cuenta tiene que tener la plata de verdad: lo apartado es un dato
  // derivado, no una caja aparte. Si se gastó por otro lado, no está.
  const balanceError = await assertBalance(supabase, userId, from, 'transferencia', amount, null, 'traslado')
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : todayISO()
  const frozen = freezeConversion(amount, from.currency as Currency, rates)

  // Cross-currency: si el cliente dice cuánto llegó, manda eso; si no, la
  // sugerencia de hoy — mismo criterio que el cierre y el registro de un fijo,
  // que también arman la transferencia del lado del servidor.
  const toAmount = from.currency === to.currency
    ? null
    : (Number.isFinite(num(body.to_amount, NaN)) && num(body.to_amount) > 0
        ? num(body.to_amount)
        : crossCurrencySuggestion(amount, from.currency as Currency, to.currency as Currency, rates))
  const frozenTo = toAmount != null ? freezeConversion(toAmount, to.currency as Currency, rates) : null

  const { data: tx, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type: 'transferencia',
      // No es plata que entre ni salga de tu vida: solo cambia de bolsillo.
      flow_type: 'movimiento',
      date,
      account_id: from.id,
      to_account_id: to.id,
      category_id: null,
      amount,
      currency: from.currency,
      to_amount: toAmount,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      to_amount_usd: frozenTo?.amount_usd ?? null,
      to_exchange_rate: frozenTo?.exchange_rate ?? null,
      description: typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null,
      savings_goal_id: id,
      savings_flow: 'traslado',
      savings_reason: null,
    })
    .select(TX_COLS)
    .single()

  if (error || !tx) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo mover' }, { status: 400 })
  }
  return NextResponse.json({ transaction: tx }, { status: 201 })
}
