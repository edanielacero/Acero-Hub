import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { cargarAutos, cargarMovimientos } from '@/lib/gas/load'

/** Todo lo que la mini-app necesita para pintar, en un solo viaje. */
export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Los autos primero: la primera visita los crea, y sin ellos los movimientos
  // no tendrían a qué colgarse.
  const autos = await cargarAutos(supabase, userId)
  const movimientos = await cargarMovimientos(supabase)

  return NextResponse.json({ autos, movimientos })
}
