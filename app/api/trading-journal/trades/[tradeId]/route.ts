import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { findMissingRequiredVariable } from '@/lib/trading/required-fields.server'
import { findMissingExecutionField, isCapitalComplete } from '@/lib/trading/required-fields'

interface Params { params: Promise<{ tradeId: string }> }

type QueryClient = Awaited<ReturnType<typeof requireUser>>['supabase']

// Single JOIN query — avoids 2 serial round-trips for ownership check
async function getOwnedTrade(tradeId: string, userId: string, supabase: QueryClient) {
  const { data } = await supabase
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
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [owned, body] = await Promise.all([
    getOwnedTrade(tradeId, userId, supabase),
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

  if ('custom_fields' in updates) {
    const missingVar = await findMissingRequiredVariable(
      supabase, owned.trade.session_id, (updates.custom_fields as Record<string, unknown>) ?? {}
    )
    if (missingVar) {
      return NextResponse.json({ error: `El campo "${missingVar}" es obligatorio` }, { status: 400 })
    }
  }

  // Vista resultante del trade después de aplicar este PATCH (parcial) — se usa tanto
  // para validar los datos de ejecución como para recalcular si sigue siendo borrador.
  const merged = { ...owned.trade, ...updates }

  const missingExecutionField = findMissingExecutionField(merged)
  if (missingExecutionField) {
    return NextResponse.json({ error: `El campo "${missingExecutionField}" es obligatorio` }, { status: 400 })
  }

  // El capital de journal nunca bloquea el guardado: mientras falte, el trade se
  // mantiene/vuelve borrador (fuera de estadísticas); en cuanto se completa, deja de serlo.
  if (owned.sessionType === 'journal') {
    updates.is_draft = !isCapitalComplete(merged)
  }

  const { data: trade, error } = await supabase
    .from('tj_trades')
    .update(updates)
    .eq('id', tradeId)
    .eq('session_id', owned.trade.session_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ trade })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { tradeId } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owned = await getOwnedTrade(tradeId, userId, supabase)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('tj_trades')
    .delete()
    .eq('id', tradeId)
    .eq('session_id', owned.trade.session_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
