import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num, round2 } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { flowTypeOnEdit, freezeConversion, isValidSavingsFlow, isValidSavingsReason, savingsFlowForType, validateInput } from '@/lib/finanzas/transactions'
import { freezeDebtUsd } from '@/lib/finanzas/splits'
import { applyBudgetExtension, assertBalance, assertCategory, assertSavingsGoal } from '@/lib/finanzas/load'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import type { Account, Currency, TransactionInput, TxType } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, to_amount_usd, to_exchange_rate, description, savings_goal_id, savings_flow, savings_reason'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

interface DebtRow {
  id: string
  person_id: string
  amount: number
  currency: Currency
  amount_usd: number
  settled_tx_id: string | null
  waived_at: string | null
}

async function readDebts(
  supabase: Awaited<ReturnType<typeof requireProfile>>['supabase'],
  profileId: string,
  txId: string,
): Promise<DebtRow[]> {
  const { data } = await supabase
    .from('fin_debts')
    .select(DEBT_COLS)
    .eq('profile_id', profileId)
    .eq('transaction_id', txId)

  return (data ?? []).map(s => ({
    id: s.id,
    person_id: s.person_id,
    amount: num(s.amount),
    currency: s.currency as Currency,
    amount_usd: num(s.amount_usd),
    settled_tx_id: s.settled_tx_id,
    waived_at: s.waived_at,
  }))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const [{ data: current }, { data: accountRows }, existingSplits] = await Promise.all([
    supabase
      .from('fin_transactions')
      .select(TX_COLS)
      .eq('id', id)
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId),
    readDebts(supabase, profileId, id),
  ])

  if (!current) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })

  const accountsById = new Map<string, Account>(
    (accountRows ?? []).map(r => {
      const a = mapAccount(r)
      return [a.id, a]
    }),
  )

  const pick = <T,>(next: T | undefined, prev: T): T => (next === undefined ? prev : next)

  const merged: Partial<TransactionInput> = {
    type: pick(body.type, current.type),
    date: pick(body.date, current.date),
    account_id: pick(body.account_id, current.account_id),
    to_account_id: pick(body.to_account_id, current.to_account_id),
    category_id: pick(body.category_id, current.category_id),
    amount: body.amount === undefined ? num(current.amount) : num(body.amount, NaN),
    to_amount:
      body.to_amount === undefined
        ? current.to_amount === null ? null : num(current.to_amount)
        : body.to_amount == null ? null : num(body.to_amount),
    description:
      body.description === undefined
        ? current.description
        : typeof body.description === 'string'
          ? body.description.trim() || null
          : null,
  }

  // Pasar a transferencia limpia la categoría; salir de transferencia limpia
  // el destino y el monto recibido. Sin esto el check constraint rechaza el update.
  if (merged.type === 'transferencia') {
    merged.category_id = null
  } else {
    merged.to_account_id = null
    merged.to_amount = null
  }

  const check = validateInput(merged, accountsById)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const account = accountsById.get(merged.account_id!)!
  const currency = account.currency

  const categoryError = await assertCategory(supabase, scope, merged.category_id)
  if (categoryError) return NextResponse.json({ error: categoryError }, { status: 400 })

  const flowType = flowTypeOnEdit(merged.type!, account, current.flow_type)

  // Un movimiento ya NO sabe crear ni editar deudas. Las deudas se manejan en
  // su propia pantalla: son una entidad aparte, no un detalle del gasto. Lo
  // único que este PATCH sigue haciendo con ellas es recongelarlas si la tasa
  // del gasto padre cambió (más abajo), para que las partes no dejen de sumar.
  const conDeudas = existingSplits.length > 0
  if (conDeudas && merged.type !== 'gasto') {
    return NextResponse.json(
      { error: 'Este gasto tiene deudas asociadas. Borralas antes de cambiarle el tipo.' },
      { status: 400 },
    )
  }

  // La tasa se recongela solo si cambió algo que la involucra: el monto, la
  // cuenta (y con ella la moneda), o una tasa enviada explícitamente desde el
  // formulario. Editar solo la descripción no toca la conversión histórica.
  const rateExplicit = body.exchange_rate !== undefined
  const amountChanged = body.amount !== undefined && num(body.amount) !== num(current.amount)
  const accountChanged = body.account_id !== undefined && body.account_id !== current.account_id

  let exchange_rate = num(current.exchange_rate)
  let amount_usd = num(current.amount_usd)

  if (rateExplicit || amountChanged || accountChanged) {
    if (rateExplicit) {
      // Una tasa mandada a mano es el factor congelado directo: USD por unidad.
      const factor = num(body.exchange_rate, NaN)
      if (!Number.isFinite(factor) || factor <= 0) {
        return NextResponse.json({ error: 'La tasa debe ser mayor a cero' }, { status: 400 })
      }
      exchange_rate = factor
      amount_usd = round2(merged.amount! * factor)
    } else {
      const { rates } = await ensureRates(supabase, userId)
      const frozen = freezeConversion(merged.amount!, currency, rates)
      exchange_rate = frozen.exchange_rate
      amount_usd = frozen.amount_usd
    }
  }

  // El lado que llega se recongela cuando cambió el monto recibido o la cuenta
  // destino; si no, se conserva el que ya tenía. Editar solo la descripción no
  // puede mover la comisión de una transferencia vieja.
  const toAccount = merged.type === 'transferencia' && merged.to_account_id
    ? accountsById.get(merged.to_account_id)
    : undefined
  // Ya no importa si las monedas coinciden: una transferencia de misma moneda
  // también puede llevar comisión, y su destino se congela igual.
  const conDestino = !!toAccount && merged.to_amount != null
  const toAmountChanged = body.to_amount !== undefined
  const toAccountChanged = body.to_account_id !== undefined && body.to_account_id !== current.to_account_id

  let to_amount_usd = current.to_amount_usd === null ? null : num(current.to_amount_usd)
  let to_exchange_rate = current.to_exchange_rate === null ? null : num(current.to_exchange_rate)

  if (!conDestino) {
    // Dejó de ser una transferencia entre monedas distintas: no hay destino
    // que congelar, y arrastrar el viejo mentiría sobre el movimiento nuevo.
    to_amount_usd = null
    to_exchange_rate = null
  } else if (toAmountChanged || toAccountChanged || amountChanged || accountChanged || to_amount_usd === null) {
    const { rates } = await ensureRates(supabase, userId)
    const frozenTo = freezeConversion(merged.to_amount!, toAccount!.currency, rates)
    to_amount_usd = frozenTo.amount_usd
    to_exchange_rate = frozenTo.exchange_rate
  }

  // Ahorro: la etiqueta es opcional y explícita, y editar solo la hereda —
  // nunca la impone ni la borra sola. Mandar `savings_goal_id: null` sí la
  // quita: es cómo se "desetiqueta" un movimiento marcado por error.
  let savingsGoalId: string | null = (current.savings_goal_id as string | null) ?? null
  let savingsFlow: string | null = (current.savings_flow as string | null) ?? null
  let savingsReason: string | null = (current.savings_reason as string | null) ?? null

  if (body.savings_goal_id !== undefined) {
    savingsGoalId = typeof body.savings_goal_id === 'string' && body.savings_goal_id ? body.savings_goal_id : null
    if (!savingsGoalId) { savingsFlow = null; savingsReason = null }
  }

  // Ronda 8: por Movimientos un ahorro solo puede SALIR, y editar no puede ser
  // la puerta de atrás. Cargar un retiro (gasto) y después cambiarle el tipo a
  // ingreso lo convertía en un aporte hecho desde acá, que es justo lo que la
  // ronda vino a sacar.
  //
  // Lo que SÍ se sigue pudiendo: editar una transferencia tageada que ya
  // existía —la que creó un fijo, el cierre de mes o un traslado— sin tocarle
  // el tipo. Archivar o cambiar una regla no congela la historia (b08fdb4);
  // lo que no se permite es fabricar historia nueva por el camino equivocado.
  if (savingsGoalId && merged.type !== 'gasto') {
    const yaEraAsi = !!current.savings_goal_id && current.type === merged.type
    if (!yaEraAsi) {
      return NextResponse.json({
        error: merged.type === 'ingreso'
          ? 'Un ingreso no aporta a un ahorro: la plata entra a un ahorro con un fijo de ahorro o en el reparto de fin de mes'
          : 'Una transferencia solo mueve saldo disponible. Para mover un ahorro de cuenta, usá "Mover de cuenta" en Ahorros',
      }, { status: 400 })
    }
  }

  if (savingsGoalId) {
    // Se acepta un ahorro archivado mientras sea el MISMO que ya tenía:
    // archivarlo no puede dejar sus movimientos sin poder editarse nunca más
    // (§ assertSavingsGoal).
    const goalError = await assertSavingsGoal(supabase, scope, savingsGoalId, {
      allowArchived: savingsGoalId === current.savings_goal_id,
    })
    if (goalError) return NextResponse.json({ error: goalError }, { status: 400 })

    // La dirección se declara, nunca se deduce. El tipo la fija en gasto e
    // ingreso; en una transferencia se hereda la que ya tenía o viene en el
    // body, y si no hay ninguna se pide.
    const implicita = savingsFlowForType(merged.type!)
    const enBody = isValidSavingsFlow(body.savings_flow) ? body.savings_flow : null
    savingsFlow = implicita ?? enBody ?? savingsFlow
    if (!savingsFlow) {
      return NextResponse.json({ error: '¿Esta transferencia aporta a un ahorro o retira de él?' }, { status: 400 })
    }

    if (savingsFlow === 'retiro') {
      const crudo = body.savings_reason === undefined ? savingsReason : body.savings_reason
      if (!isValidSavingsReason(crudo)) {
        return NextResponse.json({ error: 'Elige por qué retiras del ahorro' }, { status: 400 })
      }
      savingsReason = crudo
    } else {
      savingsReason = null
    }
  } else {
    savingsFlow = null
    savingsReason = null
  }

  // El saldo se mide recién acá: el tope depende de si la versión NUEVA del
  // movimiento es un retiro declarado (gasta de la alcancía) o un movimiento
  // común (que no puede tocarla). Ver el "piso de ahorro" en `assertBalance`.
  const balanceError = await assertBalance(supabase, scope, account, merged.type!, merged.amount!,
    { type: current.type as TxType, account_id: current.account_id as string, amount: num(current.amount), id },
    savingsFlow,
  )
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const { data, error } = await supabase
    .from('fin_transactions')
    .update({
      type: merged.type,
      flow_type: flowType,
      date: merged.date,
      account_id: merged.account_id,
      to_account_id: merged.to_account_id,
      category_id: merged.category_id,
      amount: merged.amount,
      currency,
      to_amount: merged.to_amount,
      exchange_rate,
      amount_usd,
      to_amount_usd,
      to_exchange_rate,
      description: merged.description,
      savings_goal_id: savingsGoalId,
      savings_flow: savingsFlow,
      savings_reason: savingsReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('profile_id', profileId)
    .select(TX_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const rateChanged = exchange_rate !== num(current.exchange_rate) || currency !== current.currency

  if (rateChanged && existingSplits.length > 0) {
    // El gasto se recongeló con otra tasa. Si las deudas conservaran la vieja,
    // dejarían de sumar al total y "cuánto es realmente mío" quedaría mal.
    for (const d of existingSplits) {
      const { error: reError } = await supabase
        .from('fin_debts')
        .update({ currency, amount_usd: freezeDebtUsd(d.amount, exchange_rate) })
        .eq('profile_id', profileId)
        .eq('id', d.id)
      if (reError) {
        return NextResponse.json(
          {
            error: `El movimiento se guardó, pero no se pudo recongelar la deuda: ${reError.message}`,
            transaction: { ...data, debts: await readDebts(supabase, profileId, id) },
          },
          { status: 409 },
        )
      }
    }
  }

  const budgetExtensionUsd = body.budget_extension_usd == null ? undefined : num(body.budget_extension_usd)
  let budgetExtensionError: string | undefined
  if (merged.type === 'gasto' && budgetExtensionUsd) {
    const result = await applyBudgetExtension(supabase, scope, merged.category_id ?? null, merged.date!, budgetExtensionUsd)
    if (!result.ok) budgetExtensionError = result.error
  }

  const splits = await readDebts(supabase, profileId, id)
  return NextResponse.json({ transaction: { ...data, debts: splits }, budget_extension_error: budgetExtensionError })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const splits = await readDebts(supabase, profileId, id)

  // Un split cobrado cuyo gasto padre desaparece dejaría un ingreso en la
  // cuenta sin nada que lo explique. El `on delete restrict` de la base lo
  // impide igual; acá el mensaje se puede leer.
  const cobrados = splits.filter(s => s.settled_tx_id).length
  if (cobrados > 0) {
    return NextResponse.json(
      { error: `Este gasto tiene ${cobrados} parte(s) ya cobrada(s). Deshaz el cobro antes de borrarlo.` },
      { status: 409 },
    )
  }

  if (splits.length > 0) {
    const { error: splitError } = await supabase
      .from('fin_debts')
      .delete()
      .eq('profile_id', profileId)
      .eq('transaction_id', id)

    if (splitError) return NextResponse.json({ error: splitError.message }, { status: 400 })
  }

  const { data: borradas, error } = await supabase
    .from('fin_transactions')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Sin filas afectadas: el id no es de este perfil (o no existe). Antes
  // esto devolvía 200 y la pantalla decía "borrado" sobre algo que seguía
  // ahí — así se vio el bug de las categorías en un perfil nuevo.
  if ((borradas ?? []).length === 0) {
    return NextResponse.json({ error: 'Ese movimiento no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
