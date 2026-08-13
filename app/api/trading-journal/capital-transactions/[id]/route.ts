import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { buildCapitalTimeline, type CapitalTrade, type CapitalTransaction } from '@/lib/trading/capital'

interface Params { params: Promise<{ id: string }> }

type QueryClient = Awaited<ReturnType<typeof requireUser>>['supabase']

// Single JOIN query — avoids 2 serial round-trips for ownership check
async function getOwnedTransaction(id: string, userId: string, supabase: QueryClient) {
  const { data } = await supabase
    .from('tj_capital_transactions')
    .select('id, session_id, type, amount, date, tj_sessions!inner(user_id, capital_initial)')
    .eq('id', id)
    .single()

  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = (data as any).tj_sessions as { user_id: string; capital_initial: number | null }
  if (sess.user_id !== userId) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { tj_sessions: _, ...transaction } = data as any
  return { transaction, capitalInitial: sess.capital_initial ?? 0 }
}

// Recalcula el historial completo con la nueva fecha/monto ya aplicados —
// mismo chequeo que al borrar: ningún punto puede quedar en negativo.
async function wouldGoNegative(
  supabase: QueryClient, sessionId: string, capitalInitial: number,
  txId: string, newAmount: number, newDate: string,
): Promise<boolean> {
  const [{ data: trades }, { data: transactions }] = await Promise.all([
    supabase
      .from('tj_trades')
      .select('id, date_entry, custom_fields, created_at, pnl_usd')
      .eq('session_id', sessionId),
    supabase
      .from('tj_capital_transactions')
      .select('id, type, amount, date, created_at')
      .eq('session_id', sessionId),
  ])

  // compareTradesChrono ordena por string — un "YYYY-MM-DD" (10 chars) siempre
  // ordena antes que el timestamp completo con el que quedará en la base una vez
  // guardado (ej. "...T00:00:00+00:00"), colándose artificialmente antes que
  // otros movimientos del mismo día. Se normaliza para comparar en igualdad de condiciones.
  // Asume timezone UTC en la sesión de Postgres (default de Supabase) — si cambiara,
  // esta reconstrucción dejaría de coincidir byte a byte con lo que Postgres guarda.
  const chronoDate = newDate.length === 10 ? `${newDate}T00:00:00+00:00` : newDate

  const updatedTransactions = (transactions ?? []).map(t =>
    t.id === txId ? { ...t, amount: newAmount, date: chronoDate } : t
  )

  const timeline = buildCapitalTimeline(
    capitalInitial,
    (trades ?? []) as CapitalTrade[],
    updatedTransactions as CapitalTransaction[],
  )
  return timeline.some(p => p.capitalAfter < 0)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [owned, body] = await Promise.all([
    getOwnedTransaction(id, userId, supabase),
    req.json(),
  ])
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { amount, date, note } = body
  const updates: Record<string, unknown> = {}
  let newAmount = owned.transaction.amount
  let newDate   = owned.transaction.date

  if (amount !== undefined) {
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }
    newAmount = amountNum
    updates.amount = amountNum
  }

  if (date !== undefined) {
    // Exige prefijo ISO YYYY-MM-DD — ver nota en el POST de creación.
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
      return NextResponse.json({ error: 'La fecha es requerida en formato YYYY-MM-DD' }, { status: 400 })
    }
    if (Number.isNaN(Date.parse(date))) {
      return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })
    }
    newDate = date
    updates.date = date
  }

  if (note !== undefined) {
    updates.note = note || null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  if (amount !== undefined || date !== undefined) {
    const negative = await wouldGoNegative(
      supabase, owned.transaction.session_id, owned.capitalInitial, id, newAmount, newDate,
    )
    if (negative) {
      return NextResponse.json(
        { error: 'Este cambio dejaría el capital en negativo en algún punto del historial' },
        { status: 400 },
      )
    }
  }

  const { data: transaction, error } = await supabase
    .from('tj_capital_transactions')
    .update(updates)
    .eq('id', id)
    .eq('session_id', owned.transaction.session_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transaction })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await getOwnedTransaction(id, userId, supabase)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Recalcular el historial sin este movimiento — si algún punto queda en negativo,
  // borrarlo dejaría un retiro posterior sin respaldo (ej. borrar un depósito del que
  // dependía un retiro ya registrado).
  const [{ data: trades }, { data: transactions }] = await Promise.all([
    supabase
      .from('tj_trades')
      .select('id, date_entry, custom_fields, created_at, pnl_usd')
      .eq('session_id', owned.transaction.session_id),
    supabase
      .from('tj_capital_transactions')
      .select('id, type, amount, date, created_at')
      .eq('session_id', owned.transaction.session_id)
      .neq('id', id),
  ])

  const timelineWithout = buildCapitalTimeline(
    owned.capitalInitial,
    (trades ?? []) as CapitalTrade[],
    (transactions ?? []) as CapitalTransaction[],
  )
  if (timelineWithout.some(p => p.capitalAfter < 0)) {
    return NextResponse.json(
      { error: 'No se puede borrar: dejaría el capital en negativo en algún punto del historial' },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('tj_capital_transactions')
    .delete()
    .eq('id', id)
    .eq('session_id', owned.transaction.session_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
