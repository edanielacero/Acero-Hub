/**
 * Cliente delgado sobre la Graph API de Meta. Solo lectura.
 *
 * Spec: documentos/ads_analizador/sprint_3_integraciones_meta_stripe.md §4.4
 *
 * La parte pura (`mapearInsight`) se prueba en la suite `unit` con respuestas
 * fijas; la parte de red solo arma URLs y pagina.
 */
import type { TipoConversion } from './types'

export const META_API_VERSION = 'v24.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

export class MetaError extends Error {
  constructor(message: string, public codigo?: number) {
    super(message)
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Accion = { action_type: string; value: string }

/**
 * Qué acción de `actions[]` cuenta como "resultado" según el tipo. Se toma la
 * PRIMERA presente, en este orden: Meta reporta la misma compra bajo varios
 * nombres (omni_, offsite_, pixel_) y sumarlos la contaría dos o tres veces.
 */
export const EVENTO_OPTIMIZADO: Record<TipoConversion, string[]> = {
  compra_stripe: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  venta_manual: [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'onsite_conversion.messaging_first_reply',
  ],
  // High Ticket: agendamiento (evento Schedule) o, si la campaña optimiza a
  // leads, el lead. Sin una campaña real de llamadas todavía para confirmar los
  // nombres exactos: revisar con el primer sync real. Las llamadas que mandan
  // la decisión las carga el usuario; esto es solo el resultado de Meta.
  llamadas: [
    'schedule_total', 'schedule_website', 'offsite_conversion.fb_pixel_schedule',
    'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
  ],
}
const LANDING = ['landing_page_view', 'omni_landing_page_view']
const CHECKOUT = ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']

function primera(lista: Accion[] | undefined, tipos: string[]): number | null {
  if (!lista) return null
  for (const t of tipos) {
    const a = lista.find(x => x.action_type === t)
    if (a) return Number(a.value)
  }
  return null
}

const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

export interface FilaMeta {
  fecha: string
  gasto: number
  alcance: number | null
  impresiones: number | null
  frecuencia: number | null
  cpm: number | null
  clics_enlace: number | null
  cpc_enlace: number | null
  ctr_enlace: number | null
  resultados: number
  costo_por_resultado: number | null
  landing_page_views: number | null
  pagos_iniciados: number | null
  raw_json: unknown
}

/** Una fila diaria de Insights → columnas de ads_metricas_diarias. Pura. */
export function mapearInsight(row: any, tipo: TipoConversion): FilaMeta {
  const gasto = Number(row.spend ?? 0)
  const resultados = primera(row.actions, EVENTO_OPTIMIZADO[tipo]) ?? 0
  const costoMeta = primera(row.cost_per_action_type, EVENTO_OPTIMIZADO[tipo])
  const esCompra = tipo === 'compra_stripe'
  const conLanding = tipo !== 'venta_manual'

  return {
    fecha: row.date_start,
    gasto,
    alcance: n(row.reach),
    impresiones: n(row.impressions),
    frecuencia: n(row.frequency),
    cpm: n(row.cpm),
    clics_enlace: n(row.inline_link_clicks),
    cpc_enlace: n(row.cost_per_inline_link_click),
    ctr_enlace: n(row.inline_link_click_ctr),
    resultados,
    costo_por_resultado: costoMeta ?? (resultados > 0 ? gasto / resultados : null),
    landing_page_views: conLanding ? primera(row.actions, LANDING) ?? 0 : null,
    pagos_iniciados: esCompra ? primera(row.actions, CHECKOUT) ?? 0 : null,
    raw_json: row,
  }
}

/** Traduce el error de la Graph API a algo que se pueda mostrar tal cual. */
export function mensajeDeError(json: any, status: number): MetaError {
  const e = json?.error
  const codigo = e?.code
  if (codigo === 190) return new MetaError('El token de Meta venció o no es válido. Genera uno nuevo del usuario del sistema.', 190)
  if (codigo === 100) return new MetaError('Meta no reconoce ese ID de campaña o de cuenta.', 100)
  if (codigo === 10 || codigo === 200 || codigo === 294) {
    return new MetaError('El token de Meta no tiene permiso ads_read sobre esta cuenta.', codigo)
  }
  if (codigo === 4 || codigo === 17 || codigo === 613) {
    return new MetaError('Meta limitó las consultas por ahora. Intenta en unos minutos.', codigo)
  }
  return new MetaError(e?.message ?? `Meta respondió ${status}`, codigo)
}

export function tokenMeta(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new MetaError('Falta configurar META_ACCESS_TOKEN.')
  return t
}

async function pedirGraph(url: string): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch {
    throw new MetaError('No se pudo conectar con Meta.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.error) throw mensajeDeError(json, res.status)
  return json
}

/** Todas las páginas de un listado de la Graph API. */
async function paginar(url: string, maxPaginas = 20): Promise<any[]> {
  const out: any[] = []
  let siguiente: string | undefined = url
  for (let i = 0; siguiente && i < maxPaginas; i++) {
    const json: any = await pedirGraph(siguiente)
    out.push(...(json.data ?? []))
    siguiente = json.paging?.next
  }
  return out
}

export async function listarCampanasActivas(adAccountId: string, token = tokenMeta()) {
  const qs = new URLSearchParams({
    fields: 'id,name,effective_status,objective',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: '200',
    access_token: token,
  })
  const data = await paginar(`${GRAPH}/${encodeURIComponent(adAccountId)}/campaigns?${qs}`)
  return data.map(c => ({ id: String(c.id), nombre: String(c.name), estado: String(c.effective_status) }))
}

export const CAMPOS_INSIGHTS = [
  'spend', 'reach', 'impressions', 'frequency', 'cpm',
  'inline_link_clicks', 'cost_per_inline_link_click', 'inline_link_click_ctr',
  'actions', 'cost_per_action_type',
].join(',')

/**
 * Presupuesto diario a partir de lo que devuelve Meta. Pura. Los montos llegan
 * en la unidad mínima de la moneda (centavos para USD y BOB).
 *
 * - Presupuesto de campaña (CBO): el `daily_budget` de la campaña.
 * - Si no: la suma de los `daily_budget` de los conjuntos activos.
 * - Presupuesto total (lifetime) o nada: null.
 */
export function presupuestoDiarioDeMeta(campana: any, conjuntos: any[]): number | null {
  const diario = Number(campana?.daily_budget)
  if (Number.isFinite(diario) && diario > 0) return Math.round(diario) / 100
  const suma = (conjuntos ?? [])
    .filter(a => !a?.effective_status || a.effective_status === 'ACTIVE')
    .reduce((s, a) => s + (Number(a?.daily_budget) > 0 ? Number(a.daily_budget) : 0), 0)
  return suma > 0 ? Math.round(suma) / 100 : null
}

export async function traerPresupuestoDiario(campaignId: string, token = tokenMeta()): Promise<number | null> {
  const id = encodeURIComponent(campaignId)
  const campana = await pedirGraph(`${GRAPH}/${id}?${new URLSearchParams({ fields: 'daily_budget,lifetime_budget', access_token: token })}`)
  if (Number(campana?.daily_budget) > 0) return presupuestoDiarioDeMeta(campana, [])
  const conjuntos = await paginar(`${GRAPH}/${id}/adsets?${new URLSearchParams({
    fields: 'daily_budget,effective_status', effective_status: JSON.stringify(['ACTIVE']), limit: '100', access_token: token,
  })}`)
  return presupuestoDiarioDeMeta(campana, conjuntos)
}

/** Insights día por día (time_increment=1) de una campaña, ambos extremos incluidos. */
export async function traerInsights(
  campaignId: string, desde: string, hasta: string, tipo: TipoConversion, token = tokenMeta(),
): Promise<FilaMeta[]> {
  const qs = new URLSearchParams({
    fields: CAMPOS_INSIGHTS,
    time_range: JSON.stringify({ since: desde, until: hasta }),
    time_increment: '1',
    limit: '100',
    access_token: token,
  })
  const data = await paginar(`${GRAPH}/${encodeURIComponent(campaignId)}/insights?${qs}`)
  return data.map(r => mapearInsight(r, tipo))
}
