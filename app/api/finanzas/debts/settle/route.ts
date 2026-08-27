import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num, round2, roundFor } from '@/lib/finanzas/money'
import { freezeConversion, todayISO, isValidDate } from '@/lib/finanzas/transactions'
import { isOpen, debtState } from '@/lib/finanzas/splits'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import type { Currency, FlowType } from '@/lib/finanzas/types'


const TX_SELECT = 'id, type, flow_type, date, account_id, amount, currency, exchange_rate, amount_usd, description'

/**
 * Registrar que te pagaron.
 *
 * Crea uno o dos movimientos reales, según si lo que se cobra trae margen
 * (§ `fin_debts.principal_usd`):
 *
 *   - Sin margen (el caso de siempre): un solo `ingreso` con
 *     `flow_type: 'movimiento'` — sube el saldo, no cuenta como ingreso del
 *     mes. *"Recuperar $8.99 no es haber ganado $8.99."*
 *   - Con margen: ese mismo movimiento por la parte que es recuperar costo, y
 *     UN SEGUNDO `ingreso` normal (`flow_type: 'consumo'`) por el excedente —
 *     ese sí es plata ganada, y se reconoce recién ACÁ, no cuando se creó el
 *     gasto (evita contar la misma ganancia dos veces).
 *
 * Un solo cobro puede cerrar varias deudas: Ana te paga Spotify de julio y
 * agosto de una transferencia.
 */
