import type { Account, Currency, FlowType, RateMap, Transaction, TransactionInput, TxType } from './types'
import { freezeRate, round2, roundFor, toUsd } from './money'

export interface ValidationResult {
  ok: boolean
  error?: string
}

const TYPES: TxType[] = ['gasto', 'ingreso', 'transferencia']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Fecha ISO que además EXISTE en el calendario.
 *
 * El regex solo mira la forma, así que `2026-02-30` y `2026-13-45` pasaban y
 * llegaban hasta Postgres, que las rechazaba con su mensaje crudo. Peor en un
 * plan de pagos: un `starts_on` imposible alimentaba la aritmética de cuotas
 * y salían fechas válidas contando desde un día que nunca existió.
 *
 * La ida y vuelta por `Date` cubre mes y día de una sola vez: el 30 de febrero
 * se normaliza al 2 de marzo, y ahí deja de coincidir con lo que entró.
 */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const dt = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === value
}

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
  if (!isValidDate(input.date)) {
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
          error: `Indica cuánto llegó realmente a ${to.name} (${to.currency})`,
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
  rates: RateMap,
): { exchange_rate: number; amount_usd: number } {
  return { exchange_rate: freezeRate(currency, rates), amount_usd: toUsd(amount, currency, rates) }
}

/**
 * Qué `flow_type` le corresponde a un movimiento **nuevo**, según su tipo y la
 * cuenta de origen que va a tener.
 *
 * Una transferencia siempre es `'movimiento'`. Un gasto o ingreso en una
 * cuenta de inversión también: el mercado mueve el número, no es plata real
 * que entró o salió (Feature 11, §7.1 de `contexto_finanzas.md`). Cualquier
 * otro caso es consumo real.
 */
export function flowTypeFor(type: TxType, account: Pick<Account, 'is_investment'>): FlowType {
  return type === 'transferencia' || account.is_investment ? 'movimiento' : 'consumo'
}

/**
 * Qué `flow_type` le corresponde a un movimiento **editado**.
 *
 * Sube a `'movimiento'` en las mismas condiciones que `flowTypeFor`. Pero
 * nunca baja: si ya era `'movimiento'` y la edición no lo justifica más (por
 * ejemplo, se sacó la cuenta de inversión), se conserva tal cual. Este
 * endpoint no sabe si ese `'movimiento'` venía de la cuenta o de otra razón
 * ajena a ella — un cobro de deuda, que nace en `/debts/settle` y se edita acá
 * mismo — así que bajarlo sería adivinar, no corregir. Mismo criterio que ya
 * regía para transferencias antes de que existieran las cuentas de inversión:
 * cambiar el tipo de una transferencia a gasto tampoco la vuelve consumo sola.
 */
export function flowTypeOnEdit(
  type: TxType,
  account: Pick<Account, 'is_investment'>,
  current: FlowType,
): FlowType {
  return flowTypeFor(type, account) === 'movimiento' ? 'movimiento' : current
}

/**
 * Si un movimiento es una "Actualizar valor" de cuenta de inversión — la
 * única razón por la que un `gasto` puede nacer `flow_type: 'movimiento'`
 * (§7.2 de `contexto_finanzas.md`). Un `ingreso` con `flow_type: 'movimiento'`
 * tiene dos causas posibles (inversión, o reembolso/cobro de deuda), así que
 * mirar la cuenta es lo que desambigua — y es la única señal disponible,
 * porque `flow_type` no distingue el motivo.
 *
 * La usan `TxRow` (ícono/subtítulo) y las pantallas que abren edición (Home,
 * Movimientos), para decidir si el tap en "Editar" abre el QuickAdd genérico
 * o `AccountValueSheet`.
 */
export function isInvestmentAdjustment(
  tx: Pick<Transaction, 'type' | 'flow_type'>,
  account: Pick<Account, 'is_investment'> | undefined,
): boolean {
  return tx.type !== 'transferencia' && tx.flow_type === 'movimiento' && !!account?.is_investment
}

