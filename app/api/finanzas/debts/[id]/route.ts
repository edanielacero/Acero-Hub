import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, round2 } from '@/lib/finanzas/money'
import { ensureRates } from '@/lib/finanzas/rates'
import { toUsd } from '@/lib/finanzas/money'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import { isOpen } from '@/lib/finanzas/splits'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { isValidDate } from '@/lib/finanzas/transactions'

/**
 * Editar una deuda.
 *
 * Solo se toca lo que es de la deuda en sí: monto, concepto y fecha. La persona
 * no se cambia — si te confundiste de persona, la deuda es otra.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { data: current } = await supabase
    .from('fin_debts').select(DEBT_COLS).eq('id', id).eq('profile_id', profileId).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 })

  if (!isOpen(current)) {
    return NextResponse.json(
      { error: 'Esta deuda ya está cerrada. Deshaz el cobro antes de editarla.' },
      { status: 409 },
    )
  }

  const patch: Record<string, unknown> = {}

  // Cambiar la moneda solo tiene sentido en una deuda suelta que no viene de
  // ningún lado: si vino de un gasto, la moneda es la del gasto; si es una
  // cuota de un plan, es la del plan (Sprint 4 §4.5) — cambiarla acá
  // desincronizaría a las dos de su origen.
  let currency = current.currency as Currency
  if (body.currency !== undefined && body.currency !== current.currency) {
    if (current.transaction_id) {
      return NextResponse.json(
        { error: 'Esta deuda vino de un gasto: la moneda se cambia en el gasto.' },
        { status: 400 },
      )
    }
    if (current.plan_id) {
      return NextResponse.json(
        { error: 'Esta cuota es de un plan: la moneda se cambia regenerando el plan.' },
        { status: 400 },
      )
    }
    if (!CURRENCIES.includes(body.currency)) {
      return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
    }
    currency = body.currency as Currency
    patch.currency = currency
  }

  const amountChanged = body.amount !== undefined
  const currencyChanged = patch.currency !== undefined

  if (amountChanged || currencyChanged) {
    const amount = amountChanged ? num(body.amount, NaN) : num(current.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
    }
    patch.amount = amount

    if (currencyChanged) {
      // Moneda nueva, conversión nueva: se congela con la tasa de hoy, porque
      // la vieja era de otra moneda y no dice nada sobre esta. Cambiar de
      // moneda solo es posible en una deuda suelta (bloqueado arriba para las
      // que vienen de un gasto o un plan), así que nunca lleva margen.
      const { rates } = await ensureRates(supabase, userId)
      patch.amount_usd = toUsd(amount, currency, rates)
      patch.principal_usd = patch.amount_usd
    } else {
      // Solo cambió el monto: se conserva la tasa con la que nació la deuda —
      // la del gasto padre, o la del día que la cargaste.
      const factor = num(current.amount) > 0 ? num(current.amount_usd) / num(current.amount) : 1
      patch.amount_usd = round2(amount * factor)

      // Y se conserva la MISMA proporción de margen que ya tenía — editar el
      // monto a mano no decide si esta deuda venía de un reparto con margen.
      const marginRatio = num(current.amount_usd) > 0 ? num(current.principal_usd) / num(current.amount_usd) : 1
      patch.principal_usd = Math.min(patch.amount_usd as number, round2((patch.amount_usd as number) * marginRatio))
    }
  }

  if (body.concept !== undefined) {
    const concept = typeof body.concept === 'string' ? body.concept.trim() : ''
    // Una deuda suelta necesita concepto; una que vino de un gasto lo hereda.
    if (!concept && !current.transaction_id) {
      return NextResponse.json({ error: 'Di de qué es la deuda' }, { status: 400 })
    }
    patch.concept = concept || null
  }

  if (body.incurred_on !== undefined && isValidDate(body.incurred_on)) {
    patch.incurred_on = body.incurred_on
  }
  if (body.note !== undefined) patch.note = typeof body.note === 'string' ? body.note.trim() || null : null

  const { data, error } = await supabase
    .from('fin_debts').update(patch).eq('id', id).eq('profile_id', profileId).select(DEBT_COLS).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ debt: data })
}

/**
 * Borrar una deuda.
 *
 * Una cobrada no se borra: hay un movimiento real apuntándola y borrarla lo
 * dejaría sin explicación. Primero se deshace el cobro.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: current } = await supabase
    .from('fin_debts').select('id, settled_tx_id').eq('id', id).eq('profile_id', profileId).maybeSingle()
  if (!current) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 })

  if (current.settled_tx_id) {
    return NextResponse.json(
      { error: 'Esta deuda ya fue cobrada. Deshaz el cobro antes de borrarla.' },
      { status: 409 },
    )
  }

  const { error } = await supabase.from('fin_debts').delete().eq('id', id).eq('profile_id', profileId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}