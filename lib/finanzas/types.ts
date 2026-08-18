// Finanzas · tipos compartidos entre el server y el cliente de la mini-app.
// Escritos desde cero para Finanzas: no se importan tipos de otras mini-apps.

export type Currency = 'USD' | 'BOB' | 'USDT' | 'USDC' | 'BTC'
export type TxType = 'gasto' | 'ingreso' | 'transferencia'
export type CategoryKind = 'gasto' | 'ingreso'

export const CURRENCIES: Currency[] = ['USD', 'BOB', 'USDT', 'USDC', 'BTC']
export const TX_TYPES: TxType[] = ['gasto', 'ingreso', 'transferencia']

/**
 * Cómo se convierte cada moneda a USD.
 *
 * `direct`   → usd = monto × tasa   (la tasa es "dólares por 1 unidad")
 * `inverse`  → usd = monto ÷ tasa   (la tasa es "unidades por 1 dólar")
 *
 * Los dos modos existen para poder guardar el número tal como el usuario lo
 * piensa: nadie dice "el boliviano vale 0.1437 dólares", dice "el dólar está
 * a 6.96". Y con el BTC pasa al revés: se piensa "el BTC está a 68.000".
 */
export type RateMode = 'none' | 'direct' | 'inverse'

export interface CurrencyMeta {
  code: Currency
  name: string
  symbol: string
  /** Decimales con los que se guarda y se muestra. */
  decimals: number
  rateMode: RateMode
  /** Cómo se rotula el campo de tasa en Ajustes. */
  rateLabel: string
  defaultRate: number
  /** Los stablecoins valen ~1 USD; se agrupan aparte en la UI. */
  stable: boolean
  /** Las cripto llevan el código detrás del número: `0.013245 BTC`. */
  symbolAfter: boolean
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  USD:  { code: 'USD',  name: 'Dólares',     symbol: '$',    decimals: 2, rateMode: 'none',    rateLabel: '',                      defaultRate: 1,     stable: true , symbolAfter: false },
  BOB:  { code: 'BOB',  name: 'Bolivianos',  symbol: 'Bs',   decimals: 2, rateMode: 'inverse', rateLabel: 'Bs por 1 USD',          defaultRate: 6.96,  stable: false, symbolAfter: false },
  USDT: { code: 'USDT', name: 'Tether',      symbol: 'USDT', decimals: 2, rateMode: 'direct',  rateLabel: 'USD por 1 USDT',        defaultRate: 1,     stable: true , symbolAfter: true },
  USDC: { code: 'USDC', name: 'USD Coin',    symbol: 'USDC', decimals: 2, rateMode: 'direct',  rateLabel: 'USD por 1 USDC',        defaultRate: 1,     stable: true , symbolAfter: true },
  BTC:  { code: 'BTC',  name: 'Bitcoin',     symbol: 'BTC',  decimals: 8, rateMode: 'direct',  rateLabel: 'USD por 1 BTC',         defaultRate: 68000, stable: false, symbolAfter: true },
}

/** Las monedas que necesitan una tasa cargada. USD es la referencia. */
export const RATED_CURRENCIES: Currency[] = CURRENCIES.filter(c => CURRENCY_META[c].rateMode !== 'none')

/** Tasa vigente por moneda. USD nunca aparece: siempre vale 1. */
export type RateMap = Partial<Record<Currency, number>>

export interface Rate {
  currency: Currency
  rate: number
  updated_at: string
}

export interface Account {
  id: string
  name: string
  currency: Currency
  initial_balance: number
  initial_balance_date: string
  sort_order: number
  archived: boolean
}

/** Cuenta con su saldo derivado (§4.2). El saldo nunca se guarda en la base. */
export interface AccountWithBalance extends Account {
  /** Saldo en la moneda nativa de la cuenta. */
  balance: number
  /** El mismo saldo convertido a USD con la tasa ACTUAL, no la congelada. */
  balance_usd: number
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  emoji: string | null
  sort_order: number
  archived: boolean
}

/**
 * Lo mínimo que necesita el cálculo de saldos. Existe aparte de `Transaction`
 * para que las queries que solo derivan saldos puedan pedir 5 columnas en vez
 * de la fila entera, sin castear nada.
 */
export interface BalanceMovement {
  type: TxType
  account_id: string
  to_account_id: string | null
  amount: number
  to_amount: number | null
}

export interface Transaction extends BalanceMovement {
  id: string
  date: string
  category_id: string | null
  currency: Currency
  /** Tasa congelada al momento de escribir. Nunca se recalcula. */
  exchange_rate: number
  /** Monto en USD congelado al momento de escribir. */
  amount_usd: number
  description: string | null
}

export interface TransactionInput {
  type: TxType
  date: string
  account_id: string
  to_account_id?: string | null
  category_id?: string | null
  amount: number
  to_amount?: number | null
  description?: string | null
}

/** Las 14 categorías que siembra POST /api/finanzas/seed. */
export const SEED_CATEGORIES: { name: string; kind: CategoryKind; emoji: string }[] = [
  { name: 'Comida',         kind: 'gasto',   emoji: '🍽️' },
  { name: 'Transporte',     kind: 'gasto',   emoji: '🚕' },
  { name: 'Vivienda',       kind: 'gasto',   emoji: '🏠' },
  { name: 'Servicios',      kind: 'gasto',   emoji: '💡' },
  { name: 'Suscripciones',  kind: 'gasto',   emoji: '📱' },
  { name: 'Salud',          kind: 'gasto',   emoji: '🏥' },
  { name: 'Personal',       kind: 'gasto',   emoji: '🧴' },
  { name: 'Ocio',           kind: 'gasto',   emoji: '🎬' },
  { name: 'Educación',      kind: 'gasto',   emoji: '📚' },
  { name: 'Otros',          kind: 'gasto',   emoji: '📦' },
  { name: 'Sueldo',         kind: 'ingreso', emoji: '💼' },
  { name: 'Freelance',      kind: 'ingreso', emoji: '💻' },
  { name: 'Extraordinario', kind: 'ingreso', emoji: '🎁' },
  { name: 'Otros',          kind: 'ingreso', emoji: '📥' },
]


