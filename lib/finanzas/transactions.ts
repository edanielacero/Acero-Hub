import type { Account, Currency, Transaction, TransactionInput, TxType } from './types'
import { round2, toUsd } from './money'

export interface ValidationResult {
  ok: boolean
  error?: string
}

const TYPES: TxType[] = ['gasto', 'ingreso', 'transferencia']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida la forma del movimiento. Es la misma regla que el check constraint
 * `fin_tx_transfer_shape` de la migración: la base es la última línea de
 * defensa, pero acá el mensaje de error es legible.
 */
export function validateInput(
  input: Partial<TransactionInput>,
  accountsById: Map<string, Account>,
): ValidationResult {
  if (!input.type || !TYPES.includes(input.type)) {
    return { ok: false, error: 'Tipo de movimiento inválido' }
  }
  if (!input.date || !ISO_DATE.test(input.date)) {
    return { ok: false, error: 'Fecha inválida' }
  }
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'El monto debe ser mayor a cero' }
  }
  if (!input.account_id || !accountsById.has(input.account_id)) {
    return { ok: false, error: 'La cuenta de origen no existe' }
  }

  if (input.type === 'transferencia') {
    if (!input.to_account_id) {
      return { ok: false, error: 'Una transferencia necesita cuenta destino' }
    }
    if (!accountsById.has(input.to_account_id)) {
      return { ok: false, error: 'La cuenta destino no existe' }
    }
    if (input.to_account_id === input.account_id) {
      return { ok: false, error: 'El origen y el destino no pueden ser la misma cuenta' }
    }
    if (input.category_id) {
      return { ok: false, error: 'Una transferencia no lleva categoría' }
    }

    const from = accountsById.get(input.account_id)!
    const to = accountsById.get(input.to_account_id)!
    if (from.currency !== to.currency) {
      if (typeof input.to_amount !== 'number' || !Number.isFinite(input.to_amount) || input.to_amount <= 0) {
        return {
          ok: false,
          error: `Indicá cuánto llegó realmente a ${to.name} (${to.currency})`,
        }
      }
    } else if (input.to_amount != null) {
      return { ok: false, error: 'El monto recibido solo aplica entre monedas distintas' }
    }
  } else {
    if (input.to_account_id) {
      return { ok: false, error: 'Solo una transferencia lleva cuenta destino' }
    }
    if (input.to_amount != null) {
      return { ok: false, error: 'Solo una transferencia lleva monto recibido' }
    }
  }

  return { ok: true }
}

/**
 * Congela la conversión a USD (§4.1). Se guarda `exchange_rate` incluso cuando
 * la transacción ya está en dólares, para poder auditar después con qué tasa se
 * registró.
 */
export function freezeConversion(
  amount: number,
  currency: Currency,
  rate: number,
): { exchange_rate: number; amount_usd: number } {
  return { exchange_rate: rate, amount_usd: toUsd(amount, currency, rate) }
}

/** Aporte de un movimiento al total de gasto del período, en USD. */
export function gastoUsd(txs: Transaction[]): number {
  return round2(
    txs.filter(t => t.type === 'gasto').reduce((s, t) => s + t.amount_usd, 0),
  )
}

/** Aporte al total de ingresos del período, en USD. */
export function ingresoUsd(txs: Transaction[]): number {
  return round2(
    txs.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount_usd, 0),
  )
}

/** Primer y último día del mes de `ref`, en ISO, para filtrar por mes en curso. */
export function monthRange(ref: Date = new Date()): { from: string; to: string } {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const last = new Date(y, m + 1, 0).getDate()
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` }
}

/** Fecha de hoy en ISO local (no UTC — si no, después de las 20:00 salta al día siguiente). */
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Agrupa movimientos por fecha, ya ordenados de más reciente a más antiguo. */
export function groupByDay(txs: Transaction[]): { date: string; items: Transaction[] }[] {
  const map = new Map<string, Transaction[]>()
  for (const tx of txs) {
    const list = map.get(tx.date)
    if (list) list.push(tx)
    else map.set(tx.date, [tx])
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }))
}

/**
 * Los últimos `count` meses, del más reciente al más viejo, como opciones de
 * filtro. `{ value: '2026-08', label: 'Agosto de 2026' }`.
 *
 * La cuenta se hace sobre enteros de año/mes y NO con
 * `d.setMonth(d.getMonth() - 1)` sobre una fecha con día: parado un 29, 30 o
 * 31, restar un mes cae en un día que no existe (29 de febrero en año no
 * bisiesto) y Date rebota al mes siguiente. Con ese bug la lista repetía un
 * mes y se comía otro — y el mes perdido quedaba imposible de filtrar.
 */
export function lastMonths(count = 12, ref: Date = new Date()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []

  for (let i = 0; i < count; i++) {
    const total = ref.getFullYear() * 12 + ref.getMonth() - i
    const year = Math.floor(total / 12)
    const month = ((total % 12) + 12) % 12
    // Día 1: el único que existe en todos los meses.
    const label = new Date(year, month, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
    out.push({
      value: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    })
  }
  return out
}
