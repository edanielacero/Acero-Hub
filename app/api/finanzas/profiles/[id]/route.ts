import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { deleteProfile, listProfiles } from '@/lib/finanzas/profiles'
import { isAccentKey, PROFILE_COLS } from '@/lib/finanzas/types'

/** Renombrar y cambiar color. Funciona también sobre el default: es indeleble,
 *  no inmutable — quizá querés que se llame "Daniel" y no "Personal". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'El perfil necesita un nombre' }, { status: 400 })
    if (name.length > 40) return NextResponse.json({ error: 'El nombre es demasiado largo' }, { status: 400 })

    const otros = (await listProfiles(supabase, userId)).filter(p => p.id !== id)
    if (otros.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'Ya tienes un perfil con ese nombre' }, { status: 409 })
    }
    patch.name = name
  }
  if (body.accent !== undefined) {
    if (!isAccentKey(body.accent)) return NextResponse.json({ error: 'Ese color no existe' }, { status: 400 })
    patch.accent = body.accent
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('fin_profiles').update(patch).eq('id', id).eq('user_id', userId)
    .select(PROFILE_COLS).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ese perfil no existe' }, { status: 404 })
  return NextResponse.json({ profile: data })
}

/**
 * Borra un perfil **vacío**. Con historia no se borra: se archiva (§4.4).
 *
 * Es la regla de cuentas (maestro §4.5) un nivel más arriba. Un cascade sería
 * la acción más destructiva de la app —N cuentas por meses de carga manual— y
 * como los movimientos no se mueven entre perfiles, un borrado equivocado no se
 * desharía de ninguna forma. El `on delete restrict` de las 17 FKs lo respalda
 * en la base aunque esta validación falle.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const profiles = await listProfiles(supabase, userId)

  // El borrado entero —verificar y borrar— ocurre dentro de una función de
  // Postgres, en una sola transacción. Antes eran dos operaciones sueltas desde
  // acá y un fallo a mitad de camino dejaba el perfil vivo pero sin sus
  // categorías, sin que nada lo dijera.
  const motivo = await deleteProfile(supabase, id)

  if (motivo === 'not_found') {
    return NextResponse.json({ error: 'Ese perfil no existe' }, { status: 404 })
  }
  if (motivo === 'is_default') {
    return NextResponse.json(
      { error: 'El perfil principal no se puede borrar', is_default: true }, { status: 409 })
  }
  if (motivo === 'has_data') {
    return NextResponse.json(
      { error: 'Este perfil tiene datos cargados. Archívalo en vez de borrarlo.', has_movements: true },
      { status: 409 })
  }
  if (motivo === 'error') {
    return NextResponse.json({ error: 'No se pudo borrar el perfil' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, active: profiles.find(p => p.is_default)?.id ?? null })
}
