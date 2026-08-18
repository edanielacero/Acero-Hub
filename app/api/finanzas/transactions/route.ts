import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureSettings } from '@/lib/finanzas/settings'
import { num, round2 } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, validateInput } from '@/lib/finanzas/transactions'
import type { Account, TransactionInput } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const type = url.searchParams.get('type')
  const accountId = url.searchParams.get('account_id')
  const categoryId = url.searchParams.get('category_id')
  const limit = Math.min(num(url.searchParams.get('limit'), 200), 500)
  const offset = num(url.searchParams.get('offset'), 0)

  let query = supabase
    .from('fin_transactions')
    .select(TX_COLS)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  if (type) query = query.eq('type', type)
  if (categoryId) query = query.eq('category_id', categoryId)
  // Una cuenta aparece como origen o como destino de una transferencia.
  if (accountId) query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const transactions = (data ?? []).map(t => ({
    ...t,
    amount: num(t.amount),
    to_amount: t.to_amount === null ? null : num(t.to_amount),
    exchange_rate: num(t.exchange_rate),
    amount_usd: num(t.amount_usd),
  }))

  return NextResponse.json({
    transactions,
    total_gasto_usd: round2(
      transactions.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount_usd, 0),
    ),
    total_ingreso_usd: round2(
      transactions.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount_usd, 0),
    ),
  })
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
  }

  const { data: accountRows } = await supabase
    .from('fin_accounts')
    .select(ACCOUNT_COLS)
    .eq('user_id', userId)

  const accountsById = new Map<string, Account>(
    (accountRows ?? []).map(r => {
      const a = mapAccount(r)
      return [a.id, a]
    }),
  )

  const check = validateInput(input, accountsById)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  // La moneda sale de la cuenta, nunca del cliente.
  const currency = accountsById.get(input.account_id!)!.currency
  const settings = await ensureSettings(supabase, userId)
  const frozen = freezeConversion(input.amount!, currency, settings.usd_bob_rate)

  const { data, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type: input.type,
      date: input.date,
      account_id: input.account_id,
      to_account_id: input.type === 'transferencia' ? input.to_account_id : null,
      category_id: input.type === 'transferencia' ? null : input.category_id,
      amount: input.amount,
      currency,
      to_amount: input.type === 'transferencia' ? input.to_amount : null,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      description: input.description,
    })
    .select(TX_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ transaction: data }, { status: 201 })
}
