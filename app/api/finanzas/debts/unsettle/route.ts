import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { DEBT_COLS } from '@/lib/finanzas/shared'

/**
 * Deshacer un cobro o una perdón: la deuda vuelve a estar abierta.
 *
 * `delete_transaction` borra además el movimiento del cobro, que es lo que casi
 * siempre querés: si la deuda vuelve a estar abierta, esa plata no entró.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.split_ids)
    ? body.split_ids.filter((x: unknown) => typeof x === 'string')
    : []

  if (ids.length === 0) return NextResponse.json({ error: 'Elegí al menos una deuda' }, { status: 400 })

  const { data: rows } = await supabase
    .from('fin_debts')
    .select(DEBT_COLS)
    .eq('user_id', userId)
    .in('id', ids)

  if ((rows ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'Alguna de las deudas no existe' }, { status: 404 })
  }

  const txIds = [...new Set((rows ?? []).map(s => s.settled_tx_id).filter((x): x is string => Boolean(x)))]

  // La nota se limpia junto con el estado: describía por qué se condonó, y
  // una deuda que vuelve a estar abierta no tiene ese motivo.
  const { error } = await supabase
    .from('fin_debts')
    .update({ settled_tx_id: null, waived_at: null, note: null })
    .eq('user_id', userId)
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  let deleted = 0
  if (body?.delete_transaction === true && txIds.length > 0) {
    // Un cobro puede saldar varias deudas. Si quedan otras colgando de este
    // movimiento, borrarlo las abriría a todas sin que nadie lo haya pedido —
    // así que solo se borra el que ya no salda nada.
    const { data: still } = await supabase
      .from('fin_debts')
      .select('settled_tx_id')
      .eq('user_id', userId)
      .in('settled_tx_id', txIds)

    const enUso = new Set((still ?? []).map(s => s.settled_tx_id))
    const huerfanos = txIds.filter(id => !enUso.has(id))

    if (huerfanos.length > 0) {
      const { data: gone } = await supabase
        .from('fin_transactions')
        .delete()
        .eq('user_id', userId)
        .in('id', huerfanos)
        .select('id')
      deleted = (gone ?? []).length
    }
  }

  return NextResponse.json({ reopened: ids.length, deleted_transactions: deleted })
}
