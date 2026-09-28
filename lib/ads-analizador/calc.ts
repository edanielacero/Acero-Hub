/**
 * Las reglas de negocio de Ads Analizador, como funciones puras.
 *
 * Spec: documentos/ads_analizador/sprint_1_fundaciones_y_reglas.md §4
 *
 * Entra una campaña con sus filas diarias ya armadas; sale un color, una
 * acción sugerida y las banderas que la explican. Nada acá toca la red, la base
 * ni el reloj: `hoy` llega de afuera porque el servidor de Vercel corre en UTC
 * y el usuario está en Bolivia.
 */
import type { Bandera, EntradaCalculo, EstadoCampana, FilaDiaria } from './types'

export const RESULTADOS_MINIMOS_APRENDIZAJE = 50
export const DIAS_VENTANA_APRENDIZAJE = 7
export const CONVERSIONES_MINIMAS_MUESTRA = 10
export const MULTIPLICADOR_ROAS_OBJETIVO = 1.35
export const MULTIPLICADOR_FOCO_ROJO_GASTO = 2.5
export const DIAS_SIN_VENTA_FOCO_ROJO = 3
export const DIAS_REAJUSTE_TECNICO = 4
export const DIAS_VENTANA_DECISION = 7
export const FRECUENCIA_FATIGA = 3.5

// ── Fechas (YYYY-MM-DD, sin zona) ───────────────────────────────────────────

function aUtc(fecha: string): number {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

const DIA_MS = 86_400_000

/** Días enteros de `desde` a `hasta`. Positivo si `hasta` es posterior. */
export function diferenciaDias(hasta: string, desde: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / DIA_MS)
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(aUtc(fecha) + dias * DIA_MS).toISOString().slice(0, 10)
}

// ── Fórmulas base ───────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** precio / margen. Con margen ≈ 100% da ~1.0x; con costo de producto, sube. */
export function roasEquilibrio(precioVenta: number, margenVenta: number): number {
  return precioVenta / margenVenta
}

/** El override de la campaña, o el equilibrio con un 35% de colchón encima. */
export function roasObjetivo(precioVenta: number, margenVenta: number, manual: number | null): number {
  return manual ?? roasEquilibrio(precioVenta, margenVenta) * MULTIPLICADOR_ROAS_OBJETIVO
}

export function roasActual(ingresoTotal: number, gastoTotal: number): number | null {
  return gastoTotal > 0 ? ingresoTotal / gastoTotal : null
}

// ── Ventanas ────────────────────────────────────────────────────────────────

/**
 * Las filas de los últimos `n` días corridos, terminando en el día más reciente
 * que tenga datos (y nunca después de `hoy`).
 *
 * Termina en el último día con datos y no en `hoy` porque el sync trae hasta
 * ayer: una ventana anclada en hoy tendría siempre un día vacío, y la regla de
 * "3 días seguidos sin ventas" no podría dispararse nunca.
 *
 * Por lo mismo, un día que solo tiene la venta cargada (Meta todavía no lo
 * trajo) no mueve el ancla: si lo hiciera, anotar las ventas de hoy correría la
 * ventana de 7 días un día hacia adelante y le restaría resultados.
 */
