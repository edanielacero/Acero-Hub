import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureSettings } from '@/lib/finanzas/settings'
import { SEED_CATEGORIES } from '@/lib/finanzas/types'

/**
 * Siembra idempotente: crea la fila de ajustes y las 14 categorías iniciales.
 * Se dispara desde un botón en Ajustes y no desde la migración, porque una
 * migración no puede conocer el auth.uid() del usuario de forma limpia.
 *
 * Lee lo que ya existe e inserta solo lo que falta, así correrlo dos veces no
 * duplica nada ni pisa una categoría que el usuario haya renombrado.
 */
export async function POST() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  await ensureSettings(supabase, userId)

  const { data: existing } = await supabase
    .from('fin_categories')
    .select('name, kind')
    .eq('user_id', userId)

  const taken = new Set((existing ?? []).map(c => `${c.kind}:${c.name}`))
  const missing = SEED_CATEGORIES
    .map((c, i) => ({ ...c, sort_order: i }))
    .filter(c => !taken.has(`${c.kind}:${c.name}`))

  if (missing.length > 0) {
    const { error } = await supabase.from('fin_categories').insert(
      missing.map(c => ({
        user_id: userId,
        name: c.name,
        kind: c.kind,
        emoji: c.emoji,
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
