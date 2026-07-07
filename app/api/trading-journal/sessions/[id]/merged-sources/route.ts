import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }

async function verifyMirror(sessionId: string, userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tj_sessions')
    .select('id, is_read_only')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: links } = await admin
    .from('tj_merged_sessions')
    .select('source_session_id')
    .eq('merged_session_id', id)

  if (!links?.length) return NextResponse.json({ sources: [] })

  const sourceIds = links.map(l => l.source_session_id)

  // Get source session details + trade count
  const [{ data: sessions }, { data: trades }] = await Promise.all([
    admin.from('tj_sessions').select('id, name, type').in('id', sourceIds),
    admin.from('tj_trades').select('session_id').in('session_id', sourceIds),
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
  const { data: allBt } = await admin
    .from('tj_sessions')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('type', 'backtesting')
    .eq('is_read_only', false)
    .not('id', 'in', `(${[id, ...sourceIds].join(',')})`)

  return NextResponse.json({ sources, available: allBt ?? [] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const session = await verifyMirror(id, user.id)
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!session.is_read_only) return NextResponse.json({ error: 'Solo espejos pueden tener fuentes' }, { status: 400 })

  const { sourceSessionId } = await req.json()
  if (!sourceSessionId) return NextResponse.json({ error: 'sourceSessionId requerido' }, { status: 400 })

  const admin = createAdminClient()

  // Verify source belongs to user
  const { data: src } = await admin
    .from('tj_sessions')
    .select('id')
    .eq('id', sourceSessionId)
    .eq('user_id', user.id)
    .single()
  if (!src) return NextResponse.json({ error: 'Sesión fuente no encontrada' }, { status: 404 })

  const { error } = await admin.from('tj_merged_sessions').insert({
    merged_session_id: id,
    source_session_id: sourceSessionId,
  })

  if (error?.code === '23505') return NextResponse.json({ error: 'Ya es una fuente de este espejo' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const session = await verifyMirror(id, user.id)
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { sourceSessionId } = await req.json()
  if (!sourceSessionId) return NextResponse.json({ error: 'sourceSessionId requerido' }, { status: 400 })

  const admin = createAdminClient()
  await admin
    .from('tj_merged_sessions')
    .delete()
    .eq('merged_session_id', id)
    .eq('source_session_id', sourceSessionId)

  return NextResponse.json({ success: true })
}
