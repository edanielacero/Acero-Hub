// ⚠️ ARCHIVO GENERADO — no editar.
// Copia de lib/finanzas/, transformada para Deno por scripts/build-edge-shared.mjs.
// Editá el original y volvé a correr el script.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CURRENCY_META, RATED_CURRENCIES, type Currency, type RateMap } from './types.ts'
import { num } from './money.ts'
import { PAIRS_FOR_CURRENCY, readQuotes, type QuoteMap, type QuotePair } from './quotes.ts'

/** Una tasa con todo lo que Ajustes necesita mostrar y editar. */
export interface RateDetail {
  currency: Currency
  /** El valor que se usa de verdad para convertir. */
  rate: number
  /** Si sigue al mercado o lo fijó el usuario a mano. */
  auto: boolean
  /** Qué cotización sigue cuando es automática. */
  quote_pair: QuotePair | null
  /** De dónde salió el número que se está usando. */
  source: string
  /** Cuándo se actualizó ese número. */
  updated_at: string
}

interface RateRow {
  currency: Currency
  rate: number
  auto: boolean
  quote_pair: QuotePair | null
  updated_at: string
}

function defaultPair(currency: Currency): QuotePair | null {
  return PAIRS_FOR_CURRENCY[currency]?.[0] ?? null
}

async function readRows(supabase: SupabaseClient, userId: string): Promise<Map<Currency, RateRow>> {
  const { data } = await supabase
    .from('fin_rates')
    .select('currency, rate, auto, quote_pair, updated_at')
    .eq('user_id', userId)

  return new Map(
    (data ?? []).map(r => [
      r.currency as Currency,
      {
        currency: r.currency as Currency,
        rate: num(r.rate),
        auto: r.auto !== false,
        quote_pair: (r.quote_pair as QuotePair | null) ?? defaultPair(r.currency as Currency),
        updated_at: r.updated_at,
      },
    ]),
  )
}

/**
 * Tasas efectivas del usuario, resolviendo automáticas contra el mercado.
 *
 * Una tasa en `auto` toma su valor de la cotización que sigue; una en manual
 * usa el número que el usuario fijó. Si la cotización no está disponible
 * todavía, se cae al último valor guardado en vez de romper: es preferible una
 * tasa vieja a no poder registrar un gasto.
 */
export async function ensureRates(
  supabase: SupabaseClient,
  userId: string,
  quotesOverride?: QuoteMap,
): Promise<{ rates: RateMap; rows: RateDetail[]; quotes: QuoteMap }> {
  const [existing, quotes] = await Promise.all([
    readRows(supabase, userId),
    quotesOverride ? Promise.resolve(quotesOverride) : readQuotes(supabase),
  ])

  const missing = RATED_CURRENCIES.filter(c => !existing.has(c))
  if (missing.length > 0) {
    const { data: created } = await supabase
      .from('fin_rates')
      .insert(missing.map(c => ({
        user_id: userId,
        currency: c,
        rate: CURRENCY_META[c].defaultRate,
        auto: true,
        quote_pair: defaultPair(c),
      })))
      .select('currency, rate, auto, quote_pair, updated_at')

    for (const r of created ?? []) {
      existing.set(r.currency as Currency, {
        currency: r.currency as Currency,
        rate: num(r.rate),
        auto: r.auto !== false,
        quote_pair: (r.quote_pair as QuotePair | null) ?? defaultPair(r.currency as Currency),
        updated_at: r.updated_at,
      })
    }
    // Si el insert se perdió en una carrera, se usa el default en memoria; la
    // próxima lectura ya encuentra la fila.
    for (const c of missing) {
      if (!existing.has(c)) {
        existing.set(c, {
          currency: c,
          rate: CURRENCY_META[c].defaultRate,
          auto: true,
          quote_pair: defaultPair(c),
          updated_at: new Date().toISOString(),
        })
      }
    }
  }

  const rates: RateMap = {}
  const rows: RateDetail[] = []

  for (const c of RATED_CURRENCIES) {
    const row = existing.get(c)!
    const quote = row.auto && row.quote_pair ? quotes[row.quote_pair] : undefined

    const effective = quote?.rate ?? row.rate
    rates[c] = effective
    rows.push({
      currency: c,
      rate: effective,
      auto: row.auto,
      quote_pair: row.quote_pair,
      source: quote ? quote.source : 'manual',
      updated_at: quote ? quote.fetched_at : row.updated_at,
    })
  }

  return { rates, rows, quotes }
}

/** Valida que una moneda admita tasa editable. USD es la referencia. */
export function isRatedCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (RATED_CURRENCIES as string[]).includes(value)
}

/** Valida que una moneda pueda seguir esa cotización. */
export function pairAllowedFor(currency: Currency, pair: unknown): pair is QuotePair {
  return typeof pair === 'string' && (PAIRS_FOR_CURRENCY[currency] ?? []).includes(pair as QuotePair)
}
