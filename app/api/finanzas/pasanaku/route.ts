import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { loadPasanaku } from '@/lib/finanzas/load'
import { validatePasanaku } from '@/lib/finanzas/pasanaku'
import type { PasanakuInput } from '@/lib/finanzas/types'

const PASANAKU_COLS =
  'id, name, account_id, currency, contribution_amount, total_slots, my_slot, start_date, archived'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({ pasanaku: await loadPasanaku(supabase, userId) })
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Sin cuenta: se elige al aportar o recibir, igual que un fijo (§
  // RegisterSheet). Lo que sí hace falta al crear es la moneda.
  const input: Partial<PasanakuInput> = {
    name: typeof body.name === 'string' ? body.name.trim() || 'Pasanaku' : 'Pasanaku',
    account_id: typeof body.account_id === 'string' && body.account_id ? body.account_id : null,
    currency: body.currency,
    contribution_amount: num(body.contribution_amount, NaN),
    total_slots: num(body.total_slots, NaN),
    my_slot: num(body.my_slot, NaN),
    start_date: typeof body.start_date === 'string' ? body.start_date : '',
  }

  const invalid = validatePasanaku(input)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  if (input.account_id) {
    const { data: account } = await supabase
      .from('fin_accounts').select('id, is_investment').eq('user_id', userId).eq('id', input.account_id).maybeSingle()
    if (!account) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })
    // Un aporte/recepción de pasanaku es 'gasto/ingreso · movimiento', igual
    // que un ajuste de valor de inversión — isInvestmentAdjustment() no podría
    // distinguirlos, así que el aporte desaparecería de Movimientos y se
    // saltaría el tope de saldo (ver assertBalance). La UI ya no ofrece estas
    // cuentas; esto es la defensa del lado del server.
    if (account.is_investment) {
      return NextResponse.json({ error: 'No podés usar una cuenta de inversión para un pasanaku' }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from('fin_pasanaku')
    .insert({ user_id: userId, ...input })
    .select(PASANAKU_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ pasanaku: data }, { status: 201 })
}
