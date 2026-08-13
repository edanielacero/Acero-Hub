import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import type { AccountType, Currency } from '@/lib/finanzas/accounts'

interface Params { params: Promise<{ id: string }> }

const VALID_TYPES: AccountType[] = ['efectivo', 'cuenta_bancaria', 'ahorro', 'inversion', 'cripto', 'trading', 'otro']
const VALID_CURRENCIES: Currency[] = ['USD', 'BOB']

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }
    update.name = body.name.trim()
  }
  if ('type' in body) {
    if (!VALID_TYPES.includes(body.type)) return NextResponse.json({ error: 'Tipo de cuenta inválido' }, { status: 400 })
    update.type = body.type
  }
  if ('currency' in body) {
    if (!VALID_CURRENCIES.includes(body.currency)) return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
    update.currency = body.currency
  }
  if ('initial_balance' in body) {
    const balanceNum = Number(body.initial_balance)
    if (!Number.isFinite(balanceNum)) return NextResponse.json({ error: 'El saldo inicial debe ser un número' }, { status: 400 })
    update.initial_balance = balanceNum
  }
  if ('initial_balance_date' in body) {
    const date = body.initial_balance_date
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date))) {
      return NextResponse.json({ error: 'Fecha de saldo inicial inválida' }, { status: 400 })
    }
    update.initial_balance_date = date
  }
  if ('archived' in body) {
    update.archived = !!body.archived
  }
  update.updated_at = new Date().toISOString()

  const { data: account, error } = await supabase
    .from('fin_accounts')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ account })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('fin_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
