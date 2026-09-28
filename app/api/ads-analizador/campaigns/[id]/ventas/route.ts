import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { hoyServidor, mapVenta, VENTA_COLS } from '@/lib/ads-analizador/load'
import { validarFecha, validarVenta } from '@/lib/ads-analizador/validar'

type Ctx = { params: Promise<{ id: string }> }

async function tipoDeCampana(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], id: string) {
  const { data } = await supabase.from('ads_campaigns').select('tipo_conversion').eq('id', id).maybeSingle()
  return (data?.tipo_conversion as string | undefined) ?? null
}

/**
 * Carga o corrige las ventas de un día. Upsert por (campaign_id, fecha): volver
 * a cargar el mismo día reemplaza el número, no suma otra fila. La fecha puede
 * ser cualquier día pasado — se carga tarde a menudo.
 *
 * En WhatsApp es LA venta del día. En compras es una corrección: la cantidad
 * pisa lo que trajo Meta ese día y el neto es lo recibido después de
 * comisiones — ver `ventasPorDia` en lib/ads-analizador/load.ts.
 */
async function guardar(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const tipo = await tipoDeCampana(supabase, id)
  if (!tipo) return NextResponse.json({ error: 'Esa campaña no existe' }, { status: 404 })

  const body = await request.json().catch(() => null)
  // En WhatsApp la cantidad es la venta; en compras cantidad y neto corrigen
  // cada uno lo suyo (ver validarVenta).
  const v = validarVenta(body, hoyServidor(), tipo === 'venta_manual')
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('ads_ventas_manuales')
    .upsert(
      { ...v.valor, user_id: userId, campaign_id: id, updated_at: new Date().toISOString() },
      { onConflict: 'campaign_id,fecha' },
    )
    .select(VENTA_COLS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ venta: mapVenta(data) })
}

export const POST = guardar
export const PATCH = guardar

/**
 * `?fecha=YYYY-MM-DD`. En compras, vuelve al dato automático de ese día. En
 * WhatsApp, borra la carga (el día queda sin ventas).
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(await tipoDeCampana(supabase, id))) return NextResponse.json({ error: 'Esa campaña no existe' }, { status: 404 })

  const fecha = validarFecha(new URL(request.url).searchParams.get('fecha'), hoyServidor())
  if (!fecha) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })

  const { error } = await supabase.from('ads_ventas_manuales').delete().eq('campaign_id', id).eq('fecha', fecha)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
