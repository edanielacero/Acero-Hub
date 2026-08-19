// Finanzas · tipos compartidos entre el server y el cliente de la mini-app.
// Escritos desde cero para Finanzas: no se importan tipos de otras mini-apps.

export type Currency = 'USD' | 'BOB' | 'USDT' | 'USDC' | 'BTC'
export type TxType = 'gasto' | 'ingreso' | 'transferencia'
export type CategoryKind = 'gasto' | 'ingreso'

/**
 * Si el movimiento es consumo real o solo plata cambiando de lugar.
 *
 * No toda plata que entra es un ingreso, y no toda plata que sale es un gasto.
 * Un reembolso de Spotify sube el saldo — es plata real — pero contarlo como
 * ingreso inventaría una fuente de plata que no existe. `flow_type` es lo que
 * separa las dos cosas, y de ahí cuelgan el gasto real y la futura tasa de
 * ahorro.
 */
export type FlowType = 'consumo' | 'movimiento'

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
  /** Slug de un ícono de línea ('comida', 'transporte', ...), no un emoji.
      Ver app/finanzas/components/category-icon.tsx. */
  icon: string | null
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
  /** Consumo real o movimiento financiero. Las filas viejas son 'consumo'. */
  flow_type: FlowType
  /** La plantilla de fijo que lo generó, si vino de una. */
  recurring_id?: string | null
  /** Reparto del gasto entre personas. Vacío en un gasto normal. */
  debts?: Debt[]
}

/* ─── Compartidos (Sprint 2) ────────────────────────────────────────────── */

/**
 * Alguien con quien compartís gastos. Es una etiqueta, no una cuenta: no hay
 * `auth.users` detrás y nunca lo va a haber — la app es de un solo usuario.
 *
 * No tiene ícono propio para elegir: se distingue con un círculo + monograma
 * (la inicial del nombre), así que nunca hace falta guardar nada.
 */
export interface Person {
  id: string
  name: string
  archived: boolean
}

/** Persona con lo que debe, calculado en el server. */
export interface PersonWithDebt extends Person {
  open_count: number
  open_usd: number
}

/**
 * Los tres estados de una deuda. **No se guardan**: se derivan de dos punteros
 * (`settled_tx_id`, `waived_at`), así que es imposible que un split diga
 * "cobrado" sin que exista el movimiento que lo cobró. Un enum persistido sí
 * puede desincronizarse del hecho que describe.
 */
export type DebtState = 'pendiente' | 'cobrado' | 'perdonado'

export interface Debt {
  id: string
  /** `null` cuando la deuda no viene de ningún gasto: es suelta. */
  transaction_id: string | null
  person_id: string
  amount: number
  currency: Currency
  /** Congelado con el `exchange_rate` DEL GASTO PADRE, no con la tasa de hoy. */
  amount_usd: number
  settled_tx_id: string | null
  waived_at: string | null
  note: string | null
  /** De qué es. Obligatorio cuando no hay gasto padre. */
  concept: string | null
  /** Cuándo nació la deuda. Del gasto padre, o puesta a mano si es suelta. */
  incurred_on: string
}

export interface DebtInput {
  /** Uno de los dos. `person_name` crea la persona al vuelo. */
  person_id?: string
  person_name?: string
  amount: number
}

/** Un split con el gasto que lo originó, para las pantallas de Compartidos. */
export interface DebtWithContext extends Debt {
  state: DebtState
  person: Person
  /** `null` si la deuda es suelta. */
  transaction: {
    id: string
    date: string
    description: string | null
    amount: number
    currency: Currency
    category_id: string | null
  } | null
}

/** Lo que le debe una persona, agrupado. */
export interface PersonDebt {
  person: Person
  open_usd: number
  /** Días desde el gasto más viejo sin saldar. `null` si no debe nada. */
  oldest_days: number | null
  debts: DebtWithContext[]
}

