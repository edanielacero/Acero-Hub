import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureRates } from '@/lib/finanzas/rates'
import { num } from '@/lib/finanzas/money'
import { mapAccount } from '@/lib/finanzas/accounts'
import { applyBudgetExtension, assertBalance, loadTransactions } from '@/lib/finanzas/load'
import { flowTypeFor, freezeConversion, validateInput } from '@/lib/finanzas/transactions'
import type { Account, Currency, TransactionInput } from '@/lib/finanzas/types'

const TX_COLS =
  'id, type, flow_type, date, account_id, to_account_id, category_id, amount, currency, to_amount, exchange_rate, amount_usd, description'

const ACCOUNT_COLS = 'id, name, currency, initial_balance, initial_balance_date, sort_order, archived, is_investment'

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
    recurringOnly: q.get('recurring') === '1',
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
    budget_extension_usd: body.budget_extension_usd == null ? undefined : num(body.budget_extension_usd),
  }

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
  const account = accountsById.get(input.account_id!)!
  const currency = account.currency

  const balanceError = await assertBalance(supabase, userId, account, input.type!, input.amount!)
  if (balanceError) return NextResponse.json({ error: balanceError }, { status: 400 })

  const frozen = freezeConversion(input.amount!, currency, rates)


  const { data, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type: input.type,
      // El cliente nunca manda `flow_type`: lo decide el server según el tipo
      // y la cuenta (ver `flowTypeFor`).
      flow_type: flowTypeFor(input.type!, account),
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

  // Si el quick-add bloqueó por presupuesto y el usuario eligió "Ampliar", la
  // ampliación se registra recién ahora que el gasto ya se guardó de verdad —
  // es contabilidad secundaria, nunca motivo de que el gasto en sí falle. Pero
  // si falla igual, no queda muda: viaja en la respuesta para que el cliente
  // pueda avisar, en vez de que la categoría aparezca "pasada" sin explicación.
  let budgetExtensionError: string | undefined
  if (input.type === 'gasto' && input.budget_extension_usd) {
    const result = await applyBudgetExtension(supabase, userId, input.category_id ?? null, input.date!, input.budget_extension_usd)
    if (!result.ok) budgetExtensionError = result.error
  }

  return NextResponse.json({ transaction: { ...data, debts: [] }, budget_extension_error: budgetExtensionError }, { status: 201 })
}
