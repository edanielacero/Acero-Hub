import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ tradeId: string }> }

async function getOwnedTrade(tradeId: string, userId: string) {
  const admin = createAdminClient()

  const { data: trade } = await admin
    .from('tj_trades')
    .select('*')
    .eq('id', tradeId)
    .single()

  if (!trade) return null

  const { data: session } = await admin
    .from('tj_sessions')
    .select('id, user_id, type')
    .eq('id', trade.session_id)
    .single()

  if (session?.user_id !== userId) return null

  return { trade, sessionType: session?.type ?? null }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { tradeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await getOwnedTrade(tradeId, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

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

  const admin = createAdminClient()
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

  const owned = await getOwnedTrade(tradeId, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('tj_trades')
    .delete()
    .eq('id', tradeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
