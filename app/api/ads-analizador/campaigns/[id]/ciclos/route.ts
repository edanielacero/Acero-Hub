import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { CICLO_COLS, hoyServidor, mapCiclo } from '@/lib/ads-analizador/load'
import { validarCiclos } from '@/lib/ads-analizador/validar'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Guarda lo que el dashboard calculó con `planificarCiclos`: abre, cierra
 * (con su foto) o interrumpe ciclos, y borra los de cambios deshechos.
 *
 * El cálculo vive en el cliente porque necesita el costo de referencia de las
 * otras campañas, igual que el semáforo. Acá se valida la forma y las fechas
 * de cierre y revisión las pone el servidor. Un ciclo ya revisado y cerrado
 * no se toca: su foto es definitiva.
 */
export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: campana } = await supabase.from('ads_campaigns').select('id').eq('id', id).maybeSingle()
  if (!campana) return NextResponse.json({ error: 'Esa campaña no existe' }, { status: 404 })

  const v = validarCiclos(await request.json().catch(() => null), hoyServidor())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { data: actuales, error: e1 } = await supabase.from('ads_ciclos').select(CICLO_COLS).eq('campaign_id', id)
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 })
  const porInicio = new Map((actuales ?? []).map(r => [r.inicio as string, mapCiclo(r)]))
  const ahora = new Date().toISOString()

  const filas = v.valor.escribir.flatMap(o => {
    const g = porInicio.get(o.inicio)
    if (g?.revisadoEn && (g.estado === 'cerrado' || g.estado === 'cortado')) return []
    const cerrado = o.estado !== 'abierto'
    return [{
      user_id: userId, campaign_id: id, inicio: o.inicio, fin: o.fin, dias_ciclo: o.dias_ciclo, estado: o.estado,
      snapshot: o.snapshot,
      cerrado_en: cerrado ? (g?.cerradoEn ?? ahora) : null,
      revisado_en: g?.revisadoEn ?? (o.revisar ? ahora : null),
      updated_at: ahora,
    }]
  })
  if (filas.length > 0) {
    const { error } = await supabase.from('ads_ciclos').upsert(filas, { onConflict: 'campaign_id,inicio' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (v.valor.borrar.length > 0) {
    const { error } = await supabase.from('ads_ciclos').delete().eq('campaign_id', id).in('id', v.valor.borrar)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { data, error } = await supabase.from('ads_ciclos').select(CICLO_COLS).eq('campaign_id', id).order('inicio')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ciclos: (data ?? []).map(mapCiclo) })
}

/** `{ id }`: confirma que el usuario revisó un ciclo cerrado (sale de la vista congelada). */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const cicloId = typeof body?.id === 'string' ? body.id : ''
  const { data, error } = await supabase
    .from('ads_ciclos')
    .update({ revisado_en: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('campaign_id', id)
    .eq('id', cicloId)
    .in('estado', ['cerrado', 'cortado'])
    .is('revisado_en', null)
    .select(CICLO_COLS)
    .maybeSingle()
  if (error && !/invalid input syntax/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Ese ciclo no existe, no está cerrado o ya se revisó' }, { status: 404 })
  return NextResponse.json({ ciclo: mapCiclo(data) })
}
