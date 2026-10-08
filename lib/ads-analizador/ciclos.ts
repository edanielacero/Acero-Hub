/**
 * Ciclos guardados: cuándo se cierra un ciclo, qué foto guarda, en qué modo
 * queda el panel de la campaña y qué alertas siguen vivas.
 *
 * Spec: documentos/ads_analizador/sprint_6_cierre_de_ciclo.md
 *
 * Puro, como calc.ts: recibe los datos y los ciclos guardados y devuelve qué
 * mostrar y qué escribir. No hay cron: el cierre "automático" ocurre la
 * primera vez que alguien abre la campaña después del último día del ciclo, y
 * da lo mismo que si hubiera corrido a medianoche porque solo mira días
 * completos dentro del ciclo.
 */
import {
  CONVERSIONES_MINIMAS_MUESTRA, DIAS_VENTANA_DECISION, FRECUENCIA_FATIGA, MARGEN_PARADA_VERTICAL,
  diasDeCorte, diferenciaDias, round2, sumarDias,
} from './calc'
import { armarCiclos, armarEstado, construirFilas, iniciosDeCiclos, profitDelTramo, type CicloResumen } from './load'
import type {
  Cambio, Campana, CicloGuardado, Color, EstadoCampana, EstadoCicloGuardado, EtapaCiclo, LlamadaDia, MetricaDiaria, ModoPanel,
  SnapshotCiclo, Veredicto, VentaManual, VistaCiclo,
} from './types'

export type { ModoPanel } from './types'

// ── Semáforo y veredicto de un ciclo ────────────────────────────────────────

/** Mismo criterio que la barra de ventas: piso → verde, empate → amarillo. */
export function semaforoCiclo(ventas: number, empate: number, piso: number): Color {
  return ventas >= piso ? 'verde' : ventas >= empate ? 'amarillo' : 'rojo'
}

/**
 * Veredicto al cerrar, con las reglas del día 7 (§4.4). `e` es el estado
 * evaluado al cierre (hoy = día siguiente al último del ciclo).
 *
 *   cortado  0 ventas con la inversión de corte cumplida
 *   pausar   ROAS bajo el empate
 *   mantener entre empate y piso, o sobre el piso con muestra chica, o con el
 *            corte todavía pendiente (presupuesto bajo)
 *   escalar  sobre el piso con margen y ≥ 10 ventas
 *   cambiar  sobre el piso, pero a menos de 10 % de él: anuncios nuevos
 */
export function veredictoCiclo(e: EstadoCampana, unidad = 'ventas'): { veredicto: Veredicto; nota: string | null } {
  const { conversiones: S, corteListo, gasto: G, gastoCorte } = e.ciclo
  if (S === 0 && corteListo) return { veredicto: 'cortado', nota: 'Revisa el embudo: visitas, checkouts, pagos y pixel.' }
  if (S === 0) {
    return { veredicto: 'mantener', nota: `Corte pendiente: ${Math.round((G / gastoCorte) * 100)} % de la inversión necesaria.` }
  }
  const roas = e.roasActual
  if (roas == null || roas < e.roasEquilibrio) return { veredicto: 'pausar', nota: 'Bajo el empate: pausa o cambia el creativo.' }
  if (roas < e.roasObjetivo) return { veredicto: 'mantener', nota: 'Entre el empate y el piso: sin cambios.' }
  if (S < CONVERSIONES_MINIMAS_MUESTRA) {
    return { veredicto: 'mantener', nota: `Faltan ${CONVERSIONES_MINIMAS_MUESTRA - S} ${unidad} para decidir si escalar.` }
  }
  if (roas > e.roasObjetivo * MARGEN_PARADA_VERTICAL) return { veredicto: 'escalar', nota: null }
  return { veredicto: 'cambiar', nota: 'Sobre el piso, pero cerca: prueba anuncios nuevos en un conjunto aparte.' }
}

// ── Lo que dibuja el panel ──────────────────────────────────────────────────

/**
 * Etapas y barras de un ciclo a partir de su estado. `cierre` es el estado
 * guardado del ciclo (null = en vivo). En vivo solo una etapa es la actual; la
 * última nunca queda hecha hasta que el ciclo se cierra.
 */
