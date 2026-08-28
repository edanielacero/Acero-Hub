import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { mapMovimiento, MOV_COLS } from '@/lib/gas/load'

/** Cargar saldo: plata que entra a la cuenta corriente del auto. */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const autoId = typeof body?.autoId === 'string' ? body.autoId : ''
  const monto = Number(body?.monto)

  if (!autoId) return NextResponse.json({ error: 'Falta el auto' }, { status: 400 })
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: 'El monto tiene que ser mayor a cero' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('gas_movimientos')
    .insert({
      user_id: userId,
      auto_id: autoId,
      tipo: 'carga',
      monto: Math.round(monto * 100) / 100,
    })
    .select(MOV_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ movimiento: mapMovimiento(data) }, { status: 201 })
}
