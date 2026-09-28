/**
 * El prompt para pegar en la app de Claude: reglas de negocio + el veredicto de
 * la app + los datos en JSON.
 *
 * Puro y sin red: se arma en el cliente, en el mismo click que lo copia (en
 * Safari de iPhone el portapapeles solo se puede escribir dentro del gesto, y
 * un fetch en el medio lo rompería).
 *
 * Las reglas salen de las constantes de calc.ts y no de un texto aparte: si
 * cambia un umbral, el prompt cambia con él.
 */
import {
  CONVERSIONES_MINIMAS_MUESTRA, DIAS_REAJUSTE_TECNICO, DIAS_SIN_VENTA_FOCO_ROJO, DIAS_VENTANA_APRENDIZAJE,
  DIAS_VENTANA_DECISION, FRECUENCIA_FATIGA, MULTIPLICADOR_FOCO_ROJO_GASTO, MULTIPLICADOR_ROAS_OBJETIVO,
  RESULTADOS_MINIMOS_APRENDIZAJE, sumarDias,
} from './calc'
import { netoDia, ventasPorDia } from './load'
import type { Campana, CampanaConEstado, Cambio, EstadoCampana, MetricaDiaria, PagoStripeDia, Totales, VentaManual } from './types'

/** Días de historial diario que viajan en el prompt de una campaña. */
export const DIAS_EN_PROMPT = 30

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100)
const r4 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000)

function reglas(): string {
  return [
    `1. Fase de aprendizaje: con menos de ${RESULTADOS_MINIMOS_APRENDIZAJE} resultados del evento optimizado en ${DIAS_VENTANA_APRENDIZAJE} días, Meta todavía no estabilizó la entrega. No leer tendencias de costo como definitivas.`,
    `2. ROAS de equilibrio = precio de venta / margen por venta (sale de cada campaña, nunca un número fijo).`,
    `3. Colchón: se escala subiendo presupuesto solo por encima del ROAS objetivo (equilibrio × ${MULTIPLICADOR_ROAS_OBJETIVO} por defecto, o el que fijó el usuario). Entre equilibrio y objetivo, la sugerencia es probar un anuncio o audiencia nueva (escalar horizontal), no subir presupuesto.`,
    `4. Focos rojos que no esperan: gasto acumulado ≥ ${MULTIPLICADOR_FOCO_ROJO_GASTO}× el margen de una venta sin ninguna venta, o ${DIAS_SIN_VENTA_FOCO_ROJO} días seguidos con gasto y cero ventas reales.`,
    `5. Muestra chica: con menos de ${CONVERSIONES_MINIMAS_MUESTRA} ventas confirmadas, ningún ROAS alcanza para decisiones grandes.`,
    `6. Cooldown: después de un cambio (presupuesto, creativo, audiencia) hay ${DIAS_REAJUSTE_TECNICO} días de reajuste técnico y no se recomienda otro cambio grande antes de ${DIAS_VENTANA_DECISION} días, salvo un foco rojo.`,
    `7. Fatiga: frecuencia ≥ ${FRECUENCIA_FATIGA} indica que la misma gente ve el anuncio demasiado; refrescar creativo o ampliar audiencia antes de subir presupuesto.`,
  ].join('\n')
}

const ENCABEZADO = `Eres un analista de Meta Ads con criterio de negocio. Responde en español, tuteando, directo y sin relleno.

Te paso datos exportados de mi herramienta "Ads Analizador". Solo lee Meta y Stripe; yo hago los cambios a mano en Ads Manager.

## Reglas con las que trabajo
${reglas()}

## Cómo leer los datos
- "resultados_meta" es el evento que optimiza Meta (compra, o conversación iniciada en campañas de WhatsApp). "ventas_reales" es la venta confirmada (Stripe o cargada a mano). No son lo mismo: en WhatsApp puede haber muchas conversaciones y pocas ventas.
- "fuente_ventas" dice de dónde salen las ventas: "stripe" (cobros reales), "manual" (cargadas a mano, ingreso = ventas × precio) o "meta" (campaña de Stripe todavía sin datos de Stripe: se usan las compras que atribuye Meta, provisorio y menos confiable).
- "neto" es lo que queda después de comisiones: el que depositó Stripe si lo cargué a mano ("neto_cargado_a_mano"), o facturación × (margen / precio) estimado. "profit" = neto − gasto (productos digitales, sin otro costo por venta).
- Los montos están en la moneda de cada campaña. No sumes USD con BOB.
- El sync trae hasta ayer; el día de hoy puede faltar.
- "estado_app" es el veredicto que calculó mi herramienta con las reglas de arriba.`

function campanaJson(c: Campana, e: EstadoCampana) {
  return {
    nombre: c.nombre,
    tipo: c.tipoConversion === 'venta_manual' ? 'venta por WhatsApp (carga manual)' : 'compra por Stripe',
    moneda: c.moneda,
    activa: c.activo,
    precio_venta: c.precioVenta,
    margen_por_venta: c.margenVenta,
    roas_equilibrio: r2(e.roasEquilibrio),
    roas_objetivo: r2(e.roasObjetivo),
    roas_objetivo_es_manual: c.roasObjetivo != null,
  }
}

function estadoJson(e: EstadoCampana) {
  return {
    color: e.color,
    accion_sugerida: e.accion,
    mensaje: e.mensaje,
    roas_actual: r2(e.roasActual),
    colchon_vs_equilibrio: r4(e.colchon),
    banderas: e.banderas,
  }
}

