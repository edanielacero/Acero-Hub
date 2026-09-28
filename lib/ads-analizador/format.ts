/**
 * Entrada y salida de números en Ads Analizador.
 *
 * Propio de la mini-app y no importado de lib/gas ni lib/finanzas: cada
 * mini-app es independiente y esto es bastante menos que lo que ellas necesitan.
 */
import type { Moneda } from './types'

/**
 * Normaliza lo que se tipea en un campo de plata. Acepta coma y punto como
 * separador decimal: en Bolivia el teclado muestra la coma, y descartarla
 * convertiría `24,50` en `2450`.
 */
export function parseNumeroInput(raw: string, decimales = 2): string {
  const limpio = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const [entero, ...resto] = limpio.split('.')
  const cuerpo = resto.length > 0 ? `${entero}.${resto.join('').slice(0, decimales)}` : entero
  return cuerpo.replace('.', ',')
}

/** El string de un campo convertido a número, o NaN si está vacío. */
export function numeroDeInput(raw: string): number {
  const limpio = raw.trim().replace(/\s/g, '').replace(',', '.')
  return limpio === '' ? NaN : Number(limpio)
}

/** Un número guardado, en la forma en que se escribe en un campo. */
export function paraInput(n: number | null | undefined): string {
  return n == null ? '' : String(n).replace('.', ',')
}

/** Un monto guardado, con sus dos decimales: `24` → `24,00`. */
export function montoParaInput(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

const DOS = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ENTERO = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 })

/** `$ 1.234,50` · `Bs 25,00`. */
export function fmtMoneda(n: number, moneda: Moneda): string {
  const signo = n < 0 ? '-' : ''
  const simbolo = moneda === 'USD' ? '$' : 'Bs'
  return `${signo}${simbolo} ${DOS.format(Math.abs(n))}`
}

export function fmtEntero(n: number): string {
  return ENTERO.format(n)
}

/** `1.84x`. Con punto: es como lo muestra Ads Manager y como lo lee el usuario. */
export function fmtRoas(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(2)}x`
}

/** `0.33` → `+33%`. */
export function fmtPct(n: number | null, conSigno = false): string {
  if (n == null) return '—'
  const v = Math.round(n * 100)
  return `${conSigno && v > 0 ? '+' : ''}${v}%`
}

const ZONA = 'America/La_Paz'

/** YYYY-MM-DD de hoy en Bolivia, no en UTC. */
export function hoyBolivia(ahora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
  return p // en-CA ya da YYYY-MM-DD
}

/** Un timestamptz convertido al día de Bolivia en que ocurrió. */
export function fechaBolivia(iso: string): string {
  return hoyBolivia(new Date(iso))
}

/** `2026-09-20` → `sáb 20 sep`. */
export function fmtFecha(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(a, m - 1, d)))
    .replace(/\./g, '')
}

/** "hace 6 h", "hace 3 min", "hace 2 d". */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}
