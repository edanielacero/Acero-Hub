/**
 * El prompt para pegar en la app de Claude.
 *
 * Principio (reglas v2 §8.3): la app calcula, el agente solo redacta. Viaja un
 * objeto con todo ya calculado —fase del ciclo, ritmo, probabilidades, ventas
 * necesarias, fechas de revisión, escalado— y se le pide que lo explique en
 * pocas líneas, sin hacer cuentas por su cuenta.
 *
 * Puro y sin red: se arma en el cliente, en el mismo click que lo copia (en
 * Safari de iPhone el portapapeles solo se puede escribir dentro del gesto).
 */
import {
  CONVERSIONES_MINIMAS_MUESTRA, DIAS_VENTANA_DECISION, FRECUENCIA_FATIGA,
  MULTIPLICADOR_ROAS_OBJETIVO, sumarDias,
} from './calc'
import { netoDia, ventasPorDia, type CicloResumen } from './load'
import type { Campana, CampanaConEstado, Cambio, EstadoCampana, LlamadaDia, MetricaDiaria, Totales, VentaManual } from './types'

/** Días de historial diario que viajan en el prompt de una campaña. */
export const DIAS_EN_PROMPT = 30

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100)
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 10)

const TIPO: Record<Campana['tipoConversion'], string> = {
  compra_stripe: 'Low Ticket, compra directa en la web',
  venta_manual: 'Low Ticket por mensajes (WhatsApp, venta cerrada a mano)',
  llamadas: 'High Ticket, agendamiento de llamadas',
}

const ENCABEZADO = `Eres un analista de Meta Ads con criterio de negocio. Responde en español, tuteando, directo y sin relleno.

Te paso el análisis que ya calculó mi herramienta "Ads Analizador". **No recalcules nada**: todos los números (ROAS, probabilidades, ventas necesarias, fechas) están en el objeto "analisis". Tu trabajo es explicarlos y recomendar.

## Reglas con las que calcula la app
- ROAS de empate = precio / margen. ROAS piso = empate × ${MULTIPLICADOR_ROAS_OBJETIVO}: el mínimo para considerarse rentable; decide si se escala.
- Todo se mide por CICLO (desde el inicio o el último cambio registrado), con el acumulado y nunca con un día suelto.
- Día 1: solo chequeo técnico. El corte depende de la inversión acumulada, no de un día fijo: se evalúa cuando el ciclo invirtió 5× el costo esperado (modo conservador) o 3× (estándar), nunca antes del día 3. Con presupuesto diario k = gasto/costo esperado, cae el día max(3, ⌈factor/k⌉): con presupuesto menor al costo por venta puede ser el día 7, 10 o después. Mientras no se llega, es "muy pronto para evaluar": cero ventas es normal y no se toca nada. En el corte, con 0 conversiones se corta; con ventas no hay corte, se compara contra las necesarias para empate y piso. Decisión: día ${DIAS_VENTANA_DECISION} (o el del corte si cae después) con el ROAS acumulado; escalar pide ≥ ${CONVERSIONES_MINIMAS_MUESTRA} conversiones, si no se revisa cada semana. Un presupuesto menor a ~0,75× el costo esperado retrasa todo.
- Ritmo: probabilidad (Poisson) de ver tan pocas conversiones si la campaña fuera como se esperaba. > 20 % normal, 5–20 % por debajo (sin acción), < 5 % muy por debajo (cortar solo si ya se cumplió el corte).
- Muestra chica: con menos de ${CONVERSIONES_MINIMAS_MUESTRA} conversiones no se toman decisiones grandes.
- Durante el ciclo no se cambia nada (ni presupuesto, ni anuncios, ni públicos), aunque vaya muy bien o muy mal: todo se decide al cerrarlo. La única excepción es el stop-loss del corte (0 conversiones), que cierra el ciclo.
- Escalado vertical: +20–30 % (30–50 % con presupuestos chicos), solo con el ROAS sobre el piso; se deja de escalar vertical cuando el ROAS queda a menos de 10 % del piso, y ahí se escala horizontal (conjunto nuevo con 1–2 anuncios nuevos, sin tocar el ganador). No combinar vertical y horizontal la misma semana.
- Un cambio registrado arranca un ciclo nuevo (día 1, corte, día ${DIAS_VENTANA_DECISION}): no se hace otro cambio grande antes de su revisión. Fatiga con frecuencia ≥ ${FRECUENCIA_FATIGA}.
- Los días en cero reales son algo más frecuentes que lo que dice el modelo: al hablar de riesgo, suma 5–10 puntos a la probabilidad.

## Cómo leer los datos
- Los montos están en la moneda de cada campaña; no sumes USD con BOB.
- "ganancia_neta" es lo que queda después de comisiones y antes de la inversión; "profit" = ganancia neta − inversión.
- El día de hoy está en curso: los totales lo incluyen, el análisis del ciclo no.`

