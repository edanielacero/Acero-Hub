import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num } from '@/lib/finanzas/money'
import { freezeConversion, todayISO } from '@/lib/finanzas/transactions'
import { freezeDebtUsd } from '@/lib/finanzas/splits'
import { periodOf, resolveSplits } from '@/lib/finanzas/recurring'
import { DEBT_COLS } from '@/lib/finanzas/shared'
import type { Currency, Recurring, RecurringSplit } from '@/lib/finanzas/types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description, recurring_id'

/**
 * Instanciar un fijo: crea el gasto real y su reparto.
 *
 * **Nunca se dispara solo.** Es una decisión de producto cerrada en el
 * documento de contexto: si la app posteara sola, el día que Spotify te cambie
 * el precio o te rebote el pago tendrías un gasto que no ocurrió y un saldo que
 * no cuadra con la cuenta real. La app te dice qué falta; el gasto lo confirmás
 * vos.
 *
 * Todo lo que viene en el body pisa a la plantilla solo para ESTA instancia:
 * la plantilla no se modifica salvo que lo pidas aparte.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) ?? {}

  const [{ data: plantilla }, { data: templateSplits }] = await Promise.all([
    supabase
      .from('fin_recurring')
      .select('id, name, emoji, amount, account_id, category_id, frequency, day_of_month, month_of_year, active, note, starts_on')
      .eq('id', id).eq('user_id', userId).maybeSingle(),
    supabase
      .from('fin_recurring_splits')
      .select('id, recurring_id, person_id, amount')
      .eq('user_id', userId).eq('recurring_id', id),
  ])

  if (!plantilla) return NextResponse.json({ error: 'Fijo no encontrado' }, { status: 404 })

  const base = {
    ...(plantilla as unknown as Recurring),
    amount: num(plantilla.amount),
    day_of_month: num(plantilla.day_of_month, 1),
    month_of_year: plantilla.month_of_year === null ? null : num(plantilla.month_of_year),
  }

  const hoy = todayISO()

  // La fecha por defecto es la que le toca en el período vigente, no hoy: si
  // Spotify cobra el 5 y lo registrás el 18, el cargo fue el 5. Anotarlo hoy
  // correría el gasto de mes en los bordes y ensuciaría cualquier reporte.
  const date = typeof body.date === 'string' && ISO_DATE.test(body.date)
    ? body.date
    : periodOf(base, hoy).due

  // El período se calcula sobre la fecha PEDIDA, no sobre hoy. Con un fijo que
  // arranca meses atrás se registra marzo estando en agosto, y comparar contra
  // el período de hoy dejaría duplicar marzo cuantas veces se quisiera.
  const { from, to } = periodOf(base, date)

  // Idempotencia: dos toques al botón no generan dos gastos. Se chequea contra
  // el período, no contra la fecha exacta, porque el segundo toque podría traer
  // otra fecha dentro del mismo mes.
  if (body.force !== true) {
    const { data: yaEsta } = await supabase
      .from('fin_transactions')
      .select('id, date')
      .eq('user_id', userId).eq('recurring_id', id)
      .gte('date', from).lte('date', to)
      .limit(1)

    if ((yaEsta ?? []).length > 0) {
      return NextResponse.json(
        { error: `${base.name} ya está registrado en ese período`, transaction_id: yaEsta![0].id },
        { status: 409 },
      )
    }
  }

  const accountId = typeof body.account_id === 'string' ? body.account_id : base.account_id
  const { data: account } = await supabase
    .from('fin_accounts').select('id, currency').eq('user_id', userId).eq('id', accountId).maybeSingle()
  if (!account) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })

  const amount = body.amount === undefined ? base.amount : num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const currency = account.currency as Currency
  const { rates } = await ensureRates(supabase, userId)
  const frozen = freezeConversion(amount, currency, rates)

  const { data: tx, error: txError } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type: 'gasto',
      flow_type: 'consumo',
      date,
      account_id: accountId,
      to_account_id: null,
      category_id: body.category_id === undefined ? base.category_id : (body.category_id || null),
      amount,
      currency,
      to_amount: null,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      description: typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : base.name,
      recurring_id: id,
    })
    .select(TX_COLS)
    .single()

  if (txError || !tx) {
    return NextResponse.json({ error: txError?.message ?? 'No se pudo registrar' }, { status: 400 })
  }

  // Las partes parejas se calculan con el monto de ESTE mes, no con el que
  // tenía la plantilla cuando la creaste.
  const partes = resolveSplits(
    (templateSplits ?? []).map(s => ({
      person_id: s.person_id,
      amount: s.amount === null ? null : num(s.amount),
    })) as RecurringSplit[],
    amount,
    currency,
  )

  let debts: unknown[] = []
  if (partes.length > 0) {
    const { data: creados, error: splitError } = await supabase
      .from('fin_debts')
      .insert(partes.map(pt => ({
        user_id: userId,
        transaction_id: tx.id,
        person_id: pt.person_id,
        amount: pt.amount,
        currency,
        amount_usd: freezeDebtUsd(pt.amount, frozen.exchange_rate),
        // La deuda nace el día del gasto, no el día que lo registraste. Sin
        // esto, registrar Spotify tarde hacía que la deuda pareciera más nueva
        // de lo que es: "hace 1 día" cuando en realidad son 14. Y la lista de
        // Deudas ordena por esta fecha, así que también salía mal ordenada.
        incurred_on: date,
      })))
      .select(DEBT_COLS)

    if (splitError) {
      // Misma compensación que en el Sprint 2: si el reparto no entra, el gasto
      // no queda. El peor caso posible es un gasto normal sin reparto.
      await supabase.from('fin_transactions').delete().eq('id', tx.id).eq('user_id', userId)
      return NextResponse.json({ error: `No se pudo guardar el reparto: ${splitError.message}` }, { status: 400 })
    }
    debts = creados ?? []
  }

  // "Spotify subió de precio": actualizar la plantilla es explícito, nunca un
  // efecto colateral de registrar un mes más caro.
  if (body.update_template === true && amount !== base.amount) {
    await supabase.from('fin_recurring')
      .update({ amount, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId)
  }

  return NextResponse.json({ transaction: { ...tx, debts } }, { status: 201 })
}
