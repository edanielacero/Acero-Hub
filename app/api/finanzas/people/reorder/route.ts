import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/** Reasigna `sort_order` según el orden del array recibido — mismo patrón que
    `/api/finanzas/accounts/reorder` y `/api/finanzas/categories/reorder`. */
export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Falta la lista de personas' }, { status: 400 })
  }

  const { data: propias } = await supabase
    .from('fin_people')
    .select('id')
    .eq('user_id', userId)
    .in('id', ids as string[])

  if ((propias?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: 'Alguna persona no existe' }, { status: 400 })
  }

  const results = await Promise.all(
    (ids as string[]).map((id, index) =>
      supabase
        .from('fin_people')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('user_id', userId),
    ),
  )

  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 })

  return NextResponse.json({ ok: true, ordenadas: ids.length })
}
