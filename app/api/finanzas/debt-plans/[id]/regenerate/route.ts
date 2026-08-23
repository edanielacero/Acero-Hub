import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, roundFor, toUsd } from '@/lib/finanzas/money'
import { ensureRates } from '@/lib/finanzas/rates'
import { equalInstallments, installmentDate, planTotal } from '@/lib/finanzas/plans'
import { PLAN_FREQUENCIES, type Currency, type PlanFrequency } from '@/lib/finanzas/types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DEBT_PLAN_COLS =
  'id, person_id, concept, principal, currency, interest_rate, installments, frequency, starts_on, note'

/**
 * Renegociar un plan: nuevas condiciones para lo que todavía falta cobrar.
 *
 * Las cuotas ya cobradas o condonadas **no se tocan** — son historia real.
 * Solo se reparten de nuevo las pendientes. Insertar primero y borrar después
 * (§4.6): si la generación nueva falla, no se pierde el calendario viejo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const { data: plan } = await supabase
    .from('fin_debt_plans').select(DEBT_PLAN_COLS).eq('id', id).eq('user_id', userId).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })

  const { data: cuotas } = await supabase
    .from('fin_debts')
    .select('id, amount, settled_tx_id, waived_at, plan_installment_no')
    .eq('user_id', userId)
    .eq('plan_id', id)

  const pendientes = (cuotas ?? []).filter(c => !c.settled_tx_id && !c.waived_at)
  const currency = plan.currency as Currency
  // `roundFor` y no `round2`: un plan puede estar en BTC (8 decimales), y
  // sumar sus cuotas con redondeo de dólar le habría comido la precisión.
  const saldoRestante = roundFor(pendientes.reduce((s, c) => s + num(c.amount), 0), currency)
  const maxNo = (cuotas ?? []).reduce((m, c) => Math.max(m, num(c.plan_installment_no)), 0)

  const principal = body.principal !== undefined ? num(body.principal, NaN) : saldoRestante
  if (!Number.isFinite(principal) || principal <= 0) {
    return NextResponse.json({ error: 'No hay saldo pendiente para regenerar: indica un capital' }, { status: 400 })
  }

  const interestRate = body.interest_rate == null ? null : num(body.interest_rate, NaN)
  if (interestRate !== null && (!Number.isFinite(interestRate) || interestRate < 0)) {
    return NextResponse.json({ error: 'El interés no puede ser negativo' }, { status: 400 })
  }

  const installments = Math.trunc(num(body.installments, NaN))
  if (!Number.isFinite(installments) || installments < 1) {
    return NextResponse.json({ error: 'Elige al menos una cuota' }, { status: 400 })
  }

  const frequency = (body.frequency ?? plan.frequency) as PlanFrequency
  if (!PLAN_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: 'Frecuencia inválida' }, { status: 400 })
  }

  const startsOn = typeof body.starts_on === 'string' && ISO_DATE.test(body.starts_on) ? body.starts_on : ''
  if (!startsOn) return NextResponse.json({ error: 'Elige desde cuándo arranca' }, { status: 400 })

  const mode = body.mode === 'manual' ? 'manual' : 'iguales'

  let nuevas: { amount: number; incurred_on: string }[]
  if (mode === 'manual') {
    const raw = Array.isArray(body.cuotas) ? body.cuotas : []
    if (raw.length !== installments) {
      return NextResponse.json({ error: `Carga las ${installments} cuotas` }, { status: 400 })
    }
    nuevas = raw.map((c: unknown) => {
      const row = c as { amount?: unknown; incurred_on?: unknown }
      return { amount: num(row.amount, NaN), incurred_on: typeof row.incurred_on === 'string' ? row.incurred_on : '' }
    })
    const mala = nuevas.find(c => !Number.isFinite(c.amount) || c.amount <= 0 || !ISO_DATE.test(c.incurred_on))
    if (mala) return NextResponse.json({ error: 'Cada cuota necesita un monto mayor a cero y una fecha' }, { status: 400 })
  } else {
    nuevas = equalInstallments(planTotal(principal, interestRate, currency), installments, currency)
      .map((amount, i) => ({ amount, incurred_on: installmentDate(startsOn, frequency, i) }))
  }

  const { rates } = await ensureRates(supabase, userId)
  const cuotaRows = nuevas.map((c, i) => {
    const amount_usd = toUsd(c.amount, currency, rates)
    return {
      user_id: userId,
      transaction_id: null,
      person_id: plan.person_id,
      amount: c.amount,
      currency,
      amount_usd,
      // Mismo criterio que al crear el plan: el interés queda fuera de este
      // cambio, una cuota sigue siendo 100% "recuperar".
      principal_usd: amount_usd,
      // Sin "/total": después de regenerar, el total real (viejas que quedan +
      // nuevas) no coincide con `maxNo + installments` — esa cuenta cuenta de
      // más las que se están reemplazando. Un número sin fracción no miente.
      concept: `${plan.concept} · cuota ${maxNo + i + 1}`,
      incurred_on: c.incurred_on,
      plan_id: plan.id,
      plan_installment_no: maxNo + i + 1,
    }
  })

  const { data: inserted, error: insertError } = await supabase
    .from('fin_debts').insert(cuotaRows).select('id')

  if (insertError || !inserted || inserted.length !== cuotaRows.length) {
    return NextResponse.json({ error: 'No se pudo regenerar el calendario. No se cambió nada.' }, { status: 500 })
  }

  // El calendario viejo ya no representa el trato: se borran las cuotas
  // pendientes que quedaron reemplazadas. Las cobradas y condonadas ya
  // quedaron afuera del `select` de arriba, así que no se tocan.
  //
  // El `is(...).is(...)` es la guarda contra una carrera: si entre el select
  // de arriba y este delete alguien cobró una de estas cuotas desde otra
  // pestaña, ya no está pendiente y el filtro la protege — perderla borraría
  // el rastro de un cobro real que sí pasó. Mismo patrón que usa
  // `debts/settle` para el mismo problema.
  const idsViejas = pendientes.map(c => c.id)
  if (idsViejas.length > 0) {
    await supabase
      .from('fin_debts').delete().eq('user_id', userId).in('id', idsViejas)
      .is('settled_tx_id', null).is('waived_at', null)
  }

  const { data: updatedPlan, error: planError } = await supabase
    .from('fin_debt_plans')
    .update({ principal, interest_rate: interestRate, installments, frequency, starts_on: startsOn })
    .eq('id', id).eq('user_id', userId)
    .select(DEBT_PLAN_COLS)
    .maybeSingle()

  if (planError) return NextResponse.json({ error: planError.message }, { status: 400 })
  return NextResponse.json({ plan: updatedPlan })
}
