import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureSettings } from '@/lib/finanzas/settings'
import { num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, validateInput } from '@/lib/finanzas/transactions'
import type { Account, TransactionInput } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const [{ data: current }, { data: accountRows }] = await Promise.all([
    supabase
      .from('fin_transactions')
      .select(TX_COLS)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('user_id', userId),
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

  const currency = accountsById.get(merged.account_id!)!.currency

  // La tasa se recongela solo si cambió algo que la involucra: el monto, la
  // cuenta (y con ella la moneda), o una tasa enviada explícitamente desde el
  // formulario. Editar solo la descripción no toca la conversión histórica.
  const rateExplicit = body.exchange_rate !== undefined
  const amountChanged = body.amount !== undefined && num(body.amount) !== num(current.amount)
  const accountChanged = body.account_id !== undefined && body.account_id !== current.account_id

  let exchange_rate = num(current.exchange_rate)
  let amount_usd = num(current.amount_usd)

  if (rateExplicit || amountChanged || accountChanged) {
    const rate = rateExplicit ? num(body.exchange_rate, NaN) : (await ensureSettings(supabase, userId)).usd_bob_rate
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: 'La tasa debe ser mayor a cero' }, { status: 400 })
    }
    const frozen = freezeConversion(merged.amount!, currency, rate)
    exchange_rate = frozen.exchange_rate
    amount_usd = frozen.amount_usd
  }

  const { data, error } = await supabase
    .from('fin_transactions')
    .update({
      type: merged.type,
      date: merged.date,
      account_id: merged.account_id,
      to_account_id: merged.to_account_id,
      category_id: merged.category_id,
      amount: merged.amount,
      currency,
      to_amount: merged.to_amount,
      exchange_rate,
      amount_usd,
      description: merged.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select(TX_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ transaction: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase
    .from('fin_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
