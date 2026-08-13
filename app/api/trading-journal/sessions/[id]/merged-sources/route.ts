import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }

async function verifyMirror(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], sessionId: string, userId: string) {
  const { data } = await supabase
    .from('tj_sessions')
    .select('id, is_read_only')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: links } = await supabase
    .from('tj_merged_sessions')
    .select('source_session_id')
    .eq('merged_session_id', id)

  if (!links?.length) return NextResponse.json({ sources: [] })

  const sourceIds = links.map(l => l.source_session_id)

  // Get source session details + trade count
  const [{ data: sessions }, { data: trades }] = await Promise.all([
    supabase.from('tj_sessions').select('id, name, type').in('id', sourceIds),
    supabase.from('tj_trades').select('session_id').in('session_id', sourceIds),
  ])

  const countMap: Record<string, number> = {}
  for (const t of trades ?? []) countMap[t.session_id] = (countMap[t.session_id] ?? 0) + 1

  const sources = (sessions ?? []).map(s => ({
    id:          s.id,
    name:        s.name,
    type:        s.type,
    trade_count: countMap[s.id] ?? 0,
  }))

  // Get available backtesting sessions not yet in sources and owned by user
  const { data: allBt } = await supabase
    .from('tj_sessions')
    .select('id, name')
    .eq('user_id', userId)
    .eq('type', 'backtesting')
    .eq('is_read_only', false)
    .not('id', 'in', `(${[id, ...sourceIds].join(',')})`)

  return NextResponse.json({ sources, available: allBt ?? [] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const session = await verifyMirror(supabase, id, userId)
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!session.is_read_only) return NextResponse.json({ error: 'Solo espejos pueden tener fuentes' }, { status: 400 })

  const { sourceSessionId } = await req.json()
  if (!sourceSessionId) return NextResponse.json({ error: 'sourceSessionId requerido' }, { status: 400 })

  // Verify source belongs to user
  const { data: src } = await supabase
    .from('tj_sessions')
    .select('id')
    .eq('id', sourceSessionId)
    .eq('user_id', userId)
    .single()
  if (!src) return NextResponse.json({ error: 'Sesión fuente no encontrada' }, { status: 404 })

  const { error } = await supabase.from('tj_merged_sessions').insert({
    merged_session_id: id,
    source_session_id: sourceSessionId,
  })

  if (error?.code === '23505') return NextResponse.json({ error: 'Ya es una fuente de este espejo' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const session = await verifyMirror(supabase, id, userId)
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { sourceSessionId } = await req.json()
  if (!sourceSessionId) return NextResponse.json({ error: 'sourceSessionId requerido' }, { status: 400 })

  await supabase
    .from('tj_merged_sessions')
    .delete()
    .eq('merged_session_id', id)
    .eq('source_session_id', sourceSessionId)

  return NextResponse.json({ success: true })
}
