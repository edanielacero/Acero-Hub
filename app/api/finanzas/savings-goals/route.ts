import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { loadSavingsGoals } from '@/lib/finanzas/load'
import { validateAllocation, validateGoalName, validateTargetAmount } from '@/lib/finanzas/savings'
import { todayISO } from '@/lib/finanzas/transactions'
import { CURRENCIES, type AllocationType, type Currency } from '@/lib/finanzas/types'

export async function GET(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const today = new URL(request.url).searchParams.get('today') || todayISO()
  return NextResponse.json(await loadSavingsGoals(supabase, userId, today))
}

/**
 * Crea un ahorro. Sin `category_id` ni ningún vínculo con las cuentas: es
 * independiente de ambos (Ronda 1 de sprint_7_ahorro.md) — la app se entera
 * de en qué cuenta vive su plata recién cuando se registra un aporte.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const nameError = validateGoalName(body.name)
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })

  const currency = body.currency as Currency
  if (!CURRENCIES.includes(currency)) return NextResponse.json({ error: 'Moneda inválida' }, { status: 400 })

  // El cajón de sastre no reparte según una regla propia: recibe lo que sobra.
  // Sus dos campos de reparto quedan nulos a propósito (§0.6 del spec).
  const isCatchall = Boolean(body.is_catchall)
  const allocationType = isCatchall ? null : (body.allocation_type as AllocationType)
  const allocationValue = isCatchall ? null : num(body.allocation_value, NaN)
  const allocationError = validateAllocation(allocationType, allocationValue, isCatchall)
  if (allocationError) return NextResponse.json({ error: allocationError }, { status: 400 })

  const targetAmount = body.target_amount == null ? null : num(body.target_amount, NaN)
  const targetError = validateTargetAmount(targetAmount)
  if (targetError) return NextResponse.json({ error: targetError }, { status: 400 })

  // Como mucho un cajón de sastre activo (índice único parcial): marcar este
  // desmarca el anterior en vez de rebotar con el error crudo de Postgres —
  // "que este reciba el resto" implica que el otro deja de hacerlo.
  if (isCatchall) {
    await supabase
      .from('fin_savings_goals')
      .update({ is_catchall: false })
      .eq('user_id', userId).eq('is_catchall', true)
  }

  const { data, error } = await supabase
    .from('fin_savings_goals')
    .insert({
      user_id: userId,
      name: (body.name as string).trim(),
      input_currency: currency,
      allocation_type: allocationType,
      allocation_value: allocationValue,
      target_amount: targetAmount,
      target_date: body.target_date ?? null,
      is_catchall: isCatchall,
    })
    .select('id, name, input_currency, allocation_type, allocation_value, target_amount, target_date, is_catchall, sort_order, archived')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ goal: data }, { status: 201 })
}
