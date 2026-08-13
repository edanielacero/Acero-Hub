export type AccountType = 'efectivo' | 'cuenta_bancaria' | 'ahorro' | 'inversion' | 'cripto' | 'trading' | 'otro'
export type Currency = 'USD' | 'BOB'

export interface Account {
  id:                    string
  name:                  string
  type:                  AccountType
  currency:              Currency
  initial_balance:       number
  initial_balance_date:  string
  archived:              boolean
}

export interface AssetValuation {
  id:         string
  account_id: string
  value_usd:  number
  valued_at:  string
  source:     'manual' | 'auto_btc'
  note:       string | null
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  efectivo:        'Efectivo',
  cuenta_bancaria: 'Cuenta bancaria',
  ahorro:          'Ahorro',
  inversion:       'Inversión',
  cripto:          'Cripto',
  trading:         'Trading',
  otro:            'Otro',
}

// Efectivo/banco/ahorro se consideran disponibles de inmediato; inversión/cripto/trading no.
const ILLIQUID_TYPES: ReadonlySet<AccountType> = new Set(['inversion', 'cripto', 'trading'])

export function isLiquid(type: AccountType): boolean {
  return !ILLIQUID_TYPES.has(type)
}

// Cuentas líquidas: el saldo es initial_balance + el delta neto de sus transacciones
// (ver lib/finanzas/transactions.ts) — nunca se guarda como snapshot mutable. Cuentas
// ilíquidas: si hay una valuación registrada, esa (en USD) manda sobre todo lo demás —
// el valor de mercado de un activo no se deriva de transacciones propias.
export function getAccountBalance(account: Account, latestValuation: AssetValuation | null, transactionDelta = 0): { amount: number; currency: Currency } {
  if (!isLiquid(account.type) && latestValuation) {
    return { amount: latestValuation.value_usd, currency: 'USD' }
  }
  return { amount: account.initial_balance + transactionDelta, currency: account.currency }
}

export function latestValuationByAccount(valuations: AssetValuation[]): Map<string, AssetValuation> {
  const map = new Map<string, AssetValuation>()
  for (const v of valuations) {
    const current = map.get(v.account_id)
    if (!current || v.valued_at > current.valued_at) map.set(v.account_id, v)
  }
  return map
}
