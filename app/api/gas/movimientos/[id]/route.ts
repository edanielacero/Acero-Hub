import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { mapMovimiento, MOV_COLS } from '@/lib/gas/load'

/**
 * Corregir o borrar un movimiento ya registrado.
 *
 * Existe aparte de /api/gas/viajes porque son dos cosas distintas: aquella es
 * el FLUJO del viaje (abrirlo, cerrarlo, cancelarlo) y esta es la CORRECCIÓN
 * del libro — tecleaste mal el odómetro y te diste cuenta después.
 *
 * El `bs_por_km` del viaje no se toca ni siquiera acá: es el precio que tenía
 * el auto ese día. Para cambiar el promedio está /api/gas/autos/[id], y solo
 * rige de ahí en adelante.
 */

const MAX_PERSONAS = 12
const MAX_NOTA = 200

/**
 * La nota que viene en el cuerpo, lista para guardar.
 *
 * `undefined` = no se mandó, no se toca. `null` = se mandó vacía, se borra:
 * son dos cosas distintas y confundirlas haría imposible sacar una nota.
 */
function leerNota(body: Record<string, unknown> | null): string | null | undefined | 'larga' {
  if (body?.nota === undefined) return undefined
  if (body.nota === null) return null
  if (typeof body.nota !== 'string') return undefined

  const limpia = body.nota.trim()
  if (limpia.length > MAX_NOTA) return 'larga'
  return limpia === '' ? null : limpia
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)

  const { data: actual } = await supabase
    .from('gas_movimientos')
    .select(MOV_COLS)
    .eq('id', id)
    .maybeSingle()

  if (!actual) return NextResponse.json({ error: 'Ese movimiento no existe' }, { status: 404 })

  const nota = leerNota(body)
  if (nota === 'larga') {
    return NextResponse.json({ error: `La nota no puede pasar de ${MAX_NOTA} caracteres` }, { status: 400 })
  }
  const conNota = nota === undefined ? {} : { nota }

  /* ── Solo la nota ── */
  // Se puede mandar la nota sola, sin tocar los números: es el caso de anotar
  // el para qué del viaje desde el resumen, apenas se cierra.
  if (nota !== undefined && body?.monto === undefined && body?.kmInicial === undefined
      && body?.kmFinal === undefined && body?.personas === undefined) {
    return guardar(supabase, id, conNota)
  }

  /* ── Carga ── */
  if (actual.tipo === 'carga') {
    const monto = Number(body?.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: 'El monto tiene que ser mayor a cero' }, { status: 400 })
    }
    return guardar(supabase, id, { monto: Math.round(monto * 100) / 100, ...conNota })
  }

  /* ── Viaje ── */
  const abierto = actual.km_final === null

  const kmInicial = body?.kmInicial === undefined ? Number(actual.km_inicial) : Number(body.kmInicial)
  const personas = body?.personas === undefined ? Number(actual.personas) : Number(body.personas)

  // En un viaje abierto el km final sigue siendo null: cerrarlo es otra cosa y
  // tiene su propia ruta. Acá solo se corrige lo que ya se había anotado.
  const kmFinal = abierto
    ? null
    : body?.kmFinal === undefined ? Number(actual.km_final) : Number(body.kmFinal)

  if (!Number.isFinite(kmInicial) || kmInicial < 0) {
    return NextResponse.json({ error: 'El kilometraje inicial no es válido' }, { status: 400 })
  }
  if (!Number.isInteger(personas) || personas < 1 || personas > MAX_PERSONAS) {
    return NextResponse.json({ error: `Las personas van de 1 a ${MAX_PERSONAS}` }, { status: 400 })
  }
  if (kmFinal !== null) {
    if (!Number.isFinite(kmFinal) || kmFinal < 0) {
      return NextResponse.json({ error: 'El kilometraje final no es válido' }, { status: 400 })
    }
    if (kmFinal < kmInicial) {
      return NextResponse.json(
        { error: 'El kilometraje final no puede ser menor al inicial' },
        { status: 400 },
      )
    }
  }

  return guardar(supabase, id, {
    km_inicial: Math.round(kmInicial * 10) / 10,
    personas,
    ...(kmFinal === null ? {} : { km_final: Math.round(kmFinal * 10) / 10 }),
    ...conNota,
  })
}

type Cliente = Awaited<ReturnType<typeof requireUser>>['supabase']

async function guardar(supabase: Cliente, id: string, cambios: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('gas_movimientos')
    .update(cambios)
    .eq('id', id)
    .select(MOV_COLS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ese movimiento no existe' }, { status: 404 })

  return NextResponse.json({ movimiento: mapMovimiento(data) })
}

/** Borra el movimiento, sea carga o viaje. El saldo se recalcula solo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('gas_movimientos')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ese movimiento no existe' }, { status: 404 })

  return NextResponse.json({ success: true })
}
