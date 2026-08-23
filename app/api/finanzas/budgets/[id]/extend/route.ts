import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { freezeRate, num, round2, toUsd } from '@/lib/finanzas/money'
import { ensureRates } from '@/lib/finanzas/rates'
import { isValidPeriod, resolvePeriod, validateBudgetAmount } from '@/lib/finanzas/budgets'
import type { Currency } from '@/lib/finanzas/types'

/**
 * Registra una ampliación del tope de UN mes puntual — el "Ampliar
 * presupuesto" del bloqueo en el quick-add (§4.6 del spec). Queda auditada
 * aparte de `fin_budget_periods`: nunca pisa el monto original, así que
 * después se puede mostrar "se amplió 2 veces: +$15 el 12, +$8 el 24".
 *
 * `amount` viaja en la moneda de la línea, igual que en `/period` — y se
 * guarda nativo con su tasa congelada, no reconvertido desde USD.
 *
 * El quick-add llama a esto indirectamente mandando `budget_extension_usd`
 * en el mismo `POST /transactions` que guarda el gasto (ver
 * `applyBudgetExtension` en `lib/finanzas/load.ts`); esta ruta existe para
 * ampliar sin necesidad de guardar un gasto en el mismo paso — por ejemplo,
 * desde la propia pantalla de Presupuesto.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!isValidPeriod(body.period)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  const rawAmount = num(body.amount, NaN)
  const invalid = validateBudgetAmount(rawAmount)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { data: line } = await supabase
    .from('fin_budget_lines').select('id, input_currency').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!line) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })

  const { data: periodRows } = await supabase
    .from('fin_budget_periods')
    .select('id, line_id, period, amount, amount_usd, exchange_rate').eq('user_id', userId).eq('line_id', id)
  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string,
    amount: num(p.amount), amount_usd: num(p.amount_usd), exchange_rate: num(p.exchange_rate),
  }))

  const { rates } = await ensureRates(supabase, userId)
  const exchangeRate = freezeRate(line.input_currency as Currency, rates)
  const amountUsd = round2(toUsd(rawAmount, line.input_currency as Currency, rates))

  const resolved = resolvePeriod(periods, id, body.period)
  let periodId = resolved.periodRowId
  if (!periodId) {
    // Se heredaba de un mes anterior: hay que materializar la fila de ESTE
    // mes antes de poder colgarle una ampliación (§3.3 del spec). Se copia
    // el monto heredado tal cual, con la tasa que ese monto ya tenía.
    if (resolved.amountUsd == null || resolved.amount == null) {
      return NextResponse.json({ error: 'Esta línea todavía no tiene un monto cargado' }, { status: 400 })
    }
    const inherited = periods
      .filter(p => p.period < body.period)
      .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
    const { data: created, error: createError } = await supabase
      .from('fin_budget_periods')
      .insert({
        user_id: userId, line_id: id, period: body.period,
        amount: resolved.amount, amount_usd: resolved.amountUsd,
        exchange_rate: inherited ? inherited.exchange_rate : exchangeRate,
      })
      .select('id')
      .single()
    if (createError || !created) {
      return NextResponse.json({ error: createError?.message ?? 'No se pudo registrar' }, { status: 400 })
    }
    periodId = created.id
  }

  const { data, error } = await supabase
    .from('fin_budget_extensions')
    .insert({
      user_id: userId, period_id: periodId,
      amount: rawAmount, amount_usd: amountUsd, exchange_rate: exchangeRate,
    })
    .select('id, period_id, amount, amount_usd, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ extension: data }, { status: 201 })
}
