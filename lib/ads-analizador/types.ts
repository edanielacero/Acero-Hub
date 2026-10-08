/** El modelo de Ads Analizador. Ver supabase/migrations/20260928000000_ads_analizador_foundation.sql */

export const MONEDAS = ['USD', 'BOB'] as const
export type Moneda = (typeof MONEDAS)[number]

/**
 * compra_stripe: compras web (Low Ticket, las trae Meta). El nombre interno
 * quedó de cuando se leía Stripe.
 * venta_manual: WhatsApp (Low Ticket, ventas cargadas a mano).
 * llamadas: High Ticket, agendamiento de llamadas.
 */
export const TIPOS_CONVERSION = ['compra_stripe', 'venta_manual', 'llamadas'] as const
export type TipoConversion = (typeof TIPOS_CONVERSION)[number]

export const TIPOS_CAMBIO = ['presupuesto', 'creativo', 'audiencia', 'otro'] as const
export type TipoCambio = (typeof TIPOS_CAMBIO)[number]

export const MODOS_CORTE = ['conservador', 'estandar'] as const
export type ModoCorte = (typeof MODOS_CORTE)[number]

export interface Campana {
  id: string
  metaCampaignId: string
  metaAdAccountId: string
  nombre: string
  moneda: Moneda
  tipoConversion: TipoConversion
  precioVenta: number
  margenVenta: number
  /** Override manual del ROAS piso. `null` = automático (empate × 1.35). */
  roasObjetivo: number | null
  /** Costo esperado por conversión cargado a mano. `null` = lo resuelve la app. */
  cpaEsperado: number | null
  modoCorte: ModoCorte
  /** Llamadas: tasas estimadas de asistencia y cierre (0–1). */
  showEstimado: number | null
  closeEstimado: number | null
  /** WhatsApp: conversaciones por día que el usuario puede atender. */
  capacidadChatsDia: number | null
  /** Presupuesto diario que tiene la campaña en Meta (solo referencia; los cálculos usan el gasto real). */
  presupuestoMeta: number | null
  /** Cuándo se leyó de Meta (es el presupuesto de ese momento, no un historial). */
  presupuestoMetaEn: string | null
  activo: boolean
  ultimaSync: string | null
  createdAt: string
}

/** Una fila de ads_metricas_diarias, en camelCase. */
export interface MetricaDiaria {
  fecha: string
  gasto: number
  alcance: number | null
  impresiones: number | null
  frecuencia: number | null
  cpm: number | null
  clicsEnlace: number | null
  cpcEnlace: number | null
  ctrEnlace: number | null
  resultados: number
  costoPorResultado: number | null
  landingPageViews: number | null
  pagosIniciados: number | null
}

/**
 * Una fila de ads_ventas_manuales. En WhatsApp es la venta del día (`cantidad`
 * siempre presente). En compras es una corrección: `cantidad` pisa las compras
 * que reporta Meta y `neto` es lo que se recibió después de comisiones; cada
 * uno es opcional por separado.
 */
export interface VentaManual {
  fecha: string
  cantidad: number | null
  neto: number | null
  nota: string | null
}

export interface Cambio {
  id: string
  fecha: string
  tipo: TipoCambio
  detalle: string | null
  /** Presupuesto diario después del cambio, si se cargó. */
  presupuesto: number | null
}

/** Llamadas de un día (High Ticket), por fecha de la llamada. */
export interface LlamadaDia {
  fecha: string
  agendadas: number
  calificadas: number | null
  asistidas: number
  cerradas: number
  nota: string | null
}

// ── Motor de reglas ─────────────────────────────────────────────────────────
// Spec: documentos/ads_analizador/sprint_5_reglas_v2.md

/**
 * Un día, con las dos señales de conversión separadas: lo que Meta cuenta como
 * resultado (compra, conversación, lead) y la conversión que manda la decisión
 * (venta, o llamada agendada en High Ticket).
 */
export interface FilaDiaria {
  /** YYYY-MM-DD */
  fecha: string
  gasto: number
  /** Evento optimizado de Meta: compra, conversación iniciada o lead. */
  resultadosMeta: number
  /** La conversión que se evalúa: venta (Low Ticket) o llamada agendada (High Ticket). */
  conversionesReales: number
  frecuencia: number | null
  landingPageViews?: number | null
  /** El día tiene conversión cargada pero Meta todavía no lo trajo. */
  soloVenta?: boolean
}

