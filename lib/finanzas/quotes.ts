import type { SupabaseClient } from '@supabase/supabase-js'
import type { Currency } from './types'
import { num } from './money'

export type QuotePair = 'BOB_USD' | 'BOB_USDT' | 'USDT_USD' | 'USDC_USD' | 'BTC_USD'

export const QUOTE_PAIRS: QuotePair[] = ['BOB_USD', 'BOB_USDT', 'USDT_USD', 'USDC_USD', 'BTC_USD']

export interface Quote {
  pair: QuotePair
  rate: number
  source: string
  fetched_at: string
}

export type QuoteMap = Partial<Record<QuotePair, Quote>>

/** Qué significa cada par y de dónde sale. Se muestra tal cual en Ajustes. */
export const QUOTE_META: Record<QuotePair, { label: string; hint: string; source: string }> = {
  BOB_USD:  { label: 'Bs por 1 USD',  hint: 'Oficial del BCB',            source: 'bo.dolarapi.com' },
  BOB_USDT: { label: 'Bs por 1 USDT', hint: 'Paralelo P2P',              source: 'paralelo.bo' },
  USDT_USD: { label: 'USD por 1 USDT', hint: 'Mercado',                   source: 'coingecko.com' },
  USDC_USD: { label: 'USD por 1 USDC', hint: 'Mercado',                   source: 'coingecko.com' },
  BTC_USD:  { label: 'USD por 1 BTC',  hint: 'Mercado',                   source: 'coingecko.com' },
}

/** Qué cotizaciones puede seguir cada moneda. El Bs es el único con opción. */
export const PAIRS_FOR_CURRENCY: Partial<Record<Currency, QuotePair[]>> = {
  BOB:  ['BOB_USD', 'BOB_USDT'],
  USDT: ['USDT_USD'],
  USDC: ['USDC_USD'],
  BTC:  ['BTC_USD'],
}

/** Cuánto vale una cotización antes de considerarse vieja. */
export const QUOTE_TTL_MS = 30 * 60 * 1000

const TIMEOUT_MS = 4000

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // Una fuente caída no puede tumbar al resto: se devuelve null y el par
    // conserva su última cotización buena.
    return null
  }
}

/**
 * Trae las 5 cotizaciones. Tres viajes: el oficial boliviano, el paralelo, y
 * una sola llamada a CoinGecko que resuelve USDT, USDC y BTC de una.
 *
 * Devuelve solo los pares que respondieron. Nunca lanza: si todo falla, el
 * llamador se queda con lo que ya tenía guardado.
 */
export async function fetchQuotes(): Promise<{ pair: QuotePair; rate: number; source: string }[]> {
  const [oficial, paralelo, cripto] = await Promise.all([
    getJson('https://bo.dolarapi.com/v1/dolares/oficial'),
    getJson('https://paralelo.bo/api/v1/rate'),
    getJson('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin,bitcoin&vs_currencies=usd'),
  ])

  const out: { pair: QuotePair; rate: number; source: string }[] = []
  const push = (pair: QuotePair, value: unknown, source: string) => {
    const rate = num(value, NaN)
    if (Number.isFinite(rate) && rate > 0) out.push({ pair, rate, source })
  }

  if (oficial && typeof oficial === 'object') {
    const o = oficial as { venta?: unknown; compra?: unknown }
    push('BOB_USD', o.venta ?? o.compra, QUOTE_META.BOB_USD.source)
  }

  if (paralelo && typeof paralelo === 'object') {
    // La mediana es más estable que compra o venta sueltas.
    const p = paralelo as { median?: unknown; sell?: unknown }
    push('BOB_USDT', p.median ?? p.sell, QUOTE_META.BOB_USDT.source)
  }

  if (cripto && typeof cripto === 'object') {
    const c = cripto as Record<string, { usd?: unknown } | undefined>
    push('USDT_USD', c.tether?.usd, QUOTE_META.USDT_USD.source)
    push('USDC_USD', c['usd-coin']?.usd, QUOTE_META.USDC_USD.source)
    push('BTC_USD', c.bitcoin?.usd, QUOTE_META.BTC_USD.source)
  }

  return out
}

/** Lee las cotizaciones guardadas. */
export async function readQuotes(supabase: SupabaseClient): Promise<QuoteMap> {
  const { data } = await supabase.from('fin_quotes').select('pair, rate, source, fetched_at')
  const map: QuoteMap = {}
  for (const row of data ?? []) {
    map[row.pair as QuotePair] = {
      pair: row.pair,
      rate: num(row.rate),
      source: row.source,
      fetched_at: row.fetched_at,
    }
  }
  return map
}

/** True si algún par falta o quedó más viejo que el TTL. */
export function quotesAreStale(quotes: QuoteMap, ttlMs = QUOTE_TTL_MS): boolean {
  const cutoff = Date.now() - ttlMs
  return QUOTE_PAIRS.some(p => {
    const q = quotes[p]
    return !q || new Date(q.fetched_at).getTime() < cutoff
  })
}

/**
 * Trae del mercado y guarda. Recibe el cliente admin porque `fin_quotes` no
 * tiene policies de escritura: son datos globales, no del usuario.
 */
export async function refreshQuotes(admin: SupabaseClient): Promise<QuoteMap> {
  const fresh = await fetchQuotes()

  if (fresh.length > 0) {
    const now = new Date().toISOString()
    await admin.from('fin_quotes').upsert(
      fresh.map(q => ({ ...q, fetched_at: now })),
      { onConflict: 'pair' },
    )
  }

  return readQuotes(admin)
}
