import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularEstado } from './calc'
import type {
  Campana, CampanaConEstado, Cambio, FilaDiaria, MetricaDiaria, Moneda, PagoStripeDia,
  TipoCambio, TipoConversion, Totales, VentaManual,
} from './types'

export const CAMPANA_COLS =
  'id, meta_campaign_id, meta_ad_account_id, nombre, moneda, tipo_conversion, precio_venta, margen_venta, roas_objetivo, activo, ultima_sync, created_at'
export const METRICA_COLS =
  'campaign_id, fecha, gasto, alcance, impresiones, frecuencia, cpm, clics_enlace, cpc_enlace, ctr_enlace, resultados, costo_por_resultado, landing_page_views, pagos_iniciados'
export const VENTA_COLS = 'campaign_id, fecha, cantidad, neto, nota'
export const PAGO_COLS =
  'campaign_id, fecha, compras_exitosas, monto_total, pagos_fallidos, pagos_incompletos, tres_ds_solicitados, tres_ds_exitosos, decline_reasons'
export const CAMBIO_COLS = 'id, campaign_id, fecha, tipo, detalle'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any

const num = (v: unknown): number | null => (v == null ? null : Number(v))

export function mapCampana(r: Row): Campana {
  return {
    id: r.id,
    metaCampaignId: r.meta_campaign_id,
    metaAdAccountId: r.meta_ad_account_id,
    nombre: r.nombre,
    moneda: r.moneda as Moneda,
    tipoConversion: r.tipo_conversion as TipoConversion,
    precioVenta: Number(r.precio_venta),
    margenVenta: Number(r.margen_venta),
    roasObjetivo: num(r.roas_objetivo),
    activo: r.activo,
    ultimaSync: r.ultima_sync ?? null,
    createdAt: r.created_at,
  }
}

export function mapMetrica(r: Row): MetricaDiaria {
  return {
    fecha: r.fecha,
    gasto: Number(r.gasto),
    alcance: num(r.alcance),
    impresiones: num(r.impresiones),
    frecuencia: num(r.frecuencia),
    cpm: num(r.cpm),
    clicsEnlace: num(r.clics_enlace),
    cpcEnlace: num(r.cpc_enlace),
    ctrEnlace: num(r.ctr_enlace),
    resultados: Number(r.resultados),
    costoPorResultado: num(r.costo_por_resultado),
    landingPageViews: num(r.landing_page_views),
    pagosIniciados: num(r.pagos_iniciados),
  }
}

export function mapVenta(r: Row): VentaManual {
  return { fecha: r.fecha, cantidad: num(r.cantidad), neto: num(r.neto), nota: r.nota ?? null }
}

export function mapPago(r: Row): PagoStripeDia {
  return {
    fecha: r.fecha,
    comprasExitosas: Number(r.compras_exitosas),
    montoTotal: Number(r.monto_total),
    pagosFallidos: Number(r.pagos_fallidos),
    pagosIncompletos: Number(r.pagos_incompletos),
    tresDsSolicitados: Number(r.tres_ds_solicitados),
    tresDsExitosos: Number(r.tres_ds_exitosos),
    declineReasons: r.decline_reasons ?? null,
  }
}

export function mapCambio(r: Row): Cambio {
  return { id: r.id, fecha: r.fecha, tipo: r.tipo as TipoCambio, detalle: r.detalle ?? null }
}

/** YYYY-MM-DD en Bolivia. Duplicado mínimo de format.ts para no importar Intl de UI acá. */
function diaBolivia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function hoyServidor(): string {
  return diaBolivia(new Date())
}

/**
 * De dónde salen las ventas de una campaña, mirando su historial COMPLETO.
 *
 * Una campaña de Stripe sin un solo día de Stripe (la clave todavía no está
 * configurada, o nunca sincronizó) no tiene cero ventas: tiene las que reporta
 * Meta. Tratarlas como cero pintaba un foco rojo falso. En cuanto aparece un
 * día de Stripe, Stripe manda.
 */
export function fuenteDeVentas(campana: Campana, pagosHistoricos: PagoStripeDia[]): Totales['fuenteVentas'] {
  if (campana.tipoConversion === 'venta_manual') return 'manual'
  return pagosHistoricos.length > 0 ? 'stripe' : 'meta'
}

export interface VentaDia {
  fecha: string
  ventas: number
  /** Facturación del día: lo cobrado en Stripe, o ventas × precio. */
  ingreso: number
  /**
   * `editada`: en una campaña de compras, el usuario corrigió a mano el número
   * que venía de Stripe o de Meta. Pisa al automático solo ese día.
   */
  origen: 'manual' | 'stripe' | 'meta' | 'editada'
  /** Neto cargado a mano (compras): lo depositado después de comisiones. */
  neto: number | null
}

