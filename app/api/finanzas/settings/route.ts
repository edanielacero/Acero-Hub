import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { ensureSettings } from '@/lib/finanzas/settings'
import { num } from '@/lib/finanzas/money'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json(await ensureSettings(supabase, userId))
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const rate = num(body?.usd_bob_rate, NaN)
  if (!Number.isFinite(rate) || rate <= 0) {
    return NextResponse.json({ error: 'La tasa debe ser un número mayor a cero' }, { status: 400 })
  }

  // Asegura que la fila exista antes de actualizarla.
  await ensureSettings(supabase, userId)

  const { data, error } = await supabase
    .from('fin_settings')
    .update({ usd_bob_rate: rate, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('usd_bob_rate, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ usd_bob_rate: num(data.usd_bob_rate), updated_at: data.updated_at })
}