export function vistaDeEstado(e: EstadoCampana, cierre: Exclude<EstadoCicloGuardado, 'abierto'> | null = null): VistaCiclo {
  const c = e.ciclo
  const total = c.diasDecision
  const conVentas = c.primeraConversion != null
  // Con duración fija, un corte que caería después del fin queda en el último día (pendiente).
  const corteDia = Math.min(c.diasCorte, total)
  const finJuntar = conVentas ? total - 1 : corteDia - 1
  const juntos = !conVentas && corteDia >= total

  type Base = Omit<EtapaCiclo, 'estado'> & { apagada?: boolean }
  const etapas: Base[] = [
    { clave: 'chequeo', titulo: 'Chequeo técnico', desde: 1, hasta: 1 },
    ...(finJuntar >= 2 ? [{ clave: 'juntar' as const, titulo: 'Juntar datos', desde: 2, hasta: finJuntar }] : []),
    conVentas
      ? { clave: 'corte', titulo: 'Corte', desde: 0, hasta: 0, apagada: true }
      : { clave: 'corte', titulo: juntos ? 'Corte y decisión' : 'Corte', desde: corteDia, hasta: corteDia, est: !c.corteListo || c.diasCorte > total },
    ...(juntos ? [] : [{ clave: 'decision' as const, titulo: 'Decisión', desde: total, hasta: total }]),
  ]
  const ultima = etapas[etapas.length - 1]
  const hecha = (k: Base) =>
    k.clave === 'corte' ? c.corteListo
      : k === ultima ? cierre === 'cerrado'
        : c.dias >= k.hasta

  let actualVista = false
  const conEstado: EtapaCiclo[] = etapas.map(({ apagada, ...k }) => {
    if (apagada) return { ...k, estado: 'apagada' }
    if (hecha(k)) return { ...k, estado: 'hecha' }
    // Cerrado: lo que no se alcanzó queda apagado (cortado o interrumpido) o pendiente (corte sin alcanzar).
    if (cierre) return { ...k, estado: cierre === 'cerrado' ? 'pendiente' : 'apagada' }
    if (!actualVista) { actualVista = true; return { ...k, estado: 'actual' } }
    return { ...k, estado: 'pendiente' }
  })

  const n = e.necesarias
  return {
    inicio: c.inicio!,
    diasCiclo: total,
    diasTranscurridos: Math.min(c.dias, total),
    etapas: conEstado,
    primeraConversion: c.primeraConversion,
    ventas: c.conversiones,
    empate: n.empate,
    piso: n.piso,
    meta: cierre ? n.piso : n.pisoAlCierre,
    paraHoy: cierre ? null : n.piso,
    ventasEsperadas: e.cpa.esperado > 0 ? round2(c.gasto / e.cpa.esperado) : 0,
    roas: e.roasActual == null ? null : round2(e.roasActual),
  }
}

function construirSnapshot(
  e: EstadoCampana, fin: string, cierre: Exclude<EstadoCicloGuardado, 'abierto'>, profit: number, unidad: string,
): SnapshotCiclo {
  const v = vistaDeEstado(e, cierre)
  const { veredicto, nota } = veredictoCiclo(e, unidad)
  const S = e.ciclo.conversiones, G = e.ciclo.gasto
  return {
    version: 1,
    ...v,
    fin,
    gasto: round2(G),
    costoPorVenta: S > 0 ? round2(G / S) : null,
    profit: round2(profit),
    veredicto,
    nota,
    semaforo: semaforoCiclo(S, v.empate, v.piso),
    corteListo: e.ciclo.corteListo,
    gastoCorte: round2(e.ciclo.gastoCorte),
  }
}

// ── Plan: qué ciclos hay, en qué estado y qué escribir ──────────────────────

export interface CicloPlan {
  numero: number
  inicio: string
  /** Último día (incluido). Null mientras está abierto. */
  fin: string | null
  /** 'legacy': ciclo anterior a los ciclos guardados; solo se muestra su semáforo. */
  estado: EstadoCicloGuardado | 'legacy'
  diasCiclo: number | null
  snapshot: SnapshotCiclo | null
  cerradoEn: string | null
  revisadoEn: string | null
  guardadoId: string | null
  cambio: Pick<Cambio, 'tipo' | 'detalle' | 'presupuesto'> | null
  /** Semáforo calculado al vuelo (el de antes): para los ciclos legacy. */
  resumen: CicloResumen
}

