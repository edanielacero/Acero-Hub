import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularEstado, sumarDias, ventasParaEmpate } from './calc'
import type {
  Campana, CampanaConEstado, Cambio, CicloGuardado, Color, EstadoCampana, FilaDiaria, LlamadaDia, MetricaDiaria, ModoCorte, Moneda,
  EntradaCalculo, ModoPanel, TipoCambio, TipoConversion, Totales, VentaManual,
} from './types'

export const CAMPANA_COLS =
  'id, meta_campaign_id, meta_ad_account_id, nombre, moneda, tipo_conversion, precio_venta, margen_venta, roas_objetivo, cpa_esperado, modo_corte, show_estimado, close_estimado, capacidad_chats_dia, presupuesto_meta, presupuesto_meta_en, activo, ultima_sync, created_at'
export const METRICA_COLS =
  'campaign_id, fecha, gasto, alcance, impresiones, frecuencia, cpm, clics_enlace, cpc_enlace, ctr_enlace, resultados, costo_por_resultado, landing_page_views, pagos_iniciados'
export const VENTA_COLS = 'campaign_id, fecha, cantidad, neto, nota'
export const CAMBIO_COLS = 'id, campaign_id, fecha, tipo, detalle, presupuesto'
export const LLAMADA_COLS = 'campaign_id, fecha, agendadas, calificadas, asistidas, cerradas, nota'

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
    cpaEsperado: num(r.cpa_esperado),
    modoCorte: (r.modo_corte ?? 'conservador') as ModoCorte,
    showEstimado: num(r.show_estimado),
    closeEstimado: num(r.close_estimado),
    capacidadChatsDia: num(r.capacidad_chats_dia),
    presupuestoMeta: num(r.presupuesto_meta),
    presupuestoMetaEn: r.presupuesto_meta_en ?? null,
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
  return { id: r.id, fecha: r.fecha, tipo: r.tipo as TipoCambio, detalle: r.detalle ?? null, presupuesto: num(r.presupuesto) }
}

export const CICLO_COLS = 'id, campaign_id, inicio, fin, dias_ciclo, duracion_base, estado, snapshot, cerrado_en, revisado_en'

export function mapCiclo(r: Row): CicloGuardado {
  return {
    id: r.id, inicio: r.inicio, fin: r.fin ?? null, diasCiclo: r.dias_ciclo == null ? null : Number(r.dias_ciclo),
    duracionBase: r.duracion_base ?? null,
    estado: r.estado, snapshot: r.snapshot ?? null, cerradoEn: r.cerrado_en ?? null, revisadoEn: r.revisado_en ?? null,
  }
}

export function mapLlamada(r: Row): LlamadaDia {
  return {
    fecha: r.fecha,
    agendadas: Number(r.agendadas),
    calificadas: num(r.calificadas),
    asistidas: Number(r.asistidas),
    cerradas: Number(r.cerradas),
    nota: r.nota ?? null,
  }
}

/** YYYY-MM-DD en Bolivia. Duplicado mínimo de format.ts para no importar Intl de UI acá. */
export function diaBolivia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function hoyServidor(): string {
  return diaBolivia(new Date())
}

/**
 * De dónde salen las ventas. WhatsApp y llamadas: las carga el usuario.
 * Compras: las que reporta Meta, corregibles a mano día por día.
 *
 * (Hubo una integración con la API de Stripe; se sacó el 2026-09-28 por
 * decisión del usuario. La tabla ads_pagos_stripe quedó en la base, sin uso.)
 */
export function fuenteDeVentas(campana: Campana): Totales['fuenteVentas'] {
  return campana.tipoConversion === 'compra_stripe' ? 'meta' : 'manual'
}

export interface VentaDia {
  fecha: string
  ventas: number
  /** Facturación del día: ventas × precio. */
  ingreso: number
  /** `editada`: en compras, el usuario corrigió el número que reportó Meta. */
  origen: 'manual' | 'meta' | 'editada'
  /** Neto cargado a mano (compras): lo recibido después de comisiones. */
  neto: number | null
}

/**
 * Las ventas de cada día y de dónde salen. Única fuente de verdad para la
 * tabla, los totales, el profit y el semáforo.
 *
 * - WhatsApp: cada fila de ads_ventas_manuales ES la venta.
 * - Compras: base Meta; una fila manual corrige la cantidad y/o carga el neto.
 * - Llamadas: la venta es la llamada cerrada (ads_llamadas), por fecha de la llamada.
 */
