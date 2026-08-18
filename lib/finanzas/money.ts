import type { Currency, TxType } from './types'

/** Redondeo a 2 decimales, que es la precisión de todas las columnas numeric(14,2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Convierte a USD. `rate` son bolivianos por 1 USD.
 * Un monto que ya está en USD se devuelve tal cual — nunca se toca la tasa.
 */
export function toUsd(amount: number, currency: Currency, rate: number): number {
  if (currency === 'USD') return round2(amount)
  return round2(amount / rate)
}

/** El camino inverso: cuántos bolivianos son X dólares. */
export function fromUsd(usd: number, currency: Currency, rate: number): number {
  if (currency === 'USD') return round2(usd)
  return round2(usd * rate)
}

function group(n: number): string {
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatUSD(n: number): string {
  return `${n < 0 ? '−' : ''}$${group(n)}`
}

export function formatBOB(n: number): string {
  return `${n < 0 ? '−' : ''}Bs ${group(n)}`
}

export function formatAmount(n: number, currency: Currency): string {
  return currency === 'USD' ? formatUSD(n) : formatBOB(n)
}

/**
 * Monto con signo explícito según el tipo de movimiento.
 * Nunca solo color: el signo siempre acompaña (§9 del documento de UI).
 * El menos es U+2212, no un guion.
 */
export function formatSigned(n: number, currency: Currency, type: TxType): string {
  const base = formatAmount(Math.abs(n), currency)
  if (type === 'gasto') return `−${base}`
  if (type === 'ingreso') return `+${base}`
  return base
}

/** Placeholder cuando el usuario activa "ocultar montos". */
export const HIDDEN = '••••'

export function formatMaybeHidden(text: string, hidden: boolean): string {
  return hidden ? HIDDEN : text
}

/**
 * PostgREST serializa `numeric` como número JSON, pero devuelve `null` en
 * columnas nullable. Esto normaliza cualquier caso a un número usable.
 */
export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