export interface OpCiclo {
  inicio: string
  estado: EstadoCicloGuardado
  diasCiclo: number | null
  fin: string | null
  snapshot: SnapshotCiclo | null
  /** Marcar como revisado (un cambio posterior lo deja revisado solo). */
  revisar: boolean
}

export interface PlanCiclos {
  ciclos: CicloPlan[]
  total: CicloResumen
  actual: CicloPlan | null
  modo: ModoPanel
  escribir: OpCiclo[]
  /** Ids de ciclos guardados cuyo cambio ya no existe (se deshizo). */
  borrar: string[]
}

export interface DatosCiclos {
  campana: Campana
  metricas: MetricaDiaria[]
  ventas: VentaManual[]
  llamadas: LlamadaDia[]
  cambios: Cambio[]
  guardados: CicloGuardado[]
  hoy: string
  cpaReferencia?: number | null
}

/** Igualdad de JSON sin importar el orden de las claves (jsonb las reordena). */
function mismoJson(a: unknown, b: unknown): boolean {
  const orden = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(orden)
      : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, orden((x as Record<string, unknown>)[k])]))
        : x
  return JSON.stringify(orden(a ?? null)) === JSON.stringify(orden(b ?? null))
}

const unidadDe = (c: Campana) => (c.tipoConversion === 'llamadas' ? 'llamadas' : c.tipoConversion === 'venta_manual' ? 'ventas' : 'compras')

/**
 * Duración fija del ciclo: max(7, día de corte), con el costo esperado del
 * día 1 y el presupuesto del cambio (o, si no se cargó, el gasto del día 1).
 * Null hasta que termina el día 1.
 */
export function duracionAlAbrir(d: DatosCiclos, inicio: string, cambio: Cambio | null): number | null {
  if (d.hoy <= inicio) return null
  const hasta = sumarDias(inicio, 1)
  const e = armarEstado(
    d.campana, d.metricas.filter(m => m.fecha < hasta), d.ventas.filter(v => v.fecha < hasta),
    d.llamadas.filter(l => l.fecha < hasta), cambio, hasta, d.cpaReferencia ?? null,
  ).estado
  const gastoDia = cambio?.presupuesto ?? d.metricas.find(m => m.fecha === inicio)?.gasto ?? 0
  const modo = d.campana.tipoConversion === 'llamadas' ? 'estandar' : d.campana.modoCorte
  return Math.max(DIAS_VENTANA_DECISION, diasDeCorte(gastoDia, e.cpa.esperado, modo))
}

