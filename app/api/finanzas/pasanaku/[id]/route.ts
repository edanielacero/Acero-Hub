import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { validatePasanaku } from '@/lib/finanzas/pasanaku'
import type { PasanakuInput } from '@/lib/finanzas/types'

const PASANAKU_COLS =
  'id, name, account_id, currency, contribution_amount, total_slots, my_slot, start_date, archived'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { data: current } = await supabase
    .from('fin_pasanaku').select(PASANAKU_COLS).eq('id', id).eq('profile_id', profileId).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Pasanaku no encontrado' }, { status: 404 })

  const pick = <T,>(next: T | undefined, prev: T): T => (next === undefined ? prev : next)

  const merged: Partial<PasanakuInput> = {
    name: pick(typeof body.name === 'string' ? body.name.trim() : undefined, current.name),
    account_id: pick(body.account_id, current.account_id),
    currency: pick(body.currency, current.currency),
    contribution_amount: body.contribution_amount === undefined ? num(current.contribution_amount) : num(body.contribution_amount, NaN),
    total_slots: body.total_slots === undefined ? current.total_slots : num(body.total_slots, NaN),
    my_slot: body.my_slot === undefined ? current.my_slot : num(body.my_slot, NaN),
    start_date: pick(body.start_date, current.start_date),
  }

  const invalid = validatePasanaku(merged)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  if (merged.account_id && merged.account_id !== current.account_id) {
    const { data: account } = await supabase
      .from('fin_accounts').select('id, is_investment').eq('profile_id', profileId).eq('id', merged.account_id).maybeSingle()
    if (!account) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })
    // Mismo motivo que en POST /pasanaku: un aporte ahí quedaría indistinguible
    // de un ajuste de valor y desaparecería de Movimientos.
    if (account.is_investment) {
      return NextResponse.json({ error: 'No puedes usar una cuenta de inversión para un pasanaku' }, { status: 400 })
    }
  }

  const patch: Record<string, unknown> = { ...merged, updated_at: new Date().toISOString() }
  if (typeof body.archived === 'boolean') patch.archived = body.archived

  const { data, error } = await supabase
    .from('fin_pasanaku')
    .update(patch)
    .eq('id', id)
    .eq('profile_id', profileId)
    .select(PASANAKU_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ pasanaku: data })
}

/**
 * Borrar el pasanaku no borra tus aportes: `pasanaku_id` es `on delete set
 * null`, así que la historia queda en Movimientos como un gasto/ingreso
 * suelto, solo pierde el vínculo — mismo trato que borrar un fijo (§ Sprint 3).
 * A diferencia de una cuenta, acá no hace falta "restrict + archivar": nada se
 * queda huérfano de un modo que rompa algo.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: borradas, error } = await supabase.from('fin_pasanaku').delete().eq('id', id).eq('profile_id', profileId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Sin filas afectadas: el id no es de este perfil (o no existe). Antes
  // esto devolvía 200 y la pantalla decía "borrado" sobre algo que seguía
  // ahí — así se vio el bug de las categorías en un perfil nuevo.
  if ((borradas ?? []).length === 0) {
    return NextResponse.json({ error: 'Ese pasanaku no existe' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
