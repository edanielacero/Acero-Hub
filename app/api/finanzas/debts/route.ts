import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, round2, toUsd } from '@/lib/finanzas/money'
import { ensureRates } from '@/lib/finanzas/rates'
import { resolvePeople } from '@/lib/finanzas/people'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { loadShared } from '@/lib/finanzas/load'
import { monthRange } from '@/lib/finanzas/transactions'

/** Todo el panel de Compartidos en un solo viaje. */
export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // El mes lo puede fijar el cliente: "cobrado este mes" tiene que medirse
  // contra su calendario, no contra el UTC del servidor.
  const url = new URL(request.url)
  const fallback = monthRange()
  const range = {
    from: url.searchParams.get('from') || fallback.from,
    to: url.searchParams.get('to') || fallback.to,
  }

  return NextResponse.json(await loadShared(supabase, userId, range))
}


const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Crear una deuda suelta: alguien te debe plata, sin ningún gasto detrás.
 *
 * Es la diferencia con el reparto de un gasto compartido, que nace enlazado a
 * él. Acá no hay padre: prestaste efectivo, cubriste algo, te deben una cuota.
 * `transaction_id` queda en null y el concepto lo escribís vos.
 *
 * La conversión a USD se congela ahora, igual que en cualquier movimiento: si
 * mañana cambia el tipo de cambio, una deuda de hace tres meses no puede
 * cambiar de valor.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const amount = num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const currency = body.currency as Currency
  if (!CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
  }

  const concept = typeof body.concept === 'string' ? body.concept.trim() : ''
  if (!concept) return NextResponse.json({ error: 'Decí de qué es la deuda' }, { status: 400 })

  const personId = typeof body.person_id === 'string' ? body.person_id : undefined
  const personName = typeof body.person_name === 'string' ? body.person_name : undefined
  if (!personId && !personName) {
    return NextResponse.json({ error: 'Elegí quién te debe' }, { status: 400 })
  }

  const { resolved, error: peopleError } = await resolvePeople(
    supabase, userId, [{ person_id: personId, person_name: personName, amount }],
  )
  if (peopleError || resolved.length === 0) {
    return NextResponse.json({ error: peopleError ?? 'No se pudo resolver la persona' }, { status: 400 })
  }

  const { rates } = await ensureRates(supabase, userId)
  const amount_usd = toUsd(amount, currency, rates)

  const { data, error } = await supabase
    .from('fin_debts')
    .insert({
      user_id: userId,
      transaction_id: null,
      person_id: resolved[0].person_id,
      amount,
      currency,
      amount_usd,
      // Sin gasto padre no hay "costo" contra el cual medir un margen: una
      // deuda suelta es 100% recuperar lo que prestaste.
      principal_usd: amount_usd,
      concept,
      incurred_on: typeof body.incurred_on === 'string' && ISO_DATE.test(body.incurred_on)
        ? body.incurred_on
        : undefined,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
    })
    .select(DEBT_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ debt: data }, { status: 201 })
}