/**
 * El `gasto`/`ingreso` que le corresponde a "Actualizar valor" (§7.2): dado
 * el saldo actual de la cuenta y lo que se tipeó como valor de hoy, resuelve
 * la diferencia con signo. `null` si el valor no cambió — no hay nada que
 * guardar.
 *
 * `editing` es la entrada que se está reemplazando (modo edición): su propio
 * efecto se resta de la referencia antes de medir, porque está por
 * reemplazarse, no por sumarse encima — mismo criterio que `availableFrom`.
 *
 * Redondea con la precisión de la MONEDA de la cuenta (`roundFor`), nunca a
 * 2 decimales fijos: una cuenta de inversión en BTC pierde toda su precisión
 * si un ajuste se redondea a centavos.
 */
export function valueUpdateDelta(
  currentBalance: number,
  typedValue: number,
  currency: Currency,
  editing?: Pick<Transaction, 'type' | 'amount'> | null,
): { type: TxType; amount: number } | null {
  const editingEffect = editing ? (editing.type === 'ingreso' ? editing.amount : -editing.amount) : 0
  const reference = roundFor(currentBalance - editingEffect, currency)
  const delta = roundFor(typedValue - reference, currency)
  if (delta === 0) return null
  return { type: delta > 0 ? 'ingreso' : 'gasto', amount: Math.abs(delta) }
}

/**
 * Si el movimiento cuenta como consumo real.
 *
 * Se compara contra `'movimiento'` y no a favor de `'consumo'` a propósito: una
 * fila sin `flow_type` — de antes de la migración del Sprint 2, o de un test
 * que arma el objeto a mano — es consumo. El default de la columna dice lo
 * mismo, y así las dos capas coinciden.
 */
export function isConsumo(tx: Pick<Transaction, 'flow_type'>): boolean {
  return tx.flow_type !== 'movimiento'
}

/** Aporte de un movimiento al total de gasto del período, en USD. */
export function gastoUsd(txs: Transaction[]): number {
  return round2(
    txs.filter(t => t.type === 'gasto' && isConsumo(t)).reduce((s, t) => s + t.amount_usd, 0),
  )
}

/**
 * Aporte al total de ingresos del período, en USD.
 *
 * ⚠️ **Excluye los reembolsos** (`flow_type = 'movimiento'`). Que Ana te
 * devuelva su parte de Spotify sube el saldo, pero no es plata que ganaste.
 * Sin este filtro, el reporte anual mostraría una fuente de ingresos inventada.
 */
export function ingresoUsd(txs: Transaction[]): number {
  return round2(
    txs.filter(t => t.type === 'ingreso' && isConsumo(t)).reduce((s, t) => s + t.amount_usd, 0),
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

/** `'2026-08'` → `'Agosto de 2026'`. */
export function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number)
  // Día 1: el único que existe en todos los meses.
  const label = new Date(year, month - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
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
    const value = `${year}-${String(month + 1).padStart(2, '0')}`
    out.push({ value, label: monthLabel(value) })
  }
  return out
}

/**
 * Cuánto se puede sacar de una cuenta sin dejarla en negativo.
 *
 * En modo edición hay que revertir el efecto que el propio movimiento ya tiene
 * sobre ese saldo: si estás editando un gasto de 35 y el saldo quedó en 0, el
 * máximo al que podés subirlo es 35, no 0. Sin esta corrección, editar un
 * movimiento hacia arriba sería imposible.
 */
export function availableFrom(
  balance: number,
  editing?: { type: TxType; account_id: string; amount: number } | null,
  accountId?: string,
): number {
  if (!editing || !accountId || editing.account_id !== accountId) return balance

  // Efecto actual del movimiento sobre la cuenta de origen.
  const effect = editing.type === 'ingreso' ? editing.amount : -editing.amount
  return balance - effect
}

/** Si el tipo de movimiento consume saldo de la cuenta de origen. */
export function consumesBalance(type: TxType): boolean {
  return type === 'gasto' || type === 'transferencia'
}
