import { requireUser, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { readQuotes, refreshQuotes, quotesAreStale } from '@/lib/finanzas/quotes'
import { loadAccounts } from '@/lib/finanzas/load'
import { num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // El patrimonio se valúa a la cotización de hoy, así que si está vencida se
  // refresca antes de calcular. Refrescar es idempotente: si otra request ya lo
  // hizo, esta encuentra todo fresco y sigue de largo.
  //
  // Esta ruta sí espera el refresco, a diferencia de /bootstrap: la usa Ajustes,
  // donde el punto es justamente ver la cotización al día.
  let quotes = await readQuotes(supabase)
  if (quotesAreStale(quotes)) {
    quotes = await refreshQuotes(createAdminClient())
  }

  return NextResponse.json(await loadAccounts(supabase, userId, quotes))
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