function campanaJson(c: Campana) {
  return {
    nombre: c.nombre,
    tipo: TIPO[c.tipoConversion],
    moneda: c.moneda,
    activa: c.activo,
    precio_venta: c.precioVenta,
    margen_por_venta: c.margenVenta,
    modo_corte: c.modoCorte,
  }
}

/** El análisis ya calculado por calc.ts, con nombres legibles y montos redondeados. */
export function analisisJson(e: EstadoCampana) {
  return {
    semaforo: e.color,
    accion_sugerida: e.accion,
    mensaje_de_la_app: e.mensaje,
    alertas: e.banderas,
    ciclo: {
      desde: e.ciclo.inicio,
      dias_completos: e.ciclo.dias,
      fase: e.ciclo.fase,
      inversion: r2(e.ciclo.gasto),
      conversiones: e.ciclo.conversiones,
      // Días del ciclo: cada uno cuenta al terminar (23:59).
      ultimo_dia_de_corte: e.ciclo.conversiones > 0 ? 'no aplica: ya hubo conversiones' : e.ciclo.fechaCorte,
      dia_7_decision: e.ciclo.fechaDecision,
      inversion_de_corte: r2(e.ciclo.gastoCorte),
      corte_evaluable: e.ciclo.corteListo,
    },
    roas: { empate: r2(e.roasEquilibrio), piso: r2(e.roasObjetivo), actual_del_ciclo: r2(e.roasActual) },
    costo_por_conversion: {
      esperado: r2(e.cpa.esperado),
      de_donde_sale_el_esperado: e.cpa.fuente,
      real_del_ciclo: r2(e.cpa.real),
      empate: r2(e.cpa.empate),
      maximo_para_el_piso: r2(e.cpa.maxPiso),
    },
    conversiones_necesarias_con_la_inversion_actual: e.necesarias,
    ritmo: e.ritmo ? { estado: e.ritmo.estado, probabilidad_de_verlo_asi_por_azar_pct: pct(e.ritmo.pBaja), esperadas: r2(e.ritmo.lambdaTotal) } : null,
    riesgo: {
      inversion_diaria_real: r2(e.riesgo.gastoDia),
      conversiones_esperadas_por_dia: r2(e.riesgo.lambdaDia),
      prob_dia_sin_conversiones_pct: pct(e.riesgo.pCeroHoy),
      racha_actual_sin_conversiones: e.riesgo.racha,
      prob_de_esa_racha_pct: pct(e.riesgo.pRacha),
      pct_dias_en_cero_observado: pct(e.riesgo.pctDiasCeroObservado),
      prob_cero_en_3_5_7_dias_pct: [pct(e.riesgo.pCeroVentana.d3), pct(e.riesgo.pCeroVentana.d5), pct(e.riesgo.pCeroVentana.d7)],
      reserva_hasta_el_corte: r2(e.riesgo.reservaCorte),
      reserva_hasta_el_dia_7: r2(e.riesgo.reservaDecision),
    },
    escalado: e.escalado && {
      tipo: e.escalado.tipo,
      presupuesto_actual: r2(e.escalado.presupuestoActual),
      presupuesto_sugerido: r2(e.escalado.presupuestoSugerido),
      paso_pct: [Math.round(e.escalado.pasoMin * 100), Math.round(e.escalado.pasoMax * 100)],
      conviene_solo_si_el_costo_queda_bajo: r2(e.escalado.cpaMaxParaConvenir),
      maximo_de_conjuntos_activos: e.escalado.maxConjuntos,
      perdida_maxima_si_duplica: r2(e.escalado.perdidaMaximaSiDuplica),
    },
    bajar_costo: e.bajarCosto && {
      costo_objetivo: r2(e.bajarCosto.objetivo),
      inversion_proximos_3_dias: r2(e.bajarCosto.gastoFuturo),
      conversiones_nuevas_necesarias: e.bajarCosto.nuevasNecesarias,
      probabilidad_pct: pct(e.bajarCosto.probabilidad),
    },
    chequeo_tecnico: e.chequeo,
    mensajes: e.mensajes && {
      conversaciones_del_ciclo: e.mensajes.conversaciones,
      costo_por_conversacion: r2(e.mensajes.costoConversacion),
      conversion_pct: pct(e.mensajes.conversion),
      conversaciones_esperadas_por_dia: r2(e.mensajes.conversacionesEsperadasDia),
    },
    llamadas: e.llamadas && {
      asistencia_pct: pct(e.llamadas.show),
      cierre_pct: pct(e.llamadas.close),
      tasas: e.llamadas.fuenteTasas,
      valor_por_llamada: r2(e.llamadas.valorPorLlamada),
      presupuesto_diario_sugerido: [r2(e.llamadas.presupuestoSugeridoMin), r2(e.llamadas.presupuestoSugeridoMax)],
    },
  }
}

