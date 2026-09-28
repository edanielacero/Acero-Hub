import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { CAMPANA_COLS, cargarDetalle, mapCampana } from '@/lib/ads-analizador/load'
import { validarEdicion } from '@/lib/ads-analizador/validar'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noExiste = () => NextResponse.json({ error: 'Esa campaña no existe' }, { status: 404 })

/** La campaña con todo su historial, para el dashboard. */
export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!UUID.test(id)) return noExiste()

  try {
    const detalle = await cargarDetalle(supabase, id)
    if (!detalle) return noExiste()
    return NextResponse.json(detalle)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/** Editar nombre, precio, margen, ROAS objetivo o pausar. Solo pisa lo que venga. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!UUID.test(id)) return noExiste()

  const { data: actual } = await supabase
    .from('ads_campaigns').select('precio_venta, margen_venta').eq('id', id).maybeSingle()
  if (!actual) return noExiste()

  const body = await request.json().catch(() => null)
  const v = validarEdicion(body, { precioVenta: Number(actual.precio_venta), margenVenta: Number(actual.margen_venta) })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('ads_campaigns').update(v.valor).eq('id', id).select(CAMPANA_COLS).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return noExiste()

  return NextResponse.json({ campana: mapCampana(data) })
}

/** Borra la campaña y, por cascada, todo su historial. */
export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!UUID.test(id)) return noExiste()

  const { data, error } = await supabase.from('ads_campaigns').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.length) return noExiste()

  return NextResponse.json({ ok: true })
}
