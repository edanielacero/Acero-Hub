import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const DEBT_PLAN_COLS =
  'id, person_id, concept, principal, currency, interest_rate, installments, frequency, starts_on, note'

/**
 * Editar un plan. Solo lo que no cambia el calendario ya generado: concepto y
 * nota. Cuotas, capital, interés y fechas se tocan regenerando (§4.6).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { data: current } = await supabase
    .from('fin_debt_plans').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })

  const patch: Record<string, unknown> = {}

  if (body.concept !== undefined) {
    const concept = typeof body.concept === 'string' ? body.concept.trim() : ''
    if (!concept) return NextResponse.json({ error: 'Di de qué es el plan' }, { status: 400 })
    patch.concept = concept
  }
  if (body.note !== undefined) {
    patch.note = typeof body.note === 'string' ? body.note.trim() || null : null
  }

  const { data, error } = await supabase
    .from('fin_debt_plans').update(patch).eq('id', id).eq('user_id', userId).select(DEBT_PLAN_COLS).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ plan: data })
}

/**
 * Borrar un plan. Solo si ninguna cuota fue tocada: ahí se lleva las cuotas
 * pendientes con él. Si alguna ya está cobrada o condonada, esa historia no se
 * borra — el usuario tiene que regenerar en vez de borrar (§4.7).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: plan } = await supabase
    .from('fin_debt_plans').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })

  const { data: cuotas } = await supabase
    .from('fin_debts').select('id, settled_tx_id, waived_at').eq('user_id', userId).eq('plan_id', id)

  const tocada = (cuotas ?? []).some(c => c.settled_tx_id || c.waived_at)
  if (tocada) {
    return NextResponse.json(
      { error: 'Este plan ya tiene cuotas cobradas o perdonadas. Regenéralo en vez de borrarlo.' },
      { status: 409 },
    )
  }

  // El filtro `is(...).is(...)` protege contra la misma carrera que
  // `regenerate`: si algo se cobró entre el chequeo de arriba y este borrado,
  // esa fila no se toca acá. El `delete` del plan de abajo la deja huérfana
  // vía `on delete set null` — sigue existiendo, con su historia intacta.
  await supabase
    .from('fin_debts').delete().eq('user_id', userId).eq('plan_id', id)
    .is('settled_tx_id', null).is('waived_at', null)
  const { error } = await supabase.from('fin_debt_plans').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
