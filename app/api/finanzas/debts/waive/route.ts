import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { todayISO } from '@/lib/finanzas/transactions'
import { isOpen } from '@/lib/finanzas/splits'
import { DEBT_COLS } from '@/lib/finanzas/shared'

/**
 * Perdonar: perdonás la deuda.
 *
 * **No crea ningún movimiento** — no se movió plata. Lo que cambia es de quién
 * es el gasto: perdonarle los $3 a Ana es exactamente decidir gastarlos vos, y
 * por eso el split perdonado vuelve a contar en `gasto_real_usd`.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.split_ids)
    ? body.split_ids.filter((x: unknown) => typeof x === 'string')
    : []

  if (ids.length === 0) return NextResponse.json({ error: 'Elegí al menos una deuda para perdonar' }, { status: 400 })

  const { data: rows } = await supabase
    .from('fin_debts')
    .select(DEBT_COLS)
    .eq('user_id', userId)
    .in('id', ids)

  if ((rows ?? []).length !== ids.length) {
    return NextResponse.json({ error: 'Alguna de las deudas no existe' }, { status: 404 })
  }
  if ((rows ?? []).some(s => !isOpen(s))) {
    return NextResponse.json({ error: 'Alguna de las deudas ya está cerrada' }, { status: 400 })
  }

  const note = typeof body?.note === 'string' ? body.note.trim() || null : null

  const { data, error } = await supabase
    .from('fin_debts')
    .update({ waived_at: todayISO(), ...(note ? { note } : {}) })
    .eq('user_id', userId)
    .in('id', ids)
    .is('settled_tx_id', null)
    .is('waived_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ waived: (data ?? []).length })
}
