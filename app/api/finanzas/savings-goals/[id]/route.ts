import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { validateAllocation, validateGoalName, validateTargetAmount } from '@/lib/finanzas/savings'
import { CURRENCIES, type AllocationType, type Currency } from '@/lib/finanzas/types'

const GOAL_COLS = 'id, name, input_currency, allocation_type, allocation_value, target_amount, target_date, is_catchall, sort_order, archived'

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

  // Se necesita el estado actual para dos decisiones de acá abajo: si el
  // cajón de sastre sigue siéndolo (define si el reparto es obligatorio) y si
  // ya tiene movimientos (bloquea cambiarle la moneda).
  const { data: actual } = await supabase
    .from('fin_savings_goals').select('is_catchall, input_currency').eq('user_id', userId).eq('id', id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Ahorro no encontrado' }, { status: 404 })

  const seraCatchall = body.is_catchall === undefined ? Boolean(actual.is_catchall) : Boolean(body.is_catchall)

  // El reparto es editable siempre — efectivo desde el próximo cierre, sin
  // `retroactive` como en Presupuesto porque no hay nada que recalcular hacia
  // atrás (§0 Ronda 3 de sprint_7_ahorro.md). Los dos campos viajan juntos:
  // mandar uno sin el otro dejaría, por ejemplo, un `allocation_value` de 60
  // "porcentaje" pisando un tipo `fixed` sin querer.
  //
  // Un cajón de sastre los deja en null: se lleva lo que sobra, no sigue una
  // regla propia. Pasar a serlo los limpia, y dejar de serlo vuelve a
  // exigirlos — si no, quedaría un ahorro que no reparte ni recibe el resto.
  if (body.allocation_type !== undefined || body.allocation_value !== undefined || body.is_catchall !== undefined) {
    const type = seraCatchall ? null : (body.allocation_type as AllocationType)
    const value = seraCatchall ? null : num(body.allocation_value, NaN)
    const allocationError = validateAllocation(type, value, seraCatchall)
    if (allocationError) return NextResponse.json({ error: allocationError }, { status: 400 })
    patch.allocation_type = type
    patch.allocation_value = value
  }

  // La moneda es editable mientras el ahorro no tenga movimientos — mismo
  // criterio que `PATCH /accounts/[id]`: con aportes ya registrados, cambiarla
  // reinterpretaría lo que ya se aportó.
  if (body.currency !== undefined && body.currency !== actual.input_currency) {
    if (!CURRENCIES.includes(body.currency as Currency)) {
      return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
    }
    const { count } = await supabase
      .from('fin_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('savings_goal_id', id)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'No se puede cambiar la moneda de un ahorro que ya tiene movimientos' },
        { status: 409 },
      )
    }
    patch.input_currency = body.currency
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

  // Como mucho un cajón de sastre activo: marcar este desmarca al anterior
  // (mismo criterio que el POST). Se excluye a sí mismo del UPDATE para no
  // pisarse el valor que está por escribir.
  if (body.is_catchall !== undefined) {
    const wantsCatchall = Boolean(body.is_catchall)
    if (wantsCatchall) {
      await supabase
        .from('fin_savings_goals')
        .update({ is_catchall: false })
        .eq('user_id', userId).eq('is_catchall', true).neq('id', id)
    }
    patch.is_catchall = wantsCatchall
  }

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
 * Borra el ahorro. Sus movimientos ya registrados no se tocan: pierden la
 * etiqueta, la dirección y el motivo, mismo criterio que borrar un fijo o un
 * pasanaku — el historial de gasto/ingreso real no depende de que el ahorro
 * siga existiendo.
 *
 * Los tres campos se sueltan JUNTOS, en el trigger `fin_clear_savings_tag`
 * (`20260826040000`), no con el `on delete set null` de la FK: el CHECK de
 * forma exige que etiqueta y dirección viajen de a pares y no es diferible,
 * así que soltarlas en dos pasos rompía a mitad de camino y dejaba imborrable
 * cualquier ahorro que hubiera recibido un aporte.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  // Un fijo que aporte a este ahorro lo bloquea (`on delete restrict`): sin
  // este chequeo el DELETE moría con el mensaje crudo del constraint de
  // Postgres, ilegible. Mismo criterio que la ruta de categorías (§ b08fdb4):
  // decir QUÉ lo está usando, no solo que no se puede.
  const { data: fijos } = await supabase
    .from('fin_recurring').select('name').eq('user_id', userId).eq('savings_goal_id', id)

  if ((fijos ?? []).length > 0) {
    const nombres = (fijos ?? []).map(f => f.name as string).join(', ')
    return NextResponse.json(
      { error: `No se puede borrar: hay fijos que aportan a este ahorro (${nombres}). Cámbialos o bórralos primero.` },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('fin_savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
