import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num, toUsd } from '@/lib/finanzas/money'
import { ensureRates } from '@/lib/finanzas/rates'
import { isOpen } from '@/lib/finanzas/splits'
import { equalInstallments, installmentDate, planTotal } from '@/lib/finanzas/plans'
import { loadDebtPlans } from '@/lib/finanzas/load'
import { PLAN_FREQUENCIES, type Currency, type PlanFrequency } from '@/lib/finanzas/types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DEBT_PLAN_COLS =
  'id, person_id, concept, principal, currency, interest_rate, installments, frequency, starts_on, note'
const DEBT_COLS =
  'id, transaction_id, person_id, amount, currency, amount_usd, settled_tx_id, waived_at, note, concept, incurred_on, plan_id, plan_installment_no'

/** Todos los planes de pago del usuario, con sus cuotas ya resueltas. */
export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({ plans: await loadDebtPlans(supabase, userId) })
}

/**
 * Crear un plan de pago **sobre una deuda que ya existe**.
 *
 * No se puede armar un plan de la nada: primero se registra la deuda (persona,
 * monto, concepto — el flujo de siempre) y recién ahí se decide ponerla en
 * cuotas. El plan hereda persona, moneda y capital de esa deuda; no se vuelven
 * a tipear. Al crearse, la deuda original se reemplaza por sus cuotas — son
 * el mismo monto, solo que partido.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const debtId = typeof body.debt_id === 'string' ? body.debt_id : ''
  if (!debtId) return NextResponse.json({ error: 'Elegí sobre qué deuda armar el plan' }, { status: 400 })

  const { data: debt } = await supabase
    .from('fin_debts')
    .select('id, person_id, amount, currency, concept, transaction_id, plan_id, settled_tx_id, waived_at')
    .eq('id', debtId).eq('user_id', userId).maybeSingle()

  if (!debt) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 })
  if (debt.transaction_id) {
    return NextResponse.json(
      { error: 'Esta deuda viene de un gasto compartido. Los planes de pago son para deudas sueltas.' },
      { status: 400 },
    )
  }
  if (debt.plan_id) {
    return NextResponse.json({ error: 'Esta deuda ya es una cuota de otro plan' }, { status: 400 })
  }
  if (!isOpen(debt)) {
    return NextResponse.json({ error: 'Esta deuda ya está cerrada' }, { status: 400 })
  }

  const principal = num(debt.amount)
  const currency = debt.currency as Currency
  const concept = debt.concept ?? 'Deuda'
  const person_id = debt.person_id

  const interestRate = body.interest_rate == null ? null : num(body.interest_rate, NaN)
  if (interestRate !== null && (!Number.isFinite(interestRate) || interestRate < 0)) {
    return NextResponse.json({ error: 'El interés no puede ser negativo' }, { status: 400 })
  }

  const installments = Math.trunc(num(body.installments, NaN))
  if (!Number.isFinite(installments) || installments < 1) {
    return NextResponse.json({ error: 'Elegí al menos una cuota' }, { status: 400 })
  }

  const frequency = (body.frequency ?? 'mensual') as PlanFrequency
  if (!PLAN_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: 'Frecuencia inválida' }, { status: 400 })
  }

  const startsOn = typeof body.starts_on === 'string' && ISO_DATE.test(body.starts_on) ? body.starts_on : ''
  if (!startsOn) return NextResponse.json({ error: 'Elegí desde cuándo arranca' }, { status: 400 })

  const mode = body.mode === 'manual' ? 'manual' : 'iguales'

  let cuotas: { amount: number; incurred_on: string }[]
  if (mode === 'manual') {
    const raw = Array.isArray(body.cuotas) ? body.cuotas : []
    if (raw.length !== installments) {
      return NextResponse.json({ error: `Cargá las ${installments} cuotas` }, { status: 400 })
    }
    cuotas = raw.map((c: unknown) => {
      const row = c as { amount?: unknown; incurred_on?: unknown }
      return { amount: num(row.amount, NaN), incurred_on: typeof row.incurred_on === 'string' ? row.incurred_on : '' }
    })
    const mala = cuotas.find(c => !Number.isFinite(c.amount) || c.amount <= 0 || !ISO_DATE.test(c.incurred_on))
    if (mala) return NextResponse.json({ error: 'Cada cuota necesita un monto mayor a cero y una fecha' }, { status: 400 })
  } else {
    cuotas = equalInstallments(planTotal(principal, interestRate, currency), installments, currency)
      .map((amount, i) => ({ amount, incurred_on: installmentDate(startsOn, frequency, i) }))
  }

  const { data: plan, error: planError } = await supabase
    .from('fin_debt_plans')
    .insert({
      user_id: userId, person_id, concept, principal, currency,
      interest_rate: interestRate, installments, frequency, starts_on: startsOn,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
    })
    .select(DEBT_PLAN_COLS)
    .single()

  if (planError || !plan) {
    return NextResponse.json({ error: planError?.message ?? 'No se pudo crear el plan' }, { status: 400 })
  }

  const { rates } = await ensureRates(supabase, userId)
  const cuotaRows = cuotas.map((c, i) => ({
    user_id: userId,
    transaction_id: null,
    person_id,
    amount: c.amount,
    currency,
    amount_usd: toUsd(c.amount, currency, rates),
    // Sin gasto padre, `fin_debt_origin_shape` exige un concepto propio: la
    // numeración lo hace legible en la lista de Deudas sin ir a ver el plan.
    concept: `${concept} · cuota ${i + 1}/${installments}`,
    incurred_on: c.incurred_on,
    plan_id: plan.id,
    plan_installment_no: i + 1,
  }))

  const { data: inserted, error: cuotasError } = await supabase
    .from('fin_debts')
    .insert(cuotaRows)
    .select(DEBT_COLS)

  if (cuotasError || !inserted || inserted.length !== cuotaRows.length) {
    // Compensación: sin cuotas, un plan solo no significa nada. La deuda
    // original ni se tocó — no se pierde nada, se puede reintentar.
    await supabase.from('fin_debt_plans').delete().eq('id', plan.id).eq('user_id', userId)
    return NextResponse.json(
      { error: 'No se pudo generar el calendario de cuotas. No se creó nada.' },
      { status: 500 },
    )
  }

  // La deuda original queda reemplazada por sus cuotas: son el mismo monto,
  // ahora partido. Dejarla viva duplicaría lo que se debe. Si este borrado
  // falla —caso raro, la fila es del propio usuario y ya se validó arriba—
  // el plan y sus cuotas ya están bien creados; queda una deuda vieja visible
  // y de más, que se borra a mano. Mejor eso que perder el plan recién hecho.
  //
  // El `is(...).is(...)` es la misma guarda contra una carrera que usan
  // `regenerate` y `DELETE /debt-plans/[id]`: si la deuda se cobró o se
  // condonó justo entre el chequeo de arriba y este borrado, no se toca —
  // borrarla a ciegas dejaría un cobro real sin nada que lo explique.
  await supabase
    .from('fin_debts').delete().eq('id', debt.id).eq('user_id', userId)
    .is('settled_tx_id', null).is('waived_at', null)

  return NextResponse.json({ plan: { ...plan, cuotas: inserted } }, { status: 201 })
}
