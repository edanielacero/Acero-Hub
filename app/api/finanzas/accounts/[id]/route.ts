import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

/** Cuántos movimientos tocan esta cuenta, como origen o como destino. */
async function txCount(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  userId: string,
  accountId: string,
): Promise<number> {
  const { count } = await supabase
    .from('fin_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
  return count ?? 0
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'La cuenta necesita un nombre' }, { status: 400 })
    patch.name = name
  }

  if (body.currency !== undefined) {
    if (!CURRENCIES.includes(body.currency as Currency)) {
      return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
    }
    // Cambiar la moneda reinterpretaría todos los movimientos ya registrados
    // en esta cuenta, que quedaron congelados con la moneda anterior.
    if (await txCount(supabase, userId, id) > 0) {
      return NextResponse.json(
        { error: 'No se puede cambiar la moneda de una cuenta que ya tiene movimientos' },
        { status: 409 },
      )
    }
    patch.currency = body.currency
  }

  if (body.initial_balance !== undefined) patch.initial_balance = num(body.initial_balance)
  if (body.initial_balance_date !== undefined) patch.initial_balance_date = body.initial_balance_date
  if (body.sort_order !== undefined) patch.sort_order = num(body.sort_order)
  if (body.archived !== undefined) patch.archived = Boolean(body.archived)

  const { data, error } = await supabase
    .from('fin_accounts')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(ACCOUNT_COLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  return NextResponse.json({ account: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  if (await txCount(supabase, userId, id) > 0) {
    return NextResponse.json(
      { error: 'Esta cuenta tiene movimientos. Archivala en vez de borrarla para no perder su historial.' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('fin_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
