import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { AUTO_COLS, mapAuto } from '@/lib/gas/load'

/**
 * Corregir el promedio de un auto.
 *
 * Cambiarlo NO reescribe el pasado: cada viaje guarda su propio `bs_por_km`,
 * congelado cuando se inició. Esto solo afecta a los viajes que vengan.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const cambios: { bs_por_km?: number; nombre?: string } = {}

  if (body?.bsPorKm !== undefined) {
    const valor = Number(body.bsPorKm)
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: 'El promedio tiene que ser mayor a cero' }, { status: 400 })
    }
    cambios.bs_por_km = Math.round(valor * 100) / 100
  }

  if (typeof body?.nombre === 'string') {
    const nombre = body.nombre.trim()
    if (!nombre) return NextResponse.json({ error: 'El auto necesita un nombre' }, { status: 400 })
    cambios.nombre = nombre
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('gas_autos')
    .update(cambios)
    .eq('id', id)
    .select(AUTO_COLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ese auto no existe' }, { status: 404 })

  return NextResponse.json({ auto: mapAuto(data) })
}