export function planificarCiclos(d: DatosCiclos): PlanCiclos {
  const { campana, hoy } = d
  const ref = d.cpaReferencia ?? null
  const inicios = iniciosDeCiclos(d.metricas, d.cambios, hoy)
  const porInicio = new Map(d.guardados.map(g => [g.inicio, g]))
  const dinamico = armarCiclos(campana, d.metricas, d.ventas, d.llamadas, d.cambios, hoy, ref)
  const unidad = unidadDe(campana)

  const evaluar = (inicio: string, cambio: Cambio | null, hasta: string, diasCiclo: number | null) => armarEstado(
    campana, d.metricas.filter(m => m.fecha < hasta), d.ventas.filter(v => v.fecha < hasta),
    d.llamadas.filter(l => l.fecha < hasta), cambio, hasta, ref, diasCiclo ? [{ inicio, diasCiclo }] : [],
  ).estado

  const escribir: OpCiclo[] = []
  const ciclos = inicios.map((ini, i): CicloPlan => {
    const sig = inicios[i + 1]?.dia ?? null
    const ultimo = i === inicios.length - 1
    const g = porInicio.get(ini.dia) ?? null
    const cambio = ini.cambio && ini.cambio.dia === ini.dia
      ? { tipo: ini.cambio.tipo, detalle: ini.cambio.detalle, presupuesto: ini.cambio.presupuesto }
      : null
    const base = { numero: i + 1, inicio: ini.dia, cambio, resumen: dinamico.ciclos[i], guardadoId: g?.id ?? null }

    // Anterior a los ciclos guardados: no se inventa su foto.
    if (!g && !ultimo) {
      return { ...base, fin: sumarDias(sig!, -1), estado: 'legacy', diasCiclo: null, snapshot: null, cerradoEn: null, revisadoEn: null }
    }
    // Revisado y cerrado: congelado para siempre.
    if (g && g.revisadoEn && (g.estado === 'cerrado' || g.estado === 'cortado')) {
      return { ...base, fin: g.fin, estado: g.estado, diasCiclo: g.diasCiclo, snapshot: g.snapshot, cerradoEn: g.cerradoEn, revisadoEn: g.revisadoEn }
    }

    const diasCiclo = g?.diasCiclo ?? duracionAlAbrir(d, ini.dia, ini.cambio)
    const finNatural = diasCiclo ? sumarDias(ini.dia, diasCiclo - 1) : null
    // Hasta dónde se puede mirar: hoy, el cambio siguiente o el día después del fin.
    const borde = [hoy, sig, finNatural ? sumarDias(finNatural, 1) : null].filter((x): x is string => !!x).sort()[0]
    const eb = evaluar(ini.dia, ini.cambio, borde, diasCiclo)

    let estado: EstadoCicloGuardado = 'abierto'
    let fin: string | null = null
    // Cortado: se mira el día en que se alcanzó la inversión de corte, no hoy
    // (una venta posterior no deshace un corte que ya ocurrió).
    const enCorte = eb.ciclo.corteListo ? evaluar(ini.dia, ini.cambio, sumarDias(ini.dia, eb.ciclo.diasCorte), diasCiclo) : null
    if (enCorte && enCorte.ciclo.inicio === ini.dia && enCorte.ciclo.corteListo && enCorte.ciclo.conversiones === 0) {
      estado = 'cortado'
      fin = sumarDias(ini.dia, enCorte.ciclo.diasCorte - 1)
    } else if (finNatural && sumarDias(finNatural, 1) === borde) {
      estado = 'cerrado'
      fin = finNatural
    } else if (sig) {
      estado = 'interrumpido'
      fin = sumarDias(sig, -1)
    }

    let snapshot: SnapshotCiclo | null = null
    if (estado !== 'abierto' && fin && fin >= ini.dia) {
      const despues = sumarDias(fin, 1)
      const ef = evaluar(ini.dia, ini.cambio, despues, diasCiclo)
      snapshot = construirSnapshot(ef, fin, estado, profitDelTramo(campana, d.metricas, d.ventas, d.llamadas, ini.dia, despues), unidad)
    }
    // Un cambio posterior deja el ciclo revisado: se abrió otro sin pasar por la confirmación.
    const revisar = !!sig && !g?.revisadoEn

    const cambiado = !g
      || g.estado !== estado || g.fin !== fin || g.diasCiclo !== diasCiclo
      || !mismoJson(g.snapshot, snapshot) || revisar
    if (cambiado) escribir.push({ inicio: ini.dia, estado, diasCiclo, fin, snapshot, revisar })

    return {
      ...base, fin, estado, diasCiclo, snapshot,
      cerradoEn: g?.cerradoEn ?? null,
      revisadoEn: g?.revisadoEn ?? (revisar ? hoy : null),
    }
  })

  const vigentes = new Set(inicios.map(x => x.dia))
  const borrar = d.guardados.filter(g => !vigentes.has(g.inicio)).map(g => g.id)

  const actual = ciclos.at(-1) ?? null
  const modo: ModoPanel = !actual || actual.estado === 'abierto' || actual.estado === 'legacy' ? 'ciclo'
    : actual.revisadoEn ? 'en_curso' : 'cierre'

  return { ciclos, total: dinamico.total, actual, modo, escribir, borrar }
}

// ── Campaña en curso ────────────────────────────────────────────────────────

