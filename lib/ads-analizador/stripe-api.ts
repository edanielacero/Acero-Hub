/**
 * Cliente delgado sobre Stripe. Solo lectura: la clave es restringida y la app
 * nunca crea ni modifica cobros.
 *
 * Spec: documentos/ads_analizador/sprint_3_integraciones_meta_stripe.md §4.2
 *
 * `agregarPorDia` es pura y se prueba con Payment Intents de ejemplo.
 */
import type { Moneda } from './types'

export class StripeError extends Error {}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DiaStripe {
  fecha: string
  compras_exitosas: number
  monto_total: number
  pagos_fallidos: number
  pagos_incompletos: number
  tres_ds_solicitados: number
  tres_ds_exitosos: number
  decline_reasons: Record<string, number> | null
}

/** Bolivia no tiene horario de verano: siempre UTC−4. */
const OFFSET_BOLIVIA = '-04:00'

export function diaBoliviaDeUnix(segundos: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date(segundos * 1000))
}

/** [desde 00:00, hasta 23:59:59] en Bolivia, como segundos Unix. */
export function rangoUnix(desde: string, hasta: string): { gte: number; lte: number } {
  return {
    gte: Math.floor(Date.parse(`${desde}T00:00:00${OFFSET_BOLIVIA}`) / 1000),
    lte: Math.floor(Date.parse(`${hasta}T23:59:59${OFFSET_BOLIVIA}`) / 1000),
  }
}

function vacio(fecha: string): DiaStripe {
  return {
    fecha, compras_exitosas: 0, monto_total: 0, pagos_fallidos: 0, pagos_incompletos: 0,
    tres_ds_solicitados: 0, tres_ds_exitosos: 0, decline_reasons: null,
  }
}

const TRES_DS_OK = new Set(['authenticated', 'attempt_acknowledged', 'exempted'])

/**
 * Payment Intents → una fila por día (en Bolivia) para cada día del rango,
 * incluidos los días sin ningún pago: escribir ceros es lo que corrige un día
 * que antes se había contado mal.
 *
 * - exitosa: `status === 'succeeded'`, suma `amount_received`.
 * - fallida: tiene `last_payment_error` (tarjeta rechazada, 3DS fallido…).
 * - incompleta: cualquier otro estado sin error — se abandonó el checkout.
 * Solo cuenta intents en la moneda de la campaña.
 */
export function agregarPorDia(intents: any[], dias: string[], moneda: Moneda): DiaStripe[] {
  const porDia = new Map(dias.map(d => [d, vacio(d)]))
  const cur = moneda.toLowerCase()

  for (const pi of intents) {
    if (String(pi.currency).toLowerCase() !== cur) continue
    const dia = porDia.get(diaBoliviaDeUnix(Number(pi.created)))
    if (!dia) continue

    if (pi.status === 'succeeded') {
      dia.compras_exitosas++
      dia.monto_total = Math.round((dia.monto_total + Number(pi.amount_received ?? pi.amount) / 100) * 100) / 100
    } else if (pi.last_payment_error) {
      dia.pagos_fallidos++
      const motivo = pi.last_payment_error.decline_code ?? pi.last_payment_error.code ?? 'desconocido'
      dia.decline_reasons = { ...(dia.decline_reasons ?? {}) }
      dia.decline_reasons[motivo] = (dia.decline_reasons[motivo] ?? 0) + 1
    } else if (pi.status !== 'canceled' || pi.cancellation_reason !== 'duplicate') {
      dia.pagos_incompletos++
    }

    const tresDs = pi.latest_charge?.payment_method_details?.card?.three_d_secure
    const pidio3ds = !!tresDs || pi.next_action?.type === 'use_stripe_sdk' || pi.next_action?.type === 'redirect_to_url'
    if (pidio3ds) {
      dia.tres_ds_solicitados++
      if (tresDs && TRES_DS_OK.has(tresDs.result)) dia.tres_ds_exitosos++
    }
  }
  return [...porDia.values()]
}

export function claveStripe(): string {
  const k = process.env.STRIPE_SECRET_KEY_ADS
  if (!k) throw new StripeError('Falta configurar STRIPE_SECRET_KEY_ADS.')
  return k
}

/** Todos los Payment Intents creados en el rango, paginando de a 100. */
export async function listarPaymentIntents(desde: string, hasta: string, clave = claveStripe()): Promise<any[]> {
  const { gte, lte } = rangoUnix(desde, hasta)
  const out: any[] = []
  let despues: string | null = null

  for (let i = 0; i < 50; i++) {
    const qs = new URLSearchParams({
      'created[gte]': String(gte),
      'created[lte]': String(lte),
      limit: '100',
      'expand[]': 'data.latest_charge',
    })
    if (despues) qs.set('starting_after', despues)

    let res: Response
    try {
      res = await fetch(`https://api.stripe.com/v1/payment_intents?${qs}`, {
        headers: { Authorization: `Bearer ${clave}` },
        cache: 'no-store',
      })
    } catch {
      throw new StripeError('No se pudo conectar con Stripe.')
    }
    const json: any = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 401) throw new StripeError('La clave de Stripe no es válida.')
      if (res.status === 403) throw new StripeError('La clave de Stripe no tiene permiso de lectura sobre PaymentIntents/Charges.')
      throw new StripeError(json?.error?.message ?? `Stripe respondió ${res.status}`)
    }
    out.push(...(json.data ?? []))
    if (!json.has_more || !json.data?.length) break
    despues = json.data[json.data.length - 1].id
  }
  return out
}
