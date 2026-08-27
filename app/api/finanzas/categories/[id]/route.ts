import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'

const CATEGORY_COLS = 'id, name, kind, icon, sort_order, archived'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'La categoría necesita un nombre' }, { status: 400 })
    patch.name = name
  }
  if (body.icon !== undefined) patch.icon = body.icon || null
  if (body.sort_order !== undefined) patch.sort_order = num(body.sort_order)
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)

  // `kind` no se puede cambiar: los movimientos ya registrados quedaron
  // asociados a una categoría de gasto o de ingreso, y voltearla los rompería.

  const { data, error } = await supabase
    .from('fin_categories')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', profileId)
    .select(CATEGORY_COLS)
    .maybeSingle()

  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json(
      { error: duplicate ? 'Ya existe otra categoría con ese nombre' : error.message },
      { status: duplicate ? 409 : 400 },
    )
  }
  if (!data) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
  return NextResponse.json({ category: data })
}

/**
 * Borra la categoría. Los movimientos que la usaban quedan con `category_id`
 * en null (`on delete set null`), no se pierden. Para conservar el historial
 * legible conviene archivar en vez de borrar.
 *
 * Si esta categoría era la única de una línea de presupuesto, un trigger en
 * la base (`fin_budget_line_categories_cleanup`) se lleva la línea entera al
 * quedar sin ninguna categoría — no hace falta replicarlo acá.
 *
 * Los fijos son la excepción: su categoría es obligatoria, así que la FK está
 * en RESTRICT y hay que reasignarlos antes. Se chequea acá para poder decir
 * CUÁLES son, en vez de dejar salir el error crudo de Postgres.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: fijos } = await supabase
    .from('fin_recurring').select('name').eq('profile_id', profileId).eq('category_id', id)
  if ((fijos ?? []).length > 0) {
    const nombres = (fijos ?? []).map(f => f.name as string)
    const lista = nombres.slice(0, 3).join(', ') + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : '')
    return NextResponse.json(
      { error: `${nombres.length === 1 ? 'El fijo' : 'Los fijos'} ${lista} ${nombres.length === 1 ? 'usa' : 'usan'} esta categoría. Cambia su categoría antes de borrarla.` },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('fin_categories')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
