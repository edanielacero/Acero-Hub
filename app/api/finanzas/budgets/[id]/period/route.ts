import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, round2, toUsd } from '@/lib/finanzas/money'
import { ensureRates } from '@/lib/finanzas/rates'
import { isValidPeriod, validateBudgetAmount } from '@/lib/finanzas/budgets'

/**
 * Crea o actualiza el monto de UN mes puntual. Cambiar agosto no toca julio
 * (§4.8 del spec): cada período es su propia fila, nunca se recalcula el
 * historial.
 *
 * `amount` viaja en la `input_currency` de la línea, no en USD — se fijó una
 * sola vez al crearla (mismo criterio que `retroactive`), así que acá no la
 * vuelve a mandar el cliente: se lee de la propia línea y se usa para
 * convertir antes de guardar.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { rates } = await ensureRates(supabase, userId)
  const amountUsd = round2(toUsd(rawAmount, line.input_currency, rates))

  const { data, error } = await supabase
    .from('fin_budget_periods')
    .upsert(
      { user_id: userId, line_id: id, period: body.period, amount_usd: amountUsd, updated_at: new Date().toISOString() },
      { onConflict: 'line_id,period' },
    )
    .select('id, line_id, period, amount_usd')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ period: data })
}
