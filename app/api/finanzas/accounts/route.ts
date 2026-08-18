import { requireUser, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { readQuotes, refreshQuotes, quotesAreStale } from '@/lib/finanzas/quotes'
import { num } from '@/lib/finanzas/money'
import { mapAccount, mapBalanceMovement, totalUsd, withBalances } from '@/lib/finanzas/accounts'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // El patrimonio se valúa a la cotización de hoy, así que si está vencida se
  // refresca antes de calcular. Refrescar es idempotente: si otra request ya lo
  // hizo, esta encuentra todo fresco y sigue de largo.
  let quotes = await readQuotes(supabase)
  if (quotesAreStale(quotes)) {
    quotes = await refreshQuotes(createAdminClient())
  }

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

  return NextResponse.json({
    accounts: withBal,
    total_usd: totalUsd(withBal),
    rates,
    rate_list: rateRows,
  })
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const currency = body?.currency as Currency

  if (!name) return NextResponse.json({ error: 'La cuenta necesita un nombre' }, { status: 400 })
  if (!CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('fin_accounts')
    .insert({
      user_id: userId,
      name,
      currency,
      initial_balance: num(body?.initial_balance),
      initial_balance_date: body?.initial_balance_date ?? new Date().toISOString().slice(0, 10),
      sort_order: num(body?.sort_order),
    })
    .select(ACCOUNT_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ account: mapAccount(data) }, { status: 201 })
}
