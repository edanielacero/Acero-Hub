import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { BUDGET_LINE_COLS } from '../route'

/**
 * `archived` y/o `name`. `category_id`, `input_currency` y `retroactive` son
 * inmutables (se eligen una sola vez, al crear la línea — §3.1 del spec) y
 * no hay endpoint que los toque; para el monto de cada mes está `/period`, y
 * para el rollover, `/close`. El alias, en cambio, es solo cosmético — no
 * hay razón para congelarlo, así que se puede renombrar cuando sea.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || (body.archived === undefined && body.name === undefined)) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)
  if (body.name !== undefined) patch.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null

  const { data, error } = await supabase
    .from('fin_budget_lines')
    .update(patch)
    .eq('id', id).eq('user_id', userId)
    .select(BUDGET_LINE_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ line: data })
}

/**
 * Sin `409` posible: una línea es configuración, no historial de plata real.
 * `on delete cascade` se lleva sus períodos, ampliaciones y cierres.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('fin_budget_lines').delete().eq('id', id).eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
