import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num } from '@/lib/finanzas/money'
import { freezeConversion, todayISO } from '@/lib/finanzas/transactions'
import { isOpen, debtState } from '@/lib/finanzas/splits'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import type { Currency } from '@/lib/finanzas/types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Registrar que te pagaron.
 *
 * Crea **un** movimiento real — `ingreso` con `flow_type = 'movimiento'` — y
 * apunta a él todas las deudas que salda. Un solo cobro puede cerrar varias:
 * Ana te paga Spotify de julio y agosto de una transferencia.
 *
 * El `flow_type` es lo que hace que el saldo suba pero los ingresos del mes no
 * se muevan. Sin él, recuperar $8.99 se vería como haber ganado $8.99.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const ids: string[] = Array.isArray(body.split_ids) ? body.split_ids.filter((x: unknown) => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'Elegí al menos una deuda para cobrar' }, { status: 400 })

  const accountId = typeof body.account_id === 'string' ? body.account_id : ''
  if (!accountId) return NextResponse.json({ error: 'Indicá a qué cuenta entró la plata' }, { status: 400 })

  const amount = num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const date = typeof body.date === 'string' && ISO_DATE.test(body.date) ? body.date : todayISO()

  const [{ data: splits }, { data: account }] = await Promise.all([
    supabase
      .from('fin_debts')
      .select(`${DEBT_COLS}, person:fin_people!fin_debts_person_id_fkey(name), transaction:fin_transactions!fin_debts_transaction_id_fkey(description)`)
      .eq('user_id', userId)
      .in('id', ids),
    supabase.from('fin_accounts').select('id, currency').eq('user_id', userId).eq('id', accountId).maybeSingle(),
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
  const frozen = freezeConversion(amount, currency, rates)

  const nombre = (rows[0] as { person?: { name?: string } }).person?.name ?? 'alguien'
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : `Cobro a ${nombre}`

  const { data: tx, error: txError } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type: 'ingreso',
      flow_type: 'movimiento',
      date,
      account_id: accountId,
      to_account_id: null,
      category_id: null,
      amount,
      currency,
      to_amount: null,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      description,
    })
    .select('id, type, flow_type, date, account_id, amount, currency, exchange_rate, amount_usd, description')
    .single()

  if (txError || !tx) {
    return NextResponse.json({ error: txError?.message ?? 'No se pudo registrar el cobro' }, { status: 400 })
  }

  // El `is null` doble es la guarda contra una carrera: si otra pestaña cobró
  // la misma deuda entre la lectura y esta escritura, el update no la toca y
  // el conteo de abajo lo detecta.
  const { data: updated, error: linkError } = await supabase
    .from('fin_debts')
    .update({ settled_tx_id: tx.id })
    .eq('user_id', userId)
    .in('id', ids)
    .is('settled_tx_id', null)
    .is('waived_at', null)
    .select('id')

  if (linkError || (updated ?? []).length !== ids.length) {
    // Compensación: si no se pudieron enlazar todas, el movimiento no debe
    // quedar. En el peor caso — que este delete también falle — queda un
    // ingreso suelto en la lista, que es una fila válida y se arregla a mano.
    await supabase.from('fin_transactions').delete().eq('id', tx.id).eq('user_id', userId)
    return NextResponse.json(
      { error: 'No se pudo enlazar el cobro con las deudas. No se registró nada.' },
      { status: 409 },
    )
  }

  return NextResponse.json({ transaction: tx, settled: (updated ?? []).length }, { status: 201 })
}
