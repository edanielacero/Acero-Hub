import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, round2 } from '@/lib/finanzas/money'
import { isValidPeriod, resolvePeriod, validateBudgetAmount } from '@/lib/finanzas/budgets'

/**
 * Registra una ampliación del tope de UN mes puntual — el "Ampliar
 * presupuesto" del bloqueo en el quick-add (§4.6 del spec). Queda auditada
 * aparte de `fin_budget_periods`: nunca pisa el monto original, así que
 * después se puede mostrar "se amplió 2 veces: +$15 el 12, +$8 el 24".
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
  const amount = num(body.amount_usd, NaN)
  const invalid = validateBudgetAmount(amount)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const { data: line } = await supabase
    .from('fin_budget_lines').select('id, category_id').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!line) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })
  // El tope general nunca bloquea (§4.6): no hay nada que ampliar por acá.
  if (line.category_id === null) return NextResponse.json({ error: 'El tope general no se amplía' }, { status: 400 })

  const { data: periodRows } = await supabase
    .from('fin_budget_periods').select('id, line_id, period, amount_usd').eq('user_id', userId).eq('line_id', id)
  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string, amount_usd: num(p.amount_usd),
  }))

  const resolved = resolvePeriod(periods, id, body.period)
  let periodId = resolved.periodRowId
  if (!periodId) {
    // Se heredaba de un mes anterior: hay que materializar la fila de ESTE
    // mes antes de poder colgarle una ampliación (§3.3 del spec).
    if (resolved.amountUsd == null) {
      return NextResponse.json({ error: 'Esta línea todavía no tiene un monto cargado' }, { status: 400 })
    }
    const { data: created, error: createError } = await supabase
      .from('fin_budget_periods')
      .insert({ user_id: userId, line_id: id, period: body.period, amount_usd: resolved.amountUsd })
      .select('id')
      .single()
    if (createError || !created) {
      return NextResponse.json({ error: createError?.message ?? 'No se pudo registrar' }, { status: 400 })
    }
    periodId = created.id
  }

  const { data, error } = await supabase
    .from('fin_budget_extensions')
    .insert({ user_id: userId, period_id: periodId, amount_usd: round2(amount) })
    .select('id, period_id, amount_usd, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ extension: data }, { status: 201 })
}
