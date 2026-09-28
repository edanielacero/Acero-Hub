import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { CAMBIO_COLS, hoyServidor, mapCambio } from '@/lib/ads-analizador/load'
import { validarCambio } from '@/lib/ads-analizador/validar'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Registra un cambio hecho en Ads Manager, en el día elegido de la tabla (o
 * ahora, si no viene fecha o es hoy). El reloj de cooldown (regla 6) arranca
 * desde el cambio más reciente, y un segundo cambio a mitad del reajuste lo
 * reinicia — no lo acorta.
 *
 * Un día pasado se guarda al mediodía de Bolivia: cualquier hora cerca de la
 * medianoche podría caer en el día de al lado al pasarlo a UTC y volver.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: campana } = await supabase.from('ads_campaigns').select('id').eq('id', id).maybeSingle()
  if (!campana) return NextResponse.json({ error: 'Esa campaña no existe' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const hoy = hoyServidor()
  const v = validarCambio(body, hoy)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { fecha, ...resto } = v.valor
  const { data, error } = await supabase
    .from('ads_cambios_log')
    .insert({
      ...resto,
      user_id: userId,
      campaign_id: id,
      ...(fecha && fecha !== hoy ? { fecha: `${fecha}T12:00:00-04:00` } : {}),
    })
    .select(CAMBIO_COLS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ cambio: mapCambio(data) }, { status: 201 })
}

/** Deshacer un cambio registrado por error: `?cambio=<id>`. */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cambio = new URL(request.url).searchParams.get('cambio')
  if (!cambio) return NextResponse.json({ error: 'Falta el cambio a borrar' }, { status: 400 })

  const { data, error } = await supabase
    .from('ads_cambios_log').delete().eq('id', cambio).eq('campaign_id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: 'Ese cambio no existe' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