export function ventasPorDia(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], llamadas: LlamadaDia[] = [],
): Map<string, VentaDia> {
  const out = new Map<string, VentaDia>()
  const precio = campana.precioVenta

  if (campana.tipoConversion === 'llamadas') {
    for (const l of llamadas) out.set(l.fecha, { fecha: l.fecha, ventas: l.cerradas, ingreso: l.cerradas * precio, origen: 'manual', neto: null })
    return out
  }
  if (campana.tipoConversion === 'venta_manual') {
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
 * Las filas diarias que entiende calc.ts. La conversión que se evalúa es la
 * venta (Low Ticket) o la llamada agendada (High Ticket).
 */
export function construirFilas(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], llamadas: LlamadaDia[] = [],
): FilaDiaria[] {
  const conv = new Map<string, number>()
  if (campana.tipoConversion === 'llamadas') {
    for (const l of llamadas) conv.set(l.fecha, l.agendadas)
  } else {
    for (const [f, v] of ventasPorDia(campana, metricas, ventas)) conv.set(f, v.ventas)
  }

  const filas = new Map<string, FilaDiaria>()
  for (const m of metricas) {
    filas.set(m.fecha, {
      fecha: m.fecha,
      gasto: m.gasto,
      resultadosMeta: m.resultados,
      conversionesReales: conv.get(m.fecha) ?? 0,
      frecuencia: m.frecuencia,
      landingPageViews: m.landingPageViews,
    })
  }
  // Un día con conversión cargada pero sin métricas de Meta igual cuenta.
  for (const [fecha, n] of conv) {
    if (!filas.has(fecha)) {
      filas.set(fecha, { fecha, gasto: 0, resultadosMeta: 0, conversionesReales: n, frecuencia: null, soloVenta: true })
    }
  }
  return [...filas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export function calcularTotales(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], llamadas: LlamadaDia[] = [],
): Totales {
  const s = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
  const gasto = s(metricas.map(m => m.gasto))
  const dias = [...ventasPorDia(campana, metricas, ventas, llamadas).values()]
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
    // distintos. Por eso el funnel arranca en impresiones.
    alcance: s(metricas.map(m => m.alcance)),
    impresiones: s(metricas.map(m => m.impresiones)),
    clics: s(metricas.map(m => m.clicsEnlace)),
    landingPageViews: s(metricas.map(m => m.landingPageViews)),
    pagosIniciados: s(metricas.map(m => m.pagosIniciados)),
    costoPorConversion: conversiones > 0 ? gasto / conversiones : null,
    dias: metricas.length,
    fuenteVentas: fuenteDeVentas(campana),
    llamadas: campana.tipoConversion === 'llamadas'
      ? {
        agendadas: s(llamadas.map(l => l.agendadas)),
        calificadas: s(llamadas.map(l => l.calificadas)),
        asistidas: s(llamadas.map(l => l.asistidas)),
        cerradas: s(llamadas.map(l => l.cerradas)),
      }
      : null,
  }
}

/** §4.5 "< ~$25/día", en la moneda de la campaña (≈ 7 Bs por dólar). */
const PRESUPUESTO_CHICO: Record<Moneda, number> = { USD: 25, BOB: 175 }

/**
 * Costo por conversión de referencia (§1.3 paso 2): de otra campaña del mismo
 * tipo y moneda con ≥ 5 conversiones; si hay varias, la de más conversiones.
 */
export function cpaDeReferencia(campana: Campana, otras: CampanaConEstado[]): number | null {
  let mejor: { conv: number; cpa: number } | null = null
  for (const o of otras) {
    if (o.campana.id === campana.id) continue
    if (o.campana.tipoConversion !== campana.tipoConversion || o.campana.moneda !== campana.moneda) continue
    const conv = campana.tipoConversion === 'llamadas' ? o.totales.llamadas?.agendadas ?? 0 : o.totales.conversiones
    if (conv < 5 || o.totales.gasto <= 0) continue
    if (!mejor || conv > mejor.conv) mejor = { conv, cpa: o.totales.gasto / conv }
  }
  return mejor?.cpa ?? null
}

/**
 * El semáforo de una campaña, más sus totales.
 *
 * Los totales incluyen hoy (esa plata ya se gastó). El semáforo no: calc.ts
 * trabaja con días completos y por ciclo (desde el inicio o el último cambio).
 */
export function armarEstado(
  campana: Campana,
  metricas: MetricaDiaria[],
  ventas: VentaManual[],
  llamadas: LlamadaDia[],
  ultimoCambio: Pick<Cambio, 'fecha' | 'presupuesto'> | null,
  hoy: string,
  cpaReferencia: number | null = null,
  /** Ciclos guardados: si el ciclo del estado tiene duración fija, se usa; su estado decide el modo. */
  ciclosGuardados: (Pick<CicloGuardado, 'inicio' | 'diasCiclo'> & Partial<Pick<CicloGuardado, 'estado' | 'revisadoEn'>>)[] = [],
): CampanaConEstado {
  const totales = calcularTotales(campana, metricas, ventas, llamadas)
  const historicas = llamadas.filter(l => l.fecha < hoy)

  const entrada: EntradaCalculo = {
    tipoConversion: campana.tipoConversion,
    precioVenta: campana.precioVenta,
    margenVenta: campana.margenVenta,
    roasObjetivoManual: campana.roasObjetivo,
    cpaEsperadoManual: campana.cpaEsperado,
    cpaReferencia,
    modoCorte: campana.modoCorte,
    metricas: construirFilas(campana, metricas, ventas, llamadas),
    ultimoCambio: ultimoCambio ? { fecha: diaBolivia(new Date(ultimoCambio.fecha)), presupuesto: ultimoCambio.presupuesto } : null,
    hoy,
    llamadas: campana.tipoConversion === 'llamadas'
      ? {
        agendadas: historicas.reduce((a, l) => a + l.agendadas, 0),
        asistidas: historicas.reduce((a, l) => a + l.asistidas, 0),
        cerradas: historicas.reduce((a, l) => a + l.cerradas, 0),
        showEstimado: campana.showEstimado,
        closeEstimado: campana.closeEstimado,
      }
      : undefined,
    capacidadChatsDia: campana.capacidadChatsDia,
    umbralPresupuestoChico: PRESUPUESTO_CHICO[campana.moneda],
    presupuestoMeta: campana.presupuestoMeta,
  }
  let estado = calcularEstado(entrada)
  const guardado = ciclosGuardados.find(k => k.inicio === estado.ciclo.inicio)
  if (guardado?.diasCiclo) estado = calcularEstado({ ...entrada, diasCiclo: guardado.diasCiclo })
  return { campana, estado, totales, modo: modoDeCampana(estado, guardado) }
}

/**
 * El modo del panel. Con el ciclo guardado, su estado manda; sin fila todavía
 * (nadie abrió la campaña desde que cerró), lo que diría el motor: cerrado si
 * llegó al día de decisión o se cortó sin ventas.
 */
export function modoDeCampana(e: EstadoCampana, guardado?: Partial<Pick<CicloGuardado, 'estado' | 'revisadoEn'>>): ModoPanel {
  if (guardado?.estado === 'cerrado' || guardado?.estado === 'cortado') return guardado.revisadoEn ? 'en_curso' : 'cierre'
  if (guardado?.estado === 'abierto') return 'ciclo'
  const { fase, corteListo, conversiones } = e.ciclo
  if (fase === 'decision' || (corteListo && conversiones === 0 && fase !== 'sin_datos')) return 'cierre'
  return 'ciclo'
}

/** Cómo le fue a un tramo, solo por resultado: ROAS contra empate y piso. */
export function colorPorResultado(e: Pick<EstadoCampana, 'roasActual' | 'roasEquilibrio' | 'roasObjetivo'>): Color | null {
  if (e.roasActual == null) return null
  return e.roasActual < e.roasEquilibrio ? 'rojo' : e.roasActual < e.roasObjetivo ? 'amarillo' : 'verde'
}

export interface CicloResumen {
  /** 1 = el primero. El total de la campaña lleva 0. */
  numero: number
  inicio: string | null
  /** Primer día que ya es del ciclo siguiente; null = ciclo en curso. */
  fin: string | null
  /** El cambio que abrió el ciclo (el primero arranca con el primer gasto). */
  cambio: Pick<Cambio, 'tipo' | 'detalle' | 'presupuesto'> | null
  dias: number
  gasto: number
  conversiones: number
  roas: number | null
  /** Ganancia neta − inversión de los días completos del tramo. */
  profit: number
  color: Color | null
  /** El estado como lo veía la app al cerrar el ciclo (o hoy, si está en curso). */
  estado: EstadoCampana
}

/**
 * El semáforo por ciclo y el de toda la campaña. Cada ciclo va del primer
 * gasto (o de un cambio registrado) al cambio siguiente; se evalúa con el
 * mismo motor, como si "hoy" fuera el día en que cerró. Solo días completos.
 */
export function armarCiclos(
  campana: Campana,
  metricas: MetricaDiaria[],
  ventas: VentaManual[],
  llamadas: LlamadaDia[],
  cambios: Pick<Cambio, 'fecha' | 'tipo' | 'detalle' | 'presupuesto'>[],
  hoy: string,
  cpaReferencia: number | null = null,
): { total: CicloResumen; ciclos: CicloResumen[] } {
  const porDia = ventasPorDia(campana, metricas, ventas, llamadas)
  const gastoDe = new Map(metricas.map(m => [m.fecha, m.gasto]))
  const conDia = cambios
    .map(c => ({ ...c, dia: diaBolivia(new Date(c.fecha)) }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.fecha.localeCompare(b.fecha))

  const profitEntre = (desde: string | null, hasta: string) => {
    if (!desde) return 0
    const dias = new Set([...gastoDe.keys(), ...porDia.keys()])
    let p = 0
    for (const d of dias) if (d >= desde && d < hasta) p += netoDia(campana, porDia.get(d)) - (gastoDe.get(d) ?? 0)
    return p
  }

  const resumen = (numero: number, inicio: string | null, fin: string | null, cambio: CicloResumen['cambio'], estado: EstadoCampana): CicloResumen => ({
    numero, inicio, fin, cambio,
    dias: estado.ciclo.dias,
    gasto: estado.ciclo.gasto,
    conversiones: estado.ciclo.conversiones,
    roas: estado.roasActual,
    profit: profitEntre(estado.ciclo.inicio ?? inicio, fin ?? hoy),
    color: colorPorResultado(estado),
    estado,
  })

  const ultimo = conDia.at(-1) ?? null
  const total = resumen(0, null, null, null, armarEstado(campana, metricas, ventas, llamadas, null, hoy, cpaReferencia).estado)

  const inicios = iniciosDeCiclos(metricas, cambios, hoy)

  const ciclos = inicios.map((ini, i): CicloResumen => {
    const fin = inicios[i + 1]?.dia ?? null
    const cambio = ini.cambio && ini.cambio.dia === ini.dia ? { tipo: ini.cambio.tipo, detalle: ini.cambio.detalle, presupuesto: ini.cambio.presupuesto } : null
    const estado = fin == null
      ? armarEstado(campana, metricas, ventas, llamadas, ultimo, hoy, cpaReferencia).estado
      : armarEstado(
        campana,
        metricas.filter(m => m.fecha < fin),
        ventas.filter(v => v.fecha < fin),
        llamadas.filter(l => l.fecha < fin),
        ini.cambio, fin, cpaReferencia,
      ).estado
    return resumen(i + 1, ini.dia, fin, cambio, estado)
  })

  return { total, ciclos }
}

/**
 * Dónde arranca cada ciclo: el primer día con gasto y cada día con un cambio
 * registrado después. Dos cambios el mismo día abren un solo ciclo (vale el
 * último); uno anterior al primer gasto no abre ninguno.
 */
export function iniciosDeCiclos<C extends Pick<Cambio, 'fecha'>>(
  metricas: Pick<MetricaDiaria, 'fecha' | 'gasto'>[], cambios: C[], hoy: string,
): { dia: string; cambio: (C & { dia: string }) | null }[] {
  const conDia = cambios
    .map(c => ({ ...c, dia: diaBolivia(new Date(c.fecha)) }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.fecha.localeCompare(b.fecha))
  const primerGasto = metricas.filter(m => m.gasto > 0 && m.fecha < hoy).map(m => m.fecha).sort()[0] ?? null
  const inicios: { dia: string; cambio: (C & { dia: string }) | null }[] = []
  if (!primerGasto) return inicios
  inicios.push({ dia: primerGasto, cambio: conDia.filter(c => c.dia <= primerGasto).at(-1) ?? null })
  for (const c of conDia) {
    if (c.dia <= primerGasto) continue
    if (inicios.at(-1)?.dia === c.dia) inicios[inicios.length - 1] = { dia: c.dia, cambio: c }
    else inicios.push({ dia: c.dia, cambio: c })
  }
  return inicios
}

/** Ganancia neta − inversión de los días [desde, hasta). */
export function profitDelTramo(
  campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], llamadas: LlamadaDia[], desde: string, hasta: string,
): number {
  const porDia = ventasPorDia(campana, metricas, ventas, llamadas)
  const gastoDe = new Map(metricas.map(m => [m.fecha, m.gasto]))
  let p = 0
  for (const d of new Set([...gastoDe.keys(), ...porDia.keys()])) {
    if (d >= desde && d < hasta) p += netoDia(campana, porDia.get(d)) - (gastoDe.get(d) ?? 0)
  }
  return p
}

/**
 * El mismo estado con lo de hoy sumado a los números que se muestran: ventas,
 * inversión, ROAS y las ventas para empate y piso. Las fases, fechas y
 * veredictos siguen mirando solo días completos (un día a medias no dispara
 * alarmas); esto es para que el panel diga lo mismo que la tabla y los KPIs.
 */
export function conHoy(
  e: EstadoCampana, campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], llamadas: LlamadaDia[], hoy: string,
): EstadoCampana {
  if (!e.ciclo.inicio || e.ciclo.inicio > hoy) return e
  const fila = construirFilas(campana, metricas, ventas, llamadas).find(f => f.fecha === hoy)
  if (!fila || (fila.gasto === 0 && fila.conversionesReales === 0)) return e
  const G = e.ciclo.gasto + fila.gasto
  const S = e.ciclo.conversiones + fila.conversionesReales
  const mc = e.cpa.empate
  const factorPiso = e.roasObjetivo / e.roasEquilibrio
  const pc = mc * (campana.precioVenta / campana.margenVenta)
  const roas = G > 0 ? (S * pc) / G : null
  return {
    ...e,
    roasActual: roas,
    colchon: roas == null ? null : roas / e.roasEquilibrio - 1,
    ciclo: {
      ...e.ciclo, gasto: G, conversiones: S,
      primeraConversion: e.ciclo.primeraConversion ?? (fila.conversionesReales > 0 ? hoy : null),
    },
    necesarias: {
      ...e.necesarias,
      empate: mc > 0 ? ventasParaEmpate(G, mc) : 0,
      piso: mc > 0 ? Math.ceil((factorPiso * G) / mc) : 0,
    },
  }
}

/** Un resumen de tramo abierto hasta hoy, con lo de hoy incluido (ver `conHoy`). */
export function resumenConHoy(
  r: CicloResumen, campana: Campana, metricas: MetricaDiaria[], ventas: VentaManual[], llamadas: LlamadaDia[], hoy: string,
): CicloResumen {
  const estado = conHoy(r.estado, campana, metricas, ventas, llamadas, hoy)
  if (estado === r.estado || !estado.ciclo.inicio) return r
  return {
    ...r, estado,
    gasto: estado.ciclo.gasto,
    conversiones: estado.ciclo.conversiones,
    roas: estado.roasActual,
    color: colorPorResultado(estado),
    profit: profitDelTramo(campana, metricas, ventas, llamadas, estado.ciclo.inicio, sumarDias(hoy, 1)),
  }
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
 * usuario; se trae todo en paralelo y se cruza en memoria. Dos pasadas: la
 * primera arma los totales (para el costo de referencia entre campañas), la
 * segunda el semáforo.
 */
export async function cargarCampanas(supabase: SupabaseClient, hoy = hoyServidor()): Promise<CampanaConEstado[]> {
  const [c, m, v, k, l, g] = await Promise.all([
    supabase.from('ads_campaigns').select(CAMPANA_COLS).order('created_at', { ascending: true }),
    supabase.from('ads_metricas_diarias').select(METRICA_COLS),
    supabase.from('ads_ventas_manuales').select(VENTA_COLS),
    supabase.from('ads_cambios_log').select('campaign_id, fecha, presupuesto').order('fecha', { ascending: false }),
    supabase.from('ads_llamadas').select(LLAMADA_COLS),
    supabase.from('ads_ciclos').select('campaign_id, inicio, dias_ciclo, estado, revisado_en'),
  ])
  const error = c.error ?? m.error ?? v.error ?? k.error ?? l.error ?? g.error
  if (error) throw new Error(error.message)

  const metricas = agrupar(m.data ?? [], mapMetrica)
  const ventas = agrupar(v.data ?? [], mapVenta)
  const llamadas = agrupar(l.data ?? [], mapLlamada)
  const ciclos = agrupar(g.data ?? [], r => ({
    inicio: r.inicio as string, diasCiclo: r.dias_ciclo == null ? null : Number(r.dias_ciclo),
    estado: r.estado as CicloGuardado['estado'], revisadoEn: (r.revisado_en as string | null) ?? null,
  }))
  const ultimoCambio = new Map<string, { fecha: string; presupuesto: number | null }>()
  for (const r of k.data ?? []) {
    if (!ultimoCambio.has(r.campaign_id)) ultimoCambio.set(r.campaign_id, { fecha: r.fecha, presupuesto: num(r.presupuesto) })
  }

  const campanas = (c.data ?? []).map(mapCampana)
  const datos = (x: Campana) => [metricas.get(x.id) ?? [], ventas.get(x.id) ?? [], llamadas.get(x.id) ?? []] as const
  const borrador = campanas.map(x => armarEstado(x, ...datos(x), ultimoCambio.get(x.id) ?? null, hoy, null, ciclos.get(x.id)))
  return campanas.map(x => {
    const ref = cpaDeReferencia(x, borrador)
    return {
      ...armarEstado(x, ...datos(x), ultimoCambio.get(x.id) ?? null, hoy, ref, ciclos.get(x.id)),
      estadoTotal: conHoy(armarEstado(x, ...datos(x), null, hoy, ref).estado, x, ...datos(x), hoy),
    }
  })
}

export interface DetalleCampana extends CampanaConEstado {
  metricas: MetricaDiaria[]
  ventas: VentaManual[]
  llamadas: LlamadaDia[]
  cambios: Cambio[]
  /** Ciclos guardados (cierre de ciclo). El dashboard decide con ellos el modo del panel. */
  ciclosGuardados: CicloGuardado[]
  hoy: string
}

/**
 * Una campaña con todo su historial, para el dashboard. `null` si no existe.
 * El estado de acá no conoce las otras campañas (sin costo de referencia); el
 * dashboard lo recalcula en el cliente con la lista completa.
 */
export async function cargarDetalle(supabase: SupabaseClient, id: string, hoy = hoyServidor()): Promise<DetalleCampana | null> {
  const [c, m, v, k, l, g] = await Promise.all([
    supabase.from('ads_campaigns').select(CAMPANA_COLS).eq('id', id).maybeSingle(),
    supabase.from('ads_metricas_diarias').select(METRICA_COLS).eq('campaign_id', id).order('fecha'),
    supabase.from('ads_ventas_manuales').select(VENTA_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
    supabase.from('ads_cambios_log').select(CAMBIO_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
    supabase.from('ads_llamadas').select(LLAMADA_COLS).eq('campaign_id', id).order('fecha', { ascending: false }),
    supabase.from('ads_ciclos').select(CICLO_COLS).eq('campaign_id', id).order('inicio'),
  ])
  const error = c.error ?? m.error ?? v.error ?? k.error ?? l.error ?? g.error
  if (error) throw new Error(error.message)
  if (!c.data) return null

  const campana = mapCampana(c.data)
  const metricas = (m.data ?? []).map(mapMetrica)
  const ventas = (v.data ?? []).map(mapVenta)
  const cambios = (k.data ?? []).map(mapCambio)
  const llamadas = (l.data ?? []).map(mapLlamada)
  const ciclosGuardados = (g.data ?? []).map(mapCiclo)

  return {
    ...armarEstado(campana, metricas, ventas, llamadas, cambios[0] ?? null, hoy, null, ciclosGuardados),
    metricas, ventas, llamadas, cambios, ciclosGuardados, hoy,
  }
}
