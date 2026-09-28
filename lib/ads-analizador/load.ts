import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularEstado } from './calc'
import type {
  Campana, CampanaConEstado, Cambio, FilaDiaria, MetricaDiaria, Moneda,
  TipoCambio, TipoConversion, Totales, VentaManual,
} from './types'

export const CAMPANA_COLS =
  'id, meta_campaign_id, meta_ad_account_id, nombre, moneda, tipo_conversion, precio_venta, margen_venta, roas_objetivo, activo, ultima_sync, created_at'
export const METRICA_COLS =
  'campaign_id, fecha, gasto, alcance, impresiones, frecuencia, cpm, clics_enlace, cpc_enlace, ctr_enlace, resultados, costo_por_resultado, landing_page_views, pagos_iniciados'
export const VENTA_COLS = 'campaign_id, fecha, cantidad, neto, nota'
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
 * De dónde salen las ventas. WhatsApp: las carga el usuario. Compras: las que
 * reporta Meta (evento de compra), corregibles a mano día por día.
 *
 * (Hubo una integración con la API de Stripe; se sacó el 2026-09-28 por
 * decisión del usuario. La tabla ads_pagos_stripe quedó en la base, sin uso.)
 */
export function fuenteDeVentas(campana: Campana): Totales['fuenteVentas'] {
  return campana.tipoConversion === 'venta_manual' ? 'manual' : 'meta'
}

export interface VentaDia {
  fecha: string
  ventas: number
  /** Facturación del día: ventas × precio. */
  ingreso: number
  /**
   * `editada`: en una campaña de compras, el usuario corrigió a mano el número
   * que reportó Meta. Pisa al automático solo ese día.
   */
  origen: 'manual' | 'meta' | 'editada'
  /** Neto cargado a mano (compras): lo recibido después de comisiones. */
  neto: number | null
}

/**
 * Las ventas de cada día y de dónde salen. Es la única fuente de verdad para
 * la tabla, los totales, el profit y el semáforo: si cada uno resolviera las
 * ventas por su cuenta, tarde o temprano dirían números distintos.
 *
 * En WhatsApp cada fila de ads_ventas_manuales ES la venta. En compras, una fila
 * ahí es una corrección de ese día: la cantidad pisa a Meta y el neto es lo
 * recibido después de comisiones; cada uno por separado.
 */
