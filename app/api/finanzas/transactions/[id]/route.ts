import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { toUsd } from '@/lib/finanzas/currency'
import { deriveFlowType, requiresToAccount, requiresProfile, type TransactionType, type TransactionStatus } from '@/lib/finanzas/transactions'
import type { Currency } from '@/lib/finanzas/accounts'

interface Params { params: Promise<{ id: string }> }

const VALID_TYPES: TransactionType[] = [
  'ingreso', 'gasto', 'transferencia', 'inversion', 'retiro_inversion',
  'reembolso', 'pago_deuda_por_cobrar', 'ajuste_patrimonio',
  'aporte_objetivo', 'aporte_pasanaku', 'recepcion_pasanaku',
]
const VALID_CURRENCIES: Currency[] = ['USD', 'BOB']
const VALID_STATUSES: TransactionStatus[] = ['pendiente', 'completada']

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: existing }, body] = await Promise.all([
    supabase.from('fin_transactions').select('*').eq('id', id).eq('user_id', userId).single(),
    req.json(),
  ])
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const type: TransactionType = 'type' in body ? body.type : existing.type
  if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Tipo de transacción inválido' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if ('type' in body) {
    update.type = type
    update.flow_type = deriveFlowType(type)
  }

  const needsToAccount = requiresToAccount(type)
  const accountId: string = 'account_id' in body ? body.account_id : existing.account_id
  const toAccountId: string | null = needsToAccount
    ? ('to_account_id' in body ? body.to_account_id : existing.to_account_id)
    : null

  if (needsToAccount && !toAccountId) {
    return NextResponse.json({ error: 'Este tipo de transacción requiere una cuenta destino' }, { status: 400 })
  }
  if (needsToAccount && toAccountId === accountId) {
    return NextResponse.json({ error: 'La cuenta origen y destino no pueden ser la misma' }, { status: 400 })
  }
  if ('account_id' in body || 'to_account_id' in body || 'type' in body) {
    const accountIdsToCheck = [accountId, ...(needsToAccount && toAccountId ? [toAccountId] : [])]
    const { data: ownedAccounts } = await supabase.from('fin_accounts').select('id').eq('user_id', userId).in('id', accountIdsToCheck)
    if ((ownedAccounts?.length ?? 0) !== accountIdsToCheck.length) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }
    update.account_id = accountId
    update.to_account_id = needsToAccount ? toAccountId : null
  }

  const needsProfile = requiresProfile(type)
  if ('profile_id' in body || 'type' in body) {
    const profileId: string | null = needsProfile
      ? ('profile_id' in body ? body.profile_id : existing.profile_id)
      : null
    if (needsProfile && !profileId) {
      return NextResponse.json({ error: 'El perfil es requerido para ingresos y gastos' }, { status: 400 })
    }
    if (needsProfile) {
      const { data: profile } = await supabase.from('fin_profiles').select('id').eq('id', profileId).eq('user_id', userId).single()
      if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
    }
    update.profile_id = needsProfile ? profileId : null
  }

  if ('category_id' in body) {
    if (body.category_id) {
      const { data: category } = await supabase.from('fin_categories').select('id, kind').eq('id', body.category_id).eq('user_id', userId).single()
      if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
      if ((type === 'gasto' && category.kind !== 'gasto') || (type === 'ingreso' && category.kind !== 'ingreso')) {
        return NextResponse.json({ error: 'La categoría no corresponde a este tipo de transacción' }, { status: 400 })
      }
    }
    update.category_id = body.category_id || null
  }

  let amountNum: number = existing.amount
  if ('amount' in body) {
    amountNum = Number(body.amount)
    if (!Number.isFinite(amountNum)) return NextResponse.json({ error: 'El monto debe ser un número' }, { status: 400 })
    update.amount = amountNum
  }
  // Revalidar monto+tipo cada vez que cualquiera de los dos cambie: si solo cambia el
  // tipo (ej. de ajuste_patrimonio, que admite negativos, a otro que no) el monto ya
  // guardado podría dejar de ser válido para el nuevo tipo.
  if (('amount' in body || 'type' in body) && (type === 'ajuste_patrimonio' ? amountNum === 0 : amountNum <= 0)) {
    return NextResponse.json({ error: type === 'ajuste_patrimonio' ? 'El ajuste no puede ser 0' : 'El monto debe ser mayor a 0' }, { status: 400 })
  }

  let currency: Currency = existing.currency
  if ('currency' in body) {
    if (!VALID_CURRENCIES.includes(body.currency)) return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })
    currency = body.currency
    update.currency = currency
  }

  // Solo recalculamos el tipo de cambio congelado si cambió la moneda o el monto —
  // tocar otros campos (descripción, notas, categoría...) no debe recalcular nada.
  if ('currency' in body || 'amount' in body) {
    if (currency === 'USD') {
      update.exchange_rate_used = null
      update.amount_usd = amountNum
    } else if ('currency' in body) {
      // Cambió a Bs (o ya era Bs pero se pide moneda explícitamente): usar la tasa vigente ahora.
      const rate = await getLatestUsdBobRate(userId, supabase)
      if (!rate) {
        return NextResponse.json({ error: 'No hay tipo de cambio configurado. Configuralo en /finanzas/tipo-cambio.' }, { status: 400 })
      }
      update.exchange_rate_used = rate
      update.amount_usd = toUsd(amountNum, 'BOB', rate)
    } else {
      // Solo cambió el monto, la moneda ya era Bs: reusar la tasa ya congelada.
      const rate = existing.exchange_rate_used as number
      update.amount_usd = toUsd(amountNum, 'BOB', rate)
    }
  }

  if ('date' in body) {
    const date = body.date
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(Date.parse(date))) {
      return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    }
    update.date = date
  }
  if ('description' in body) update.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  if ('notes' in body) update.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  if ('tags' in body) update.tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown): t is string => typeof t === 'string') : []
  if ('is_shared' in body) update.is_shared = !!body.is_shared
  if ('status' in body) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    update.status = body.status
  }
  update.updated_at = new Date().toISOString()

  const { data: transaction, error } = await supabase
    .from('fin_transactions')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('fin_transactions').delete().eq('id', id).eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
