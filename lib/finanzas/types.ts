// Finanzas · tipos compartidos entre el server y el cliente de la mini-app.
// Escritos desde cero para Finanzas: no se importan tipos de otras mini-apps.

export type Currency = 'USD' | 'BOB'
export type TxType = 'gasto' | 'ingreso' | 'transferencia'
export type CategoryKind = 'gasto' | 'ingreso'

export const CURRENCIES: Currency[] = ['USD', 'BOB']
export const TX_TYPES: TxType[] = ['gasto', 'ingreso', 'transferencia']

export interface Settings {
  usd_bob_rate: number
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

export const DEFAULT_USD_BOB_RATE = 6.96
