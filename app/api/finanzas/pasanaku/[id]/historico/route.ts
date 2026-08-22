import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const HISTORICO_COLS = 'id, pasanaku_id, date, amount, note'

/**
 * Registrar un aporte de ANTES de empezar a usar la app — solo una
 * anotación, nunca un `fin_transactions`. No pide cuenta ni toca ningún
 * saldo: esa plata ya salió en la vida real, antes de que la app existiera
 * para vos. Cargarla como gasto normal la restaría dos veces (ver
 * sprint_5_pasanaku.md, "Aportes de antes de la app").
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) ?? {}

  const { data: p } = await supabase
    .from('fin_pasanaku').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Pasanaku no encontrado' }, { status: 404 })

  const amount = num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const date = typeof body.date === 'string' && ISO_DATE.test(body.date) ? body.date : null
  if (!date) return NextResponse.json({ error: 'Elegí una fecha' }, { status: 400 })

  const note = typeof body.note === 'string' ? body.note.trim() || null : null

  const { data, error } = await supabase
    .from('fin_pasanaku_historico')
    .insert({ user_id: userId, pasanaku_id: id, date, amount, note })
    .select(HISTORICO_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ historico: data }, { status: 201 })
}
