import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('tj_sessions')
    .select('id, type')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const field = session.type === 'backtesting' ? 'backtesting_id' : 'journal_id'
  const otherField = session.type === 'backtesting' ? 'journal_id' : 'backtesting_id'
  const otherType = session.type === 'backtesting' ? 'journal' : 'backtesting'

  const { data: connections } = await admin
    .from('tj_session_connections')
    .select('id, backtesting_id, journal_id, sync_paused')
    .eq(field, id)

  const otherIds = (connections ?? []).map(c => c[otherField as keyof typeof c] as string)
  const { data: otherSessions } = otherIds.length > 0
    ? await admin.from('tj_sessions').select('id, name, type').in('id', otherIds)
    : { data: [] }

  // Available sessions to connect (same user, correct type, not already connected)
  let availableQuery = admin
    .from('tj_sessions')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('type', otherType)
    .eq('is_archived', false)
  if (otherIds.length > 0) {
    availableQuery = availableQuery.not('id', 'in', `(${otherIds.join(',')})`)
  }
  const { data: available } = await availableQuery

  const enriched = (connections ?? []).map(c => ({
    ...c,
    other_session: (otherSessions ?? []).find(s => s.id === c[otherField as keyof typeof c]) ?? null,
  }))

  return NextResponse.json({ connections: enriched, available: available ?? [] })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('tj_sessions')
    .select('id, type, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (session.type !== 'backtesting') return NextResponse.json({ error: 'Solo sesiones de backtesting pueden iniciar conexiones' }, { status: 400 })

  const body = await request.json()

  // Option A: connect to existing journal
  if (body.journalId) {
    const { data: journal } = await admin
      .from('tj_sessions')
      .select('id')
      .eq('id', body.journalId)
      .eq('user_id', user.id)
      .eq('type', 'journal')
      .single()
    if (!journal) return NextResponse.json({ error: 'Journal no encontrado' }, { status: 404 })

    const { data: connection, error } = await admin
      .from('tj_session_connections')
      .insert({ backtesting_id: id, journal_id: body.journalId })
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Ya existe esta conexión' }, { status: 409 })
    return NextResponse.json({ connection }, { status: 201 })
  }

  // Option B: create new journal from this strategy
  if (body.createJournal) {
    const journalName = body.name?.trim() || `Journal — ${session.name}`

    const { data: newJournal, error: journalError } = await admin
      .from('tj_sessions')
      .insert({
        user_id: user.id,
        type: 'journal',
        name: journalName,
        description: body.description?.trim() || null,
        instrument: body.instrument?.trim() || null,
        capital_initial: body.capital_initial ?? null,
      })
      .select()
      .single()

    if (journalError || !newJournal) return NextResponse.json({ error: journalError?.message ?? 'Error al crear journal' }, { status: 500 })

    // Copy variable definitions from the backtesting session
    const { data: varDefs } = await admin
      .from('tj_variable_definitions')
      .select('*')
      .eq('session_id', id)

    if (varDefs && varDefs.length > 0) {
      const copies = varDefs.map(({ id: _id, created_at: _ca, session_id: _sid, ...rest }) => ({
        ...rest,
        session_id: newJournal.id,
      }))
      await admin.from('tj_variable_definitions').insert(copies)
    }

    // Connect if requested (default: true)
    let connection = null
    if (body.connect !== false) {
      const { data: conn } = await admin
        .from('tj_session_connections')
        .insert({ backtesting_id: id, journal_id: newJournal.id })
        .select()
        .single()
      connection = conn
    }

    return NextResponse.json({ journal: newJournal, connection }, { status: 201 })
  }

  return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('tj_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { connectionId, syncPaused } = await request.json()
  if (!connectionId) return NextResponse.json({ error: 'connectionId requerido' }, { status: 400 })
  if (typeof syncPaused !== 'boolean') return NextResponse.json({ error: 'syncPaused debe ser booleano' }, { status: 400 })

  const { data: connection, error } = await admin
    .from('tj_session_connections')
    .update({ sync_paused: syncPaused })
    .eq('id', connectionId)
    .or(`backtesting_id.eq.${id},journal_id.eq.${id}`)
    .select()
    .single()

  if (error || !connection) return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 })
  return NextResponse.json({ connection })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('tj_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { connectionId } = await request.json()
  if (!connectionId) return NextResponse.json({ error: 'connectionId requerido' }, { status: 400 })

  const { error, count } = await admin
    .from('tj_session_connections')
    .delete({ count: 'exact' })
    .eq('id', connectionId)
    .or(`backtesting_id.eq.${id},journal_id.eq.${id}`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: 'Conexión no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
