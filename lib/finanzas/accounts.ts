import type { Account, AccountWithBalance, BalanceMovement, Currency, RateMap } from './types'
import { num, roundFor, round2, toUsd } from './money'

/**
 * Saldo derivado por cuenta (§4.2 del documento maestro).
 *
 *   saldo(A) = initial_balance
 *              − gastos y transferencias que SALEN de A
 *              + ingresos y transferencias que ENTRAN a A
 *
 * No existe columna `balance` en la base: el saldo es siempre una consecuencia
 * de los movimientos. Editar o borrar uno recalcula solo, sin compensaciones.
 */
export function computeBalances(
  accounts: Account[],
  transactions: BalanceMovement[],
): Map<string, number> {
  const balances = new Map<string, number>()
  for (const a of accounts) balances.set(a.id, a.initial_balance)

  for (const tx of transactions) {
    if (balances.has(tx.account_id)) {
      const current = balances.get(tx.account_id)!
      // Gasto y transferencia salen de la cuenta origen; ingreso entra.
      const delta = tx.type === 'ingreso' ? tx.amount : -tx.amount
      balances.set(tx.account_id, current + delta)
    }

    if (tx.type === 'transferencia' && tx.to_account_id && balances.has(tx.to_account_id)) {
      // Si las monedas difieren, el destino recibe `to_amount` (lo que
      // realmente llegó); si no, recibe el mismo monto que salió.
      const received = tx.to_amount ?? tx.amount
      balances.set(tx.to_account_id, balances.get(tx.to_account_id)! + received)
    }
  }

  // Cada saldo se redondea a la precisión de SU moneda: 2 decimales en fiat,
  // 8 en BTC. Redondear un saldo en satoshis a centavos lo destruiría.
  const currencyById = new Map(accounts.map(a => [a.id, a.currency]))
  for (const [id, value] of balances) {
    balances.set(id, roundFor(value, currencyById.get(id) ?? 'USD'))
  }
  return balances
}

/**
 * Cuentas enriquecidas con su saldo. El equivalente en USD usa la tasa ACTUAL,
 * no la congelada de cada transacción: el patrimonio es una foto del presente,
 * no un dato histórico (§4.3).
 *
 * `has_value_updates` y la porción ahorrada quedan afuera a propósito:
 * necesitan mirar `flow_type` y `savings_goal_id` de cada movimiento, que
 * `BalanceMovement` no trae (es "lo mínimo que necesita el cálculo de
 * saldos"). Quien llama los completa — hoy solo `loadAccounts`.
 */
export function withBalances(
  accounts: Account[],
  transactions: BalanceMovement[],
  rates: RateMap,
): Omit<AccountWithBalance, 'has_value_updates' | 'savings_balance' | 'savings_balance_usd'>[] {
  const balances = computeBalances(accounts, transactions)
  return accounts.map(a => {
    const balance = balances.get(a.id) ?? a.initial_balance
    return { ...a, balance, balance_usd: toUsd(balance, a.currency, rates) }
  })
}

/** Patrimonio total: suma de todos los saldos convertidos a USD de hoy. */
export function totalUsd(accounts: AccountWithBalance[]): number {
  return round2(
    accounts.filter(a => !a.archived).reduce((sum, a) => sum + a.balance_usd, 0),
  )
}

/** Fila cruda de `fin_accounts` → `Account`, normalizando los numeric. */
export function mapAccount(row: Record<string, unknown>): Account {
  return {
    id: row.id as string,
    name: row.name as string,
    currency: row.currency as Currency,
    initial_balance: num(row.initial_balance),
    initial_balance_date: row.initial_balance_date as string,
    sort_order: num(row.sort_order),
    archived: Boolean(row.archived),
    is_investment: Boolean(row.is_investment),
  }
}

/** Fila cruda de `fin_transactions` → lo que necesita el cálculo de saldos. */
export function mapBalanceMovement(row: Record<string, unknown>): BalanceMovement {
  return {
    type: row.type as BalanceMovement['type'],
    account_id: row.account_id as string,
    to_account_id: (row.to_account_id as string | null) ?? null,
    amount: num(row.amount),
    to_amount: row.to_amount === null || row.to_amount === undefined ? null : num(row.to_amount),
  }
}
