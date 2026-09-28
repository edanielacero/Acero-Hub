/** El modelo de Ads Analizador. Ver supabase/migrations/20260928000000_ads_analizador_foundation.sql */

export const MONEDAS = ['USD', 'BOB'] as const
export type Moneda = (typeof MONEDAS)[number]

export const TIPOS_CONVERSION = ['compra_stripe', 'venta_manual'] as const
export type TipoConversion = (typeof TIPOS_CONVERSION)[number]

export const TIPOS_CAMBIO = ['presupuesto', 'creativo', 'audiencia', 'otro'] as const
export type TipoCambio = (typeof TIPOS_CAMBIO)[number]

export interface Campana {
  id: string
  metaCampaignId: string
  metaAdAccountId: string
  nombre: string
  moneda: Moneda
  tipoConversion: TipoConversion
  precioVenta: number
  margenVenta: number
  /** Override manual. `null` = automático (equilibrio × 1.35). */
  roasObjetivo: number | null
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

export interface VentaManual {
  fecha: string
  cantidad: number
  nota: string | null
}

export interface PagoStripeDia {
  fecha: string
  comprasExitosas: number
  montoTotal: number
  pagosFallidos: number
  pagosIncompletos: number
  tresDsSolicitados: number
  tresDsExitosos: number
  declineReasons: Record<string, number> | null
}

export interface Cambio {
  id: string
  fecha: string
  tipo: TipoCambio
  detalle: string | null
}

// ── Motor de reglas ─────────────────────────────────────────────────────────

/**
 * Un día, con las DOS señales de conversión separadas (Sprint 1 §4.1):
 * lo que Meta cuenta como resultado y la venta que de verdad se cerró.
 */
export interface FilaDiaria {
  /** YYYY-MM-DD */
  fecha: string
  gasto: number
  /** Evento optimizado de Meta — solo para la fase de aprendizaje. */
  resultadosMeta: number
  /** Venta/compra confirmada ese día: Stripe o carga manual. */
  conversionesReales: number
  frecuencia: number | null
  /**
   * El día tiene venta cargada pero Meta todavía no lo trajo (típicamente hoy).
   * Cuenta sus conversiones, pero no mueve el ancla de las ventanas.
   */
  soloVenta?: boolean
}

export interface EntradaCalculo {
  tipoConversion: TipoConversion
  precioVenta: number
  margenVenta: number
  roasObjetivoManual: number | null
  /** Historial completo, en cualquier orden. */
  metricas: FilaDiaria[]
  conversionesConfirmadas: number
  ingresoTotal: number
  gastoTotal: number
  /** YYYY-MM-DD (hora de Bolivia) del cambio más reciente, si hay. */
  ultimoCambioFecha: string | null
  /** YYYY-MM-DD de referencia. Nunca se calcula adentro: el servidor corre en UTC. */
  hoy: string
}

export type Bandera =
  | { tipo: 'foco_rojo'; motivo: 'gasto_sin_resultados' | 'sin_ventas_dias' }
  | { tipo: 'en_aprendizaje'; resultados7d: number }
  | { tipo: 'muestra_chica'; conversiones: number }
  | { tipo: 'reajuste_tecnico'; hasta: string }
  | { tipo: 'ventana_decision'; hasta: string }
  | { tipo: 'fatiga_audiencia'; frecuencia: number }

export type Color = 'verde' | 'amarillo' | 'rojo'

/** Qué conviene hacer, en una palabra. La UI lo traduce a texto. */
export type Accion =
  | 'sin_datos'
  | 'frenar'             // foco rojo o ROAS bajo el equilibrio
  | 'esperar'            // aprendizaje, muestra chica, cooldown
  | 'escalar_horizontal' // colchón bajo el objetivo: probar anuncio/audiencia nueva
  | 'escalar_vertical'   // sano: subir presupuesto

export interface EstadoCampana {
  color: Color
  accion: Accion
  mensaje: string
  banderas: Bandera[]
  roasEquilibrio: number
  roasObjetivo: number
  /** null si todavía no hay gasto que dividir. */
  roasActual: number | null
  /** roasActual / roasEquilibrio − 1. 0.33 = 33% por encima del equilibrio. */
  colchon: number | null
}

/** Campaña + todo lo que la tarjeta y el dashboard necesitan, ya calculado. */
export interface CampanaConEstado {
  campana: Campana
  estado: EstadoCampana
  totales: Totales
}

export interface Totales {
  gasto: number
  ingreso: number
  /** ingreso × (margen / precio) − gasto. */
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
  /**
   * De dónde salen las ventas. `meta` = campaña de Stripe que todavía no tiene
   * ningún dato de Stripe: se usan las compras que reporta Meta, provisorio.
   */
  fuenteVentas: 'stripe' | 'manual' | 'meta'
}
