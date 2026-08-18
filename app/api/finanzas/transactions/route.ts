import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { loadTransactions } from '@/lib/finanzas/load'
import { freezeConversion, validateInput } from '@/lib/finanzas/transactions'
import { freezeSplitUsd, validateSplits } from '@/lib/finanzas/splits'
import { resolvePeople, assertOwnedPeople } from '@/lib/finanzas/people'
import { SPLIT_COLS } from '@/lib/finanzas/shared'
import type { Account, Currency, SplitInput, TransactionInput } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived'

/** El reparto tal como llega del cliente, sin confiar en nada. */
export function readSplitInput(raw: unknown): SplitInput[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return []
  return raw.map(r => ({
    person_id: typeof r?.person_id === 'string' ? r.person_id : undefined,
    person_name: typeof r?.person_name === 'string' ? r.person_name : undefined,
    amount: num(r?.amount, NaN),
  }))
}

export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const q = new URL(request.url).searchParams
  const { data, error } = await loadTransactions(supabase, userId, {
    from: q.get('from'),
    to: q.get('to'),
    type: q.get('type'),
    accountId: q.get('account_id'),
    categoryId: q.get('category_id'),
    sharedOnly: q.get('shared') === '1',
    limit: num(q.get('limit'), 200),
    offset: num(q.get('offset'), 0),
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const input: Partial<TransactionInput> = {
    type: body.type,
    date: body.date,
    account_id: body.account_id,
    to_account_id: body.to_account_id ?? null,
    category_id: body.category_id ?? null,
    amount: num(body.amount, NaN),
    to_amount: body.to_amount == null ? null : num(body.to_amount),
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
  }
  const splitsInput = readSplitInput(body.splits) ?? []

  // Cuentas y tasas no dependen entre sí — van juntas en un solo viaje.
  const [{ data: accountRows }, { rates }] = await Promise.all([
    supabase.from('fin_accounts').select(ACCOUNT_COLS).eq('user_id', userId),
    ensureRates(supabase, userId),
  ])

  const accountsById = new Map<string, Account>(
    (accountRows ?? []).map(r => {
      const a = mapAccount(r)
      return [a.id, a]
    }),
  )

  const check = validateInput(input, accountsById)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  // La moneda sale de la cuenta, nunca del cliente.
  const currency = accountsById.get(input.account_id!)!.currency
  const frozen = freezeConversion(input.amount!, currency, rates)

  // Se leen las personas antes de validar: hacen falta para cruzar las filas
  // que llegan por id con las que llegan por nombre y son la misma persona.
  const conocidas = splitsInput.length > 0
    ? (await supabase.from('fin_people').select('id, name').eq('user_id', userId)).data ?? []
    : []

  const splitCheck = validateSplits(splitsInput, input.type!, input.amount!, currency, conocidas)
  if (!splitCheck.ok) return NextResponse.json({ error: splitCheck.error }, { status: 400 })

  const ownedError = await assertOwnedPeople(
    supabase, userId,
    splitsInput.map(s => s.person_id).filter((x): x is string => Boolean(x)),
  )
  if (ownedError) return NextResponse.json({ error: ownedError }, { status: 400 })

  const { data, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type: input.type,
      // El cliente nunca manda `flow_type`. Un gasto o un ingreso registrados
      // desde el quick-add son siempre consumo; los movimientos financieros los
      // crea el server (transferencias y cobros).
      flow_type: input.type === 'transferencia' ? 'movimiento' : 'consumo',
      date: input.date,
      account_id: input.account_id,
      to_account_id: input.type === 'transferencia' ? input.to_account_id : null,
      category_id: input.type === 'transferencia' ? null : input.category_id,
      amount: input.amount,
      currency,
      to_amount: input.type === 'transferencia' ? input.to_amount : null,
      exchange_rate: frozen.exchange_rate,
      amount_usd: frozen.amount_usd,
      description: input.description,
    })
    .select(TX_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (splitsInput.length === 0) {
    return NextResponse.json({ transaction: { ...data, splits: [] } }, { status: 201 })
  }

  const { resolved, error: peopleError } = await resolvePeople(supabase, userId, splitsInput)
  if (peopleError) {
    await supabase.from('fin_transactions').delete().eq('id', data.id).eq('user_id', userId)
    return NextResponse.json({ error: peopleError }, { status: 400 })
  }

  const { data: splits, error: splitError } = await supabase
    .from('fin_splits')
    .insert(resolved.map(r => ({
      user_id: userId,
      transaction_id: data.id,
      person_id: r.person_id,
      amount: r.amount,
      currency,
      // Con la tasa congelada del gasto, no con la de hoy: si cada parte
      // convirtiera por su cuenta, las partes no sumarían al total.
      amount_usd: freezeSplitUsd(r.amount, frozen.exchange_rate),
    })))
    .select(SPLIT_COLS)

  if (splitError) {
    // Compensación (§4.7 del sprint). Si este delete también falla, lo peor que
    // queda es un gasto normal sin reparto: una fila válida, no un dato roto.
    await supabase.from('fin_transactions').delete().eq('id', data.id).eq('user_id', userId)
    return NextResponse.json({ error: `No se pudo guardar el reparto: ${splitError.message}` }, { status: 400 })
  }

  return NextResponse.json({ transaction: { ...data, splits: splits ?? [] } }, { status: 201 })
}
