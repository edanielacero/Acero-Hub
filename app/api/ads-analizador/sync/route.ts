import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { hoyServidor } from '@/lib/ads-analizador/load'
import { sincronizar, type CampanaSync } from '@/lib/ads-analizador/sync'

// Varias campañas × Meta + Stripe en serie. El default de Vercel corta antes.
export const maxDuration = 60

const COLS = 'id, user_id, nombre, meta_campaign_id, tipo_conversion, moneda, activo'

/**
 * Trae Insights de Meta (y pagos de Stripe) de las campañas activas del
 * usuario y los guarda.
 *
 * No hay cron: la app llama a esta ruta sola al abrirse si los datos tienen
 * más de unas horas (ver `AdsProvider`), y con el botón "Actualizar". Los
 * números solo importan cuando alguien los mira, y así no hace falta ni un
 * secreto ni el cliente admin: todo corre con la sesión del usuario y RLS.
 */
export async function POST() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase.from('ads_campaigns').select(COLS).eq('activo', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultado = await sincronizar(supabase, (data ?? []) as CampanaSync[], hoyServidor())
  return NextResponse.json(resultado)
}
