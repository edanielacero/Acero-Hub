import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { hoyServidor, LLAMADA_COLS, mapLlamada } from '@/lib/ads-analizador/load'
import { validarFecha, validarLlamadas } from '@/lib/ads-analizador/validar'

type Ctx = { params: Promise<{ id: string }> }

async function esDeLlamadas(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], id: string) {
  const { data } = await supabase.from('ads_campaigns').select('tipo_conversion').eq('id', id).maybeSingle()
  return data?.tipo_conversion === 'llamadas'
}

/**
 * Carga o corrige las llamadas de un día (High Ticket), por fecha de la
 * llamada. Upsert por (campaign_id, fecha): volver a cargar reemplaza.
 */
async function guardar(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(await esDeLlamadas(supabase, id))) {
    return NextResponse.json({ error: 'Esa campaña no existe o no es de llamadas' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const v = validarLlamadas(body, hoyServidor())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data, error } = await supabase
    .from('ads_llamadas')
    .upsert(
      { ...v.valor, user_id: userId, campaign_id: id, updated_at: new Date().toISOString() },
      { onConflict: 'campaign_id,fecha' },
    )
    .select(LLAMADA_COLS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ llamada: mapLlamada(data) })
}

export const POST = guardar
export const PATCH = guardar

/** `?fecha=YYYY-MM-DD`: borra la carga de ese día. */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!(await esDeLlamadas(supabase, id))) {
    return NextResponse.json({ error: 'Esa campaña no existe o no es de llamadas' }, { status: 404 })
  }

  const fecha = validarFecha(new URL(request.url).searchParams.get('fecha'), hoyServidor())
  if (!fecha) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })

  const { error } = await supabase.from('ads_llamadas').delete().eq('campaign_id', id).eq('fecha', fecha)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
