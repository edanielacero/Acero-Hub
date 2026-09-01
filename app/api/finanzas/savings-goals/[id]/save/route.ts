import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { crossCurrencySuggestion, formatAmount, formatUSD, num, round2, roundFor, toUsd } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, isValidDate, todayISO } from '@/lib/finanzas/transactions'
import { assertSavingsGoal, loadSavingsGoals } from '@/lib/finanzas/load'
import { canSaveForPeriod, isPeriod, periodOfDate } from '@/lib/finanzas/savings'
import type { Currency } from '@/lib/finanzas/types'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'
const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, savings_goal_id, savings_flow, savings_reason, savings_period'

/**
 * "Ahorrar": guardar plata de un mes ya terminado en UN plan de ahorro
 * (Ronda 9).
 *
 * Reemplaza al reparto global. Antes el mes se cerraba de una sola vez, con
 * una cuenta de origen y una de destino para todos los ahorros juntos; ahora
 * cada plan tiene su propio botón y su propia decisión, que es como la gente
 * piensa el ahorro: plan por plan, no como un trámite mensual.
 *
 * Dos cosas que cambian respecto del cierre viejo:
 *
 * 1. **El origen sale de dónde quedó la plata del mes**, no de un picker en
 *    blanco: `available_funds` dice en qué cuentas hay plata de ese mes todavía
 *    libre, y solo se puede sacar de ahí.
 * 2. **El destino puede ser la misma cuenta.** Guardar sin mover de banco es
 *    lo normal: la plata ya está donde tiene que estar, lo que cambia es que
 *    pasa a estar apartada. Se registra como una transferencia de la cuenta a
 *    sí misma — el saldo no se mueve un peso (sale y entra el mismo monto) y
 *    lo apartado sube. Por eso acá NO rige la regla de "origen y destino
 *    distintos" que sí vale para un traslado.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const { id } = await params
  const body = (await request.json().catch(() => null)) ?? {}

  const goalError = await assertSavingsGoal(supabase, scope, id)
  if (goalError) return NextResponse.json({ error: goalError }, { status: 400 })

  const hoy = todayISO()
  const savings = await loadSavingsGoals(supabase, scope, hoy)
  const goal = savings.goals.find(g => g.id === id)
  if (!goal) return NextResponse.json({ error: 'Ese ahorro no existe' }, { status: 400 })

  // El período: el que mande el cliente si es válido, o el pendiente. Nunca el
  // mes en curso — todavía no se sabe cuánto va a sobrar (§4.3).
  const period = isPeriod(body.period) ? body.period : savings.pending_period
  if (!period) return NextResponse.json({ error: 'No hay ningún mes terminado por organizar' }, { status: 400 })
  if (period >= periodOfDate(hoy)) {
    return NextResponse.json({ error: 'Ese mes todavía no terminó' }, { status: 400 })
  }
  if (goal.saved_periods.includes(period)) {
    return NextResponse.json({ error: 'Ya guardaste en este ahorro para ese mes' }, { status: 409 })
  }
  // Y un plan creado después no organiza un mes que no vivió.
  if (!canSaveForPeriod(goal, period)) {
    return NextResponse.json({ error: 'Este ahorro todavía no existía ese mes' }, { status: 400 })
  }

  const fromId = typeof body.from_account_id === 'string' ? body.from_account_id : ''
  if (!fromId) return NextResponse.json({ error: 'Elige de qué cuenta sale' }, { status: 400 })
  // Por defecto se guarda en la misma cuenta: la plata ya está ahí, solo pasa
  // a estar apartada.
  const toId = typeof body.to_account_id === 'string' && body.to_account_id ? body.to_account_id : fromId

  const amount = num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const [{ data: accountRows }, { rates }] = await Promise.all([
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId).in('id', [...new Set([fromId, toId])]),
    ensureRates(supabase, userId),
  ])
  const cuentas = (accountRows ?? []).map(mapAccount)
  const from = cuentas.find(a => a.id === fromId)
  const to = cuentas.find(a => a.id === toId)
  if (!from || !to) return NextResponse.json({ error: 'Esa cuenta no existe' }, { status: 400 })

  // Solo cuentas en la moneda del plan: un ahorro en Bs no se alimenta con
  // dólares sin decidir a qué tasa, y esa decisión no va escondida acá.
  if (from.currency !== goal.input_currency) {
    return NextResponse.json(
      { error: `${goal.name} es un ahorro en ${goal.input_currency}: elige una cuenta en esa moneda` },
      { status: 400 },
    )
  }

  // Y solo hasta lo que de verdad hay libre ahí: saldo menos lo ya apartado.
  // NO se topea contra "lo que ese mes dejó en esta cuenta": la plata es
  // fungible y el sobrante del mes es un monto, no un lugar. Atarlo a la
  // cuenta dejaba fuera plata que estaba disponible y volvía imposible de
  // seguir el propio consejo de "convertí y volvé" — la conversión pasa hoy,
  // no en el mes que se está organizando.
  const fondo = savings.available_funds.find(f => f.account_id === fromId)
  const disponible = fondo?.available ?? 0
  if (amount > disponible) {
    return NextResponse.json({
      error: disponible <= 0
        ? `${from.name} no tiene plata libre para ahorrar`
        : `${from.name} tiene ${formatAmount(disponible, from.currency)} libres`,
    }, { status: 400 })
  }

  // Antes que cualquier tope: si quedan meses sin cerrar, todavía no se sabe
  // cuánto reserva el presupuesto —los carries no están aplicados— así que el
  // número contra el que se compararía estaría corto. Se responde primero.
  if (savings.budget_pending_closures > 0) {
    const n = savings.budget_pending_closures
    return NextResponse.json({
      error: `Primero cierra ${n === 1 ? 'el presupuesto que quedó pendiente' : `los ${n} presupuestos que quedaron pendientes`} del mes pasado: hasta decidir qué pasa con lo que sobró, no se sabe cuánto reserva este mes.`,
      budget_pending_closures: n,
    }, { status: 400 })
  }

  // Primero se presupuesta, después se ahorra. El tope de arriba mira UNA
  // cuenta; este mira el total contra lo que el presupuesto del mes reserva,
  // que es un número global y no vive en ninguna cuenta en particular.
  //
  // Se valida en el server y no solo en el sheet porque es la regla, no una
  // ayuda visual: sin esto, cualquier cliente viejo podría saltearla.
  const montoUsd = round2(toUsd(amount, from.currency as Currency, rates))
  if (montoUsd > savings.savable_usd) {
    return NextResponse.json({
      error: savings.savable_usd <= 0
        ? `Tus presupuestos de este mes reservan ${formatUSD(savings.budget_reserved_usd)} y todavía no los cubres. Primero presupuesta, después ahorra.`
        : `Puedes apartar hasta ${formatUSD(savings.savable_usd)}: tus presupuestos reservan ${formatUSD(savings.budget_reserved_usd)}.`,
      savable_usd: savings.savable_usd,
      budget_reserved_usd: savings.budget_reserved_usd,
    }, { status: 400 })
  }

  const date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : hoy
  const frozen = freezeConversion(amount, from.currency as Currency, rates)

  const mismaCuenta = from.id === to.id
  const toAmount = mismaCuenta || from.currency === to.currency
    ? null
    : crossCurrencySuggestion(amount, from.currency as Currency, to.currency as Currency, rates)
  const frozenTo = toAmount != null ? freezeConversion(toAmount, to.currency as Currency, rates) : null

  const { data: tx, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId, profile_id: profileId,
      type: 'transferencia',
      // Guardar no es ganar ni gastar: no ensucia el ingreso ni el gasto real.
      flow_type: 'movimiento',
      date,
      account_id: from.id,
      to_account_id: to.id,
      category_id: null,
      amount: roundFor(amount, from.currency),
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
      savings_flow: 'aporte',
      savings_reason: null,
      savings_period: period,
    })
    .select(TX_COLS)
    .single()

  if (error || !tx) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo guardar' }, { status: 400 })
  }
  return NextResponse.json({ transaction: tx }, { status: 201 })
}