function totalesJson(t: Totales) {
  return {
    dias_con_datos: t.dias,
    inversion: r2(t.gasto),
    facturacion: r2(t.ingreso),
    ganancia_neta: r2(t.neto),
    profit: r2(t.profit),
    ventas: t.conversiones,
    resultados_meta: t.resultadosMeta,
    clics_enlace: t.clics,
    visitas_landing: t.landingPageViews,
    checkouts: t.pagosIniciados,
    ...(t.llamadas ? { llamadas: t.llamadas } : {}),
  }
}

function bloqueJson(datos: unknown): string {
  return '```json\n' + JSON.stringify(datos, null, 2) + '\n```'
}

export interface DatosCampanaPrompt {
  campana: Campana
  estado: EstadoCampana
  totales: Totales
  metricas: MetricaDiaria[]
  ventas: VentaManual[]
  llamadas?: LlamadaDia[]
  cambios: Cambio[]
  hoy: string
  /** Resultado de cada ciclo (del primero al actual), si el dashboard lo calculó. */
  ciclos?: CicloResumen[]
}

/** Prompt de una campaña: análisis calculado, totales y los últimos 30 días. */
export function promptCampana(d: DatosCampanaPrompt): string {
  const { campana: c } = d
  const desde = sumarDias(d.hoy, -DIAS_EN_PROMPT)
  const ventasDia = ventasPorDia(c, d.metricas, d.ventas, d.llamadas ?? [])
  const llamadasDia = new Map((d.llamadas ?? []).map(l => [l.fecha, l]))

  const diario = d.metricas
    .filter(m => m.fecha >= desde)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(m => {
      const v = ventasDia.get(m.fecha)
      const l = llamadasDia.get(m.fecha)
      return {
        fecha: m.fecha,
        inversion: r2(m.gasto),
        frecuencia: r2(m.frecuencia),
        clics_enlace: m.clicsEnlace,
        resultados_meta: m.resultados,
        ...(c.tipoConversion === 'venta_manual' ? {} : { visitas_landing: m.landingPageViews }),
        ...(c.tipoConversion === 'compra_stripe' ? { checkouts: m.pagosIniciados } : {}),
        ...(l ? { llamadas: { agendadas: l.agendadas, calificadas: l.calificadas, asistidas: l.asistidas, cerradas: l.cerradas } } : {}),
        ventas: v?.ventas ?? 0,
        ganancia_neta: r2(netoDia(c, v)),
        profit: r2(netoDia(c, v) - m.gasto),
      }
    })

  const datos = {
    fecha_de_hoy: d.hoy,
    campana: campanaJson(c),
    analisis: analisisJson(d.estado),
    totales_historicos: totalesJson(d.totales),
    [`ultimos_${DIAS_EN_PROMPT}_dias`]: diario,
    cambios_registrados: d.cambios.map(k => ({ fecha: k.fecha, tipo: k.tipo, detalle: k.detalle, presupuesto: k.presupuesto })),
    ...(d.ciclos && d.ciclos.length > 1 ? {
      resultado_por_ciclo: d.ciclos.map(k => ({
        ciclo: k.numero,
        desde: k.estado.ciclo.inicio ?? k.inicio,
        hasta: k.fin ? sumarDias(k.fin, -1) : 'en curso',
        dias: k.dias,
        inversion: r2(k.gasto),
        conversiones: k.conversiones,
        roas: k.roas == null ? null : r2(k.roas),
        profit: r2(k.profit),
        resultado: k.color == null ? 'sin datos' : { rojo: 'bajo el empate', amarillo: 'entre empate y piso', verde: 'sobre el piso' }[k.color],
      })),
    } : {}),
  }

  return `${ENCABEZADO}

## Qué necesito
Sobre la campaña "${c.nombre}", escribe **3 a 5 líneas**:
1. Qué está pasando (usando los números de "analisis", sin recalcularlos).
2. Qué hacer ahora, o explícitamente "no tocar nada" si está en chequeo o recolección.
3. Cuándo volver a revisar (usa las fechas de revisión del ciclo).
Si ves algo que la app pasa por alto en el día a día (por ejemplo, el embudo o un patrón de días), agrégalo en una línea al final.

## Datos
${bloqueJson(datos)}`
}

/** Prompt de todas las campañas: análisis calculado y totales de cada una. */
export function promptPortafolio(items: CampanaConEstado[], hoy: string): string {
  const datos = {
    fecha_de_hoy: hoy,
    campanas: items.map(({ campana: c, estado: e, totales: t }) => ({
      ...campanaJson(c),
      ultima_sincronizacion: c.ultimaSync,
      analisis: analisisJson(e),
      totales_historicos: totalesJson(t),
    })),
  }

  return `${ENCABEZADO}

## Qué necesito
Mira todas mis campañas juntas, sin recalcular nada:
1. **Resumen** en 2–3 líneas: ¿cómo va el conjunto?
2. **Prioridades**: ordena las campañas de la que más atención necesita a la que menos, una línea por campaña con qué hacer y cuándo revisar.
3. **Dónde pondría el próximo peso** de presupuesto, respetando el piso, la muestra chica y los ciclos.
No compares montos entre monedas distintas.

## Datos
${bloqueJson(datos)}`
}