export interface EntradaCalculo {
  tipoConversion: TipoConversion
  precioVenta: number
  margenVenta: number
  roasObjetivoManual: number | null
  cpaEsperadoManual: number | null
  /** Costo por conversión de una campaña comparable con ≥ 5 ventas, si hay. */
  cpaReferencia: number | null
  modoCorte: ModoCorte
  /** Días COMPLETOS (antes de hoy), todo el historial, en cualquier orden. */
  metricas: FilaDiaria[]
  /** El cambio más reciente: fecha YYYY-MM-DD (Bolivia) y presupuesto, si se cargó. */
  ultimoCambio: { fecha: string; presupuesto: number | null } | null
  /** YYYY-MM-DD de referencia. Nunca se calcula adentro: el servidor corre en UTC. */
  hoy: string
  /** Solo llamadas: totales históricos y tasas estimadas. */
  llamadas?: { agendadas: number; asistidas: number; cerradas: number; showEstimado: number | null; closeEstimado: number | null }
  /** Solo WhatsApp. */
  capacidadChatsDia?: number | null
  /**
   * Debajo de este presupuesto diario el paso de escalado puede ser 30–50 % en
   * vez de 20–30 % (§4.5: "< ~$25/día"). En la moneda de la campaña.
   */
  umbralPresupuestoChico?: number
  /** Duración fija del ciclo (guardada al terminar su día 3). Sin ella, max(7, día de corte) estimado. */
  diasCiclo?: number | null
  /** Presupuesto diario en Meta: solo de respaldo si todavía no hay ningún día con gasto. */
  presupuestoMeta?: number | null
}

export type Bandera =
  | { tipo: 'ritmo'; estado: Color; pBaja: number }
  | { tipo: 'muestra_chica'; conversiones: number }
  | { tipo: 'fatiga_audiencia'; frecuencia: number }
  | { tipo: 'calidad_mensajes' }
  | { tipo: 'capacidad'; esperadas: number; capacidad: number }
  | { tipo: 'presupuesto_bajo'; relativo: number; diasCorte: number }

export type Color = 'verde' | 'amarillo' | 'rojo'

/** Qué conviene hacer, en una palabra. La UI lo traduce a texto. */
export type Accion =
  | 'sin_datos'
  | 'chequeo'            // día 1: solo chequeo técnico
  | 'muy_pronto'         // todavía no se invirtió lo necesario para evaluar el corte
  | 'esperar'            // mantener sin tocar
  | 'decidir'            // corte con ventas bajo el empate: seguir al día 7 o pausar
  | 'frenar'             // corte sin ventas o ROAS bajo el empate al día 7
  | 'escalar_horizontal' // sobre el piso, pero a menos de 10 % de él
  | 'escalar_vertical'   // sobre el piso con margen: subir presupuesto

export type Fase = 'sin_datos' | 'chequeo' | 'recoleccion' | 'corte' | 'decision'

export interface EstadoCampana {
  color: Color
  accion: Accion
  mensaje: string
  banderas: Bandera[]
  /** P / M: ROAS donde la venta paga justo su costo. */
  roasEquilibrio: number
  /** ROAS piso: empate × 1,35 (o el manual). Decide si se escala. */
  roasObjetivo: number
  /** ROAS acumulado del ciclo (desde el inicio o el último cambio). */
  roasActual: number | null
  /** roasActual / roasEquilibrio − 1. */
  colchon: number | null
  ciclo: {
    inicio: string | null
    dias: number
    gasto: number
    conversiones: number
    fase: Fase
    modo: ModoCorte
    diasCorte: number
    gastoCorte: number
    /** Último día de la ventana de corte (día N del ciclo); se evalúa al terminar. */
    fechaCorte: string | null
    /** Día de la decisión (7, o el del corte si cae después); se toma al terminar ese día. */
    fechaDecision: string | null
    /** Número de día de la decisión: max(7, día de corte). */
    diasDecision: number
    /** Ya se invirtió lo necesario para evaluar el corte (y van ≥ 3 días). */
    corteListo: boolean
    /** La duración ya quedó fija (día 3 cumplido); si no, es un estimado. */
    duracionFija: boolean
    /** Primer día completo del ciclo con alguna conversión: con ventas, el corte ya no aplica. */
    primeraConversion: string | null
  }
  cpa: {
    esperado: number
    fuente: 'real' | 'usuario' | 'referencia' | 'margen' | 'llamada'
    /** Costo por conversión que deja el ROAS justo en el empate. */
    empate: number
    /** Costo por conversión máximo para cumplir el ROAS piso. */
    maxPiso: number
    /** Costo real del ciclo; null sin conversiones. */
    real: number | null
  }
  necesarias: {
    /** Con lo invertido hasta hoy en el ciclo. */
    empate: number
    piso: number
    /** Meta del ciclo: el piso al cierre del día de decisión, con la inversión que se espera hasta ahí. */
    gastoAlCierre: number
    empateAlCierre: number
    pisoAlCierre: number
  }
  riesgo: {
    gastoDia: number
    lambdaDia: number
    pCeroHoy: number
    racha: number
    pRacha: number | null
    /** % de días con gasto y cero conversiones (con ≥ 7 días), para comparar con el modelo. */
    pctDiasCeroObservado: number | null
    pCeroVentana: { d3: number; d5: number; d7: number }
    reservaCorte: number
    reservaDecision: number
  }
  ritmo: { lambdaTotal: number; pBaja: number; estado: Color } | null
  escalado: {
    tipo: 'vertical' | 'horizontal'
    presupuestoActual: number
    presupuestoSugerido: number
    pasoMin: number
    pasoMax: number
    /** Si el costo por conversión supera esto con el presupuesto nuevo, subir no conviene. */
    cpaMaxParaConvenir: number | null
    maxConjuntos: number
    perdidaMaximaSiDuplica: number
  } | null
  bajarCosto: { objetivo: number; gastoFuturo: number; nuevasNecesarias: number; probabilidad: number } | null
  chequeo: { texto: string; ok: boolean }[] | null
  mensajes: {
    conversaciones: number
    costoConversacion: number | null
    conversion: number | null
    conversacionesEsperadasDia: number | null
  } | null
  llamadas: {
    show: number
    close: number
    fuenteTasas: 'reales' | 'estimadas' | 'mixtas'
    valorPorLlamada: number
    presupuestoSugeridoMin: number
    presupuestoSugeridoMax: number
  } | null
}

