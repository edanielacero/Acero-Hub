/**
 * Las reglas de negocio de Ads Analizador, como funciones puras.
 *
 * Spec: documentos/ads_analizador/sprint_5_reglas_v2.md (reglas Low Ticket /
 * High Ticket). Reemplaza al motor del Sprint 1: ya no se usa la meta de 50
 * conversiones en 7 días ni los "focos rojos" por días sueltos sin ventas.
 *
 * Principio: la app calcula, el agente IA solo redacta. Todo número que se
 * muestra o se manda a Claude sale de acá. Nada toca la red, la base ni el
 * reloj: `hoy` llega de afuera porque el servidor corre en UTC.
 */
import type { Bandera, Color, EntradaCalculo, EstadoCampana, Fase, FilaDiaria, ModoCorte } from './types'

/** ROAS piso = empate × 1,35 (colchón de 30–40 %). */
export const MULTIPLICADOR_ROAS_OBJETIVO = 1.35
export const CONVERSIONES_MINIMAS_MUESTRA = 10
/** Paso vertical temprano: desde este día del ciclo, con ≥ 5 conversiones desde el cambio. */
export const DIAS_PASO_TEMPRANO = 4
export const DIAS_VENTANA_DECISION = 7
export const DIAS_MINIMOS_CORTE = 3
export const FRECUENCIA_FATIGA = 3.5
/** Con estas conversiones la app reemplaza el costo esperado por el real. */
export const CONVERSIONES_PARA_CPA_REAL = 5
/** Se deja de escalar vertical cuando el ROAS queda a menos de 10 % del piso. */
export const MARGEN_PARADA_VERTICAL = 1.1
export const RITMO_VERDE = 0.2
export const RITMO_ROJO = 0.05
/** High Ticket: escenario "medio" mientras no hay tasas reales. */
export const SHOW_ESTIMADO_DEFECTO = 0.6
export const CLOSE_ESTIMADO_DEFECTO = 0.2
export const LLAMADAS_PARA_TASAS_REALES = 10
export const FACTOR_CPA_LLAMADA = 0.45
/** Por debajo de este presupuesto (× costo esperado) el corte tarda 7–10 días. */
export const PRESUPUESTO_MINIMO_RELATIVO = 0.75

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

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-10-03` → `3 oct`. */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Poisson (§3, §9) ────────────────────────────────────────────────────────

export function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p *= lambda / i // evita factoriales grandes
  return p
}

/** P(X ≤ k) */
export function poissonCdf(k: number, lambda: number): number {
  let sum = 0
  for (let i = 0; i <= k; i++) sum += poissonPmf(i, lambda)
  return Math.min(1, sum)
}

/** P(X ≥ k) */
export const probAtLeast = (k: number, lambda: number): number =>
  k <= 0 ? 1 : 1 - poissonCdf(k - 1, lambda)

export const lambdaDia = (gastoDia: number, cpaEsp: number) => gastoDia / cpaEsp

export const probZeroDia = (gastoDia: number, cpaEsp: number) => Math.exp(-lambdaDia(gastoDia, cpaEsp))

export const probZeroRacha = (gastoDia: number, cpaEsp: number, dias: number) =>
  Math.exp(-lambdaDia(gastoDia, cpaEsp) * dias)

// ── Fórmulas base (§2) ──────────────────────────────────────────────────────

export const roasEmpate = (precio: number, margen: number) => precio / margen
export const roasPiso = (precio: number, margen: number) => (precio / margen) * MULTIPLICADOR_ROAS_OBJETIVO
export const profit = (ventas: number, margen: number, gasto: number) => ventas * margen - gasto

/** Alias histórico de `roasEmpate`. */
export const roasEquilibrio = roasEmpate

/** El override de la campaña, o el empate con el colchón del 35 %. */
export function roasObjetivo(precioVenta: number, margenVenta: number, manual: number | null): number {
  return manual ?? roasPiso(precioVenta, margenVenta)
}

export function roasActual(ingresoTotal: number, gastoTotal: number): number | null {
  return gastoTotal > 0 ? ingresoTotal / gastoTotal : null
}

// ── Corte (§4.2–4.3) ────────────────────────────────────────────────────────

export function gastoDeCorte(cpaEsp: number, modo: ModoCorte): number {
  return (modo === 'conservador' ? 5 : 3) * cpaEsp
}

/**
 * El corte depende del gasto acumulado, no de un día fijo: cae cuando se
 * invierte `factor × costo esperado` (5 conservador, 3 estándar), nunca antes
 * del día 3. Con k = presupuesto / costo esperado: día = max(3, ⌈factor / k⌉).
 */
export function diasDeCorte(gastoDia: number, cpaEsp: number, modo: ModoCorte): number {
  const factor = modo === 'conservador' ? 5 : 3
  if (!(gastoDia > 0) || !(cpaEsp > 0)) return Math.max(DIAS_MINIMOS_CORTE, factor)
  const k = gastoDia / cpaEsp
  return Math.max(DIAS_MINIMOS_CORTE, Math.ceil(factor / k - 1e-9))
}

/** ¿Ya se puede evaluar el corte? Inversión de corte cumplida y al menos 3 días. */
export const puedeEvaluarCorte = (gastoAcum: number, cpaEsp: number, modo: ModoCorte, dias: number) =>
  gastoAcum >= gastoDeCorte(cpaEsp, modo) && dias >= DIAS_MINIMOS_CORTE

export function ventasParaEmpate(gastoAcum: number, margen: number): number {
  return Math.ceil(gastoAcum / margen)
}

export function ventasParaPiso(gastoAcum: number, margen: number): number {
  return Math.ceil((MULTIPLICADOR_ROAS_OBJETIVO * gastoAcum) / margen)
}

/** §3.6: ventas nuevas para que el costo acumulado quede en `objetivoCosto`. */
export function ventasNuevasParaObjetivo(
  objetivoCosto: number, gastoActual: number, ventasActuales: number, gastoFuturo: number,
): number {
  return Math.max(0, Math.ceil((gastoActual + gastoFuturo) / objetivoCosto - ventasActuales))
}

/** §8.1: qué tan raro es ver tan pocas ventas si la campaña fuera como se esperaba. */
export function estadoPorRitmo(
  ventasObservadas: number, gastoAcum: number, cpaEsp: number,
): { estado: Color; pBaja: number; lambdaTotal: number } {
  const lambdaTotal = gastoAcum / cpaEsp
  const pBaja = poissonCdf(ventasObservadas, lambdaTotal)
  const estado: Color = pBaja > RITMO_VERDE ? 'verde' : pBaja >= RITMO_ROJO ? 'amarillo' : 'rojo'
  return { estado, pBaja, lambdaTotal }
}

// ── High Ticket (§6) ────────────────────────────────────────────────────────

export const valorPorLlamada = (margen: number, show: number, close: number) => margen * show * close

/** 0,40 – 0,50 del valor por llamada en el primer lanzamiento. */
export const cpaEspLlamadaInicial = (valorLlamada: number, factor = FACTOR_CPA_LLAMADA) => valorLlamada * factor

/**
 * Tasas reales cuando hay datos (asistencia con ≥ 10 agendadas, cierre con ≥ 10
 * asistidas); si no, las estimadas por el usuario o el escenario medio.
 */
export function tasasLlamadas(l: NonNullable<EntradaCalculo['llamadas']>) {
  const showReal = l.agendadas >= LLAMADAS_PARA_TASAS_REALES ? l.asistidas / l.agendadas : null
  const closeReal = l.asistidas >= LLAMADAS_PARA_TASAS_REALES ? l.cerradas / l.asistidas : null
  const show = showReal ?? l.showEstimado ?? SHOW_ESTIMADO_DEFECTO
  const close = closeReal ?? l.closeEstimado ?? CLOSE_ESTIMADO_DEFECTO
  const fuente: 'reales' | 'estimadas' | 'mixtas' =
    showReal != null && closeReal != null ? 'reales' : showReal == null && closeReal == null ? 'estimadas' : 'mixtas'
  return { show, close, fuente }
}

// ── Lecturas del historial ──────────────────────────────────────────────────

/** Regla de fatiga: la frecuencia del día más reciente que la tenga. */
export function frecuenciaReciente(metricas: FilaDiaria[], hoy: string): number | null {
  const conFrecuencia = metricas
    .filter(m => m.fecha <= hoy && m.frecuencia != null)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  return conFrecuencia[0]?.frecuencia ?? null
}

/** Promedio de gasto de los últimos `n` días con gasto: el gasto real, no el presupuesto. */
function gastoDiaReciente(filas: FilaDiaria[], n = 3): number {
  const conGasto = filas.filter(f => f.gasto > 0).slice(-n)
  if (conGasto.length === 0) return 0
  return conGasto.reduce((s, f) => s + f.gasto, 0) / conGasto.length
}

// ── El estado ───────────────────────────────────────────────────────────────

type CpaResuelto = { valor: number; fuente: EstadoCampana['cpa']['fuente'] }

/**
 * §1.3: costo real con ≥ 5 conversiones (la app lo reemplaza en cuanto hay
 * datos); si no, el cargado por el usuario; si no, el de una campaña
 * comparable; si no, el margen (Low Ticket) o 0,45 × valor por llamada.
 */
export function resolverCpaEsperado(
  e: Pick<EntradaCalculo, 'cpaEsperadoManual' | 'cpaReferencia' | 'tipoConversion'>,
  gastoTotal: number, conversionesTotal: number, margenPorConversion: number,
): CpaResuelto {
  if (conversionesTotal >= CONVERSIONES_PARA_CPA_REAL && gastoTotal > 0) {
    return { valor: gastoTotal / conversionesTotal, fuente: 'real' }
  }
  if (e.cpaEsperadoManual) return { valor: e.cpaEsperadoManual, fuente: 'usuario' }
  if (e.cpaReferencia) return { valor: e.cpaReferencia, fuente: 'referencia' }
  if (e.tipoConversion === 'llamadas') return { valor: cpaEspLlamadaInicial(margenPorConversion), fuente: 'llamada' }
  return { valor: margenPorConversion, fuente: 'margen' }
}

/**
 * El semáforo de una campaña, por CICLO: desde el primer día con gasto o desde
 * el último cambio registrado, lo que sea más reciente. Siempre sobre días
 * completos y sobre el acumulado, nunca un día suelto (§2).
 *
 *   día 1          → chequeo técnico, no se decide nada
 *   días 2 a corte → recolección: solo el ritmo (Poisson), sin recomendar cambios
 *   corte (día 5, o 3 en modo estándar / con presupuesto ≥ 2× el costo esperado)
 *                  → stop-loss si no hay conversiones; si no, contra empate y piso
 *   día 7          → decisión con el ROAS acumulado: escalar, mantener o pausar
 *
 * High Ticket usa la misma lógica con la llamada agendada como conversión y el
 * valor por llamada (margen × asistencia × cierre) como margen.
 */
export function calcularEstado(e: EntradaCalculo): EstadoCampana {
  const llamadasTipo = e.tipoConversion === 'llamadas'
  const tasas = llamadasTipo && e.llamadas ? tasasLlamadas(e.llamadas) : null
  const factor = tasas ? tasas.show * tasas.close : 1
  // Margen e ingreso esperados POR CONVERSIÓN (venta, o llamada agendada).
  const mc = e.margenVenta * factor
  const pc = e.precioVenta * factor

  const eq = roasEmpate(e.precioVenta, e.margenVenta)
  const piso = roasObjetivo(e.precioVenta, e.margenVenta, e.roasObjetivoManual)
  const factorPiso = piso / eq

  const completos = e.metricas.filter(m => m.fecha < e.hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const gastoTotal = completos.reduce((s, m) => s + m.gasto, 0)
  const convTotal = completos.reduce((s, m) => s + m.conversionesReales, 0)

  const cpa = resolverCpaEsperado(e, gastoTotal, convTotal, mc > 0 ? mc : e.margenVenta)

  // ── Ciclo ──
  const primerGasto = completos.find(m => m.gasto > 0)?.fecha ?? null
  const cambio = e.ultimoCambio?.fecha ?? null
  const inicio = primerGasto && cambio ? (cambio > primerGasto ? cambio : primerGasto) : (primerGasto ?? cambio)
  const filas = inicio ? completos.filter(m => m.fecha >= inicio) : []
  const dias = inicio ? Math.max(0, diferenciaDias(e.hoy, inicio)) : 0
  const G = filas.reduce((s, m) => s + m.gasto, 0)
  const S = filas.reduce((s, m) => s + m.conversionesReales, 0)

  const gastoDia = gastoDiaReciente(filas) || gastoDiaReciente(completos)
  const presupuestoActual = e.ultimoCambio?.presupuesto ?? gastoDia
  // High Ticket corta con 3× el costo por llamada (§6); Low Ticket, 5× o 3× según el modo.
  const factorCorte = llamadasTipo ? DIAS_MINIMOS_CORTE : e.modoCorte === 'conservador' ? 5 : 3
  const gastoCorte = factorCorte * cpa.valor
  // Día del ciclo en que se alcanzó la inversión de corte; si todavía no, el
  // estimado al ritmo de gasto actual (con presupuesto chico cae después del 5).
  let acumulado = 0
  let diaAlcanzado: number | null = null
  for (const m of filas) {
    acumulado += m.gasto
    if (diaAlcanzado == null && acumulado >= gastoCorte) diaAlcanzado = diferenciaDias(m.fecha, inicio!) + 1
  }
  const diasCorte = Math.max(DIAS_MINIMOS_CORTE, diaAlcanzado ?? (gastoDia > 0
    ? dias + Math.ceil((gastoCorte - G) / gastoDia - 1e-9)
    : diasDeCorte(gastoDia, cpa.valor, llamadasTipo ? 'estandar' : e.modoCorte)))
  const corteListo = G >= gastoCorte && dias >= DIAS_MINIMOS_CORTE
  // La decisión también espera al corte, salvo que el ciclo ya tenga su
  // duración fija (se guarda al terminar el día 1 y no se estira).
  const diasDecision = e.diasCiclo ?? Math.max(DIAS_VENTANA_DECISION, diasCorte)

  let fase: Fase
  if (!inicio || dias <= 0 || (G === 0 && S === 0)) fase = 'sin_datos'
  else if (dias === 1) fase = 'chequeo'
  else if (!corteListo) fase = 'recoleccion'
  else if (dias < diasDecision) fase = 'corte'
  else fase = 'decision'

  const ciclo = {
    inicio, dias, gasto: G, conversiones: S, fase, modo: e.modoCorte, diasCorte, gastoCorte, diasDecision, corteListo,
    // El inicio es el día 1: el día N es inicio + N − 1, y cuenta al terminar.
    fechaCorte: inicio ? sumarDias(inicio, diasCorte - 1) : null,
    fechaDecision: inicio ? sumarDias(inicio, diasDecision - 1) : null,
    primeraConversion: filas.find(m => m.conversionesReales > 0)?.fecha ?? null,
  }

  const roas = G > 0 ? (S * pc) / G : null
  const colchon = roas == null ? null : roas / eq - 1
  // La meta del ciclo proyecta la inversión al ritmo actual hasta el día de decisión.
  const gastoAlCierre = G + gastoDia * Math.max(0, diasDecision - dias)
  const necesarias = {
    empate: mc > 0 ? ventasParaEmpate(G, mc) : 0,
    piso: mc > 0 ? Math.ceil((factorPiso * G) / mc) : 0,
    gastoAlCierre,
    empateAlCierre: mc > 0 ? ventasParaEmpate(gastoAlCierre, mc) : 0,
    pisoAlCierre: mc > 0 ? Math.ceil((factorPiso * gastoAlCierre) / mc) : 0,
  }


  // ── Riesgo (§3, §8.2) ──
  const lambda = cpa.valor > 0 ? gastoDia / cpa.valor : 0
  let racha = 0
  for (let i = filas.length - 1; i >= 0 && filas[i].gasto > 0 && filas[i].conversionesReales === 0; i--) racha++
  const conGasto = completos.filter(m => m.gasto > 0).slice(-30)
  const riesgo = {
    gastoDia,
    lambdaDia: lambda,
    pCeroHoy: Math.exp(-lambda),
    racha,
    pRacha: racha > 0 ? Math.exp(-lambda * racha) : null,
    pctDiasCeroObservado: conGasto.length >= 7 ? conGasto.filter(m => m.conversionesReales === 0).length / conGasto.length : null,
    pCeroVentana: { d3: Math.exp(-lambda * 3), d5: Math.exp(-lambda * 5), d7: Math.exp(-lambda * 7) },
    reservaCorte: diasCorte * presupuestoActual,
    reservaDecision: DIAS_VENTANA_DECISION * presupuestoActual,
  }
  const ritmo = G > 0 && cpa.valor > 0 ? estadoPorRitmo(S, G, cpa.valor) : null

  // ── Banderas ──
  const banderas: Bandera[] = []
  if (ritmo && ritmo.estado !== 'verde' && fase !== 'sin_datos') banderas.push({ tipo: 'ritmo', estado: ritmo.estado, pBaja: ritmo.pBaja })
  if (S < CONVERSIONES_MINIMAS_MUESTRA && dias >= DIAS_MINIMOS_CORTE && fase !== 'sin_datos' && fase !== 'recoleccion') banderas.push({ tipo: 'muestra_chica', conversiones: S })
  // Solo importa mientras se espera el corte: con la primera venta ya no hay corte.
  if (S === 0 && gastoDia > 0 && cpa.valor > 0 && gastoDia / cpa.valor < PRESUPUESTO_MINIMO_RELATIVO && fase !== 'sin_datos') {
    banderas.push({ tipo: 'presupuesto_bajo', relativo: gastoDia / cpa.valor, diasCorte })
  }
  const frecuencia = frecuenciaReciente(completos, e.hoy)
  if (frecuencia != null && frecuencia >= FRECUENCIA_FATIGA) banderas.push({ tipo: 'fatiga_audiencia', frecuencia })

  // ── Mensajes (§5) ──
  let mensajes: EstadoCampana['mensajes'] = null
  if (e.tipoConversion === 'venta_manual') {
    const conversaciones = filas.reduce((s, m) => s + m.resultadosMeta, 0)
    const costoConversacion = conversaciones > 0 ? G / conversaciones : null
    mensajes = {
      conversaciones,
      costoConversacion,
      conversion: conversaciones > 0 ? S / conversaciones : null,
      conversacionesEsperadasDia: costoConversacion ? gastoDia / costoConversacion : null,
    }
    if (alertaCalidadMensajes(filas)) banderas.push({ tipo: 'calidad_mensajes' })
  }

  const llamadas = tasas ? {
    show: tasas.show, close: tasas.close, fuenteTasas: tasas.fuente,
    valorPorLlamada: mc,
    presupuestoSugeridoMin: mc * 0.4,
    presupuestoSugeridoMax: mc * 0.5,
  } : null

  const base = {
    banderas, roasEquilibrio: eq, roasObjetivo: piso, roasActual: roas, colchon, ciclo,
    cpa: { esperado: cpa.valor, fuente: cpa.fuente, empate: mc, maxPiso: mc / factorPiso, real: S > 0 ? G / S : null },
    necesarias, riesgo, ritmo, mensajes, llamadas,
    escalado: null as EstadoCampana['escalado'],
    bajarCosto: null as EstadoCampana['bajarCosto'],
    chequeo: null as EstadoCampana['chequeo'],
  }

  const conv = llamadasTipo ? 'llamadas agendadas' : e.tipoConversion === 'venta_manual' ? 'ventas' : 'compras'
  const recordatorio = e.tipoConversion === 'venta_manual' ? ' Si vendiste, cárgalo en la tabla.' : ''
  const enCorte = (f: string) => fechaCorta(f)
  const dia7 = `el cierre del día ${diasDecision} (${enCorte(ciclo.fechaDecision ?? e.hoy)})`
  // Con alguna venta el corte ya no aplica (solo corta con 0): lo que sigue es el día 7.
  const hasta = S > 0 ? dia7 : `el corte, al cierre del día ${diasCorte} (${enCorte(ciclo.fechaCorte ?? e.hoy)})`

  // High Ticket con cero cierres reales: ninguna llamada paga su costo.
  if (llamadasTipo && mc <= 0) {
    return {
      ...base, color: 'rojo', accion: 'frenar',
      mensaje: 'Con las tasas reales de asistencia y cierre, una llamada no deja margen. Revisa la calificación y el cierre antes de seguir invirtiendo.',
    }
  }

  // §3.6: ¿puede bajar el costo acumulado? Solo información, nunca una recomendación.
  if (S > 0 && G / S > base.cpa.maxPiso && gastoDia > 0) {
    const costoReal = G / S
    const gastoFuturo = 3 * gastoDia
    const nuevas = ventasNuevasParaObjetivo(base.cpa.maxPiso, G, S, gastoFuturo)
    base.bajarCosto = { objetivo: base.cpa.maxPiso, gastoFuturo, nuevasNecesarias: nuevas, probabilidad: probAtLeast(nuevas, gastoFuturo / costoReal) }
  }

  if (fase === 'sin_datos') {
    const cambioHoy = cambio === e.hoy && primerGasto
    return {
      ...base, color: 'amarillo', accion: 'sin_datos',
      mensaje: cambioHoy
        ? 'Registraste un cambio hoy: el ciclo nuevo empieza hoy y mañana es su día 1 (chequeo técnico).'
        : completos.length === 0 && e.metricas.some(m => m.fecha === e.hoy)
          ? 'Solo hay datos de hoy, que todavía está en curso. El ciclo arranca con el primer día completo.'
          : 'Todavía no hay datos. Sincroniza para ver el estado de la campaña.',
    }
  }

  if (fase === 'chequeo') {
    const dia = filas[filas.length - 1]
    const chequeo = [{ texto: 'Hay gasto', ok: G > 0 }]
    if (e.tipoConversion === 'compra_stripe') chequeo.push({ texto: 'El pixel registra visitas a la landing', ok: (dia?.landingPageViews ?? 0) > 0 })
    if (e.tipoConversion === 'venta_manual') chequeo.push({ texto: 'Llegan conversaciones', ok: (dia?.resultadosMeta ?? 0) > 0 })
    if (llamadasTipo) chequeo.push({ texto: 'Llegan leads o agendamientos', ok: (dia?.resultadosMeta ?? 0) > 0 })
    const falla = chequeo.find(c => !c.ok)
    return {
      ...base, chequeo, color: falla ? 'rojo' : 'amarillo', accion: 'chequeo',
      mensaje: falla
        ? `Día 1 del ciclo: falla el chequeo técnico (${falla.texto.toLowerCase()}). Revisa el anuncio, el pixel o el checkout en Ads Manager.`
        : `Día 1 del ciclo: solo chequeo técnico. No cambies presupuesto, anuncios ni públicos hasta ${hasta}.`,
    }
  }

  // Muy pronto para evaluar: todavía no se invirtió lo necesario para el corte.
  // Cero ventas acá no es alarma, así que nunca va en rojo.
  if (fase === 'recoleccion') {
    const est: Color = ritmo?.estado === 'verde' ? 'verde' : 'amarillo'
    const inversion = `llevas ${round2(G)} de ${round2(gastoCorte)} invertidos para evaluar el corte`
    return {
      ...base, color: est, accion: 'muy_pronto',
      mensaje: S === 0
        ? `Sin ${conv} todavía, y es normal: ${inversion} (se estima al cierre del día ${diasCorte}, el ${enCorte(ciclo.fechaCorte ?? e.hoy)}). No cambies presupuesto, anuncios ni públicos.${recordatorio}`
        : est === 'verde'
          ? `Vas al ritmo esperado y ya hubo ${conv}, así que no hay corte. No cambies nada hasta ${hasta}.`
          : `Vas por debajo de lo esperado, pero todavía es pronto (${inversion}). No cambies nada hasta ${hasta}.${recordatorio}`,
    }
  }

  // Corte y decisión: ¿se puede escalar? Doble vía (§4.4–4.5): la decisión del
  // día 7 con ≥ 10 conversiones del ciclo, o un paso vertical desde el día 4
  // del ciclo si hubo ≥ 5 conversiones desde el cambio y la campaña ya probó
  // tener muestra (≥ 10 en total).
  const sobrePiso = roas != null && roas >= piso
  const puedeEscalar = sobrePiso && (
    (fase === 'decision' && S >= CONVERSIONES_MINIMAS_MUESTRA)
    || (dias >= DIAS_PASO_TEMPRANO && S >= 5 && convTotal >= CONVERSIONES_MINIMAS_MUESTRA)
  )
  if (puedeEscalar) {
    const vertical = roas! > piso * MARGEN_PARADA_VERTICAL
    const chico = presupuestoActual < (e.umbralPresupuestoChico ?? 25)
    const [pasoMin, pasoMax] = chico ? [0.3, 0.5] : [0.2, 0.3]
    const sugerido = vertical ? presupuestoActual * (1 + (pasoMin + pasoMax) / 2) : presupuestoActual + cpa.valor
    const profitDiario = dias > 0 ? (S * mc - G) / dias : 0
    base.escalado = {
      tipo: vertical ? 'vertical' : 'horizontal',
      presupuestoActual,
      presupuestoSugerido: sugerido,
      pasoMin, pasoMax,
      cpaMaxParaConvenir: vertical && profitDiario > 0 ? (mc * sugerido) / (sugerido + profitDiario) : null,
      maxConjuntos: Math.max(1, Math.floor(sugerido / cpa.valor)),
      perdidaMaximaSiDuplica: DIAS_VENTANA_DECISION * 2 * presupuestoActual,
    }
    if (mensajes && e.capacidadChatsDia && mensajes.costoConversacion) {
      const esperadas = sugerido / mensajes.costoConversacion
      if (esperadas > e.capacidadChatsDia) banderas.push({ tipo: 'capacidad', esperadas, capacidad: e.capacidadChatsDia })
    }
    return {
      ...base, color: 'verde', accion: vertical ? 'escalar_vertical' : 'escalar_horizontal',
      mensaje: vertical
        ? `ROAS ${roas!.toFixed(2)}x sobre el piso (${piso.toFixed(2)}x) con ${S} ${conv}: puedes subir el presupuesto un ${Math.round(pasoMin * 100)}–${Math.round(pasoMax * 100)} %.`
        : `ROAS ${roas!.toFixed(2)}x sobre el piso, pero a menos de 10 % de él: deja de escalar vertical y prueba 1–2 anuncios nuevos en un conjunto aparte.`,
    }
  }

  if (mensajes && e.capacidadChatsDia && mensajes.conversacionesEsperadasDia && mensajes.conversacionesEsperadasDia > e.capacidadChatsDia) {
    banderas.push({ tipo: 'capacidad', esperadas: mensajes.conversacionesEsperadasDia, capacidad: e.capacidadChatsDia })
  }

  if (fase === 'corte') {
    if (S === 0) {
      return {
        ...base, color: 'rojo', accion: 'frenar',
        mensaje: llamadasTipo
          ? `Corte: ${round2(G)} gastados sin ninguna llamada agendada. Revisa clics, visitas y % que agenda antes de descartar la oferta.`
          : `Corte (stop-loss): ${round2(G)} gastados sin ${conv}. Revisa el embudo antes de descartar el producto (visitas, checkouts, mensajes).${recordatorio}`,
      }
    }
    if (S < necesarias.empate) {
      return {
        ...base, color: 'amarillo', accion: 'decidir',
        mensaje: `Por debajo del empate: ${S} de ${necesarias.empate} ${conv} necesarias. Sigue solo si aceptas llegar hasta ${dia7}; si no, pausa.${recordatorio}`,
      }
    }
    if (S < necesarias.piso) {
      return {
        ...base, color: 'amarillo', accion: 'esperar',
        mensaje: `Sobre el empate y bajo el piso (${S} de ${necesarias.piso} ${conv}): sigue y vigila. Se decide con ${dia7}.`,
      }
    }
    return {
      ...base, color: 'verde', accion: 'esperar',
      mensaje: `Sobre el ROAS piso (${S} ${conv}). Sigue sin tocar; evalúa escalar con ${dia7}.`,
    }
  }

  // Decisión (día 7 en adelante, y con la inversión de corte cumplida).
  if (S === 0) {
    return {
      ...base, color: 'rojo', accion: 'frenar',
      mensaje: `Corte (stop-loss): ${round2(G)} gastados sin ${conv}. Revisa el embudo antes de descartar el producto (visitas, checkouts, mensajes).${recordatorio}`,
    }
  }
  if (roas == null || roas < eq) {
    return {
      ...base, color: 'rojo', accion: 'frenar',
      mensaje: `ROAS ${roas == null ? '—' : roas.toFixed(2) + 'x'} bajo el empate (${eq.toFixed(2)}x): pausa o cambia el creativo. No subas presupuesto.${recordatorio}`,
    }
  }
  if (roas < piso) {
    return {
      ...base, color: 'amarillo', accion: 'esperar',
      mensaje: `ROAS ${roas.toFixed(2)}x entre el empate y el piso (${piso.toFixed(2)}x): mantén sin tocar y vigila.`,
    }
  }
  return {
    ...base, color: 'amarillo', accion: 'esperar',
    mensaje: `Sobre el piso, pero con muestra chica (${S} de ${CONVERSIONES_MINIMAS_MUESTRA} ${conv} para escalar): mantén sin tocar y revisa de nuevo al cierre del ${enCorte(sumarDias(inicio!, (Math.floor(dias / 7) + 1) * 7 - 1))}.`,
  }
}

/**
 * §5: el costo por conversación baja pero el % de conversión cae varios días.
 * Últimos 3 días contra el resto del ciclo: costo ≥ 10 % menor y conversión
 * ≥ 25 % menor. Necesita al menos 6 días y conversaciones en las dos mitades.
 */
export function alertaCalidadMensajes(filas: FilaDiaria[]): boolean {
  if (filas.length < 6) return false
  const ult = filas.slice(-3), ant = filas.slice(0, -3)
  const tot = (xs: FilaDiaria[]) => xs.reduce((a, f) => ({ g: a.g + f.gasto, c: a.c + f.resultadosMeta, v: a.v + f.conversionesReales }), { g: 0, c: 0, v: 0 })
  const u = tot(ult), a = tot(ant)
  if (u.c === 0 || a.c === 0 || a.v === 0) return false
  const costoBaja = u.g / u.c <= (a.g / a.c) * 0.9
  const conversionCae = u.v / u.c <= (a.v / a.c) * 0.75
  return costoBaja && conversionCae
}

// ── Funnel ──────────────────────────────────────────────────────────────────

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
