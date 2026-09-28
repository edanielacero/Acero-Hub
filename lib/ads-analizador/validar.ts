/**
 * Validación de lo que entra por la API. Pura: se prueba en la suite `unit`.
 *
 * Devuelve el objeto listo para la base (snake_case) o un mensaje de error en
 * español para mostrar tal cual.
 */
import { MONEDAS, TIPOS_CAMBIO, TIPOS_CONVERSION } from './types'

type Ok<T> = { ok: true; valor: T }
type Err = { ok: false; error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */

const positivo = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Los IDs de campaña de Meta son solo dígitos. */
export function normalizarCampaignId(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return /^\d{6,25}$/.test(s) ? s : null
}

/** Acepta `act_123` o `123` (lo que muestra Ads Manager) y devuelve `act_123`. */
export function normalizarAdAccount(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/^act_/i, '')
  return /^\d{5,25}$/.test(s) ? `act_${s}` : null
}

export interface CampanaInsert {
  meta_campaign_id: string
  meta_ad_account_id: string
  nombre: string
  moneda: string
  tipo_conversion: string
  precio_venta: number
  margen_venta: number
}

export function validarAlta(body: any): Ok<CampanaInsert> | Err {
  const meta_campaign_id = normalizarCampaignId(body?.metaCampaignId)
  if (!meta_campaign_id) return { ok: false, error: 'El ID de campaña de Meta tiene que ser solo números.' }

  const meta_ad_account_id = normalizarAdAccount(body?.metaAdAccountId)
  if (!meta_ad_account_id) return { ok: false, error: 'La cuenta publicitaria tiene que ser act_ seguido de números.' }

  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) return { ok: false, error: 'La campaña necesita un nombre.' }
  if (nombre.length > 120) return { ok: false, error: 'El nombre es demasiado largo.' }

  if (!MONEDAS.includes(body?.moneda)) return { ok: false, error: 'La moneda tiene que ser USD o BOB.' }
  if (!TIPOS_CONVERSION.includes(body?.tipoConversion)) {
    return { ok: false, error: 'Elige cómo se cierra la venta: Stripe o WhatsApp.' }
  }

  const precio_venta = positivo(body?.precioVenta)
  if (precio_venta == null) return { ok: false, error: 'El precio de venta tiene que ser mayor a cero.' }
  const margen_venta = positivo(body?.margenVenta)
  if (margen_venta == null) return { ok: false, error: 'El margen tiene que ser mayor a cero.' }
  if (margen_venta > precio_venta) return { ok: false, error: 'El margen no puede ser mayor que el precio.' }

  return {
    ok: true,
    valor: {
      meta_campaign_id, meta_ad_account_id, nombre,
      moneda: body.moneda, tipo_conversion: body.tipoConversion,
      precio_venta, margen_venta,
    },
  }
}

export interface CampanaUpdate {
  nombre?: string
  precio_venta?: number
  margen_venta?: number
  roas_objetivo?: number | null
  activo?: boolean
}

/**
 * Solo pisa lo que venga. `roasObjetivo: null` vuelve al automático.
 * El chequeo margen ≤ precio necesita los valores actuales, por eso los recibe.
 */
export function validarEdicion(body: any, actual: { precioVenta: number; margenVenta: number }): Ok<CampanaUpdate> | Err {
  const cambios: CampanaUpdate = {}

  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre).trim()
    if (!nombre) return { ok: false, error: 'La campaña necesita un nombre.' }
    cambios.nombre = nombre
  }
  if (body?.precioVenta !== undefined) {
    const v = positivo(body.precioVenta)
    if (v == null) return { ok: false, error: 'El precio de venta tiene que ser mayor a cero.' }
    cambios.precio_venta = v
  }
  if (body?.margenVenta !== undefined) {
    const v = positivo(body.margenVenta)
    if (v == null) return { ok: false, error: 'El margen tiene que ser mayor a cero.' }
    cambios.margen_venta = v
  }
  if (body?.roasObjetivo !== undefined) {
    if (body.roasObjetivo === null || body.roasObjetivo === '') {
      cambios.roas_objetivo = null
    } else {
      const v = positivo(body.roasObjetivo)
      if (v == null || v >= 1000) return { ok: false, error: 'El ROAS objetivo tiene que ser un número mayor a cero.' }
      cambios.roas_objetivo = v
    }
  }
  if (body?.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return { ok: false, error: 'Valor de "activo" inválido.' }
    cambios.activo = body.activo
  }

  const precio = cambios.precio_venta ?? actual.precioVenta
  const margen = cambios.margen_venta ?? actual.margenVenta
  if (margen > precio) return { ok: false, error: 'El margen no puede ser mayor que el precio.' }

  if (Object.keys(cambios).length === 0) return { ok: false, error: 'Nada que actualizar.' }
  return { ok: true, valor: cambios }
}

/** YYYY-MM-DD válido y no en el futuro respecto de `hoy`. */
export function validarFecha(raw: unknown, hoy: string): string | null {
  const s = String(raw ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null
  return s <= hoy ? s : null
}

export function validarVenta(body: any, hoy: string): Ok<{ fecha: string; cantidad: number; nota: string | null }> | Err {
  const fecha = validarFecha(body?.fecha, hoy)
  if (!fecha) return { ok: false, error: 'Fecha inválida (no puede ser futura).' }
  const cantidad = Number(body?.cantidad)
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 100000) {
    return { ok: false, error: 'La cantidad tiene que ser un número entero, cero o más.' }
  }
  const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null
  return { ok: true, valor: { fecha, cantidad, nota } }
}

/**
 * `fecha` opcional (YYYY-MM-DD, no futura): el cambio se registra desde la fila
 * de ese día en la tabla. Sin fecha, o con la de hoy, es "ahora".
 */
export function validarCambio(body: any, hoy: string): Ok<{ tipo: string; detalle: string | null; fecha: string | null }> | Err {
  if (!TIPOS_CAMBIO.includes(body?.tipo)) return { ok: false, error: 'Elige qué tipo de cambio hiciste.' }
  const detalle = typeof body?.detalle === 'string' && body.detalle.trim() ? body.detalle.trim().slice(0, 500) : null
  let fecha: string | null = null
  if (body?.fecha != null && body.fecha !== '') {
    fecha = validarFecha(body.fecha, hoy)
    if (!fecha) return { ok: false, error: 'La fecha del cambio no es válida (no puede ser futura).' }
  }
  return { ok: true, valor: { tipo: body.tipo, detalle, fecha } }
}
