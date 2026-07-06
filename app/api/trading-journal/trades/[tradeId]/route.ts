import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ tradeId: string }> }

type AdminClient = ReturnType<typeof createAdminClient>

// Single JOIN query — avoids 2 serial round-trips for ownership check
async function getOwnedTrade(tradeId: string, userId: string, admin: AdminClient) {
  const { data } = await admin
    .from('tj_trades')
    .select('*, tj_sessions!inner(user_id, type)')
    .eq('id', tradeId)
    .single()

  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = (data as any).tj_sessions as { user_id: string; type: string }
  if (sess.user_id !== userId) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { tj_sessions: _, ...trade } = data as any
  return { trade, sessionType: sess.type }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { tradeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const [owned, body] = await Promise.all([
    getOwnedTrade(tradeId, user.id, admin),
    req.json(),
  ])
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowed = [
    'date_entry', 'date_exit', 'instrument', 'direction', 'result',
    'rr_target', 'rr_max', 'rr_exit', 'be_moved', 'notes',
    'risk_percent', 'pnl_usd', 'capital_start', 'capital_end',
    'custom_fields',
  ]

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data: trade, error } = await admin
    .from('tj_trades')
    .update(updates)
    .eq('id', tradeId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ trade })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { tradeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const owned = await getOwnedTrade(tradeId, user.id, admin)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await admin
    .from('tj_trades')
    .delete()
    .eq('id', tradeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
