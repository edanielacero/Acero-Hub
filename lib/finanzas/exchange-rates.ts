export type RatePair = 'USD_BOB' | 'BOB_USDT' | 'BTC_USDT'

export interface ExchangeRate {
  pair:                RatePair
  rate:                number
  source:              string
  fetched_at:          string
  is_manual_override:  boolean
}

export interface FetchedRate {
  pair:   RatePair
  rate:   number
  source: string
}

export type RateFetchResult =
  | { pair: RatePair; ok: true; rate: FetchedRate }
  | { pair: RatePair; ok: false; error: string }

// bo.dolarapi.com republica el tipo de cambio oficial del Banco Central de Bolivia.
// Respuesta real: { moneda, casa, nombre, compra, venta, fechaActualizacion }.
async function fetchUsdBobOficial(): Promise<FetchedRate> {
  const res = await fetch('https://bo.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' })
  if (!res.ok) throw new Error(`dolarapi.com respondió ${res.status}`)
  const json = await res.json()
  const rate = Number(json.venta)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('dolarapi.com devolvió una tasa inválida')
  return { pair: 'USD_BOB', rate, source: 'dolarapi.com (oficial BCB)' }
}

// paralelo.bo promedia 5 plataformas P2P. Respuesta real:
// { timestamp, buy, sell, median, spreadPct, sourceCount, methodologyVersion }.
async function fetchBobUsdtParalelo(): Promise<FetchedRate> {
  const res = await fetch('https://paralelo.bo/api/v1/rate', { cache: 'no-store' })
  if (!res.ok) throw new Error(`paralelo.bo respondió ${res.status}`)
  const json = await res.json()
  const rate = Number(json.median)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('paralelo.bo devolvió una tasa inválida')
  return { pair: 'BOB_USDT', rate, source: 'paralelo.bo (P2P)' }
}

// Respuesta real: { symbol: "BTCUSDT", price: "63626.02000000" } (price viene como string).
async function fetchBtcUsdt(): Promise<FetchedRate> {
  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Binance respondió ${res.status}`)
  const json = await res.json()
  const rate = Number(json.price)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Binance devolvió un precio inválido')
  return { pair: 'BTC_USDT', rate, source: 'Binance' }
}

const FETCHERS: { pair: RatePair; fetch: () => Promise<FetchedRate> }[] = [
  { pair: 'USD_BOB',  fetch: fetchUsdBobOficial },
  { pair: 'BOB_USDT', fetch: fetchBobUsdtParalelo },
  { pair: 'BTC_USDT', fetch: fetchBtcUsdt },
]

// Cada fuente es un servicio de terceros independiente — una que falle no debe tumbar
// a las otras dos, así que cada fetch se aísla en su propio try/catch.
export async function fetchAllRates(): Promise<RateFetchResult[]> {
  return Promise.all(
    FETCHERS.map(async ({ pair, fetch: fn }) => {
      try {
        return { pair, ok: true, rate: await fn() } as const
      } catch (e) {
        return { pair, ok: false, error: e instanceof Error ? e.message : 'Error desconocido' } as const
      }
    }),
  )
}

export function latestRateByPair(rates: ExchangeRate[]): Map<RatePair, ExchangeRate> {
  const map = new Map<RatePair, ExchangeRate>()
  for (const r of rates) {
    const current = map.get(r.pair)
    if (!current || r.fetched_at > current.fetched_at) map.set(r.pair, r)
  }
  return map
}