/** Cada 7 días desde el cierre. Si hoy toca, es hoy. */
export function proximaRevision(fin: string, hoy: string): string {
  const d = diferenciaDias(hoy, fin)
  return sumarDias(fin, 7 * Math.max(1, Math.ceil(d / 7)))
}

export interface Alerta {
  tipo: 'stop_loss' | 'corte_pendiente' | 'ultimos_7_bajo_empate' | 'frecuencia' | 'costo_al_alza'
  texto: string
  tono: 'rojo' | 'amarillo'
}

export interface Ventana {
  gasto: number
  conversiones: number
  roas: number | null
}

/** Gasto, conversiones y ROAS (en el mismo criterio del semáforo) de días completos [desde, hasta). */
export function ventana(d: Pick<DatosCiclos, 'campana' | 'metricas' | 'ventas' | 'llamadas'>, e: EstadoCampana, desde: string, hasta: string): Ventana {
  const filas = construirFilas(d.campana, d.metricas, d.ventas, d.llamadas).filter(f => f.fecha >= desde && f.fecha < hasta)
  const gasto = filas.reduce((s, f) => s + f.gasto, 0)
  const conversiones = filas.reduce((s, f) => s + f.conversionesReales, 0)
  // Ingreso por conversión del semáforo: margen por conversión × precio / margen.
  const pc = e.cpa.empate * (d.campana.precioVenta / d.campana.margenVenta)
  return { gasto, conversiones, roas: gasto > 0 ? (conversiones * pc) / gasto : null }
}

/**
 * Alertas en vivo, siempre sobre la ventana "desde el último cambio" (`e`) y
 * los últimos días: no dependen del período que se esté mirando ni de que la
 * vista esté congelada.
 */
export function alertasEnVivo(d: Pick<DatosCiclos, 'campana' | 'metricas' | 'ventas' | 'llamadas' | 'hoy'>, e: EstadoCampana): Alerta[] {
  const out: Alerta[] = []
  const unidad = unidadDe(d.campana)
  const { conversiones: S, corteListo, gasto: G, gastoCorte } = e.ciclo
  if (e.ciclo.inicio && S === 0 && corteListo) {
    out.push({ tipo: 'stop_loss', tono: 'rojo', texto: `Stop-loss: ${round2(G)} invertidos sin ${unidad} desde el último cambio. Revisa el embudo.` })
  } else if (e.ciclo.inicio && S === 0 && G > 0) {
    out.push({ tipo: 'corte_pendiente', tono: 'amarillo', texto: `Corte pendiente: ${Math.round((G / gastoCorte) * 100)} % de la inversión necesaria para evaluarlo.` })
  }

  const hoy = d.hoy
  const u7 = ventana(d, e, sumarDias(hoy, -7), hoy)
  if (u7.gasto > 0 && u7.roas != null && u7.roas < e.roasEquilibrio && e.ciclo.dias >= 7) {
    out.push({ tipo: 'ultimos_7_bajo_empate', tono: 'rojo', texto: `Últimos 7 días bajo el empate (ROAS ${u7.roas.toFixed(2)}x): revísala antes de la fecha.` })
  }
  const fatiga = e.banderas.find(b => b.tipo === 'fatiga_audiencia')
  if (fatiga && fatiga.tipo === 'fatiga_audiencia') {
    out.push({ tipo: 'frecuencia', tono: 'amarillo', texto: `Frecuencia ${fatiga.frecuencia.toFixed(1)} (≥ ${FRECUENCIA_FATIGA}): prepara creativos nuevos.` })
  }
  const u3 = ventana(d, e, sumarDias(hoy, -3), hoy)
  const ant = ventana(d, e, sumarDias(hoy, -10), sumarDias(hoy, -3))
  if (u3.conversiones > 0 && ant.conversiones > 0 && u3.gasto / u3.conversiones >= 1.25 * (ant.gasto / ant.conversiones)) {
    out.push({ tipo: 'costo_al_alza', tono: 'amarillo', texto: `El costo por ${unidad.slice(0, -1)} de los últimos 3 días subió ${Math.round(((u3.gasto / u3.conversiones) / (ant.gasto / ant.conversiones) - 1) * 100)} % frente a la semana anterior.` })
  }
  return out
}
