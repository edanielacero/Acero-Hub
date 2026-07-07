import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { name, sourceSessionIds, mode } = await req.json() as {
    name: string
    sourceSessionIds: string[]
    mode: 'copy' | 'mirror'
  }

  if (!name?.trim() || !sourceSessionIds?.length || !['copy', 'mirror'].includes(mode)) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  // Validate all source sessions belong to user and are backtesting type
  const { data: sources } = await admin
    .from('tj_sessions')
    .select('id, type, name, is_read_only')
    .in('id', sourceSessionIds)
    .eq('user_id', user.id)

  if (!sources || sources.length !== sourceSessionIds.length) {
    return NextResponse.json({ error: 'Una o más sesiones no encontradas' }, { status: 404 })
  }
  if (sources.some(s => s.type !== 'backtesting')) {
    return NextResponse.json({ error: 'Solo se pueden fusionar sesiones de backtesting' }, { status: 400 })
  }

  if (mode === 'mirror') {
    // Create a read-only mirror session
    const { data: merged, error } = await admin
      .from('tj_sessions')
      .insert({
        user_id:      user.id,
        type:         'backtesting',
        name:         name.trim(),
        is_read_only: true,
        is_archived:  false,
        is_favorite:  false,
      })
      .select()
      .single()

    if (error || !merged) return NextResponse.json({ error: 'Error al crear espejo' }, { status: 500 })

    await admin.from('tj_merged_sessions').insert(
      sourceSessionIds.map(sid => ({ merged_session_id: merged.id, source_session_id: sid }))
    )

    return NextResponse.json({ session: merged }, { status: 201 })
  }

  // mode === 'copy': create an editable copy with all trades merged
  const { data: merged, error: sessionErr } = await admin
    .from('tj_sessions')
    .insert({
      user_id:      user.id,
      type:         'backtesting',
      name:         name.trim(),
      is_read_only: false,
      is_archived:  false,
      is_favorite:  false,
    })
    .select()
    .single()

  if (sessionErr || !merged) return NextResponse.json({ error: 'Error al crear sesión' }, { status: 500 })

  // Union of variable definitions (deduplicate by key)
  const { data: allVarDefs } = await admin
    .from('tj_variable_definitions')
    .select('*')
    .in('session_id', sourceSessionIds)

  if (allVarDefs && allVarDefs.length > 0) {
    const seen = new Set<string>()
    const uniqueVars = allVarDefs
      .filter(v => { if (seen.has(v.key)) return false; seen.add(v.key); return true })
      .map(({ id: _id, created_at: _ca, session_id: _sid, ...rest }) => ({
        ...rest,
        session_id: merged.id,
      }))
    if (uniqueVars.length > 0) await admin.from('tj_variable_definitions').insert(uniqueVars)
  }

  // Copy all trades from all sources
  const { data: allTrades } = await admin
    .from('tj_trades')
    .select('*')
    .in('session_id', sourceSessionIds)

  if (allTrades && allTrades.length > 0) {
    const tradeCopies = allTrades.map(({
      id: _id, created_at: _ca, session_id: _sid, linked_trade_id: _lt, ...rest
    }) => ({ ...rest, session_id: merged.id, linked_trade_id: null }))
    await admin.from('tj_trades').insert(tradeCopies)
  }

  return NextResponse.json({ session: merged }, { status: 201 })
}
