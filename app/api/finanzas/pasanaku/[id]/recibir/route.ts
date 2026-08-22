import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { crossCurrencySuggestion, num, roundFor } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { freezeConversion, todayISO } from '@/lib/finanzas/transactions'
import type { Currency } from '@/lib/finanzas/types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description, pasanaku_id'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

/**
 * Marcar que recibiste tu turno. La "verificación" que pediste ES este
 * ingreso: no hay un flag aparte que se pueda desincronizar de si de verdad
 * entró la plata — `loadPasanaku` deriva `received` de que exista.
 *
 * `flow_type: 'movimiento'`, no `'consumo'`: el pozo completo no es plata que
 * ganaste, es la misma plata que aportaste mes a mes volviendo de una vez.
 * Repetible: si el pasanaku sigue rotando y volvés a recibir en una vuelta
 * futura, se registra otra recepción — la más reciente es la que se muestra.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) ?? {}

  const { data: p } = await supabase
    .from('fin_pasanaku')
    .select('id, name, account_id, currency, contribution_amount, total_slots')
    .eq('id', id).eq('user_id', userId).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Pasanaku no encontrado' }, { status: 404 })

  // El pasanaku no tiene cuenta propia — se elige recién acá, igual que en
  // /aporte. `p.account_id` solo sirve como último default si ya se usó una vez.
  const accountId = typeof body.account_id === 'string' && body.account_id ? body.account_id : p.account_id
  if (!accountId) return NextResponse.json({ error: 'Elegí a qué cuenta entra' }, { status: 400 })

  const { data: accountRow } = await supabase
    .from('fin_accounts').select(ACCOUNT_COLS).eq('user_id', userId).eq('id', accountId).maybeSingle()
  if (!accountRow) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 400 })
  const account = mapAccount(accountRow)
  // Misma razón que en /aporte: quedaría indistinguible de un ajuste de valor
  // de inversión y desaparecería de Movimientos.
  if (account.is_investment) {
    return NextResponse.json({ error: 'No podés recibir en una cuenta de inversión' }, { status: 400 })
  }
  const currency = account.currency as Currency
  const { rates } = await ensureRates(supabase, userId)

  // El pozo (`contribution_amount × total_slots`) está denominado en
  // `p.currency`, no necesariamente en la de la cuenta elegida — se convierte
  // con la tasa de hoy cuando difieren, mismo mecanismo que el sheet.
  const pozoHomeCurrency = num(p.contribution_amount) * num(p.total_slots, 1)
  const suggested = currency === p.currency
    ? roundFor(pozoHomeCurrency, currency)
    : crossCurrencySuggestion(pozoHomeCurrency, p.currency as Currency, currency, rates) ?? roundFor(pozoHomeCurrency, currency)
  const amount = body.amount === undefined ? suggested : num(body.amount, NaN)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })
  }

  const date = typeof body.date === 'string' && ISO_DATE.test(body.date) ? body.date : todayISO()

  const frozen = freezeConversion(amount, currency, rates)

  const { data: tx, error } = await supabase
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
      description: typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : `${p.name} · tu turno`,
      pasanaku_id: id,
    })
    .select(TX_COLS)
    .single()

  if (error || !tx) return NextResponse.json({ error: error?.message ?? 'No se pudo registrar' }, { status: 400 })
  return NextResponse.json({ transaction: tx }, { status: 201 })
}
