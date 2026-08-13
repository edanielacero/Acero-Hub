import type { Currency } from './accounts'

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const bobFormatter  = new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' })

export function formatMoney(amount: number, currency: Currency): string {
  return currency === 'USD' ? usdFormatter.format(amount) : bobFormatter.format(amount)
}

// `bobPerUsd` es siempre "cuántos Bs vale 1 USD" (así devuelven tanto bo.dolarapi.com
// como paralelo.bo) — misma convención para el oficial y el paralelo.
export function bobToUsd(amountBob: number, bobPerUsd: number): number {
  return amountBob / bobPerUsd
}

export function usdToBob(amountUsd: number, bobPerUsd: number): number {
  return amountUsd * bobPerUsd
}

export function toUsd(amount: number, currency: Currency, bobPerUsd: number): number {
  return currency === 'USD' ? amount : bobToUsd(amount, bobPerUsd)
}
