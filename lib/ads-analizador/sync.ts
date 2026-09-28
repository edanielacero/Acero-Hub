/**
 * Sincronización Meta → ads_metricas_diarias.
 *
 * Spec: documentos/ads_analizador/sprint_3_integraciones_meta_stripe.md §4
 * (la parte de Stripe se sacó el 2026-09-28 por decisión del usuario).
 *
 * El cliente de Meta llega inyectado (`deps`) para poder probar la
 * orquestación sin pegarle a Meta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sumarDias } from './calc'
import { traerInsights, type FilaMeta } from './meta-api'
import type { TipoConversion } from './types'

/** Meta atribuye conversiones con hasta ~72 h de atraso: se re-traen los últimos 3 días. */
export const VENTANA_RESYNC_DIAS = 3
/**
 * La primera vez se traen 30 días. Con solo 7, una campaña que ya venía
 * corriendo aparecía como "muestra chica" por falta de historial, no de ventas.
 */
export const DIAS_BACKFILL_INICIAL = 30

/**
 * Qué días pedir. Incluye HOY, aunque esté en curso: el usuario abre la app
 * para ver cómo va el día. Queda a medias en la base hasta el sync siguiente,
 * que lo vuelve a traer (la ventana de re-sync arranca 2 días antes del último
 * guardado, así que "hoy" siempre se completa). El semáforo no lo usa: se
 * calcula con días completos (ver `armarEstado`).
 */
export function rangoSync(ultimaFecha: string | null, hoy: string): { desde: string; hasta: string } {
  const hasta = hoy
  const desde = ultimaFecha
    ? sumarDias(ultimaFecha, -(VENTANA_RESYNC_DIAS - 1))
    : sumarDias(hoy, -(DIAS_BACKFILL_INICIAL - 1))
  return { desde: desde > hasta ? hasta : desde, hasta }
}

export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d)
  return out
}

export interface CampanaSync {
  id: string
  user_id: string
  nombre: string
  meta_campaign_id: string
  tipo_conversion: TipoConversion
  activo: boolean
}

export interface Deps {
  traerInsights: (campaignId: string, desde: string, hasta: string, tipo: TipoConversion) => Promise<FilaMeta[]>
}

export const DEPS_REALES: Deps = {
  traerInsights: (id, desde, hasta, tipo) => traerInsights(id, desde, hasta, tipo),
}

export interface ResultadoSync {
  procesadas: number
  resultados: { campaign_id: string; nombre: string; ok: boolean; error?: string; dias_sincronizados?: number }[]
}

/**
 * Sincroniza las campañas activas recibidas. Cada una en su propio try/catch:
 * que Meta falle para una no frena a las demás (§4.3).
 */
export async function sincronizar(
  supabase: SupabaseClient, campanas: CampanaSync[], hoy: string, deps: Deps = DEPS_REALES,
): Promise<ResultadoSync> {
  const out: ResultadoSync = { procesadas: 0, resultados: [] }

  for (const c of campanas.filter(c => c.activo)) {
    try {
      const { data: ultima, error: errUltima } = await supabase
        .from('ads_metricas_diarias').select('fecha').eq('campaign_id', c.id)
        .order('fecha', { ascending: false }).limit(1).maybeSingle()
      if (errUltima) throw new Error(errUltima.message)

      const rango = rangoSync(ultima?.fecha ?? null, hoy)
      const filas = await deps.traerInsights(c.meta_campaign_id, rango.desde, rango.hasta, c.tipo_conversion)
      if (filas.length > 0) {
        const ahora = new Date().toISOString()
        const { error } = await supabase.from('ads_metricas_diarias').upsert(
          filas.map(f => ({ ...f, user_id: c.user_id, campaign_id: c.id, updated_at: ahora })),
          { onConflict: 'campaign_id,fecha' },
        )
        if (error) throw new Error(error.message)
      }

      await supabase.from('ads_campaigns').update({ ultima_sync: new Date().toISOString() }).eq('id', c.id)
      out.procesadas++
      out.resultados.push({ campaign_id: c.id, nombre: c.nombre, ok: true, dias_sincronizados: filas.length })
    } catch (e) {
      out.resultados.push({ campaign_id: c.id, nombre: c.nombre, ok: false, error: (e as Error).message })
    }
  }

  return out
}