function totalesJson(t: Totales) {
  return {
    dias_con_datos: t.dias,
    gasto: r2(t.gasto),
    facturacion: r2(t.ingreso),
    neto: r2(t.neto),
    dias_con_neto_cargado_a_mano: t.diasConNetoManual,
    profit: r2(t.profit),
    ventas_reales: t.conversiones,
    resultados_meta: t.resultadosMeta,
    impresiones: t.impresiones,
    clics_enlace: t.clics,
    landing_page_views: t.landingPageViews,
    pagos_iniciados: t.pagosIniciados,
    fuente_ventas: t.fuenteVentas,
    costo_por_venta: r2(t.costoPorConversion),
    ctr_enlace: t.impresiones > 0 ? r4(t.clics / t.impresiones) : null,
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
  pagos: PagoStripeDia[]
  cambios: Cambio[]
  hoy: string
}

/** Prompt de una campaña: config, veredicto, totales y los últimos 30 días. */
export function promptCampana(d: DatosCampanaPrompt): string {
  const { campana: c } = d
  const desde = sumarDias(d.hoy, -DIAS_EN_PROMPT)
  const manual = c.tipoConversion === 'venta_manual'
  const fuente = d.totales.fuenteVentas
  // Las mismas ventas por día que ve el dashboard, con las correcciones a mano.
  const ventasDia = ventasPorDia(c, d.metricas, d.ventas, d.pagos, fuente)

  const diario = d.metricas
    .filter(m => m.fecha >= desde)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(m => {
      const v = ventasDia.get(m.fecha)
      const ingreso = v?.ingreso ?? 0
      return {
        fecha: m.fecha,
        gasto: r2(m.gasto),
        impresiones: m.impresiones,
        frecuencia: r2(m.frecuencia),
        clics_enlace: m.clicsEnlace,
        ctr_enlace_pct: r2(m.ctrEnlace),
        resultados_meta: m.resultados,
        ...(manual ? {} : { landing_page_views: m.landingPageViews, pagos_iniciados: m.pagosIniciados }),
        ventas_reales: v?.ventas ?? 0,
        ...(v?.origen === 'editada' ? { ventas_corregidas_a_mano: true } : {}),
        facturacion: r2(ingreso),
        neto: r2(netoDia(c, v)),
        ...(v?.neto != null ? { neto_cargado_a_mano: true } : {}),
        profit: r2(netoDia(c, v) - m.gasto),
      }
    })

  const stripe = fuente !== 'stripe' ? undefined : (() => {
    const enRango = d.pagos.filter(p => p.fecha >= desde)
    const motivos: Record<string, number> = {}
    for (const p of enRango) for (const [k, v] of Object.entries(p.declineReasons ?? {})) motivos[k] = (motivos[k] ?? 0) + v
    const suma = (f: (p: PagoStripeDia) => number) => enRango.reduce((s, p) => s + f(p), 0)
    return {
      compras_exitosas: suma(p => p.comprasExitosas),
      pagos_rechazados: suma(p => p.pagosFallidos),
      pagos_abandonados: suma(p => p.pagosIncompletos),
      tres_ds_pedidos: suma(p => p.tresDsSolicitados),
      tres_ds_aprobados: suma(p => p.tresDsExitosos),
      motivos_de_rechazo: motivos,
    }
  })()

  const datos = {
    fecha_de_hoy: d.hoy,
    campana: campanaJson(c, d.estado),
    estado_app: estadoJson(d.estado),
    totales_historicos: totalesJson(d.totales),
    [`ultimos_${DIAS_EN_PROMPT}_dias`]: diario,
    ...(stripe ? { [`stripe_ultimos_${DIAS_EN_PROMPT}_dias`]: stripe } : {}),
    cambios_registrados: d.cambios.map(k => ({ fecha: k.fecha, tipo: k.tipo, detalle: k.detalle })),
  }

  return `${ENCABEZADO}

## Qué necesito
Analiza la campaña "${c.nombre}":
1. **Diagnóstico** en 2-3 frases: ¿cómo está de verdad? ¿Coincides con el veredicto de la app ("estado_app")? Si no, explica por qué.
2. **Dónde se pierde la plata o la gente**: el paso del embudo o el patrón diario que más pesa${manual ? ' (ojo con la diferencia entre conversaciones y ventas)' : ' (incluye los rechazos de Stripe si son relevantes)'}.
3. **Qué haría esta semana**: 1 a 3 acciones concretas en Ads Manager, respetando el cooldown y la muestra chica.
4. **Qué NO haría** todavía, y por qué.
5. **Qué dato me falta** para decidir mejor, si falta alguno.

## Datos
${bloqueJson(datos)}`
}

/** Prompt de todas las campañas: config, veredicto y totales de cada una. */
export function promptPortafolio(items: CampanaConEstado[], hoy: string): string {
  const datos = {
    fecha_de_hoy: hoy,
    campanas: items.map(({ campana: c, estado: e, totales: t }) => ({
      ...campanaJson(c, e),
      ultima_sincronizacion: c.ultimaSync,
      estado_app: estadoJson(e),
      totales_historicos: totalesJson(t),
    })),
  }

  return `${ENCABEZADO}

## Qué necesito
Mira todas mis campañas juntas:
1. **Resumen** de 2-3 frases: ¿cómo va el conjunto?
2. **Prioridades**: ordena las campañas de la que más atención necesita a la que menos, con una línea de por qué.
3. **Dónde pondría el próximo peso**: si tuviera presupuesto extra, ¿a cuál iría y cuánto subirías? ¿De cuál lo sacarías? Respeta las reglas de colchón, aprendizaje y cooldown.
4. **Alertas** que la app pueda estar pasando por alto.
No compares montos entre monedas distintas; compara ROAS, costo por venta relativo al margen y tendencias.

## Datos
${bloqueJson(datos)}`
}
