import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import type { RatePair } from '@/lib/finanzas/exchange-rates'

const VALID_PAIRS: RatePair[] = ['USD_BOB', 'BOB_USDT', 'BTC_USDT']

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rates, error } = await supabase
    .from('fin_exchange_rates')
    .select('*')
    .eq('user_id', userId)
    .order('fetched_at', { ascending: false })
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rates })
}

// Override manual — el usuario puede pisar la tasa vigente si una fuente falla o si
// prefiere fijar la suya (ver principio de "conversión configurable" de la spec).
export async function POST(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { pair, rate } = body

  if (!VALID_PAIRS.includes(pair)) {
    return NextResponse.json({ error: 'Par de moneda inválido' }, { status: 400 })
  }
  const rateNum = Number(rate)
  if (!Number.isFinite(rateNum) || rateNum <= 0) {
    return NextResponse.json({ error: 'La tasa debe ser un número mayor a 0' }, { status: 400 })
  }

  const { data: exchangeRate, error } = await supabase
    .from('fin_exchange_rates')
    .insert({ user_id: userId, pair, rate: rateNum, source: 'Manual (usuario)', is_manual_override: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exchangeRate }, { status: 201 })
}
