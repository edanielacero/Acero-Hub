import { requireUser, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates, isRatedCurrency, pairAllowedFor } from '@/lib/finanzas/rates'
import { readQuotes, refreshQuotes, quotesAreStale } from '@/lib/finanzas/quotes'
import { num } from '@/lib/finanzas/money'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Vercel Hobby permite un solo cron por día, así que el cron es apenas el
  // piso: lo que mantiene las cotizaciones frescas es abrir la app. Si están
  // vencidas se refrescan acá, y si las fuentes no contestan se sigue con las
  // últimas buenas.
  let quotes = await readQuotes(supabase)
  if (quotesAreStale(quotes)) {
    quotes = await refreshQuotes(createAdminClient())
  }

  const { rates, rows } = await ensureRates(supabase, userId, quotes)
  return NextResponse.json({ rates, list: rows, quotes })
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const currency = body?.currency

  if (!isRatedCurrency(currency)) {
    return NextResponse.json({ error: 'Esa moneda no lleva tasa editable' }, { status: 400 })
  }

  await ensureRates(supabase, userId)

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.auto !== undefined) patch.auto = Boolean(body.auto)

  if (body.quote_pair !== undefined) {
    if (!pairAllowedFor(currency, body.quote_pair)) {
      return NextResponse.json(
        { error: `${currency} no puede seguir esa cotización` },
        { status: 400 },
      )
    }
    patch.quote_pair = body.quote_pair
  }

  if (body.rate !== undefined) {
    const rate = num(body.rate, NaN)
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: 'La tasa debe ser un número mayor a cero' }, { status: 400 })
    }
    patch.rate = rate
    // Escribir un valor a mano implica dejar de seguir al mercado; si no, el
    // próximo refresco lo pisaría y el usuario no entendería por qué.
    if (body.auto === undefined) patch.auto = false
  }

  const { error } = await supabase
    .from('fin_rates')
    .update(patch)
    .eq('user_id', userId)
    .eq('currency', currency)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { rates, rows, quotes } = await ensureRates(supabase, userId)
  return NextResponse.json({ rates, list: rows, quotes })
}
