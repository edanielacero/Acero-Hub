import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { validateAllocation, validateGoalName, validateTargetAmount } from '@/lib/finanzas/savings'
import type { AllocationType } from '@/lib/finanzas/types'

const GOAL_COLS = 'id, name, input_currency, allocation_type, allocation_value, target_amount, target_date, sort_order, archived'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name !== undefined) {
    const nameError = validateGoalName(body.name)
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })
    patch.name = (body.name as string).trim()
  }

  // El reparto es editable siempre — efectivo desde el próximo cierre, sin
  // `retroactive` como en Presupuesto porque no hay nada que recalcular hacia
  // atrás (§0 Ronda 3 de sprint_7_ahorro.md). Los dos campos viajan juntos:
  // mandar uno sin el otro dejaría, por ejemplo, un `allocation_value` de 60
  // "porcentaje" pisando un tipo `fixed` sin querer.
  if (body.allocation_type !== undefined || body.allocation_value !== undefined) {
    const type = body.allocation_type as AllocationType
    const value = num(body.allocation_value, NaN)
    const allocationError = validateAllocation(type, value)
    if (allocationError) return NextResponse.json({ error: allocationError }, { status: 400 })
    patch.allocation_type = type
    patch.allocation_value = value
  }

  if (body.target_amount !== undefined) {
    const targetAmount = body.target_amount == null ? null : num(body.target_amount, NaN)
    const targetError = validateTargetAmount(targetAmount)
    if (targetError) return NextResponse.json({ error: targetError }, { status: 400 })
    patch.target_amount = targetAmount
  }
  if (body.target_date !== undefined) patch.target_date = body.target_date
  if (body.sort_order !== undefined) patch.sort_order = num(body.sort_order)
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)

  const { data, error } = await supabase
    .from('fin_savings_goals')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(GOAL_COLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ahorro no encontrado' }, { status: 404 })
  return NextResponse.json({ goal: data })
}

/**
 * Borra el ahorro. Sus movimientos ya registrados no se tocan —
 * `savings_goal_id` cae a `null` por el `on delete set null`, mismo criterio
 * que borrar un fijo o un pasanaku: el historial de gasto/ingreso real no
 * depende de que el ahorro siga existiendo.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase
    .from('fin_savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
