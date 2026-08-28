import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { mapMovimiento, MOV_COLS } from '@/lib/gas/load'

/** Finalizar viaje: llega el kilometraje final y recién ahí el viaje cuesta algo. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const kmFinal = Number(body?.kmFinal)
  if (!Number.isFinite(kmFinal) || kmFinal < 0) {
    return NextResponse.json({ error: 'El kilometraje final no es válido' }, { status: 400 })
  }

  const { data: viaje } = await supabase
    .from('gas_movimientos')
    .select(MOV_COLS)
    .eq('id', id)
    .eq('tipo', 'viaje')
    .single()

  if (!viaje) return NextResponse.json({ error: 'Ese viaje no existe' }, { status: 404 })
  if (viaje.km_final !== null) {
    return NextResponse.json({ error: 'Ese viaje ya está cerrado' }, { status: 409 })
  }
  if (kmFinal < Number(viaje.km_inicial)) {
    return NextResponse.json(
      { error: 'El kilometraje final no puede ser menor al inicial' },
      { status: 400 },
    )
  }

  // El `.is('km_final', null)` no es decorativo: hace que cerrar el viaje sea
  // atómico. Si otro dispositivo lo cerró entre el SELECT de arriba y este
  // UPDATE, acá no coincide ninguna fila y el segundo cierre no pisa al primero.
  const { data, error } = await supabase
    .from('gas_movimientos')
    .update({
      km_final: Math.round(kmFinal * 10) / 10,
      terminado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .is('km_final', null)
    .select(MOV_COLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ese viaje ya está cerrado' }, { status: 409 })

  return NextResponse.json({ movimiento: mapMovimiento(data) })
}

/**
 * Cancelar un viaje que se abrió por error.
 *
 * Solo mientras esté EN CURSO: un viaje ya cerrado movió el saldo, y borrarlo
 * desde el mismo botón que cancela sería demasiado fácil de tocar sin querer.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('gas_movimientos')
    .delete()
    .eq('id', id)
    .eq('tipo', 'viaje')
    .is('km_final', null)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'No hay un viaje en curso para cancelar' }, { status: 404 })

  return NextResponse.json({ success: true })
}
