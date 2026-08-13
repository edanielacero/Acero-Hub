import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import type { AccountType, Currency } from '@/lib/finanzas/accounts'

const VALID_TYPES: AccountType[] = ['efectivo', 'cuenta_bancaria', 'ahorro', 'inversion', 'cripto', 'trading', 'otro']
const VALID_CURRENCIES: Currency[] = ['USD', 'BOB']

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: accounts, error } = await supabase
    .from('fin_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, type, currency, initial_balance, initial_balance_date } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Tipo de cuenta inválido' }, { status: 400 })
  }
  if (!VALID_CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
  }
  const balanceNum = Number(initial_balance)
  if (!Number.isFinite(balanceNum)) {
    return NextResponse.json({ error: 'El saldo inicial debe ser un número' }, { status: 400 })
  }
  const date = typeof initial_balance_date === 'string' && initial_balance_date ? initial_balance_date : new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: 'Fecha de saldo inicial inválida' }, { status: 400 })
  }

  const { data: account, error } = await supabase
    .from('fin_accounts')
    .insert({
      user_id: userId,
      name: name.trim(),
      type,
      currency,
      initial_balance: balanceNum,
      initial_balance_date: date,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account }, { status: 201 })
}
