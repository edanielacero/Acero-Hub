import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }

async function getOwnedSession(sessionId: string, userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tj_sessions')
    .select('id, type, name, instrument, capital_initial')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await getOwnedSession(id, user.id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()

  const [variablesRes, tradesRes] = await Promise.all([
    admin
      .from('tj_variable_definitions')
      .select('id, key, label, type, options, is_required')
      .eq('session_id', id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    admin
      .from('tj_trades')
      .select('*')
      .eq('session_id', id)
      .order('date_entry', { ascending: false }),
  ])

  let activeConnections: { id: string; journalId: string; journalName: string }[] = []

  if (session.type === 'backtesting') {
    const { data: connections } = await admin
      .from('tj_session_connections')
      .select('id, journal_id')
      .eq('backtesting_id', id)
      .eq('sync_paused', false)

    if (connections?.length) {
      const journalIds = connections.map(c => c.journal_id)
      const { data: journals } = await admin
        .from('tj_sessions')
        .select('id, name')
        .in('id', journalIds)

      activeConnections = connections.map(conn => ({
        id: conn.id,
        journalId: conn.journal_id,
        journalName: journals?.find(j => j.id === conn.journal_id)?.name ?? 'Journal',
      }))
    }
  }

  return NextResponse.json({
    session,
    variables: variablesRes.data ?? [],
    trades: tradesRes.data ?? [],
    activeConnections,
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await getOwnedSession(id, user.id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const {
    date_entry, date_exit, instrument, direction, result,
    rr_target, rr_max, rr_exit, be_moved, notes,
    risk_percent, pnl_usd, capital_start, capital_end,
    custom_fields,
  } = body

  if (!date_entry) {
    return NextResponse.json({ error: 'date_entry requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const payload = {
    session_id: id,
    date_entry,
    date_exit: date_exit ?? null,
    instrument: instrument || session.instrument || null,
    direction: direction ?? null,
    result: result ?? null,
    rr_target: rr_target ?? null,
    rr_max: rr_max ?? null,
    rr_exit: rr_exit ?? null,
    be_moved: be_moved ?? false,
    notes: notes || null,
    risk_percent: risk_percent ?? null,
    pnl_usd: pnl_usd ?? null,
    capital_start: capital_start ?? null,
    capital_end: capital_end ?? null,
    custom_fields: custom_fields ?? {},
  }

  const { data: trade, error } = await admin
    .from('tj_trades')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const synced: { journalId: string; journalName: string; tradeId: string }[] = []

  if (session.type === 'backtesting') {
    const { data: connections } = await admin
      .from('tj_session_connections')
      .select('id, journal_id')
      .eq('backtesting_id', id)
      .eq('sync_paused', false)

    if (connections?.length) {
      const journalIds = connections.map(c => c.journal_id)
      const { data: journals } = await admin
        .from('tj_sessions')
        .select('id, name')
        .in('id', journalIds)

      for (const conn of connections) {
        const journalName = journals?.find(j => j.id === conn.journal_id)?.name ?? 'Journal'

        const { data: copy } = await admin
          .from('tj_trades')
          .insert({
            ...payload,
            session_id: conn.journal_id,
            linked_trade_id: trade.id,
            risk_percent: null,
            pnl_usd: null,
            capital_start: null,
            capital_end: null,
          })
          .select('id')
          .single()

        if (copy) {
          synced.push({ journalId: conn.journal_id, journalName, tradeId: copy.id })
        }
      }
    }
  }

  return NextResponse.json({ trade, synced }, { status: 201 })
}
