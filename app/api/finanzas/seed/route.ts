import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { SEED_CATEGORIES } from '@/lib/finanzas/types'

/**
 * Siembra idempotente: crea las tasas por moneda y las 14 categorías iniciales.
 * Se dispara desde un botón en Ajustes y no desde la migración, porque una
 * migración no puede conocer el auth.uid() del usuario de forma limpia.
 *
 * Lee lo que ya existe e inserta solo lo que falta, así correrlo dos veces no
 * duplica nada ni pisa una categoría que el usuario haya renombrado.
 */
export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await ensureRates(supabase, userId)

  const { data: existing } = await supabase
    .from('fin_categories')
    .select('name, kind')
    .eq('profile_id', profileId)

  const taken = new Set((existing ?? []).map(c => `${c.kind}:${c.name}`))
  const missing = SEED_CATEGORIES
    .map((c, i) => ({ ...c, sort_order: i }))
    .filter(c => !taken.has(`${c.kind}:${c.name}`))

  if (missing.length > 0) {
    const { error } = await supabase.from('fin_categories').insert(
      missing.map(c => ({
        user_id: userId, profile_id: profileId,
        name: c.name,
        kind: c.kind,
        icon: c.icon,
        sort_order: c.sort_order,
      })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    creadas: missing.length,
    total: (existing?.length ?? 0) + missing.length,
  })
}