export function ventasPorDia(campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[]): Map<string, VentaDia> {
  const out = new Map<string, VentaDia>()
  const precio = campana.precioVenta

  if (fuenteDeVentas(campana) === 'manual') {
    for (const v of ventas) {
      if (v.cantidad == null) continue
      out.set(v.fecha, { fecha: v.fecha, ventas: v.cantidad, ingreso: v.cantidad * precio, origen: 'manual', neto: null })
    }
    return out
  }

  for (const m of metricas) out.set(m.fecha, { fecha: m.fecha, ventas: m.resultados, ingreso: m.resultados * precio, origen: 'meta', neto: null })
  for (const v of ventas) {
    const base = out.get(v.fecha)
    const corrige = v.cantidad != null
    out.set(v.fecha, {
      fecha: v.fecha,
      ventas: corrige ? v.cantidad! : base?.ventas ?? 0,
      ingreso: corrige ? v.cantidad! * precio : base?.ingreso ?? 0,
      origen: corrige ? 'editada' : 'meta',
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
export function construirFilas(campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[]): FilaDiaria[] {
  const reales = ventasPorDia(campana, metricas, ventas)

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

export function calcularTotales(campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[]): Totales {
  const s = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
  const gasto = s(metricas.map(m => m.gasto))
  const dias = [...ventasPorDia(campana, metricas, ventas).values()]
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
    fuenteVentas: fuenteDeVentas(campana),
  }
}

/** El semáforo de una campaña, más sus totales. */
export function armarEstado(
  campana: Campana,
  metricas: MetricaDiaria[],
  ventas: VentaManual[],
  ultimoCambio: string | null,
  hoy: string,
): CampanaConEstado {
  // Los totales (indicadores, tabla) incluyen hoy: esa plata ya se gastó.
  const totales = calcularTotales(campana, metricas, ventas)

  // El semáforo NO: hoy está en curso. A media tarde hay gasto de hoy y las
  // ventas todavía no llegaron; leerlo con las reglas daría falsas alarmas
  // ("3 días sin ventas") o sacaría a una campaña sana de "sana".
  const completos = <T extends { fecha: string }>(xs: T[]) => xs.filter(x => x.fecha < hoy)
  const m = completos(metricas), v = completos(ventas)
  const t = calcularTotales(campana, m, v)
  let estado = calcularEstado({
    tipoConversion: campana.tipoConversion,
    precioVenta: campana.precioVenta,
    margenVenta: campana.margenVenta,
    roasObjetivoManual: campana.roasObjetivo,
    metricas: construirFilas(campana, m, v),
    conversionesConfirmadas: t.conversiones,
    ingresoTotal: t.ingreso,
    gastoTotal: t.gasto,
    ultimoCambioFecha: ultimoCambio ? diaBolivia(new Date(ultimoCambio)) : null,
    hoy,
  })

  // Campaña que arrancó hoy: sí hay datos, solo que todavía no hay un día entero.
  if (estado.accion === 'sin_datos' && metricas.some(x => x.fecha === hoy)) {
    estado = { ...estado, mensaje: 'Solo hay datos de hoy, que todavía está en curso. El semáforo arranca con el primer día completo.' }
  }
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
 * cuatro consultas en paralelo y se cruza en memoria.
 */
export async function cargarCampanas(supabase: SupabaseClient, hoy = hoyServidor()): Promise<CampanaConEstado[]> {
  const [c, m, v, k] = await Promise.all([
    supabase.from('ads_campaigns').select(CAMPANA_COLS).order('created_at', { ascending: true }),
    supabase.from('ads_metricas_diarias').select(METRICA_COLS),
    supabase.from('ads_ventas_manuales').select(VENTA_COLS),
    supabase.from('ads_cambios_log').select('campaign_id, fecha').order('fecha', { ascending: false }),
  ])
  const error = c.error ?? m.error ?? v.error ?? k.error
  if (error) throw new Error(error.message)

  const metricas = agrupar(m.data ?? [], mapMetrica)
  const ventas = agrupar(v.data ?? [], mapVenta)
  const ultimoCambio = new Map<string, string>()
  for (const r of k.data ?? []) if (!ultimoCambio.has(r.campaign_id)) ultimoCambio.set(r.campaign_id, r.fecha)

  return (c.data ?? []).map(r => {
    const campana = mapCampana(r)
    return armarEstado(
      campana,
      metricas.get(campana.id) ?? [],
      ventas.get(campana.id) ?? [],
      ultimoCambio.get(campana.id) ?? null,
      hoy,
    )
  })
}

export interface DetalleCampana extends CampanaConEstado {
  metricas: MetricaDiaria[]
  ventas: VentaManual[]
  cambios: Cambio[]
  hoy: string
}

/** Una campaña con todo su historial, para el dashboard. `null` si no existe. */
export async function cargarDetalle(supabase: SupabaseClient, id: string, hoy = hoyServidor()): Promise<DetalleCampana | null> {
  const [c, m, v, k] = await Promise.all([
    supabase.from('ads_campaigns').select(CAMPANA_COLS).eq('id', id).maybeSingle(),
    supabase.from('ads_metricas_diarias').select(METRICA_COLS).eq('campaign_id', id).order('fecha'),
    supabase.from('ads_ventas_manuales').select(VENTA_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
    supabase.from('ads_cambios_log').select(CAMBIO_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
  ])
  const error = c.error ?? m.error ?? v.error ?? k.error
  if (error) throw new Error(error.message)
  if (!c.data) return null

  const campana = mapCampana(c.data)
  const metricas = (m.data ?? []).map(mapMetrica)
  const ventas = (v.data ?? []).map(mapVenta)
  const cambios = (k.data ?? []).map(mapCambio)

  return {
    ...armarEstado(campana, metricas, ventas, cambios[0]?.fecha ?? null, hoy),
    metricas, ventas, cambios, hoy,
  }
}