/* ─── Fijos / recurrentes (Sprint 3) ───────────────────────────────────────

   "Compartido" y "recurrente" son atributos independientes: cualquier
   combinación existe. El alquiler es fijo y solo tuyo; Spotify es fijo y
   compartido; un almuerzo es suelto y tuyo. Por eso el reparto es opcional
   dentro de la plantilla, y no un tipo de plantilla aparte. */

export type Frequency = 'mensual' | 'anual'

/** Derivado, nunca guardado: sale de si existe el movimiento del período. */
export type RecurringStatus = 'pendiente' | 'registrado' | 'vencido' | 'pausado' | 'programado'

/** Una plantilla: literalmente "un gasto que todavía no pasó". */
export interface Recurring {
  id: string
  name: string
  /** Slug de un ícono de línea, igual que `Category.icon`. */
  icon: string | null
  /** Un default editable al confirmar, no una ley. */
  amount: number
  account_id: string
  category_id: string | null
  frequency: Frequency
  day_of_month: number
  month_of_year: number | null
  active: boolean
  note: string | null
  /** Primer período que cuenta. Anterior a hoy = hay meses para recuperar. */
  starts_on: string
}

/** Una parte del reparto por defecto. `amount` null = parte pareja. */
export interface RecurringSplit {
  id: string
  recurring_id: string
  person_id: string
  /** null = se calcula al registrar, con el monto de ese mes. */
  amount: number | null
}

export interface RecurringInput {
  name: string
  icon?: string | null
  amount: number
  account_id: string
  category_id?: string | null
  frequency?: Frequency
  day_of_month?: number
  month_of_year?: number | null
  active?: boolean
  note?: string | null
  starts_on?: string
  splits?: { person_id?: string; person_name?: string; amount?: number | null }[]
}

/** Una plantilla con su estado en el período vigente. */
export interface RecurringWithState extends Recurring {
  splits: RecurringSplit[]
  currency: Currency
  status: RecurringStatus
  /** Cuándo cae en el período vigente, topeado al largo del mes. */
  due: string
  days_late: number
  /** Los períodos sin registrar, del más viejo al más nuevo. */
  pending: string[]
  /** El movimiento que ya la registró en este período, si existe. */
  registered_tx_id: string | null
  /** Lo que todavía te deben de este fijo, en USD, sumando todos los períodos. */
  open_usd: number
}

export interface RecurringSummary {
  recurring: RecurringWithState[]
  done: number
  total: number
  pending: number
}

export interface SharedSummary {
  por_cobrar_usd: number
  cobrado_mes_usd: number
  perdonado_mes_usd: number
  por_persona: PersonDebt[]
  historial: DebtWithContext[]
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
  /** Solo lo setea el server. El cliente nunca manda `flow_type`. */
  flow_type?: FlowType
  /** Reparto entre personas. Solo válido en `gasto`. */
  splits?: DebtInput[]
}

/** Las 14 categorías que siembra POST /api/finanzas/seed. */
export const SEED_CATEGORIES: { name: string; kind: CategoryKind; icon: string }[] = [
  { name: 'Comida',         kind: 'gasto',   icon: 'comida' },
  { name: 'Transporte',     kind: 'gasto',   icon: 'transporte' },
  { name: 'Vivienda',       kind: 'gasto',   icon: 'vivienda' },
  { name: 'Servicios',      kind: 'gasto',   icon: 'servicios' },
  { name: 'Suscripciones',  kind: 'gasto',   icon: 'suscripciones' },
  { name: 'Salud',          kind: 'gasto',   icon: 'salud' },
  { name: 'Personal',       kind: 'gasto',   icon: 'personal' },
  { name: 'Ocio',           kind: 'gasto',   icon: 'ocio' },
  { name: 'Educación',      kind: 'gasto',   icon: 'educacion' },
  { name: 'Otros',          kind: 'gasto',   icon: 'otros' },
  { name: 'Sueldo',         kind: 'ingreso', icon: 'sueldo' },
  { name: 'Freelance',      kind: 'ingreso', icon: 'freelance' },
  { name: 'Extraordinario', kind: 'ingreso', icon: 'extraordinario' },
  { name: 'Otros',          kind: 'ingreso', icon: 'otros-ingreso' },
]


