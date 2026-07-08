import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }

async function getOwnedSession(sessionId: string, userId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tj_sessions')
    .select('id, type, name, instrument, capital_initial, is_read_only')
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

  const admin = createAdminClient()

  // Fan-out all queries in parallel — ownership check included
  const [sessionRes, variablesRes, tradesRes, connectionsRes] = await Promise.all([
    admin
      .from('tj_sessions')
      .select('id, type, name, instrument, capital_initial, is_read_only')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
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
    admin
      .from('tj_session_connections')
      .select('id, journal_id')
      .eq('backtesting_id', id)
      .eq('sync_paused', false),
  ])

  const session = sessionRes.data
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let activeConnections: { id: string; journalId: string; journalName: string }[] = []

  if (session.type === 'backtesting' && connectionsRes.data?.length) {
    const journalIds = connectionsRes.data.map(c => c.journal_id)
    const { data: journals } = await admin
      .from('tj_sessions')
      .select('id, name')
      .in('id', journalIds)

    activeConnections = connectionsRes.data.map(conn => ({
      id: conn.id,
      journalId: conn.journal_id,
      journalName: journals?.find(j => j.id === conn.journal_id)?.name ?? 'Journal',
    }))
  }

  // For mirror (read-only) sessions: fetch trades and variables from all source sessions
  let trades = tradesRes.data ?? []
  let mirrorSourceCount = 0
  let variables = variablesRes.data ?? []

  if (session.is_read_only) {
    const { data: links } = await admin
      .from('tj_merged_sessions')
      .select('source_session_id')
      .eq('merged_session_id', id)

    mirrorSourceCount = links?.length ?? 0

    if (links && links.length > 0) {
      const sourceIds = links.map(l => l.source_session_id)

      const [{ data: sourceTrades }, { data: sourceSessions }, { data: sourceVarDefs }] = await Promise.all([
        admin.from('tj_trades').select('*').in('session_id', sourceIds).order('date_entry', { ascending: false }),
        admin.from('tj_sessions').select('id, name').in('id', sourceIds),
        admin.from('tj_variable_definitions').select('id, key, label, type, options, is_required').in('session_id', sourceIds).eq('is_active', true).order('sort_order', { ascending: true }),
      ])

      const nameMap: Record<string, string> = {}
      for (const s of sourceSessions ?? []) nameMap[s.id] = s.name

      trades = (sourceTrades ?? []).map(t => ({
        ...t,
        source_session_name: nameMap[t.session_id] ?? null,
      }))

      // Union of variable defs from all sources, deduplicated by key
      const seen = new Set<string>()
      variables = (sourceVarDefs ?? []).filter(v => {
        if (seen.has(v.key)) return false
        seen.add(v.key)
        return true
      })
    } else {
      trades = []
      variables = []
    }
  }

  // For journal sessions: resolve source backtesting name for synced trades
  if (session.type === 'journal') {
    const linkedIds = trades.filter(t => t.linked_trade_id).map(t => t.linked_trade_id as string)
    if (linkedIds.length > 0) {
      const [{ data: linkedTrades }, ] = await Promise.all([
        admin.from('tj_trades').select('id, session_id').in('id', linkedIds),
      ])
      const linkedSessionIds = [...new Set((linkedTrades ?? []).map(t => t.session_id))]
      const { data: sourceSessions } = await admin
        .from('tj_sessions').select('id, name').in('id', linkedSessionIds)

      const tradeToSession: Record<string, string> = {}
      for (const lt of linkedTrades ?? []) tradeToSession[lt.id] = lt.session_id
      const sessionNameMap: Record<string, string> = {}
      for (const s of sourceSessions ?? []) sessionNameMap[s.id] = s.name

      trades = trades.map(t => ({
        ...t,
        source_session_name: t.linked_trade_id
          ? (sessionNameMap[tradeToSession[t.linked_trade_id]] ?? null)
          : null,
      }))
    }
  }

  // Always deduplicate variables by key before returning
  const seenKeys = new Set<string>()
  const uniqueVariables = variables.filter(v => {
    if (seenKeys.has(v.key)) return false
    seenKeys.add(v.key)
    return true
  })

  return NextResponse.json({
    session,
    variables: uniqueVariables,
    trades,
    activeConnections,
    mirrorSourceCount,
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await getOwnedSession(id, user.id)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.is_read_only) return NextResponse.json({ error: 'Sesión de solo lectura' }, { status: 403 })

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