/**
 * Las ventas de cada día y de dónde salen. Es la única fuente de verdad para
 * la tabla, los totales, el profit y el semáforo: si cada uno resolviera las
 * ventas por su cuenta, tarde o temprano dirían números distintos.
 *
 * En WhatsApp cada fila de ads_ventas_manuales ES la venta. En compras, una fila
 * ahí es una corrección que pisa a Stripe (o a Meta, sin Stripe) ese día.
 */
export function ventasPorDia(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], pagos: PagoStripeDia[],
  fuente: Totales['fuenteVentas'] = fuenteDeVentas(campana, pagos),
): Map<string, VentaDia> {
  const out = new Map<string, VentaDia>()
  const precio = campana.precioVenta

  if (fuente === 'manual') {
    for (const v of ventas) {
      if (v.cantidad == null) continue
      out.set(v.fecha, { fecha: v.fecha, ventas: v.cantidad, ingreso: v.cantidad * precio, origen: 'manual', neto: null })
    }
    return out
  }
  if (fuente === 'stripe') {
    for (const p of pagos) out.set(p.fecha, { fecha: p.fecha, ventas: p.comprasExitosas, ingreso: p.montoTotal, origen: 'stripe', neto: null })
  } else {
    for (const m of metricas) out.set(m.fecha, { fecha: m.fecha, ventas: m.resultados, ingreso: m.resultados * precio, origen: 'meta', neto: null })
  }
  // Correcciones: cada campo pisa solo lo suyo. Un neto sin cantidad deja las
  // ventas en automático.
  for (const v of ventas) {
    const base = out.get(v.fecha)
    const corrige = v.cantidad != null
    out.set(v.fecha, {
      fecha: v.fecha,
      ventas: corrige ? v.cantidad! : base?.ventas ?? 0,
      ingreso: corrige ? v.cantidad! * precio : base?.ingreso ?? 0,
      origen: corrige ? 'editada' : base?.origen ?? (fuente === 'stripe' ? 'stripe' : 'meta'),
      neto: v.neto,
    })
  }
  return out
}

/**
 * Lo que queda de un día después de comisiones: el neto cargado a mano si lo
 * hay, o la facturación × (margen / precio). Productos digitales: no hay otro
 * costo por venta, así que profit = neto − inversión.
 */
export function netoDia(campana: Campana, v: VentaDia | undefined): number {
  if (!v) return 0
  return v.neto ?? v.ingreso * (campana.margenVenta / campana.precioVenta)
}

/**
 * Las filas diarias que entiende calc.ts: métricas de Meta + la venta real del
 * día (Sprint 1 §4.1).
 */
export function construirFilas(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], pagos: PagoStripeDia[],
  fuente: Totales['fuenteVentas'] = fuenteDeVentas(campana, pagos),
): FilaDiaria[] {
  const reales = ventasPorDia(campana, metricas, ventas, pagos, fuente)

  const filas = new Map<string, FilaDiaria>()
  for (const m of metricas) {
    filas.set(m.fecha, {
      fecha: m.fecha,
      gasto: m.gasto,
      resultadosMeta: m.resultados,
      conversionesReales: reales.get(m.fecha)?.ventas ?? 0,
      frecuencia: m.frecuencia,
    })
  }
  // Un día con venta pero sin métricas de Meta (se cargó la venta de hoy y el
  // sync todavía no trajo el día) igual cuenta como conversión.
  for (const [fecha, v] of reales) {
    if (!filas.has(fecha)) {
      filas.set(fecha, { fecha, gasto: 0, resultadosMeta: 0, conversionesReales: v.ventas, frecuencia: null, soloVenta: true })
    }
  }
  return [...filas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * `fuente` se pasa de afuera cuando se calculan totales de un RANGO: el rango
 * puede no tener días de Stripe aunque el historial sí, y no por eso tiene que
 * cambiar de fuente.
 */
export function calcularTotales(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], pagos: PagoStripeDia[],
  fuente: Totales['fuenteVentas'] = fuenteDeVentas(campana, pagos),
): Totales {
  const s = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
  const gasto = s(metricas.map(m => m.gasto))
  const dias = [...ventasPorDia(campana, metricas, ventas, pagos, fuente).values()]
  const conversiones = s(dias.map(d => d.ventas))
  const ingreso = s(dias.map(d => d.ingreso))
  const neto = s(dias.map(d => netoDia(campana, d)))

  return {
    gasto,
    ingreso,
    neto,
    diasConNetoManual: dias.filter(d => d.neto != null).length,
    profit: neto - gasto,
    conversiones,
    resultadosMeta: s(metricas.map(m => m.resultados)),
    // Suma de alcances diarios: cuenta dos veces a quien vio el anuncio dos días
    // distintos. Por eso el funnel arranca en impresiones, que sí se suman, y
    // esto queda solo como referencia.
    alcance: s(metricas.map(m => m.alcance)),
    impresiones: s(metricas.map(m => m.impresiones)),
    clics: s(metricas.map(m => m.clicsEnlace)),
    landingPageViews: s(metricas.map(m => m.landingPageViews)),
    pagosIniciados: s(metricas.map(m => m.pagosIniciados)),
    costoPorConversion: conversiones > 0 ? gasto / conversiones : null,
    dias: metricas.length,
    fuenteVentas: fuente,
  }
}

/**
 * El semáforo de una campaña. `fuente` se pasa cuando se calcula sobre un rango
 * (el dashboard con filtro de fechas), por la misma razón que en los totales.
 */
export function armarEstado(
  campana: Campana,
  metricas: MetricaDiaria[],
  ventas: VentaManual[],
  pagos: PagoStripeDia[],
  ultimoCambio: string | null,
  hoy: string,
  fuente: Totales['fuenteVentas'] = fuenteDeVentas(campana, pagos),
): CampanaConEstado {
  const totales = calcularTotales(campana, metricas, ventas, pagos, fuente)
  const estado = calcularEstado({
    tipoConversion: campana.tipoConversion,
    precioVenta: campana.precioVenta,
    margenVenta: campana.margenVenta,
    roasObjetivoManual: campana.roasObjetivo,
    metricas: construirFilas(campana, metricas, ventas, pagos, fuente),
    conversionesConfirmadas: totales.conversiones,
    ingresoTotal: totales.ingreso,
    gastoTotal: totales.gasto,
    ultimoCambioFecha: ultimoCambio ? diaBolivia(new Date(ultimoCambio)) : null,
    hoy,
  })
  return { campana, estado, totales }
}

function agrupar<T>(filas: Row[], map: (r: Row) => T): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of filas) {
    const lista = out.get(r.campaign_id) ?? []
    lista.push(map(r))
    out.set(r.campaign_id, lista)
  }
  return out
}

