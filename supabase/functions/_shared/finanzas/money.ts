// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import { CURRENCY_META, type Currency, type RateMap, type TxType } from './types.ts'

/** Redondeo a 2 decimales — la precisión del dólar y de `amount_usd`. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Redondeo a la precisión de la moneda: 2 para fiat y stablecoins, 8 para BTC.
 * Redondear un monto en BTC a 2 decimales lo destruiría.
 */
export function roundFor(n: number, currency: Currency): number {
  const factor = 10 ** decimalsFor(currency)
  return Math.round((n + Number.EPSILON) * factor) / factor
}

/**
 * Cuántos USD vale 1 unidad de esta moneda, según la tasa cargada.
 * Resuelve la dirección: la del Bs se guarda invertida (6.96 Bs por dólar),
 * la del BTC directa (68.000 dólares por BTC).
 */
export function usdPerUnit(currency: Currency, rates: RateMap): number {
  const meta = CURRENCY_META[currency]
  if (meta.rateMode === 'none') return 1
  const rate = rates[currency] ?? meta.defaultRate
  if (!Number.isFinite(rate) || rate <= 0) return meta.rateMode === 'direct' ? meta.defaultRate : 1 / meta.defaultRate
  return meta.rateMode === 'direct' ? rate : 1 / rate
}

/** Convierte un monto a USD con las tasas dadas. */
export function toUsd(amount: number, currency: Currency, rates: RateMap): number {
  if (currency === 'USD') return round2(amount)
  return round2(amount * usdPerUnit(currency, rates))
}

/** El camino inverso: cuántas unidades de `currency` son X dólares. */
export function fromUsd(usd: number, currency: Currency, rates: RateMap): number {
  if (currency === 'USD') return round2(usd)
  return roundFor(usd / usdPerUnit(currency, rates), currency)
}

/**
 * Cuánto valdría `homeAmount` (denominado en `homeCurrency`) convertido a
 * `targetCurrency` con la tasa de hoy — la sugerencia que se ofrece cuando un
 * sheet deja elegir una cuenta en otra moneda que el monto de referencia
 * (RegisterSheet de Fijos, PasanakuAporteSheet/PasanakuRecibirSheet). `null`
 * cuando las monedas coinciden: no hay nada que convertir, el número vale tal
 * cual. Una sola función para no repetir `fromUsd(toUsd(...))` en cada sheet
 * — la duplicación fue justo lo que dejó a dos de esas tres copias sin
 * convertir de verdad (Sprint 5, revisión del 2026-08-21).
 */
export function crossCurrencySuggestion(
  homeAmount: number,
  homeCurrency: Currency,
  targetCurrency: Currency,
  rates: RateMap,
): number | null {
  if (homeCurrency === targetCurrency) return null
  return fromUsd(toUsd(homeAmount, homeCurrency, rates), targetCurrency, rates)
}

/**
 * El factor congelado que se guarda en cada transacción.
 * Siempre es "USD por 1 unidad", así que `amount_usd = amount × exchange_rate`
 * sin importar la moneda — lo que hace que auditar una fila vieja sea trivial.
 */
export function freezeRate(currency: Currency, rates: RateMap): number {
  return usdPerUnit(currency, rates)
}

/**
 * El inverso de `freezeRate`: a partir del factor congelado en una
 * transacción ("USD por 1 unidad") devuelve el número tal como el usuario lo
 * piensa — el mismo que muestra Ajustes bajo `rateLabel` ("6.96 Bs por 1
 * USD", no "0.1437 USD por 1 Bs"). Sirve para mostrar en el detalle de un
 * movimiento con qué tasa se registró, sin tener que guardarla dos veces.
 */
export function displayRate(currency: Currency, exchangeRate: number): number {
  return CURRENCY_META[currency].rateMode === 'inverse' ? 1 / exchangeRate : exchangeRate
}

function group(n: number, currency: Currency): string {
  return Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: CURRENCY_META[currency].decimals,
  })
}

export function formatAmount(n: number, currency: Currency): string {
  const meta = CURRENCY_META[currency]
  const sign = n < 0 ? '−' : ''
  const body = group(n, currency)
  return meta.symbolAfter
    ? `${sign}${body} ${meta.symbol}`
    : `${sign}${meta.symbol}${meta.symbol === '$' ? '' : ' '}${body}`
}

export function formatUSD(n: number): string {
  return formatAmount(n, 'USD')
}

export function formatBOB(n: number): string {
  return formatAmount(n, 'BOB')
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

/**
 * Normaliza lo que se tipea en un campo de monto.
 *
 * Acepta **coma y punto** como separador decimal: en teclado boliviano/español
 * la coma es lo natural, y el teclado decimal de iOS muestra la del locale. Si
 * se descartara la coma, escribir "5,03" daría "503" — un error de 100× que no
 * avisa. En una app de plata eso es inaceptable.
 *
 * `decimals` sale de la moneda: 2 para fiat, 8 para BTC.
 */
export function parseDecimalInput(
  raw: string,
  opts?: { allowNegative?: boolean; decimals?: number },
): string {
  const decimals = opts?.decimals ?? 2
  const negative = opts?.allowNegative === true && raw.trimStart().startsWith('-')

  // La coma pasa a punto ANTES de filtrar, para no perderla.
  const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')

  // Solo el primer separador cuenta; el resto se ignora.
  const [head, ...rest] = cleaned.split('.')
  const body = rest.length > 0 ? `${head}.${rest.join('').slice(0, decimals)}` : head

  return negative && body !== '' ? `-${body}` : body
}

/** El string de un campo de monto convertido a número, o NaN si está vacío. */
export function amountFromInput(
  raw: string,
  opts?: { allowNegative?: boolean; decimals?: number },
): number {
  const parsed = parseDecimalInput(raw, opts)
  if (parsed === '' || parsed === '.' || parsed === '-' || parsed === '-.') return NaN
  return Number(parsed)
}

/** Decimales que admite el campo de monto de una moneda. */
export function decimalsFor(currency: Currency | undefined): number {
  // `?.` y no un acceso directo: los módulos de dominio reciben la moneda de
  // la línea como string suelto (viene de la base), y una desconocida tiraba
  // "cannot read decimals of undefined" en vez de caer en el default.
  return currency ? (CURRENCY_META[currency]?.decimals ?? 2) : 2
}
