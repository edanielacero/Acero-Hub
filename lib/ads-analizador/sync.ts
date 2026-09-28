/**
 * Sincronización Meta + Stripe → tablas propias.
 *
 * Spec: documentos/ads_analizador/sprint_3_integraciones_meta_stripe.md §4
 *
 * Los clientes externos llegan inyectados (`deps`) para poder probar la
 * orquestación sin pegarle a Meta ni a Stripe.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sumarDias } from './calc'
import { traerInsights, type FilaMeta } from './meta-api'
import { agregarPorDia, listarPaymentIntents, StripeError } from './stripe-api'
import type { Moneda, TipoConversion } from './types'

/** Meta atribuye conversiones con hasta ~72 h de atraso: se re-traen los últimos 3 días. */
export const VENTANA_RESYNC_DIAS = 3
/**
 * La primera vez se traen 30 días. Con solo 7, una campaña que ya venía
 * corriendo aparecía como "muestra chica" por falta de historial, no de ventas.
 */
export const DIAS_BACKFILL_INICIAL = 30
/** Tope de historial de Stripe en su primera sincronización. */
export const DIAS_BACKFILL_STRIPE = 90

/**
 * Qué días pedir. Termina AYER: el día en curso está incompleto y guardarlo
 * lo dejaría como total hasta el sync siguiente.
 */
export function rangoSync(ultimaFecha: string | null, hoy: string): { desde: string; hasta: string } {
  const hasta = sumarDias(hoy, -1)
  const desde = ultimaFecha
    ? sumarDias(ultimaFecha, -(VENTANA_RESYNC_DIAS - 1))
    : sumarDias(hoy, -DIAS_BACKFILL_INICIAL)
  const desdeFinal = desde > hasta ? hasta : desde
  return { desde: desdeFinal, hasta }
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
  moneda: Moneda
  activo: boolean
}

export interface Deps {
  traerInsights: (campaignId: string, desde: string, hasta: string, tipo: TipoConversion) => Promise<FilaMeta[]>
  listarPaymentIntents: (desde: string, hasta: string) => Promise<unknown[]>
}

export const DEPS_REALES: Deps = {
  traerInsights: (id, desde, hasta, tipo) => traerInsights(id, desde, hasta, tipo),
  listarPaymentIntents: (desde, hasta) => listarPaymentIntents(desde, hasta),
}

export interface ResultadoSync {
  procesadas: number
  omitidas: { motivo: string; campanas: string[] }[]
  resultados: { campaign_id: string; nombre: string; ok: boolean; error?: string; dias_sincronizados?: number }[]
}

/**
 * El rango de Stripe va aparte del de Meta: si Stripe se conecta cuando la
 * campaña ya tiene semanas de métricas, el rango de Meta sería solo "los
 * últimos 3 días" y todo lo anterior quedaría para siempre con 0 ventas. La
 * primera vez se completa desde el primer día con métricas (con tope).
 */
async function rangoStripe(
  supabase: SupabaseClient, campaignId: string, rangoMeta: { desde: string; hasta: string }, hoy: string,
): Promise<{ desde: string; hasta: string }> {
  const { data: ultimo } = await supabase
    .from('ads_pagos_stripe').select('fecha').eq('campaign_id', campaignId)
    .order('fecha', { ascending: false }).limit(1).maybeSingle()
  if (ultimo) return rangoSync(ultimo.fecha, hoy)

  const { data: primera } = await supabase
    .from('ads_metricas_diarias').select('fecha').eq('campaign_id', campaignId)
    .order('fecha', { ascending: true }).limit(1).maybeSingle()
  const tope = sumarDias(hoy, -DIAS_BACKFILL_STRIPE)
  const desde = [primera?.fecha ?? rangoMeta.desde, rangoMeta.desde].sort()[0]
  return { desde: desde < tope ? tope : desde, hasta: rangoMeta.hasta }
}

/**
 * Sincroniza las campañas activas recibidas. Cada una en su propio try/catch:
 * que Meta falle para una no frena a las demás (§4.3).
 */
export async function sincronizar(
  supabase: SupabaseClient, campanas: CampanaSync[], hoy: string, deps: Deps = DEPS_REALES,
): Promise<ResultadoSync> {
  const activas = campanas.filter(c => c.activo)
  const out: ResultadoSync = { procesadas: 0, omitidas: [], resultados: [] }

  // §4.2: con más de un checkout posible no se sabe de quién es cada pago.
  // Adivinar duplicaría ventas en dos dashboards; no se reparte a ninguna.
  const stripeActivas = activas.filter(c => c.tipo_conversion === 'compra_stripe')
  let stripeHabilitado = stripeActivas.length === 1
  if (stripeActivas.length > 1) {
    out.omitidas.push({ motivo: 'mas_de_una_campana_stripe_activa', campanas: stripeActivas.map(c => c.id) })
  }

  for (const c of activas) {
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

      let errorStripe: string | null = null
      if (c.tipo_conversion === 'compra_stripe' && stripeHabilitado) {
        try {
          const rs = await rangoStripe(supabase, c.id, rango, hoy)
          const intents = await deps.listarPaymentIntents(rs.desde, rs.hasta)
          const dias = agregarPorDia(intents, diasEntre(rs.desde, rs.hasta), c.moneda)
          const ahora = new Date().toISOString()
          const { error } = await supabase.from('ads_pagos_stripe').upsert(
            dias.map(d => ({ ...d, user_id: c.user_id, campaign_id: c.id, updated_at: ahora })),
            { onConflict: 'campaign_id,fecha' },
          )
          if (error) throw new Error(error.message)
        } catch (e) {
          if (e instanceof StripeError && /Falta configurar/.test(e.message)) {
            stripeHabilitado = false
            out.omitidas.push({ motivo: 'stripe_sin_credenciales', campanas: [c.id] })
          } else {
            errorStripe = `Stripe: ${(e as Error).message}`
          }
        }
      }

      await supabase.from('ads_campaigns').update({ ultima_sync: new Date().toISOString() }).eq('id', c.id)
      out.procesadas++
      out.resultados.push(errorStripe
        ? { campaign_id: c.id, nombre: c.nombre, ok: false, error: errorStripe, dias_sincronizados: filas.length }
        : { campaign_id: c.id, nombre: c.nombre, ok: true, dias_sincronizados: filas.length })
    } catch (e) {
      out.resultados.push({ campaign_id: c.id, nombre: c.nombre, ok: false, error: (e as Error).message })
    }
  }

  return out
}