/**
 * Todas las campañas del usuario con su estado calculado. RLS filtra por
 * usuario; el volumen es de decenas de campañas × días, así que se trae todo en
 * cinco consultas en paralelo y se cruza en memoria.
 */
export async function cargarCampanas(supabase: SupabaseClient, hoy = hoyServidor()): Promise<CampanaConEstado[]> {
  const [c, m, v, p, k] = await Promise.all([
    supabase.from('ads_campaigns').select(CAMPANA_COLS).order('created_at', { ascending: true }),
    supabase.from('ads_metricas_diarias').select(METRICA_COLS),
    supabase.from('ads_ventas_manuales').select(VENTA_COLS),
    supabase.from('ads_pagos_stripe').select(PAGO_COLS),
    supabase.from('ads_cambios_log').select('campaign_id, fecha').order('fecha', { ascending: false }),
  ])
  const error = c.error ?? m.error ?? v.error ?? p.error ?? k.error
  if (error) throw new Error(error.message)

  const metricas = agrupar(m.data ?? [], mapMetrica)
  const ventas = agrupar(v.data ?? [], mapVenta)
  const pagos = agrupar(p.data ?? [], mapPago)
  const ultimoCambio = new Map<string, string>()
  for (const r of k.data ?? []) if (!ultimoCambio.has(r.campaign_id)) ultimoCambio.set(r.campaign_id, r.fecha)

  return (c.data ?? []).map(r => {
    const campana = mapCampana(r)
    return armarEstado(
      campana,
      metricas.get(campana.id) ?? [],
      ventas.get(campana.id) ?? [],
      pagos.get(campana.id) ?? [],
      ultimoCambio.get(campana.id) ?? null,
      hoy,
    )
  })
}

export interface DetalleCampana extends CampanaConEstado {
  metricas: MetricaDiaria[]
  ventas: VentaManual[]
  pagos: PagoStripeDia[]
  cambios: Cambio[]
  hoy: string
}

/** Una campaña con todo su historial, para el dashboard. `null` si no existe. */
export async function cargarDetalle(supabase: SupabaseClient, id: string, hoy = hoyServidor()): Promise<DetalleCampana | null> {
  const [c, m, v, p, k] = await Promise.all([
    supabase.from('ads_campaigns').select(CAMPANA_COLS).eq('id', id).maybeSingle(),
    supabase.from('ads_metricas_diarias').select(METRICA_COLS).eq('campaign_id', id).order('fecha'),
    supabase.from('ads_ventas_manuales').select(VENTA_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
    supabase.from('ads_pagos_stripe').select(PAGO_COLS).eq('campaign_id', id).order('fecha'),
    supabase.from('ads_cambios_log').select(CAMBIO_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
  ])
  const error = c.error ?? m.error ?? v.error ?? p.error ?? k.error
  if (error) throw new Error(error.message)
  if (!c.data) return null

  const campana = mapCampana(c.data)
  const metricas = (m.data ?? []).map(mapMetrica)
  const ventas = (v.data ?? []).map(mapVenta)
  const pagos = (p.data ?? []).map(mapPago)
  const cambios = (k.data ?? []).map(mapCambio)

  return {
    ...armarEstado(campana, metricas, ventas, pagos, cambios[0]?.fecha ?? null, hoy),
    metricas, ventas, pagos, cambios, hoy,
  }
}