export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const ids: string[] = Array.isArray(body.split_ids) ? body.split_ids.filter((x: unknown) => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'Elige al menos una deuda para cobrar' }, { status: 400 })

  const accountId = typeof body.account_id === 'string' ? body.account_id : ''
  if (!accountId) return NextResponse.json({ error: 'Indica a qué cuenta entró la plata' }, { status: 400 })

  const amount = num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : todayISO()

  const [{ data: splits }, { data: account }] = await Promise.all([
    supabase
      .from('fin_debts')
      .select(`${DEBT_COLS}, person:fin_people!fin_debts_person_id_fkey(name), transaction:fin_transactions!fin_debts_transaction_id_fkey(description)`)
      .eq('profile_id', profileId)
      .in('id', ids),
    supabase.from('fin_accounts').select('id, currency').eq('profile_id', profileId).eq('id', accountId).maybeSingle(),
  ])

  if (!account) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })

  const rows = splits ?? []
  if (rows.length !== ids.length) {
    return NextResponse.json({ error: 'Alguna de las deudas no existe' }, { status: 404 })
  }

  const yaCerrada = rows.find(s => !isOpen(s))
  if (yaCerrada) {
    // Una deuda suelta no tiene gasto que la nombre: la nombra su concepto.
    const fila = yaCerrada as { concept?: string | null; transaction?: { description?: string } | null }
    const label = fila.transaction?.description?.trim() || fila.concept?.trim() || 'esa deuda'
    const estado = debtState(yaCerrada) === 'cobrado' ? 'ya está cobrada' : 'está perdonada'
    return NextResponse.json({ error: `La deuda de ${label} ${estado}` }, { status: 400 })
  }

  // Un cobro es de una persona. Mezclar dos en el mismo movimiento haría
  // imposible saber después quién pagó qué.
  const personas = new Set(rows.map(s => s.person_id))
  if (personas.size > 1) {
    return NextResponse.json({ error: 'Un cobro no puede mezclar deudas de personas distintas' }, { status: 400 })
  }

  const currency = account.currency as Currency
  const { rates } = await ensureRates(supabase, userId)

  // Cuánto de lo elegido es margen — proporcional a lo que ya traía cada
  // deuda (§ fin_debts.principal_usd) — aplicado al monto REAL que entra, no
  // a la suma teórica de las deudas: un cobro redondeado o negociado no
  // siempre coincide centavo a centavo, y así ganancia + reembolso suman
  // exacto el monto que realmente se cobró.
  const amountUsdTotal = rows.reduce((s, r) => s + num(r.amount_usd), 0)
  const principalUsdTotal = rows.reduce((s, r) => s + num(r.principal_usd), 0)
  const marginUsd = Math.max(0, round2(amountUsdTotal - principalUsdTotal))
  const marginRatio = amountUsdTotal > 0 ? marginUsd / amountUsdTotal : 0

  const ganancia = marginRatio > 0 ? roundFor(amount * marginRatio, currency) : 0
  const reembolso = roundFor(amount - ganancia, currency)

  const nombre = (rows[0] as { person?: { name?: string } }).person?.name ?? 'alguien'
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : `Cobro a ${nombre}`

  async function crearMovimiento(monto: number, flow_type: FlowType, desc: string) {
    const frozen = freezeConversion(monto, currency, rates)
    return supabase
      .from('fin_transactions')
      .insert({
        user_id: userId, profile_id: profileId,
        type: 'ingreso',
        flow_type,
        date,
        account_id: accountId,
        to_account_id: null,
        category_id: null,
        amount: monto,
        currency,
        to_amount: null,
        exchange_rate: frozen.exchange_rate,
        amount_usd: frozen.amount_usd,
        description: desc,
      })
      .select(TX_SELECT)
      .single()
  }

  let reembolsoTx: { id: string } | null = null
  let gananciaTx: { id: string } | null = null

  if (reembolso > 0) {
    const { data, error } = await crearMovimiento(reembolso, 'movimiento', description)
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo registrar el cobro' }, { status: 400 })
    reembolsoTx = data
  }

  if (ganancia > 0) {
    // `flow_type` normal (no `'movimiento'`): esto SÍ es plata ganada, y acá
    // es donde se reconoce — no al crear el gasto.
    const { data, error } = await crearMovimiento(ganancia, 'consumo', `Ganancia — ${description}`)
    if (error || !data) {
      if (reembolsoTx) await supabase.from('fin_transactions').delete().eq('id', reembolsoTx.id).eq('profile_id', profileId)
      return NextResponse.json({ error: error?.message ?? 'No se pudo registrar la ganancia' }, { status: 400 })
    }
    gananciaTx = data
  }

  // Siempre hay al menos uno: `amount > 0` ya se validó arriba, y
  // reembolso + ganancia suman exacto `amount`. `settled_tx_id` es siempre el
  // "principal" (reembolso, o ganancia si el cobro fue 100% margen);
  // `settled_margin_tx_id` es el otro, solo cuando hay dos — únicamente para
  // que `/debts/unsettle` sepa que tiene que borrar ambos.
  const principalTx = reembolsoTx ?? gananciaTx!
  const margenTx = reembolsoTx ? gananciaTx : null

  // El `is null` doble es la guarda contra una carrera: si otra pestaña cobró
  // la misma deuda entre la lectura y esta escritura, el update no la toca y
  // el conteo de abajo lo detecta.
  const { data: updated, error: linkError } = await supabase
    .from('fin_debts')
    .update({ settled_tx_id: principalTx.id, settled_margin_tx_id: margenTx?.id ?? null })
    .eq('profile_id', profileId)
    .in('id', ids)
    .is('settled_tx_id', null)
    .is('waived_at', null)
    .select('id')

  if (linkError || (updated ?? []).length !== ids.length) {
    // Compensación: si no se pudieron enlazar todas, ninguno de los
    // movimientos debe quedar. En el peor caso — que este delete también
    // falle — quedan ingresos sueltos en la lista, filas válidas que se
    // arreglan a mano.
    await supabase.from('fin_transactions').delete().eq('id', principalTx.id).eq('profile_id', profileId)
    if (margenTx) await supabase.from('fin_transactions').delete().eq('id', margenTx.id).eq('profile_id', profileId)
    return NextResponse.json(
      { error: 'No se pudo enlazar el cobro con las deudas. No se registró nada.' },
      { status: 409 },
    )
  }

  return NextResponse.json(
    { transaction: principalTx, ganancia_transaction: margenTx, settled: (updated ?? []).length },
    { status: 201 },
  )
}
