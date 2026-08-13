import type { Currency } from './accounts'

export type TransactionType =
  | 'ingreso' | 'gasto' | 'transferencia' | 'inversion' | 'retiro_inversion'
  | 'reembolso' | 'pago_deuda_por_cobrar' | 'ajuste_patrimonio'
  | 'aporte_objetivo' | 'aporte_pasanaku' | 'recepcion_pasanaku'

export type FlowType = 'consumo' | 'movimiento'
export type TransactionStatus = 'pendiente' | 'completada'

export interface Transaction {
  id:                  string
  type:                TransactionType
  flow_type:           FlowType
  account_id:          string
  to_account_id:       string | null
  category_id:         string | null
  profile_id:          string | null
  amount:              number
  currency:            Currency
  exchange_rate_used:  number | null
  amount_usd:          number
  date:                string
  description:         string | null
  tags:                string[]
  is_shared:           boolean
  status:              TransactionStatus
  notes:               string | null
}

// Solo ingreso/gasto se dividen entre perfiles (Personal/LLC) — el resto de los
// tipos son movimientos de patrimonio, que queda compartido entre todos los perfiles.
const PROFILED_TYPES: ReadonlySet<TransactionType> = new Set(['ingreso', 'gasto'])

export function requiresProfile(type: TransactionType): boolean {
  return PROFILED_TYPES.has(type)
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  ingreso:                'Ingreso',
  gasto:                  'Gasto',
  transferencia:          'Transferencia',
  inversion:              'Inversión',
  retiro_inversion:       'Retiro de inversión',
  reembolso:              'Reembolso',
  pago_deuda_por_cobrar:  'Pago de deuda por cobrar',
  ajuste_patrimonio:      'Ajuste de patrimonio',
  aporte_objetivo:        'Aporte a objetivo',
  aporte_pasanaku:        'Aporte a pasanaku',
  recepcion_pasanaku:     'Recepción de pasanaku',
}

// Tipos que mueven dinero entre dos cuentas propias — piden to_account_id (Sprint 2
// solo expone estos 3 en la UI; ver quick-add.tsx). Ninguno de los dos lados cuenta
// como ingreso ni gasto.
export const TRANSFER_LIKE_TYPES: ReadonlySet<TransactionType> = new Set(['transferencia', 'inversion', 'retiro_inversion'])

export function requiresToAccount(type: TransactionType): boolean {
  return TRANSFER_LIKE_TYPES.has(type)
}

// Único tipo "consumo" es gasto — todo lo demás (transferencias, inversiones, aportes
// a objetivos/pasanaku, reembolsos, etc.) es "movimiento": mueve o cambia de forma el
// dinero, pero no es plata que se consume. Los reportes de gasto/ahorro deben sumar
// solo flow_type='consumo' (ver documento maestro, sección de decisiones de diseño).
export function deriveFlowType(type: TransactionType): FlowType {
  return type === 'gasto' ? 'consumo' : 'movimiento'
}

interface DeltaInput {
  type:           TransactionType
  amount:         number
  account_id:     string
  to_account_id?: string | null
}

export interface BalanceDelta { accountId: string; delta: number }

const DEBIT_TYPES: ReadonlySet<TransactionType> = new Set(['gasto', 'aporte_objetivo', 'aporte_pasanaku'])

// Clasificación de dirección por tipo, para UI (colores/signos en listas de
// transacciones) — única fuente de verdad, la misma que usa computeBalanceDeltas.
// 'variable' es solo ajuste_patrimonio: su signo depende del monto, no del tipo.
export type TransactionDirection = 'debit' | 'credit' | 'transfer' | 'variable'

export function transactionDirection(type: TransactionType): TransactionDirection {
  if (type === 'ajuste_patrimonio') return 'variable'
  if (TRANSFER_LIKE_TYPES.has(type)) return 'transfer'
  return DEBIT_TYPES.has(type) ? 'debit' : 'credit'
}

// Tabla de signos por tipo. El monto siempre es positivo (excepto ajuste_patrimonio,
// que trae su propio signo — ver el check constraint de la migración). El saldo de
// una cuenta nunca se guarda como snapshot: siempre se deriva sumando estos deltas
// sobre initial_balance (mismo principio que lib/trading/capital.ts).
export function computeBalanceDeltas(tx: DeltaInput): BalanceDelta[] {
  if (tx.type === 'ajuste_patrimonio') {
    return [{ accountId: tx.account_id, delta: tx.amount }]
  }
  if (TRANSFER_LIKE_TYPES.has(tx.type)) {
    const deltas: BalanceDelta[] = [{ accountId: tx.account_id, delta: -tx.amount }]
    if (tx.to_account_id) deltas.push({ accountId: tx.to_account_id, delta: tx.amount })
    return deltas
  }
  const sign = DEBIT_TYPES.has(tx.type) ? -1 : 1
  return [{ accountId: tx.account_id, delta: sign * tx.amount }]
}

// Delta neto que un conjunto de transacciones aporta al saldo de una cuenta puntual,
// ya sea como origen (account_id) o destino (to_account_id).
export function accountTransactionDelta(accountId: string, transactions: DeltaInput[]): number {
  return transactions.reduce((sum, t) => {
    const own = computeBalanceDeltas(t).filter(d => d.accountId === accountId)
    return sum + own.reduce((s, d) => s + d.delta, 0)
  }, 0)
}
