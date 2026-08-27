import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { freezeRate, num, round2, toUsd } from '@/lib/finanzas/money'
import { loadBudgets } from '@/lib/finanzas/load'
import { ensureRates } from '@/lib/finanzas/rates'
import { periodStart, validateBudgetAmount } from '@/lib/finanzas/budgets'
import { todayISO } from '@/lib/finanzas/transactions'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'

export const BUDGET_LINE_COLS = 'id, name, input_currency, retroactive, created_on, archived'

export async function GET(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  // El día del usuario, no el del servidor (Vercel corre en UTC) — de él
  // depende qué período es "el vigente" y qué meses ya terminaron.
  const today = new URL(request.url).searchParams.get('today') || todayISO()
  return NextResponse.json(await loadBudgets(supabase, scope, today))
}

/**
 * Crea una línea de presupuesto con su primer monto. Siempre atada a al
 * menos una categoría — el tope general ya no es una línea propia, es la
 * suma de estas (`sumGeneral` en `lib/finanzas/load.ts`).
 *
 * Una línea puede cubrir varias categorías (`fin_budget_line_categories`),
 * pero ninguna de ellas puede pertenecer a otra línea activa a la vez: si
 * dos presupuestos reclamaran la misma categoría, el general contaría ese
 * gasto dos veces.
 *
 * `amount` viaja en `currency` (comodidad de entrada Y de visualización,
 * revisión post-Sprint 6: el usuario piensa en Bs, no en USD) — acá se
 * convierte y de ahí en más `amount_usd` es lo único que se guarda. `name`
 * es un alias opcional; sin él, el cliente muestra los nombres de las
 * categorías como default, así que acá no hace falta resolver nada.
 */
export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const categoryIds = Array.isArray(body.category_ids)
    ? [...new Set(body.category_ids.filter((id: unknown): id is string => typeof id === 'string' && !!id))]
    : []
  if (categoryIds.length === 0) return NextResponse.json({ error: 'Elige al menos una categoría' }, { status: 400 })

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
  const currency = (body.currency ?? 'USD') as Currency
  const rawAmount = num(body.amount, NaN)
  const retroactive = body.retroactive === undefined ? true : Boolean(body.retroactive)

  if (!CURRENCIES.includes(currency)) return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })

  const invalidAmount = validateBudgetAmount(rawAmount)
  if (invalidAmount) return NextResponse.json({ error: invalidAmount }, { status: 400 })

  const { data: categories } = await supabase
    .from('fin_categories').select('id, kind, archived').eq('profile_id', profileId).in('id', categoryIds)
  if ((categories ?? []).length !== categoryIds.length) {
    return NextResponse.json({ error: 'Alguna de esas categorías no existe' }, { status: 400 })
  }
  if ((categories ?? []).some(c => c.kind !== 'gasto')) {
    return NextResponse.json({ error: 'El presupuesto solo aplica a categorías de gasto' }, { status: 400 })
  }
  // Una categoría archivada ya no se ofrece al registrar un gasto, así que un
  // presupuesto sobre ella nunca podría moverse. El selector tampoco la
  // muestra — esto ataja el caso de archivarla con el sheet ya abierto.
  if ((categories ?? []).some(c => c.archived)) {
    return NextResponse.json({ error: 'No se puede presupuestar una categoría archivada' }, { status: 400 })
  }

  // Chequeo previo para un mensaje legible — el índice único de
  // `fin_budget_line_categories` (user_id, category_id) es la red de verdad.
  const { data: dup } = await supabase
    .from('fin_budget_line_categories').select('category_id').eq('profile_id', profileId).in('category_id', categoryIds)
  if ((dup ?? []).length > 0) {
    return NextResponse.json({ error: 'Alguna de esas categorías ya tiene un presupuesto' }, { status: 409 })
  }

  const today = todayISO()
  const { data: line, error } = await supabase
    .from('fin_budget_lines')
    .insert({ user_id: userId, profile_id: profileId, name, input_currency: currency, retroactive, created_on: today })
    .select(BUDGET_LINE_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { error: categoriesError } = await supabase
    .from('fin_budget_line_categories')
    .insert(categoryIds.map(category_id => ({ user_id: userId, profile_id: profileId, line_id: line.id, category_id })))

  if (categoriesError) {
    await supabase.from('fin_budget_lines').delete().eq('id', line.id).eq('profile_id', profileId)
    return NextResponse.json({ error: `No se pudieron guardar las categorías: ${categoriesError.message}` }, { status: 400 })
  }

  // El monto nativo se guarda tal cual y la tasa se CONGELA — mismo criterio
  // que `fin_transactions`. Así "2.400 Bs" sigue diciendo 2.400 aunque el
  // paralelo se mueva; el USD es lo derivado, para comparar entre líneas.
  const { rates } = await ensureRates(supabase, userId)
  const exchangeRate = freezeRate(currency, rates)
  const amountUsd = round2(toUsd(rawAmount, currency, rates))

  const { error: periodError } = await supabase
    .from('fin_budget_periods')
    .insert({
      user_id: userId, profile_id: profileId, line_id: line.id, period: periodStart(today),
      amount: rawAmount, amount_usd: amountUsd, exchange_rate: exchangeRate,
    })

  if (periodError) {
    // Compensación: sin su primer monto, la línea no queda a medias — mismo
    // criterio que el reparto de un gasto (Sprint 2 §4.7). Cascade se lleva
    // las filas de fin_budget_line_categories.
    await supabase.from('fin_budget_lines').delete().eq('id', line.id).eq('profile_id', profileId)
    return NextResponse.json({ error: `No se pudo guardar el monto: ${periodError.message}` }, { status: 400 })
  }

  return NextResponse.json({ line }, { status: 201 })
}
