import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { resolvePeople } from '@/lib/finanzas/people'
import { assertSavingsTarget, RECURRING_COLS, readTemplateSplits, validateRecurring } from '../route'
import { assertCategory } from '@/lib/finanzas/load'
import { validateTemplateSplits } from '@/lib/finanzas/recurring'
import type { RecurringInput } from '@/lib/finanzas/types'
import { isValidDate } from '@/lib/finanzas/transactions'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { data: current } = await supabase
    .from('fin_recurring').select(RECURRING_COLS).eq('id', id).eq('profile_id', profileId).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Fijo no encontrado' }, { status: 404 })

  const pick = <T,>(next: T | undefined, prev: T): T => (next === undefined ? prev : next)

  const merged: Partial<RecurringInput> = {
    name: typeof body.name === 'string' ? body.name.trim() : current.name,
    icon: body.icon === undefined ? current.icon : (body.icon || null),
    amount: body.amount === undefined ? num(current.amount) : num(body.amount, NaN),
    currency: pick(body.currency, current.currency),
    account_id: body.account_id === undefined
      ? current.account_id
      : (typeof body.account_id === 'string' && body.account_id ? body.account_id : null),
    category_id: body.category_id === undefined ? current.category_id : (body.category_id || null),
    frequency: pick(body.frequency, current.frequency),
    day_of_month: body.day_of_month === undefined ? num(current.day_of_month) : num(body.day_of_month),
    month_of_year:
      body.month_of_year === undefined
        ? (current.month_of_year === null ? null : num(current.month_of_year))
        : (body.month_of_year == null ? null : num(body.month_of_year)),
    active: body.active === undefined ? current.active : Boolean(body.active),
    note: body.note === undefined ? current.note : (typeof body.note === 'string' ? body.note.trim() || null : null),
    starts_on: typeof body.starts_on === 'string' && isValidDate(body.starts_on)
      ? body.starts_on
      : current.starts_on,
    savings_goal_id: body.savings_goal_id === undefined
      ? current.savings_goal_id
      : (typeof body.savings_goal_id === 'string' && body.savings_goal_id ? body.savings_goal_id : null),
    to_account_id: body.to_account_id === undefined
      ? current.to_account_id
      : (typeof body.to_account_id === 'string' && body.to_account_id ? body.to_account_id : null),
  }
  // Pasar a mensual limpia el mes; sin esto el check constraint rechaza el update.
  if (merged.frequency === 'mensual') merged.month_of_year = null
  // Convertirlo en fijo de ahorro limpia la categoría, y dejar de serlo limpia
  // las dos columnas del ahorro — si no, el check `fin_recurring_savings_shape`
  // rechaza el update con su mensaje crudo.
  if (merged.savings_goal_id) merged.category_id = null
  else { merged.savings_goal_id = null; merged.to_account_id = null }

  const categoryError = await assertCategory(supabase, scope, merged.category_id)
  if (categoryError) return NextResponse.json({ error: categoryError }, { status: 400 })

  // Igual que con la categoría archivada de un fijo normal: si el ahorro no
  // cambió, se acepta aunque esté archivado — archivar algo no puede dejar sin
  // poder editar ni pausar lo que lo referencia (§ b08fdb4).
  if (merged.savings_goal_id !== current.savings_goal_id || merged.to_account_id !== current.to_account_id) {
    const savingsError = await assertSavingsTarget(supabase, userId, merged.savings_goal_id, merged.to_account_id)
    if (savingsError) return NextResponse.json({ error: savingsError }, { status: 400 })
  }

  const invalid = validateRecurring(merged)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const entrantes = readTemplateSplits(body.splits)
  if (entrantes !== undefined) {
    const conocidas = (await supabase.from('fin_people').select('id, name').eq('profile_id', profileId)).data ?? []
    const splitCheck = validateTemplateSplits(entrantes, conocidas)
    if (!splitCheck.ok) return NextResponse.json({ error: splitCheck.error }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('fin_recurring')
    .update({ ...merged, updated_at: new Date().toISOString() })
    .eq('id', id).eq('profile_id', profileId)
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
    const { resolved, error: peopleError } = await resolvePeople(supabase, scope, incoming.map(s => ({ ...s, amount: 1 })),
    )
    if (peopleError) return NextResponse.json({ error: peopleError }, { status: 400 })

    const { data: actuales } = await supabase
      .from('fin_recurring_splits').select('id, person_id, amount')
      .eq('profile_id', profileId).eq('recurring_id', id)

    const previos = new Map((actuales ?? []).map(x => [x.person_id, x]))
    const objetivo = new Map(
      resolved.map((r, i) => [
        r.person_id,
        incoming[i].amount == null || Number.isNaN(incoming[i].amount) ? null : incoming[i].amount,
      ]),
    )

    /*
      Se reconcilia por diferencia en vez de borrar todo y reinsertar.
      Con el borrado-total, un reparto inválido dejaba la plantilla SIN partes:
      el delete pasaba, el insert fallaba contra el índice único y el usuario
      perdía su reparto por haber escrito mal un nombre. Acá lo que no cambia,
      no se toca.
    */
    const aBorrar = (actuales ?? []).filter(x => !objetivo.has(x.person_id)).map(x => x.id)
    if (aBorrar.length > 0) {
      const { error: delError } = await supabase
        .from('fin_recurring_splits').delete().eq('profile_id', profileId).in('id', aBorrar)
      if (delError) return NextResponse.json({ error: delError.message }, { status: 400 })
    }

    for (const [personId, amount] of objetivo) {
      const prev = previos.get(personId)
      if (prev) {
        if (num(prev.amount, NaN) !== num(amount, NaN) && !(prev.amount == null && amount == null)) {
          const { error } = await supabase
            .from('fin_recurring_splits').update({ amount }).eq('profile_id', profileId).eq('id', prev.id)
          if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        }
      } else {
        const { error } = await supabase.from('fin_recurring_splits')
          .insert({ user_id: userId, profile_id: profileId, recurring_id: id, person_id: personId, amount })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }
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
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('fin_recurring').delete().eq('id', id).eq('profile_id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
