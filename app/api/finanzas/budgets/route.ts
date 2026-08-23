import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, round2, toUsd } from '@/lib/finanzas/money'
import { loadBudgets } from '@/lib/finanzas/load'
import { ensureRates } from '@/lib/finanzas/rates'
import { periodStart, validateBudgetAmount } from '@/lib/finanzas/budgets'
import { todayISO } from '@/lib/finanzas/transactions'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'

export const BUDGET_LINE_COLS = 'id, category_id, name, input_currency, retroactive, created_on, archived'

export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // El día del usuario, no el del servidor (Vercel corre en UTC) — de él
  // depende qué período es "el vigente" y qué meses ya terminaron.
  const today = new URL(request.url).searchParams.get('today') || todayISO()
  return NextResponse.json(await loadBudgets(supabase, userId, today))
}

/**
 * Crea una línea de presupuesto con su primer monto. `category_id` ausente o
 * `null` es el tope general — nunca bloquea el quick-add (§4.6 del spec),
 * pero sigue el mismo mecanismo de línea + período que cualquier categoría.
 *
 * `amount` viaja en `currency` (comodidad de entrada, revisión post-Sprint
 * 6: el usuario piensa en Bs, no en USD) — acá se convierte y de ahí en más
 * `amount_usd` es lo único que se guarda. `name` es un alias opcional; sin
 * él, el cliente muestra el nombre de la categoría (o "Presupuesto
 * general") como default, así que acá no hace falta resolver nada.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const categoryId: string | null = typeof body.category_id === 'string' && body.category_id ? body.category_id : null
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
  const currency = (body.currency ?? 'USD') as Currency
  const rawAmount = num(body.amount, NaN)
  const retroactive = body.retroactive === undefined ? true : Boolean(body.retroactive)

  if (!CURRENCIES.includes(currency)) return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })

  const invalidAmount = validateBudgetAmount(rawAmount)
  if (invalidAmount) return NextResponse.json({ error: invalidAmount }, { status: 400 })

  if (categoryId) {
    const { data: category } = await supabase
      .from('fin_categories').select('id, kind').eq('user_id', userId).eq('id', categoryId).maybeSingle()
    if (!category) return NextResponse.json({ error: 'La categoría no existe' }, { status: 400 })
    if (category.kind !== 'gasto') {
      return NextResponse.json({ error: 'El presupuesto solo aplica a categorías de gasto' }, { status: 400 })
    }
  }

  // Chequeo previo para un mensaje legible — el índice único parcial es la
  // red de verdad (`fin_budget_lines_category_idx` / `..._general_idx`).
  let dupQuery = supabase.from('fin_budget_lines').select('id').eq('user_id', userId).eq('archived', false)
  dupQuery = categoryId ? dupQuery.eq('category_id', categoryId) : dupQuery.is('category_id', null)
  const { data: dup } = await dupQuery.maybeSingle()
  if (dup) {
    return NextResponse.json(
      { error: categoryId ? 'Esa categoría ya tiene una línea de presupuesto' : 'Ya existe un tope general' },
      { status: 409 },
    )
  }

  const today = todayISO()
  const { data: line, error } = await supabase
    .from('fin_budget_lines')
    .insert({ user_id: userId, category_id: categoryId, name, input_currency: currency, retroactive, created_on: today })
    .select(BUDGET_LINE_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { rates } = await ensureRates(supabase, userId)
  const amountUsd = round2(toUsd(rawAmount, currency, rates))

  const { error: periodError } = await supabase
    .from('fin_budget_periods')
    .insert({ user_id: userId, line_id: line.id, period: periodStart(today), amount_usd: amountUsd })

  if (periodError) {
    // Compensación: sin su primer monto, la línea no queda a medias — mismo
    // criterio que el reparto de un gasto (Sprint 2 §4.7).
    await supabase.from('fin_budget_lines').delete().eq('id', line.id).eq('user_id', userId)
    return NextResponse.json({ error: `No se pudo guardar el monto: ${periodError.message}` }, { status: 400 })
  }

  return NextResponse.json({ line }, { status: 201 })
}
