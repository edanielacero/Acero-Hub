import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { toUsd } from '@/lib/finanzas/currency'
import { deriveFlowType, requiresToAccount, requiresProfile, type TransactionType, type TransactionStatus } from '@/lib/finanzas/transactions'
import type { Currency } from '@/lib/finanzas/accounts'

const VALID_TYPES: TransactionType[] = [
  'ingreso', 'gasto', 'transferencia', 'inversion', 'retiro_inversion',
  'reembolso', 'pago_deuda_por_cobrar', 'ajuste_patrimonio',
  'aporte_objetivo', 'aporte_pasanaku', 'recepcion_pasanaku',
]
const VALID_CURRENCIES: Currency[] = ['USD', 'BOB']
const VALID_STATUSES: TransactionStatus[] = ['pendiente', 'completada']

export async function GET(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  let query = supabase.from('fin_transactions').select('*').eq('user_id', userId)

  const accountId = searchParams.get('account_id')
  const categoryId = searchParams.get('category_id')
  const type = searchParams.get('type')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  if (accountId) query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (type) query = query.eq('type', type)
  if (dateFrom) query = query.gte('date', dateFrom)
  if (dateTo) query = query.lte('date', dateTo)

  const { data: transactions, error } = await query.order('date', { ascending: false }).order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions })
}

// Obtiene la última tasa USD/Bs del usuario (fetch automático u override manual, lo
// que sea más reciente) — la transacción congela ese valor y nunca se recalcula.
async function getLatestUsdBobRate(userId: string, supabase: Awaited<ReturnType<typeof requireUser>>['supabase']) {
  const { data } = await supabase
    .from('fin_exchange_rates')
    .select('rate')
    .eq('user_id', userId)
    .eq('pair', 'USD_BOB')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.rate as number | undefined
}

export async function POST(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    type, account_id, to_account_id, category_id, profile_id, currency, date,
    description, notes, tags, is_shared, status,
  } = body

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Tipo de transacción inválido' }, { status: 400 })
  }
  if (!VALID_CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
  }
  const amountNum = Number(body.amount)
  if (!Number.isFinite(amountNum)) {
    return NextResponse.json({ error: 'El monto debe ser un número' }, { status: 400 })
  }
  if (type === 'ajuste_patrimonio' ? amountNum === 0 : amountNum <= 0) {
    return NextResponse.json({ error: type === 'ajuste_patrimonio' ? 'El ajuste no puede ser 0' : 'El monto debe ser mayor a 0' }, { status: 400 })
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }
  if (typeof account_id !== 'string' || !account_id) {
    return NextResponse.json({ error: 'La cuenta es requerida' }, { status: 400 })
  }
  const needsToAccount = requiresToAccount(type)
  if (needsToAccount && (typeof to_account_id !== 'string' || !to_account_id)) {
    return NextResponse.json({ error: 'Este tipo de transacción requiere una cuenta destino' }, { status: 400 })
  }
  if (needsToAccount && to_account_id === account_id) {
    return NextResponse.json({ error: 'La cuenta origen y destino no pueden ser la misma' }, { status: 400 })
  }
  if (status != null && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  const needsProfile = requiresProfile(type)
  if (needsProfile && (typeof profile_id !== 'string' || !profile_id)) {
    return NextResponse.json({ error: 'El perfil es requerido para ingresos y gastos' }, { status: 400 })
  }

  const accountIdsToCheck = [account_id, ...(needsToAccount ? [to_account_id] : [])]
  const { data: ownedAccounts } = await supabase.from('fin_accounts').select('id').eq('user_id', userId).in('id', accountIdsToCheck)
  if ((ownedAccounts?.length ?? 0) !== accountIdsToCheck.length) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  }

  if (needsProfile) {
    const { data: profile } = await supabase.from('fin_profiles').select('id').eq('id', profile_id).eq('user_id', userId).single()
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
  }

  if (category_id) {
    const { data: category } = await supabase.from('fin_categories').select('id, kind').eq('id', category_id).eq('user_id', userId).single()
    if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    if ((type === 'gasto' && category.kind !== 'gasto') || (type === 'ingreso' && category.kind !== 'ingreso')) {
      return NextResponse.json({ error: 'La categoría no corresponde a este tipo de transacción' }, { status: 400 })
    }
  }

  let exchangeRateUsed: number | null = null
  let amountUsd: number
  if (currency === 'USD') {
    amountUsd = amountNum
  } else {
    const rate = await getLatestUsdBobRate(userId, supabase)
    if (!rate) {
      return NextResponse.json({ error: 'No hay tipo de cambio configurado. Configuralo en /finanzas/tipo-cambio antes de registrar transacciones en Bs.' }, { status: 400 })
    }
    exchangeRateUsed = rate
    amountUsd = toUsd(amountNum, 'BOB', rate)
  }

  const { data: transaction, error } = await supabase
    .from('fin_transactions')
    .insert({
      user_id: userId,
      type,
      flow_type: deriveFlowType(type),
      account_id,
      to_account_id: needsToAccount ? to_account_id : null,
      category_id: category_id || null,
      profile_id: needsProfile ? profile_id : null,
      amount: amountNum,
      currency,
      exchange_rate_used: exchangeRateUsed,
      amount_usd: amountUsd,
      date,
      description: typeof description === 'string' && description.trim() ? description.trim() : null,
      tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [],
      is_shared: !!is_shared,
      status: status ?? 'completada',
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction }, { status: 201 })
}
