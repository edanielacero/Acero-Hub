import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { crossCurrencySuggestion, num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, todayISO, isValidDate } from '@/lib/finanzas/transactions'
import { assertBalance } from '@/lib/finanzas/load'
import type { Currency } from '@/lib/finanzas/types'


const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description, pasanaku_id'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

/**
 * Registrar un aporte. `flow_type: 'movimiento'`, no `'consumo'` — la plata
 * sale de la cuenta pero vuelve completa cuando te toca el turno, así que no
 * puede ensuciar "cuánto gasté este mes" (§3.1 de contexto_finanzas.md).
 *
 * Repetible sin límite y sin control de "ya registraste este mes": a
 * diferencia de un fijo, acá no hay un período estricto que cuidar — es un
 * tracker personal, no un calendario de rondas ajenas.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) ?? {}

  const { data: p } = await supabase
    .from('fin_pasanaku')
    .select('id, name, account_id, currency, contribution_amount')
    .eq('id', id).eq('profile_id', profileId).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Pasanaku no encontrado' }, { status: 404 })

  // El pasanaku no tiene cuenta propia — se elige recién acá, igual que un
  // fijo (§ RegisterSheet). `p.account_id` solo sirve como último default si
  // ya se usó una vez; sin body ni default, no hay de dónde sacarla.
  const accountId = typeof body.account_id === 'string' && body.account_id ? body.account_id : p.account_id
  if (!accountId) return NextResponse.json({ error: 'Elige de qué cuenta sale' }, { status: 400 })

  const { data: accountRow } = await supabase
    .from('fin_accounts').select(ACCOUNT_COLS).eq('profile_id', profileId).eq('id', accountId).maybeSingle()
  if (!accountRow) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })
  const account = mapAccount(accountRow)
  // Un aporte ahí sería indistinguible de un ajuste de valor de inversión
  // (mismo `flow_type: 'movimiento'`) y desaparecería de Movimientos — ver
  // isInvestmentAdjustment() en lib/finanzas/transactions.ts.
  if (account.is_investment) {
    return NextResponse.json({ error: 'No puedes aportar desde una cuenta de inversión' }, { status: 400 })
  }

  const currency = account.currency as Currency
  const { rates } = await ensureRates(supabase, userId)

  // `contribution_amount` está denominado en `p.currency`, no necesariamente
  // en la de la cuenta elegida — se convierte con la tasa de hoy cuando
  // difieren, mismo mecanismo que usa el sheet (`crossCurrencySuggestion`).
  const defaultAmount = currency === p.currency
    ? num(p.contribution_amount)
    : crossCurrencySuggestion(num(p.contribution_amount), p.currency as Currency, currency, rates) ?? num(p.contribution_amount)
  const amount = body.amount === undefined ? defaultAmount : num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : todayISO()

  const balanceError = await assertBalance(supabase, scope, account, 'gasto', amount)
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const frozen = freezeConversion(amount, currency, rates)

  const { data: tx, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId, profile_id: profileId,
      type: 'gasto',
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
      description: typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : p.name,
      pasanaku_id: id,
    })
    .select(TX_COLS)
    .single()

  if (error || !tx) return NextResponse.json({ error: error?.message ?? 'No se pudo registrar' }, { status: 400 })
  return NextResponse.json({ transaction: tx }, { status: 201 })
}