export function ultimosNDias(metricas: FilaDiaria[], hoy: string, n: number): FilaDiaria[] {
  const validas = metricas.filter(m => m.fecha <= hoy)
  if (validas.length === 0) return []
  const anclas = validas.some(m => !m.soloVenta) ? validas.filter(m => !m.soloVenta) : validas
  const ultima = anclas.reduce((max, m) => (m.fecha > max ? m.fecha : max), anclas[0].fecha)
  const desde = sumarDias(ultima, -(n - 1))
  return validas
    .filter(m => m.fecha >= desde && m.fecha <= ultima)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Regla 1. Suma `resultadosMeta`, no la venta real: es lo que optimiza Meta. */
export function resultadosUltimos7(metricas: FilaDiaria[], hoy: string): number {
  return ultimosNDias(metricas, hoy, DIAS_VENTANA_APRENDIZAJE).reduce((s, m) => s + m.resultadosMeta, 0)
}

/**
 * Regla 4 — los focos rojos que no esperan a nada.
 *
 * Usa `conversionesReales`, nunca `resultadosMeta`: una campaña de WhatsApp que
 * junta conversaciones pero no cierra ninguna venta es exactamente lo que esta
 * regla tiene que agarrar.
 */
export function detectarFocoRojo(e: EntradaCalculo): Extract<Bandera, { tipo: 'foco_rojo' }> | null {
  if (e.conversionesConfirmadas === 0 && e.gastoTotal >= MULTIPLICADOR_FOCO_ROJO_GASTO * e.margenVenta) {
    return { tipo: 'foco_rojo', motivo: 'gasto_sin_resultados' }
  }

  const ultimos = ultimosNDias(e.metricas, e.hoy, DIAS_SIN_VENTA_FOCO_ROJO)
  const todosSinVenta = ultimos.length === DIAS_SIN_VENTA_FOCO_ROJO
    && ultimos.every(d => d.gasto > 0 && d.conversionesReales === 0)
  const gastoDeEsosDias = ultimos.reduce((s, d) => s + d.gasto, 0)
  if (todosSinVenta && gastoDeEsosDias >= e.margenVenta) {
    return { tipo: 'foco_rojo', motivo: 'sin_ventas_dias' }
  }

  return null
}

/** Regla 6. Las dos ventanas se miden desde el cambio más reciente. */
export function calcularCooldown(ultimoCambioFecha: string | null, hoy: string) {
  if (!ultimoCambioFecha) {
    return { reajusteTecnico: false, ventanaDecision: false, reajusteHasta: null, decisionHasta: null }
  }
  const dias = diferenciaDias(hoy, ultimoCambioFecha)
  return {
    reajusteTecnico: dias >= 0 && dias < DIAS_REAJUSTE_TECNICO,
    ventanaDecision: dias >= 0 && dias < DIAS_VENTANA_DECISION,
    reajusteHasta: sumarDias(ultimoCambioFecha, DIAS_REAJUSTE_TECNICO),
    decisionHasta: sumarDias(ultimoCambioFecha, DIAS_VENTANA_DECISION),
  }
}

/** Regla 7. La frecuencia del día más reciente que la tenga. */
export function frecuenciaReciente(metricas: FilaDiaria[], hoy: string): number | null {
  const conFrecuencia = metricas
    .filter(m => m.fecha <= hoy && m.frecuencia != null)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  return conFrecuencia[0]?.frecuencia ?? null
}

// ── Textos ──────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-10-03` → `3 oct`. */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}

// ── El estado ───────────────────────────────────────────────────────────────

/**
 * El semáforo de una campaña.
 *
 * Orden de prioridad (Sprint 1 §4.8), de más a menos urgente:
 *   1. Foco rojo temprano — no lo tapa nada.
 *   2. En aprendizaje.
 *   3. Muestra chica.
 *   4. Reajuste técnico / ventana de decisión.
 *   5. Recién ahí, el colchón de ROAS: bajo equilibrio 🔴, bajo objetivo 🟡,
 *      sobre objetivo 🟢.
 * La fatiga de audiencia nunca cambia el color: es una bandera más.
 */
export function calcularEstado(e: EntradaCalculo): EstadoCampana {
  const eq = roasEquilibrio(e.precioVenta, e.margenVenta)
  const obj = roasObjetivo(e.precioVenta, e.margenVenta, e.roasObjetivoManual)
  const actual = roasActual(e.ingresoTotal, e.gastoTotal)
  const colchon = actual == null ? null : actual / eq - 1

  const base = { roasEquilibrio: eq, roasObjetivo: obj, roasActual: actual, colchon }
  const banderas: Bandera[] = []

  // Sin un solo día de Meta no hay nada que evaluar: decir "en aprendizaje" de
  // una campaña que nunca sincronizó sería afirmar algo que no se sabe. Las
  // ventas cargadas a mano solas no cuentan: sin gasto no hay ROAS.
  if (!e.metricas.some(m => !m.soloVenta) && e.gastoTotal === 0) {
    return {
      ...base, color: 'amarillo', accion: 'sin_datos', banderas,
      mensaje: 'Todavía no hay datos. Sincroniza para ver el estado de la campaña.',
    }
  }

  const foco = detectarFocoRojo(e)
  if (foco) banderas.push(foco)

  const resultados7d = resultadosUltimos7(e.metricas, e.hoy)
  const enAprendizaje = resultados7d < RESULTADOS_MINIMOS_APRENDIZAJE
  if (enAprendizaje) banderas.push({ tipo: 'en_aprendizaje', resultados7d })

  const muestraChica = e.conversionesConfirmadas < CONVERSIONES_MINIMAS_MUESTRA
  if (muestraChica) banderas.push({ tipo: 'muestra_chica', conversiones: e.conversionesConfirmadas })

  const cd = calcularCooldown(e.ultimoCambioFecha, e.hoy)
  // Si las dos son ciertas, se muestra solo la más restrictiva.
  if (cd.reajusteTecnico) banderas.push({ tipo: 'reajuste_tecnico', hasta: cd.reajusteHasta! })
  else if (cd.ventanaDecision) banderas.push({ tipo: 'ventana_decision', hasta: cd.decisionHasta! })

  const frecuencia = frecuenciaReciente(e.metricas, e.hoy)
  if (frecuencia != null && frecuencia >= FRECUENCIA_FATIGA) {
    banderas.push({ tipo: 'fatiga_audiencia', frecuencia })
  }

  const conv = e.tipoConversion === 'venta_manual' ? 'ventas cargadas' : 'compras'

  if (foco) {
    // En WhatsApp las ventas las carga el usuario: "cero ventas" muchas veces
    // es "todavía no las cargué". Se dice, sin bajarle el tono al foco rojo.
    const recordatorio = e.tipoConversion === 'venta_manual' ? ' Si sí vendiste, carga las ventas en la campaña.' : ''
    return {
      ...base, color: 'rojo', accion: 'frenar', banderas,
      mensaje: (foco.motivo === 'gasto_sin_resultados'
        ? `Ya gastaste ${MULTIPLICADOR_FOCO_ROJO_GASTO}× el margen de una venta y no hay ni una. Revisa la campaña ahora.`
        : `${DIAS_SIN_VENTA_FOCO_ROJO} días seguidos con gasto y sin ${conv}. Revisa la campaña ahora.`) + recordatorio,
    }
  }

  if (enAprendizaje) {
    return {
      ...base, color: 'amarillo', accion: 'esperar', banderas,
      mensaje: `En fase de aprendizaje: ${resultados7d} de ${RESULTADOS_MINIMOS_APRENDIZAJE} resultados en 7 días. Todavía es pronto para leer tendencias.`,
    }
  }

  if (muestraChica) {
    return {
      ...base, color: 'amarillo', accion: 'esperar', banderas,
      mensaje: `Muestra chica: ${e.conversionesConfirmadas} ${conv}. No tomes decisiones grandes con esto todavía.`,
    }
  }

  if (cd.reajusteTecnico) {
    return {
      ...base, color: 'amarillo', accion: 'esperar', banderas,
      mensaje: `En reajuste técnico hasta el ${fechaCorta(cd.reajusteHasta!)}: los números de estos días pueden no reflejar el rendimiento real.`,
    }
  }

  if (cd.ventanaDecision) {
    return {
      ...base, color: 'amarillo', accion: 'esperar', banderas,
      mensaje: `Ventana de decisión abierta hasta el ${fechaCorta(cd.decisionHasta!)}: espera antes de otro cambio grande.`,
    }
  }

  if (actual == null) {
    return {
      ...base, color: 'amarillo', accion: 'sin_datos', banderas,
      mensaje: 'Todavía no hay gasto registrado.',
    }
  }

  if (actual < eq) {
    return {
      ...base, color: 'rojo', accion: 'frenar', banderas,
      mensaje: `ROAS ${actual.toFixed(2)}x, por debajo del equilibrio (${eq.toFixed(2)}x): cada venta pierde plata. Frena o cambia el enfoque.`,
    }
  }

  if (actual < obj) {
    return {
      ...base, color: 'amarillo', accion: 'escalar_horizontal', banderas,
      mensaje: `Colchón por debajo del objetivo (${obj.toFixed(2)}x). No subas presupuesto: prueba un anuncio o una audiencia nueva.`,
    }
  }

  return {
    ...base, color: 'verde', accion: 'escalar_vertical', banderas,
    mensaje: 'Sana: puedes seguir escalando el presupuesto.',
  }
}

// ── Funnel (Sprint 4) ───────────────────────────────────────────────────────

export interface Escalon {
  etiqueta: string
  valor: number
}

/**
 * El paso con la mayor caída porcentual entre dos escalones consecutivos.
 * Devuelve el índice del escalón DE LLEGADA, o null si no hay caída medible.
 */
export function puntoDebil(escalones: Escalon[]): { indice: number; caida: number } | null {
  let peor: { indice: number; caida: number } | null = null
  for (let i = 1; i < escalones.length; i++) {
    const antes = escalones[i - 1].valor
    if (antes <= 0) continue
    const caida = 1 - escalones[i].valor / antes
    if (caida > 0 && (!peor || caida > peor.caida)) peor = { indice: i, caida }
  }
  return peor
}

/** Suma de los `decline_reasons` de varios días, ordenada de mayor a menor. */
export function sumarDeclines(dias: (Record<string, number> | null)[]): [string, number][] {
  const total: Record<string, number> = {}
  for (const d of dias) {
    if (!d) continue
    for (const [motivo, n] of Object.entries(d)) total[motivo] = (total[motivo] ?? 0) + Number(n)
  }
  return Object.entries(total).sort((a, b) => b[1] - a[1])
}
