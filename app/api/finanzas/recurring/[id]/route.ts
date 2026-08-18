import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { resolvePeople } from '@/lib/finanzas/people'
import { RECURRING_COLS, readTemplateSplits, validateRecurring } from '../route'
import type { RecurringInput } from '@/lib/finanzas/types'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { data: current } = await supabase
    .from('fin_recurring').select(RECURRING_COLS).eq('id', id).eq('user_id', userId).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Fijo no encontrado' }, { status: 404 })

  const pick = <T,>(next: T | undefined, prev: T): T => (next === undefined ? prev : next)

  const merged: Partial<RecurringInput> = {
    name: typeof body.name === 'string' ? body.name.trim() : current.name,
    emoji: body.emoji === undefined ? current.emoji : (body.emoji || null),
    amount: body.amount === undefined ? num(current.amount) : num(body.amount, NaN),
    account_id: pick(body.account_id, current.account_id),
    category_id: body.category_id === undefined ? current.category_id : (body.category_id || null),
    frequency: pick(body.frequency, current.frequency),
    day_of_month: body.day_of_month === undefined ? num(current.day_of_month) : num(body.day_of_month),
    month_of_year:
      body.month_of_year === undefined
        ? (current.month_of_year === null ? null : num(current.month_of_year))
        : (body.month_of_year == null ? null : num(body.month_of_year)),
    active: body.active === undefined ? current.active : Boolean(body.active),
    note: body.note === undefined ? current.note : (typeof body.note === 'string' ? body.note.trim() || null : null),
  }
  // Pasar a mensual limpia el mes; sin esto el check constraint rechaza el update.
  if (merged.frequency === 'mensual') merged.month_of_year = null

  const invalid = validateRecurring(merged)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { data, error } = await supabase
    .from('fin_recurring')
    .update({ ...merged, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId)
    .select(RECURRING_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  /* ─── Reparto por defecto ────────────────────────────────────────────────
     Mandar `splits` lo reemplaza entero; no mandarlo lo deja intacto. Es la
     misma convención que el reparto de un movimiento en el Sprint 2, y acá no
     hay nada que bloquear: una plantilla no tiene deudas cobradas, solo
     configuración. */

  const incoming = readTemplateSplits(body.splits)
  if (incoming !== undefined) {
    const { resolved, error: peopleError } = await resolvePeople(
      supabase, userId, incoming.map(s => ({ ...s, amount: 1 })),
    )
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    const { error: delError } = await supabase
      .from('fin_recurring_splits').delete().eq('user_id', userId).eq('recurring_id', id)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 400 })

    if (resolved.length > 0) {
      const { error: insError } = await supabase.from('fin_recurring_splits').insert(
        resolved.map((r, i) => ({
          user_id: userId,
          recurring_id: id,
          person_id: r.person_id,
          amount: incoming[i].amount == null || Number.isNaN(incoming[i].amount) ? null : incoming[i].amount,
        })),
      )
      if (insError) return NextResponse.json({ error: insError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ recurring: data })
}

/**
 * Borrar un fijo **no borra su historia**: los movimientos que generó quedan,
 * solo pierden el vínculo (`on delete set null`), y las deudas que produjeron
 * siguen abiertas. Si lo que querés es dejar de verlo sin perder el vínculo,
 * pausalo con `active: false`.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('fin_recurring').delete().eq('id', id).eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
