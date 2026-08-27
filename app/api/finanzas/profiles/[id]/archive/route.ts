import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { listProfiles } from '@/lib/finanzas/profiles'
import { PROFILE_COLS } from '@/lib/finanzas/types'

/**
 * Archiva o reactiva un perfil.
 *
 * Archivar es lo que reemplaza al borrado cuando el perfil tiene historia: sale
 * del selector y sus datos quedan intactos. El default no se archiva nunca —lo
 * respalda además un CHECK en la base—, porque es a donde salta la app cuando
 * se archiva el activo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const archived = body.archived !== false

  const profiles = await listProfiles(supabase, userId)
  const target = profiles.find(p => p.id === id)
  if (!target) return NextResponse.json({ error: 'Ese perfil no existe' }, { status: 404 })

  if (target.is_default) {
    return NextResponse.json({ error: 'El perfil principal no se puede archivar' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('fin_profiles')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId)
    .select(PROFILE_COLS).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Si se archivó el perfil activo, el cliente tiene que reubicarse. Va en la
  // respuesta para que no necesite un segundo viaje para averiguar a dónde.
  const fallback = profiles.find(p => p.is_default)?.id ?? null
  const active = archived && id === profileId ? fallback : profileId

  return NextResponse.json({ profile: data, active })
}
