import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { PERSON_COLS } from '@/lib/finanzas/people'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'La persona necesita un nombre' }, { status: 400 })
    patch.name = name
  }
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)

  const { data, error } = await supabase
    .from('fin_people')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', profileId)
    .select(PERSON_COLS)
    .maybeSingle()

  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json(
      { error: duplicate ? 'Ya existe otra persona con ese nombre' : error.message },
      { status: duplicate ? 409 : 400 },
    )
  }
  if (!data) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
  return NextResponse.json({ person: data })
}

/**
 * Borra la persona. Si tiene historial de repartos, el `on delete restrict` de
 * `fin_debts.person_id` lo impide y devolvemos 409 sugiriendo archivar — la
 * misma regla que las cuentas con movimientos.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { count } = await supabase
    .from('fin_debts')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('person_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Esta persona aparece en ${count} reparto(s). Archivala en vez de borrarla para no perder el historial.` },
      { status: 409 },
    )
  }

  const { data: borradas, error } = await supabase
    .from('fin_people')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Sin filas afectadas: el id no es de este perfil (o no existe). Antes
  // esto devolvía 200 y la pantalla decía "borrado" sobre algo que seguía
  // ahí — así se vio el bug de las categorías en un perfil nuevo.
  if ((borradas ?? []).length === 0) {
    return NextResponse.json({ error: 'Esa persona no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
