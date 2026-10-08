import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { hoyServidor } from '@/lib/ads-analizador/load'
import { sincronizar, type CampanaSync } from '@/lib/ads-analizador/sync'

// Varias campañas contra Meta en serie. El default de Vercel corta antes.
export const maxDuration = 60

const COLS = 'id, user_id, nombre, meta_campaign_id, tipo_conversion, activo'

/**
 * Trae Insights de Meta de las campañas activas del
 * usuario y los guarda.
 *
 * No hay cron: la app llama a esta ruta sola al abrirse si los datos tienen
 * más de unas horas (ver `AdsProvider`), y con el botón "Actualizar" (del home,
 * todas; de una campaña, con `{ campaignId }`, solo esa). Los
 * números solo importan cuando alguien los mira, y así no hace falta ni un
 * secreto ni el cliente admin: todo corre con la sesión del usuario y RLS.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { campaignId?: unknown }
  const campaignId = body?.campaignId
  if (campaignId != null && (typeof campaignId !== 'string' || !UUID.test(campaignId))) {
    return NextResponse.json({ error: 'campaignId inválido' }, { status: 400 })
  }

  let q = supabase.from('ads_campaigns').select(COLS).eq('activo', true)
  if (campaignId) q = q.eq('id', campaignId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (campaignId && (data ?? []).length === 0) {
    return NextResponse.json({ error: 'La campaña no existe o está pausada' }, { status: 404 })
  }

  const resultado = await sincronizar(supabase, (data ?? []) as CampanaSync[], hoyServidor())
  return NextResponse.json(resultado)
}