/** Campaña + todo lo que la tarjeta y el dashboard necesitan, ya calculado. */
/** En qué modo está el panel: midiendo un cambio, con un cierre por revisar o sin ciclo abierto. */
export type ModoPanel = 'ciclo' | 'cierre' | 'en_curso'

export interface CampanaConEstado {
  campana: Campana
  estado: EstadoCampana
  totales: Totales
  modo: ModoPanel
  /** Toda la campaña como un solo tramo (lo que muestra la tarjeta del inicio). Solo en la lista. */
  estadoTotal?: EstadoCampana
}

export interface Totales {
  gasto: number
  ingreso: number
  /** Lo que queda después de comisiones: neto cargado a mano, o estimado. */
  neto: number
  /** Días del rango con el neto cargado a mano (el resto es estimado). */
  diasConNetoManual: number
  /** neto − gasto. */
  profit: number
  conversiones: number
  resultadosMeta: number
  alcance: number
  impresiones: number
  clics: number
  landingPageViews: number
  pagosIniciados: number
  /** Gasto / conversión real. null sin conversiones. */
  costoPorConversion: number | null
  dias: number
  /** De dónde salen las ventas: cargadas a mano (WhatsApp y llamadas) o las compras de Meta. */
  fuenteVentas: 'manual' | 'meta'
  /** Solo llamadas. */
  llamadas: { agendadas: number; calificadas: number; asistidas: number; cerradas: number } | null
}

// ── Ciclos guardados (cierre de ciclo) ──────────────────────────────────────

export type EstadoCicloGuardado = 'abierto' | 'cerrado' | 'cortado' | 'interrumpido'
export type Veredicto = 'escalar' | 'mantener' | 'cambiar' | 'pausar' | 'cortado'
export type EstadoEtapa = 'hecha' | 'actual' | 'pendiente' | 'apagada'

export interface EtapaCiclo {
  clave: 'chequeo' | 'juntar' | 'corte' | 'decision'
  titulo: string
  /** Días del ciclo que cubre (1 = día del inicio). 0 si no aplica. */
  desde: number
  hasta: number
  estado: EstadoEtapa
  /** La fecha es un estimado (corte que todavía no se alcanzó). */
  est?: boolean
}

/** Lo que dibuja el panel del ciclo: sirve igual en vivo y congelado. */
export interface VistaCiclo {
  inicio: string
  diasCiclo: number
  diasTranscurridos: number
  etapas: EtapaCiclo[]
  primeraConversion: string | null
  ventas: number
  /** Ventas para empate y piso con lo invertido hasta ese momento. */
  empate: number
  piso: number
  /** Final de la barra: el piso al cierre del ciclo. */
  meta: number
  /** Marca "para hoy" en vivo; null en un ciclo cerrado. */
  paraHoy: number | null
  /** Lo que predice el modelo: inversión / costo esperado. */
  ventasEsperadas: number
  roas: number | null
  /** La duración todavía es un estimado (se fija al cerrar el día 3). */
  duracionEstimada?: boolean
}

/** Foto de un ciclo al cerrarse: valores ya calculados, no se recalculan al mostrarlos. */
export interface SnapshotCiclo extends VistaCiclo {
  version: 1
  fin: string
  gasto: number
  costoPorVenta: number | null
  profit: number
  veredicto: Veredicto
  nota: string | null
  semaforo: Color
  corteListo: boolean
  gastoCorte: number
}

/** Con qué se fijó la duración del ciclo. Null = una regla anterior. */
export type BaseDuracion = 'presupuesto_meta' | 'gasto_real'

export interface CicloGuardado {
  id: string
  inicio: string
  fin: string | null
  diasCiclo: number | null
  duracionBase: BaseDuracion | null
  estado: EstadoCicloGuardado
  snapshot: SnapshotCiclo | null
  cerradoEn: string | null
  revisadoEn: string | null
}

