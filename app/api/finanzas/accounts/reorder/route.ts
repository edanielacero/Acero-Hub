import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/**
 * Reasigna `sort_order` según el orden del array recibido.
 *
 * Se manda la lista completa en vez de intercambiar dos filas porque las
 * cuentas nacen todas con `sort_order = 0` (el orden real lo desempata
 * `created_at`). Intercambiar dos ceros no cambiaría nada; asignar 0..n de una
 * deja el orden explícito y sin huecos, sin importar de dónde se venía.
 */
export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Falta la lista de cuentas' }, { status: 400 })
  }

  // Solo se tocan cuentas del usuario: RLS lo garantiza igual, pero validar acá
  // evita gastar N updates para descubrirlo.
  const { data: propias } = await supabase
    .from('fin_accounts')
    .select('id')
    .eq('user_id', userId)
    .in('id', ids as string[])

  if ((propias?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: 'Alguna cuenta no existe' }, { status: 400 })
  }

  const results = await Promise.all(
    (ids as string[]).map((id, index) =>
      supabase
        .from('fin_accounts')
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId),
    ),
  )

  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 })

  return NextResponse.json({ ok: true, ordenadas: ids.length })
}
