import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { createProfile, listProfiles, profileHasData } from '@/lib/finanzas/profiles'
import { isAccentKey, type ProfileWithUsage } from '@/lib/finanzas/types'

/**
 * Los perfiles del usuario, con si cada uno tiene historia.
 *
 * `has_movements` es lo que decide si Ajustes ofrece **Borrar** o **Archivar**.
 * Va acá y no se deduce en el cliente porque sin él la pantalla tendría que
 * intentar el borrado y mostrar un 409 después del click.
 */
export async function GET(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const profiles = await listProfiles(supabase, userId)
  const usage = await Promise.all(profiles.map(p => profileHasData(supabase, p.id)))

  return NextResponse.json({
    profiles: profiles.map((p, i): ProfileWithUsage => ({ ...p, has_movements: usage[i] })),
    active: profileId,
  })
}

/**
 * Crea un perfil. Nace con las categorías semilla y nada más (§4.7).
 *
 * Si no viene `accent`, se le asigna la primera clave libre de la paleta.
 */
export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'El perfil necesita un nombre' }, { status: 400 })
  if (name.length > 40) return NextResponse.json({ error: 'El nombre es demasiado largo' }, { status: 400 })

  const accent = isAccentKey(body.accent) ? body.accent : undefined

  const { profile, error } = await createProfile(supabase, userId, { name, accent })
  if (error || !profile) return NextResponse.json({ error: error ?? 'No se pudo crear el perfil' }, { status: 400 })

  return NextResponse.json({ profile }, { status: 201 })
}
