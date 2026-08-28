import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { mapMovimiento, MOV_COLS } from '@/lib/gas/load'

/** Máximo razonable de gente en un auto. Atrapa un `personas: 40` mal tipeado. */
const MAX_PERSONAS = 12

/** Iniciar viaje: se abre el movimiento y queda esperando el kilometraje final. */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const autoId = typeof body?.autoId === 'string' ? body.autoId : ''
  const kmInicial = Number(body?.kmInicial)
  const personas = Number(body?.personas)

  if (!autoId) return NextResponse.json({ error: 'Falta el auto' }, { status: 400 })
  if (!Number.isFinite(kmInicial) || kmInicial < 0) {
    return NextResponse.json({ error: 'El kilometraje inicial no es válido' }, { status: 400 })
  }
  if (!Number.isInteger(personas) || personas < 1 || personas > MAX_PERSONAS) {
    return NextResponse.json({ error: `Las personas van de 1 a ${MAX_PERSONAS}` }, { status: 400 })
  }

  // El Bs/km se congela desde la BASE, no desde lo que mande el cliente: es el
  // precio del viaje y no puede depender de quien llama a la ruta.
  const { data: auto } = await supabase
    .from('gas_autos')
    .select('bs_por_km')
    .eq('id', autoId)
    .single()

  if (!auto) return NextResponse.json({ error: 'Ese auto no existe' }, { status: 404 })

  const { data, error } = await supabase
    .from('gas_movimientos')
    .insert({
      user_id: userId,
      auto_id: autoId,
      tipo: 'viaje',
      km_inicial: Math.round(kmInicial * 10) / 10,
      personas,
      bs_por_km: auto.bs_por_km,
    })
    .select(MOV_COLS)
    .single()

  // 23505 = el índice parcial de "un solo viaje abierto por auto". Pasa si se
  // abrió un viaje desde otro dispositivo, o con dos toques muy seguidos.
  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Ese auto ya tiene un viaje en curso' }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ movimiento: mapMovimiento(data) }, { status: 201 })
}
