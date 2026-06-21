import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { PRESET_VARIABLES } from '@/lib/trading/presets'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: sessions } = await admin
    .from('tj_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const sessionIds = (sessions ?? []).map(s => s.id)

  if (sessionIds.length === 0) {
    return NextResponse.json({ sessions: [] })
  }

  const [{ data: connections }, { data: trades }] = await Promise.all([
    admin
      .from('tj_session_connections')
      .select('id, backtesting_id, journal_id, sync_paused')
      .or(`backtesting_id.in.(${sessionIds.join(',')}),journal_id.in.(${sessionIds.join(',')})`),
    admin
      .from('tj_trades')
      .select('session_id')
      .in('session_id', sessionIds),
  ])

  const countMap: Record<string, number> = {}
  for (const t of trades ?? []) {
    countMap[t.session_id] = (countMap[t.session_id] ?? 0) + 1
  }

  // Enrich sessions with connections and trade count
  const relevantConnections = (connections ?? []).filter(
    c => sessionIds.includes(c.backtesting_id) || sessionIds.includes(c.journal_id)
  )

  // Get names of connected sessions (may belong to the same user)
  const connectedIds = [
    ...relevantConnections.map(c => c.backtesting_id),
    ...relevantConnections.map(c => c.journal_id),
  ].filter(id => !sessionIds.includes(id))

  let otherSessions: { id: string; name: string; type: string }[] = []
  if (connectedIds.length > 0) {
    const { data: other } = await admin
      .from('tj_sessions')
      .select('id, name, type')
      .in('id', connectedIds)
    otherSessions = other ?? []
  }

  const allSessionsMap = new Map([
    ...(sessions ?? []).map(s => [s.id, s] as [string, typeof s]),
    ...otherSessions.map(s => [s.id, s] as [string, typeof s]),
  ])

  const enriched = (sessions ?? []).map(s => ({
    ...s,
    trade_count: countMap[s.id] ?? 0,
    connections: relevantConnections
      .filter(c => c.backtesting_id === s.id || c.journal_id === s.id)
      .map(c => {
        const otherId = c.backtesting_id === s.id ? c.journal_id : c.backtesting_id
        const other = allSessionsMap.get(otherId)
        return {
          id: c.id,
          backtesting_id: c.backtesting_id,
          journal_id: c.journal_id,
          sync_paused: c.sync_paused,
          other_session: other ? { id: other.id, name: other.name, type: other.type } : null,
        }
      }),
  }))

  return NextResponse.json({ sessions: enriched })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { name, type, description, instrument, capital_initial, preset_keys } = body

  if (!name?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  if (!['backtesting', 'journal'].includes(type)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  const admin = createAdminClient()

  const { data: session, error } = await admin
    .from('tj_sessions')
    .insert({
      user_id: user.id,
      name: name.trim(),
      type,
      description: description?.trim() || null,
      instrument: instrument?.trim() || null,
      capital_initial: type === 'journal' ? (capital_initial ?? null) : null,
    })
    .select()
    .single()

  if (error || !session) return NextResponse.json({ error: error?.message ?? 'Error al crear sesión' }, { status: 500 })

  // Insert selected preset variable definitions
  if (Array.isArray(preset_keys) && preset_keys.length > 0) {
    const presetDefs = PRESET_VARIABLES
      .filter(p => preset_keys.includes(p.key))
      .map(p => ({
        session_id: session.id,
        key: p.key,
        label: p.label,
        type: p.type,
        options: p.options ? p.options : null,
        is_preset: true,
        sort_order: p.defaultSortOrder,
      }))

    if (presetDefs.length > 0) {
      await admin.from('tj_variable_definitions').insert(presetDefs)
    }
  }

  return NextResponse.json({ session }, { status: 201 })
}
