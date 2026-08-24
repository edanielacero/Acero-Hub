import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, roundFor } from '@/lib/finanzas/money'
import {
  carriedInto, disponible, effectiveFromFor, gastoRealCategoria, isValidPeriod, montoEfectivo, periodRange,
} from '@/lib/finanzas/budgets'

interface DebtEmbed {
  transaction: { id: string } | null
  amount: unknown
  currency: string
  amount_usd: unknown
  principal_usd: unknown
  waived_at: string | null
}

/**
 * Responde la pregunta de cierre de UN mes de UNA línea: ¿se lleva el
 * sobrante/sobregasto al siguiente, o no? (§4.5 del spec — reemplaza al
 * `rollover_mode` estático del primer borrador).
 *
 * El disponible que se congela lo calcula el SERVER, nunca el cliente: es la
 * única fuente que puede leer los movimientos reales de ese mes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!isValidPeriod(body.period)) return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
  if (typeof body.carried !== 'boolean') return NextResponse.json({ error: 'Falta decir si se lleva o no' }, { status: 400 })

  const { data: line } = await supabase
    .from('fin_budget_lines').select('id, input_currency, retroactive, created_on').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!line) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })

  const [{ data: periodRows }, { data: closureRows }, { data: lineCatRows }] = await Promise.all([
    supabase.from('fin_budget_periods')
      .select('id, line_id, period, amount, amount_usd, exchange_rate').eq('user_id', userId).eq('line_id', id),
    supabase.from('fin_budget_closures')
      .select('line_id, period, carried, amount, amount_usd').eq('user_id', userId).eq('line_id', id),
    supabase.from('fin_budget_line_categories').select('category_id').eq('user_id', userId).eq('line_id', id),
  ])
  const categoryIds = (lineCatRows ?? []).map(r => r.category_id as string)
  const periods = (periodRows ?? []).map(p => ({
    id: p.id as string, line_id: p.line_id as string, period: p.period as string,
    amount: num(p.amount), amount_usd: num(p.amount_usd), exchange_rate: num(p.exchange_rate),
  }))
  const closures = (closureRows ?? []).map(c => ({
    line_id: c.line_id as string, period: c.period as string, carried: c.carried as boolean,
    amount: num(c.amount), amount_usd: num(c.amount_usd),
  }))

  const periodIds = periods.map(p => p.id)
  const { data: extensionRows } = periodIds.length > 0
    ? await supabase.from('fin_budget_extensions').select('period_id, amount, amount_usd').in('period_id', periodIds)
    : { data: [] as { period_id: string; amount: number; amount_usd: number }[] }
  const extensions = (extensionRows ?? []).map(e => ({
    period_id: e.period_id as string, amount: num(e.amount), amount_usd: num(e.amount_usd),
  }))

  // Sin esto, cerrar un mes que tuvo una ampliación (§4.6) congelaba un
  // disponible que ignoraba esos dólares extra — el número que se lleva o se
  // pierde al mes siguiente quedaba mal para siempre.
  const effective = montoEfectivo(periods, extensions, id, body.period, line.input_currency)
  if (effective == null) return NextResponse.json({ error: 'Ese período no tenía monto cargado' }, { status: 400 })

  // La tasa con la que ese mes quedó expresado — el disponible congelado se
  // guarda también en moneda nativa, para poder mostrarlo sin reconvertir.
  const periodRow = periods.find(p => p.period === body.period)
    ?? periods.filter(p => p.period < body.period).sort((a, b) => (a.period < b.period ? 1 : -1))[0]
  const rate = periodRow ? periodRow.exchange_rate : 1

  const { to } = periodRange(body.period)
  const from = effectiveFromFor(line, body.period)
  const carried = carriedInto(closures, id, body.period)

  const [{ data: txRows }, { data: debtRows }] = await Promise.all([
    supabase
      .from('fin_transactions').select('id, category_id, amount, currency, amount_usd, flow_type, date')
      .eq('user_id', userId).eq('type', 'gasto').gte('date', from).lte('date', to),
    supabase
      .from('fin_debts')
      .select('amount, currency, amount_usd, principal_usd, waived_at, transaction:fin_transactions!fin_debts_transaction_id_fkey(id)')
      .eq('user_id', userId),
  ])

  const txs = (txRows ?? [])
    .filter(t => t.flow_type !== 'movimiento')
    .map(t => ({
      id: t.id as string, category_id: t.category_id as string | null,
      amount: num(t.amount), currency: t.currency as string,
      amount_usd: num(t.amount_usd), date: t.date as string,
    }))
  const debts = ((debtRows ?? []) as unknown as DebtEmbed[])
    .filter(d => d.transaction)
    .map(d => ({
      transaction_id: d.transaction!.id,
      amount: num(d.amount), currency: d.currency,
      amount_usd: num(d.amount_usd), principal_usd: num(d.principal_usd),
      waived_at: d.waived_at,
    }))

  const spent = gastoRealCategoria(txs, debts, categoryIds, from, to, line.input_currency, rate)
  // Un mes ya cerrado no tiene nada "todavía por pasar": sin `comprometido`.
  const amount_usd = disponible({
    montoEfectivoUsd: effective.amountUsd,
    gastoRealUsd: spent.amountUsd,
    comprometidoUsd: 0,
    carriedUsd: carried.amountUsd,
  })!
  // El nativo se arma con los montos exactos, no convirtiendo el USD.
  const amount = roundFor(effective.amount + carried.amount - spent.amount, line.input_currency)

  const { data, error } = await supabase
    .from('fin_budget_closures')
    .insert({
      user_id: userId, line_id: id, period: body.period, carried: body.carried,
      amount, amount_usd, exchange_rate: rate,
    })
    .select('id, line_id, period, carried, amount, amount_usd')
    .single()

  if (error) {
    // El índice único (line_id, period) es la red: un cierre no se responde dos veces.
    return NextResponse.json({ error: 'Ese mes ya tiene una decisión de cierre' }, { status: 409 })
  }

  return NextResponse.json({ closure: data }, { status: 201 })
}
