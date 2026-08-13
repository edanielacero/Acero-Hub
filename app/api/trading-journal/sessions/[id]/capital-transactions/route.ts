import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { getCapitalUpTo, type CapitalTrade, type CapitalTransaction } from '@/lib/trading/capital'

interface Params { params: Promise<{ id: string }> }

async function getOwnedSession(sessionId: string, userId: string, supabase: Awaited<ReturnType<typeof requireUser>>['supabase']) {
  const { data } = await supabase
    .from('tj_sessions')
    .select('id, type, capital_initial, is_read_only')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [session, body] = await Promise.all([
    getOwnedSession(id, userId, supabase),
    req.json(),
  ])
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.is_read_only) return NextResponse.json({ error: 'Sesión de solo lectura' }, { status: 403 })
  if (session.type !== 'journal') {
    return NextResponse.json({ error: 'Solo los journals admiten depósitos y retiros' }, { status: 400 })
  }

  const { type, amount, date, note } = body

  if (type !== 'deposit' && type !== 'withdrawal') {
    return NextResponse.json({ error: 'Tipo de movimiento inválido' }, { status: 400 })
  }
  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
  }
  // Exige prefijo ISO YYYY-MM-DD: getCapitalUpTo compara fechas con slice(0, 10),
  // así que un formato distinto (ej. "07/24/2026") daría un resultado incorrecto ahí.
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
    return NextResponse.json({ error: 'La fecha es requerida en formato YYYY-MM-DD' }, { status: 400 })
  }
  if (Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })
  }

  if (type === 'withdrawal') {
    const [{ data: trades }, { data: transactions }] = await Promise.all([
      supabase
        .from('tj_trades')
        .select('id, date_entry, custom_fields, created_at, pnl_usd')
        .eq('session_id', id),
      supabase
        .from('tj_capital_transactions')
        .select('id, type, amount, date, created_at')
        .eq('session_id', id),
    ])

    const capitalAtDate = getCapitalUpTo(
      session.capital_initial ?? 0,
      (trades ?? []) as CapitalTrade[],
      (transactions ?? []) as CapitalTransaction[],
      date,
    )

    if (amountNum > capitalAtDate) {
      return NextResponse.json(
        { error: `El retiro excede el capital disponible a esa fecha ($${capitalAtDate.toFixed(2)})` },
        { status: 400 },
      )
    }
  }

  const { data: transaction, error } = await supabase
    .from('tj_capital_transactions')
    .insert({ session_id: id, type, amount: amountNum, date, note: note || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transaction }, { status: 201 })
}
