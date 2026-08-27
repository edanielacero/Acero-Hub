import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/**
 * Reasigna `sort_order` según el orden del array recibido — mismo patrón que
 * `/api/finanzas/accounts/reorder`. Gastos e Ingresos se arrastran cada uno
 * en su propia lista (ver `CategoryList`), pero el endpoint no necesita saber
 * de `kind`: `loadCategories` ordena por `kind` antes que por `sort_order`,
 * así que dos categorías de distinto tipo nunca compiten por el mismo índice.
 */
export async function PATCH(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Falta la lista de categorías' }, { status: 400 })
  }

  const { data: propias } = await supabase
    .from('fin_categories')
    .select('id')
    .eq('profile_id', profileId)
    .in('id', ids as string[])

  if ((propias?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: 'Alguna categoría no existe' }, { status: 400 })
  }

  const results = await Promise.all(
    (ids as string[]).map((id, index) =>
      supabase
        .from('fin_categories')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('profile_id', profileId),
    ),
  )

  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 })

  return NextResponse.json({ ok: true, ordenadas: ids.length })
}
