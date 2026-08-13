import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: original } = await supabase
    .from('tj_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!original) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { data: copy, error: sessionError } = await supabase
    .from('tj_sessions')
    .insert({
      user_id: userId,
      type: original.type,
      name: `Copia — ${original.name}`,
      description: original.description,
      instrument: original.instrument,
      capital_initial: original.capital_initial,
      is_archived: false,
      is_favorite: false,
    })
    .select()
    .single()

  if (sessionError || !copy) return NextResponse.json({ error: sessionError?.message ?? 'Error al duplicar' }, { status: 500 })

  // Copy variable definitions
  const { data: varDefs } = await supabase
    .from('tj_variable_definitions')
    .select('*')
    .eq('session_id', id)

  if (varDefs && varDefs.length > 0) {
    const copies = varDefs.map(({ id: _id, created_at: _ca, session_id: _sid, ...rest }) => ({
      ...rest,
      session_id: copy.id,
    }))
    await supabase.from('tj_variable_definitions').insert(copies)
  }

  // Copy trades
  const { data: trades } = await supabase
    .from('tj_trades')
    .select('*')
    .eq('session_id', id)

  if (trades && trades.length > 0) {
    const tradeCopies = trades.map(({
      id: _id, created_at: _ca, session_id: _sid, linked_trade_id: _lt, ...rest
    }) => ({
      ...rest,
      session_id: copy.id,
      linked_trade_id: null,
    }))
    await supabase.from('tj_trades').insert(tradeCopies)
  }

  return NextResponse.json({ session: copy }, { status: 201 })
}
