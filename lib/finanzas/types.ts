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
  /** Sube y baja por el mercado, no por plata real que entró o salió: sus
      movimientos nacen `flow_type: 'movimiento'` en vez de `'consumo'`, para
      no ensuciar el gasto/ingreso del mes (§7.1 de contexto_finanzas.md). */
  is_investment: boolean
}

/** Cuenta con su saldo derivado (§4.2). El saldo nunca se guarda en la base. */
export interface AccountWithBalance extends Account {
  /** Saldo en la moneda nativa de la cuenta. */
  balance: number
  /** El mismo saldo convertido a USD con la tasa ACTUAL, no la congelada. */
  balance_usd: number
  /** Ya tiene alguna "Actualizar valor" registrada — bloquea poder desmarcar
      "Cuenta de inversión" (§7.2 de contexto_finanzas.md): el form de Cuentas
      directamente no ofrece el toggle en ese caso, en vez de dejar guardar y
      rechazarlo. Solo importa cuando `is_investment` ya es `true`. */
  has_value_updates: boolean
  /** Cuánto del saldo está apartado como ahorro, en la moneda de la cuenta.
      Una cuenta puede tener plata libre y plata etiquetada mezcladas: esto
      dice cuánta de la que hay es de un ahorro (idea del usuario, 26/8). */
  savings_balance: number
  savings_balance_usd: number
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
  /** Lo que LLEGÓ, en USD, congelado igual que `amount_usd`. Solo en una
      transferencia entre monedas distintas; `null` en todo lo demás. Sin
      esto la comisión había que calcularla con la tasa de hoy y se movía
      sola con el paralelo. */
  to_amount_usd: number | null
  /** La tasa congelada de la moneda destino, misma convención que
      `exchange_rate`: USD por 1 unidad. */
  to_exchange_rate: number | null
  description: string | null
  /** Consumo real o movimiento financiero. Las filas viejas son 'consumo'. */
  flow_type: FlowType
  /** La plantilla de fijo que lo generó, si vino de una. */
  recurring_id?: string | null
  /** El pasanaku al que pertenece, si es un aporte o una recepción (Sprint 5). */
  pasanaku_id?: string | null
  /** El ahorro al que pertenece, si es un aporte o un retiro (Sprint 7). */
  savings_goal_id?: string | null
  /** Aporta o retira. Siempre presente junto con `savings_goal_id`. */
  savings_flow?: SavingsFlow | null
  /** Por qué se retiró de un ahorro. Su PRESENCIA es lo que distingue un
      retiro de un aporte en un movimiento etiquetado (revisión 26/8). */
  savings_reason?: SavingsReason | null
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
  sort_order: number
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
  /** Cuánto de `amount_usd` es recuperar costo real, congelado igual que él.
      `amount_usd - principal_usd` es la ganancia — nunca se guarda aparte.
      Casi siempre igual a `amount_usd`; difiere solo cuando el reparto de un
      gasto compartido pide más de lo que costó (§ debts/settle). */
  principal_usd: number
  settled_tx_id: string | null
  /** El otro movimiento del mismo cobro, cuando hubo margen (§ debts/settle):
      `settled_tx_id` es el reembolso (o la ganancia si el reembolso dio 0),
      esto apunta al que falta. Null si el cobro no tuvo margen o si la deuda
      no está cobrada. Solo existe para que `/debts/unsettle` pueda borrar los
      dos movimientos, no dejar uno huérfano contando como ingreso real. */
  settled_margin_tx_id: string | null
  waived_at: string | null
  note: string | null
  /** De qué es. Obligatorio cuando no hay gasto padre. */
  concept: string | null
  /** Cuándo nació la deuda. Del gasto padre, o puesta a mano si es suelta. */
  incurred_on: string
  /** El plan de pago que la generó, si vino de uno (Sprint 4). */
  plan_id: string | null
  /** "Cuota 3 de 10". `null` cuando la deuda no es una cuota. */
  plan_installment_no: number | null
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
  /** Cómo se cobró: a qué cuenta entró, cuándo y cuánto. `null` si sigue
      pendiente o si se perdonó — ahí la fecha la da `waived_at`. */
  settlement: {
    date: string
    account_id: string | null
    amount: number | null
    currency: Currency
  } | null
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
  /** Independiente de la cuenta: se elige al crear el fijo, la cuenta recién
      al registrarlo (§ RecurringSheet / RegisterSheet). */
  currency: Currency
  /** Null hasta que se registra por primera vez — o para siempre, si cada
      instancia sale de una cuenta distinta. */
  account_id: string | null
  category_id: string | null
  frequency: Frequency
  day_of_month: number
  month_of_year: number | null
  active: boolean
  note: string | null
  /** Primer período que cuenta. Anterior a hoy = hay meses para recuperar. */
  starts_on: string
  /**
   * Si el fijo es un aporte a un ahorro (Sprint 7): al registrarlo genera una
   * **transferencia** tageada con este ahorro en vez del gasto de siempre —
   * "pagarme a mí primero", con su día del mes y su pendiente/vencido, sin
   * esperar al cierre ni depender del sobrante.
   *
   * Va junto con `to_account_id` y excluye `category_id`: no es un gasto que
   * presupuestar. Lo garantiza `fin_recurring_savings_shape`.
   */
  savings_goal_id: string | null
  /**
   * La cuenta de ahorro a la que entra. **Opcional en la plantilla**: se elige
   * al REGISTRAR cada instancia, igual que `account_id` — la plantilla solo
   * necesita saber a qué ahorro aporta y en qué moneda. Queda guardada como
   * default para la próxima vez.
   */
  to_account_id: string | null
}

/** Un fijo que aporta a un ahorro en vez de gastar. `to_account_id` es
    opcional: sin cuenta destino, la plata se aparta en la misma cuenta de
    donde sale. */
export type SavingsRecurring = Recurring & { savings_goal_id: string }

/**
 * Lo único que hace de un fijo un fijo de ahorro es apuntar a un ahorro.
 *
 * Antes exigía también `to_account_id`, y quedó desalineada del esquema
 * cuando la migración 20260826000000 hizo opcional la cuenta destino
 * ("Cuenta destino opcional en la plantilla del fijo"). Con la cuenta en
 * null, un fijo de ahorro real daba `false`: la pantalla de Ahorros no lo
 * reconocía y seguía ofreciendo el botón "Ahorrar" en paralelo al fijo, que
 * es justo el doble camino que hay que evitar.
 */
export function isSavingsRecurring(r: Pick<Recurring, 'savings_goal_id'>): boolean {
  return !!r.savings_goal_id
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
  currency?: Currency
  account_id?: string | null
  category_id?: string | null
  frequency?: Frequency
  day_of_month?: number
  month_of_year?: number | null
  active?: boolean
  note?: string | null
  starts_on?: string
  splits?: { person_id?: string; person_name?: string; amount?: number | null }[]
  savings_goal_id?: string | null
  to_account_id?: string | null
}

/** Una plantilla con su estado en el período vigente. */
export interface RecurringWithState extends Recurring {
  splits: RecurringSplit[]
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

/* ─── Planes de pago (Sprint 4) ─────────────────────────────────────────────

   Un plan es una intención de cobro sobre UNA persona: capital, interés
   opcional, N cuotas. Genera cuotas que son filas normales de `fin_debts` —
   cobrar, condonar y deshacer usan los endpoints de Deudas tal cual. */

export type PlanFrequency = 'semanal' | 'quincenal' | 'mensual'
export const PLAN_FREQUENCIES: PlanFrequency[] = ['semanal', 'quincenal', 'mensual']

/** Cómo se reparte el total entre las cuotas al crear o regenerar un plan. */
export type PlanMode = 'iguales' | 'manual'

export interface DebtPlan {
  id: string
  person_id: string
  concept: string
  principal: number
  currency: Currency
  /** `null` = solo capital, sin interés. */
  interest_rate: number | null
  installments: number
  frequency: PlanFrequency
  starts_on: string
  note: string | null
}

/** Una cuota manual, tal como la tipea el usuario. */
export interface PlanInstallmentDraft {
  amount: number
  incurred_on: string
}

export interface DebtPlanInput {
  /** Uno de los dos. `person_name` crea la persona al vuelo. */
  person_id?: string
  person_name?: string
  concept: string
  principal: number
  currency: Currency
  interest_rate?: number | null
  installments: number
  frequency?: PlanFrequency
  starts_on: string
  mode: PlanMode
  /** Solo cuando `mode = 'manual'`: una entrada por cuota. */
  cuotas?: PlanInstallmentDraft[]
}

/** Un plan con sus cuotas ya resueltas, para la pantalla de Deudas. */
export interface DebtPlanWithCuotas extends DebtPlan {
  person: Person
  total_usd: number
  pagado_usd: number
  pendiente_usd: number
  perdonado_usd: number
  /** Derivado: `true` cuando todas las cuotas están cobradas o perdonadas. */
  cerrado: boolean
  cuotas: DebtWithContext[]
}

/* ─── Pasanaku (Sprint 5) ────────────────────────────────────────────────────

   Tracker PERSONAL, no del grupo: no hay participantes ni rondas ajenas. Solo
   mi lado — cuánto aporto, cuántos puestos somos, qué puesto me toca a mí, y
   cuándo recibo. La fecha de mi turno se DERIVA de `start_date` + `my_slot`
   (ver `expectedTurnDate` en pasanaku.ts), nunca se guarda. */

export interface Pasanaku {
  id: string
  name: string
  /** Null hasta que se registra un aporte o recepción por primera vez — o
      para siempre, si cada movimiento sale de una cuenta distinta. Mismo
      criterio que `Recurring.account_id`: la cuenta se elige al REGISTRAR,
      no al crear. */
  account_id: string | null
  /** Independiente de la cuenta: en qué moneda está pensado el aporte
      mensual. Mismo rol que `Recurring.currency`. */
  currency: Currency
  contribution_amount: number
  total_slots: number
  /** Qué puesto soy yo en la ronda. 1-indexado. */
  my_slot: number
  start_date: string
  archived: boolean
}

export interface PasanakuInput {
  name: string
  account_id?: string | null
  currency: Currency
  contribution_amount: number
  total_slots: number
  my_slot: number
  start_date: string
}

/** Un pasanaku con lo que ya se derivó del historial de aportes/recepción. */
/**
 * Un aporte de ANTES de empezar a usar la app — solo un registro, nunca un
 * movimiento de cuentas. `amount` está en `Pasanaku.currency`, sin cuenta ni
 * conversión congelada: es una anotación, no una transacción real.
 */
export interface PasanakuHistorico {
  id: string
  pasanaku_id: string
  date: string
  amount: number
  note: string | null
}

/**
 * Un cobro de tu turno — un `ingreso · movimiento` real con este
 * `pasanaku_id`, tal como quedó en `fin_transactions`. `amount`/`currency`
 * son los reales de esa fila, sin convertir — la conversión a `Pasanaku.
 * currency` (para la barra de progreso) se hace aparte, en `collected_amount`.
 */
export interface PasanakuCobro {
  id: string
  date: string
  amount: number
  currency: Currency
}

/**
 * Un aporte real — un `gasto · movimiento` con este `pasanaku_id`, tal como
 * quedó en `fin_transactions`. `amount`/`currency` son los de esa fila, sin
 * convertir; `amount_in_currency` es el mismo aporte llevado a
 * `Pasanaku.currency` con la tasa de HOY (lo que suma en `total_aportado` y
 * lo que muestra la tabla de meses del ciclo).
 */
export interface PasanakuAporte {
  id: string
  date: string
  amount: number
  currency: Currency
  amount_in_currency: number
}

export interface PasanakuWithState extends Pasanaku {
  /** `start_date` + `(my_slot − 1)` meses. Cuándo te toca recibir. */
  expected_turn: string
  /** El mismo día del mes que `start_date`, la próxima vez que cae. */
  next_aporte_due: string
  /** En qué ronda vamos (1 = `start_date`), para la barra "hasta que te
      toque" (`current_round` / `my_slot`). Aproximación por mes calendario,
      no un conteo de aportes realmente registrados. */
  current_round: number
  /**
   * `true` cuando `collected_amount` ya alcanzó `collection_target` — es
   * decir, cuando ya cobraste la parte de todos los demás puestos. Antes
   * significaba "existe al menos un cobro"; cambió porque ahora un cobro se
   * registra de a uno por jugador, no de una sola vez (revisión 2026-08-21).
   */
  received: boolean
  /** Fecha del cobro más reciente, o null si todavía no cobraste ninguno. */
  received_at: string | null
  /** Aportes reales (fin_transactions) + históricos (fin_pasanaku_historico). */
  aportes_count: number
  /** Los aportes reales, del más nuevo al más viejo — para la tabla de meses
      del ciclo (qué ronda ya pagaste y cuáles quedan). */
  aportes: PasanakuAporte[]
  /** En `currency`, no en USD — es la moneda en la que el usuario piensa el
      pasanaku. Un aporte en otra moneda se convierte con la tasa de HOY. */
  total_aportado: number
  /** Los aportes de antes de la app, para poder listarlos y borrar alguno. */
  historico: PasanakuHistorico[]
  /** Suma de todos los cobros de tu turno, en `currency` (convertidos con la
      tasa de HOY si alguno vino de una cuenta de otra moneda). */
  collected_amount: number
  /** `contribution_amount × (total_slots − 1)` — la parte de los OTROS
      puestos, la que de verdad tenés que cobrar (la tuya la vas aportando
      mes a mes como cualquier otra, no hay que "cobrártela" a vos mismo). */
  collection_target: number
  /** Los cobros de tu turno, uno por jugador, para poder listarlos y
      borrar alguno — mismo patrón que `historico`. */
  cobros: PasanakuCobro[]
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
  /** Si el quick-add bloqueó el gasto por presupuesto y el usuario eligió
      "Ampliar", cuánto agregar al tope de ESE mes antes de guardar (Sprint 6,
      §4.6 de sprint_6_presupuesto.md). */
  budget_extension_usd?: number
}

/* ─── Presupuesto (Sprint 6, rediseñado) ─────────────────────────────────────

   Una línea por categoría de gasto, siempre — el "tope general" ya NO es una
   línea propia: es un agregado derivado (la suma de las categorías
   presupuestadas), sin monto, moneda, retroactividad ni cierre propios. El
   monto de cada línea es editable mes a mes (`fin_budget_periods`, perezoso:
   solo se guardan los meses que alguien tocó). Cada ampliación al bloquear el
   quick-add queda auditada aparte (`fin_budget_extensions`), sin pisar el
   monto original. Y el rollover NO es una configuración fija: es una
   pregunta que se responde una vez por mes, por línea, al cerrarlo
   (`fin_budget_closures`) — la ausencia de fila es la pregunta pendiente. */

export interface BudgetExtensionEntry {
  amount: number
  amount_usd: number
  created_at: string
}

/**
 * Una línea con su progreso ya resuelto para un período determinado.
 *
 * Los campos `*_usd` son la unidad de comparación (todo el gasto real viene
 * congelado en USD desde `fin_transactions`); los sin sufijo están en la
 * `input_currency` de la línea y son los que se muestran. `amount` en
 * particular es EXACTAMENTE lo que el usuario escribió — no se recalcula
 * nunca desde el USD, para que "2.400 Bs" siga diciendo 2.400 aunque la
 * tasa se mueva. El resto de los nativos sí son derivados, convertidos con
 * la tasa que la línea congeló (`exchange_rate`), no con la de hoy.
 */
export interface BudgetLineProgress {
  line_id: string
  /** Una línea cubre una o más categorías — nunca cero, y ninguna de ellas
      puede pertenecer a otra línea activa a la vez (§ fin_budget_line_categories). */
  category_ids: string[]
  category_names: string[]
  /** Alias propio, o `null` si usa los nombres de las categorías de default. */
  name: string | null
  input_currency: Currency
  /** Cuántas unidades de `input_currency` vale 1 USD, congelado al escribir. */
  exchange_rate: number
  retroactive: boolean
  /** `null` = todavía no se cargó ningún monto para esta línea. */
  amount: number | null
  amount_usd: number | null
  extensions: BudgetExtensionEntry[]
  extended: number
  extended_usd: number
  carried: number
  carried_usd: number
  spent: number
  spent_usd: number
  committed: number
  committed_usd: number
  available: number | null
  available_usd: number | null
  day_of_period: number
  days_in_period: number
}

/** El tope general: la SUMA de todas las líneas por categoría, siempre en
    USD (cada línea puede tener su propia moneda de entrada — sumarlas
    necesita una unidad común). No es una línea: no se crea, no se edita, no
    tiene cierre ni ampliación propios. `null` cuando todavía no hay ninguna
    categoría presupuestada. */
export interface BudgetGeneralProgress {
  amount_usd: number
  extended_usd: number
  carried_usd: number
  spent_usd: number
  committed_usd: number
  available_usd: number
  day_of_period: number
  days_in_period: number
}

/** Un mes ya terminado de una línea, sin decisión de cierre todavía —
    lo que dispara la pregunta "¿llevás el sobrante/sobregasto al próximo?". */
export interface PendingClosure {
  line_id: string
  category_ids: string[]
  category_names: string[]
  name: string | null
  input_currency: Currency
  period: string
  /** El disponible de ese mes, en la moneda de la línea (lo que se muestra). */
  amount: number
  amount_usd: number
}

export interface BudgetsPayload {
  general: BudgetGeneralProgress | null
  categories: BudgetLineProgress[]
  pending_closures: PendingClosure[]
  /** Categorías de gasto sin línea todavía — alimenta el selector al crear. */
  categories_without_line: { id: string; name: string }[]
}

/* ─── Historial de presupuestos ───────────────────────────────────────────
   Mes a mes de cada línea: cuánto se presupuestó, cuánto se gastó y cuánto
   sobró o se pasó. Se calcula igual que el período vigente (§4.3 del spec),
   solo que para cada mes de la vida de la línea — nunca desde el `amount`
   congelado del cierre, que solo existe para los meses ya respondidos. */

export interface BudgetHistoryEntry {
  period: string
  /** Lo presupuestado ese mes: el monto del período más sus ampliaciones. */
  budgeted: number
  budgeted_usd: number
  /** Lo que entró del mes anterior por decisión de cierre. Puede ser negativo. */
  carried_in: number
  carried_in_usd: number
  spent: number
  spent_usd: number
  /** Presupuestado + lo que entró − gastado. Positivo sobró, negativo se pasó. */
  result: number
  result_usd: number
  /** Qué se decidió al cerrarlo; `null` si todavía no se cerró. */
  carried_out: boolean | null
  /** Ya tiene fila en `fin_budget_closures` — o sea, ya se respondió. */
  closed: boolean
}

export interface BudgetLineHistory {
  line_id: string
  name: string | null
  category_ids: string[]
  category_names: string[]
  input_currency: Currency
  /** La línea está archivada: su historial sigue, su presente no. */
  archived: boolean
  /** Del mes más reciente al más viejo. Nunca incluye el mes en curso. */
  entries: BudgetHistoryEntry[]
}

export interface BudgetHistoryPayload {
  lines: BudgetLineHistory[]
  /** El agregado de todas las líneas por mes, en USD — la única unidad en la
      que se pueden sumar líneas de distinta moneda. */
  months: {
    period: string
    budgeted_usd: number
    spent_usd: number
    result_usd: number
  }[]
}

export interface BudgetLineInput {
  category_ids: string[]
  name?: string | null
  amount: number
  currency?: Currency
  retroactive?: boolean
}

/* ─── Ahorro (Sprint 7) ───────────────────────────────────────────────────────

   Un ahorro (antes "motivo") es independiente de las cuentas: vive en
   `fin_savings_goals`, y su saldo es SIEMPRE derivado de sus propios
   movimientos tageados con `savings_goal_id`, sin importar en qué cuenta
   haya caído la plata físicamente — mismo principio que el
   saldo de una cuenta (Sprint 1 §4.2). Cada mes se calcula el sobrante
   (ingreso real − gasto real) y se propone un reparto entre los ahorros
   activos, que el usuario confirma o ajusta antes de que se convierta en
   transferencias reales. */

export type AllocationType = 'fixed' | 'percent'
export const ALLOCATION_TYPES: AllocationType[] = ['fixed', 'percent']

/**
 * Si el movimiento etiquetado APORTA a un ahorro o RETIRA de él.
 *
 * Se declara siempre; nunca se deduce. Antes se leía de que `savings_reason`
 * estuviera vacío, lo cual mezclaba "es un aporte" con "no puse motivo": un
 * retiro sin motivo habría sumado al ahorro en vez de restarle, y mirando la
 * fila no había forma de distinguir intención de olvido.
 */
/**
 * En qué dirección cruza la plata la frontera de un ahorro (§4.6, §4.12).
 *
 *   aporte   — pasa a estar guardada; sube el ahorro
 *   retiro   — sale de lo guardado; baja el ahorro
 *   traslado — cambia de cuenta sin cambiar de dueño; el ahorro no se mueve
 */
export type SavingsFlow = 'aporte' | 'retiro' | 'traslado'
export const SAVINGS_FLOWS: SavingsFlow[] = ['aporte', 'retiro', 'traslado']

export type SavingsReason = 'emergencia' | 'meta_cumplida' | 'cambio_planes' | 'otro'
export const SAVINGS_REASONS: SavingsReason[] = ['emergencia', 'meta_cumplida', 'cambio_planes', 'otro']

export interface SavingsGoal {
  id: string
  name: string
  input_currency: Currency
  /** `null` solo en el cajón de sastre (`is_catchall`): no reparte según una
      regla propia, se lleva lo que sobra. Pedirle un monto o un porcentaje
      sería pedir un dato que nunca se lee. */
  allocation_type: AllocationType | null
  /** Monto en `input_currency` si es `'fixed'`, o 0–100 si es `'percent'`.
      `null` en el cajón de sastre, por lo mismo. */
  allocation_value: number | null
  /** En `input_currency`. `null` = sin meta, el ahorro solo acumula. */
  target_amount: number | null
  target_date: string | null
  /**
   * El "cajón de sastre": recibe todo lo que el reparto mensual no asignó a
   * nadie más, para que no quede un sobrante suelto (decisión del usuario,
   * 2026-08-24). Como mucho uno activo por usuario — lo garantiza el índice
   * único parcial `fin_savings_goals_catchall_idx`.
   *
   * Es el único que ignora su propia meta al recibir: si la respetara,
   * volvería a quedar plata sin asignar, que es justo lo que vino a evitar.
   */
  is_catchall: boolean
  sort_order: number
  archived: boolean
}

export interface SavingsGoalInput {
  name: string
  currency: Currency
  /** Opcionales cuando `is_catchall` — ver `SavingsGoal.allocation_type`. */
  allocation_type?: AllocationType | null
  allocation_value?: number | null
  target_amount?: number | null
  target_date?: string | null
  is_catchall?: boolean
}

/** Un ahorro con su saldo ya resuelto — derivado de sus movimientos, nunca
    guardado (§4.2 de sprint_7_ahorro.md). */
export interface SavingsGoalWithBalance extends SavingsGoal {
  /** En `input_currency`, con la tasa de HOY. */
  balance: number
  balance_usd: number
  /** `true` cuando `target_amount` existe y `balance_usd` ya lo alcanza —
      se excluye de la propuesta automática de reparto (§4.7). */
  goal_reached: boolean
  /** Ya tiene aportes o retiros registrados. Bloquea cambiarle la moneda —
      mismo criterio que la moneda de una cuenta con movimientos. */
  has_movements: boolean
  /** Desde cuándo existe: la tabla de meses del detalle arranca de acá. */
  created_at: string
  /** Los meses (primero del mes, ISO) en los que este ahorro ya recibió un
      aporte — sea del reparto de fin de mes o de un fijo. Esconde el botón
      "Ahorrar" del mes ya guardado y dibuja la tabla de meses del detalle. */
  saved_periods: string[]
  /** En qué cuentas vive físicamente este ahorro, y cuánto en cada una.
      Solo las que tienen saldo positivo, de mayor a menor. Es lo que hace
      posible el traslado (§4.12): mover plata de una cuenta a otra necesita
      saber cuánto de ESTE ahorro hay en la de origen. */
  by_account: { account_id: string; amount_usd: number }[]
}

/** Una línea de la propuesta de reparto al cerrar un mes (§4.3). */
export interface SavingsAllocationProposal {
  goal_id: string
  name: string
  currency: Currency
  /** En `currency` del ahorro. */
  amount: number
  amount_usd: number
  /** `true` cuando este ahorro es de monto fijo y el sobrante no alcanzó
      para cubrirlo entero — la UI lo muestra editable, no como sugerencia. */
  capped: boolean
}

export interface SavingsClosureProposal {
  /** `null` cuando no hay ningún período vencido sin decidir. */
  pending_period: string | null
  surplus_usd: number
  proposal: SavingsAllocationProposal[]
  /** Lo que sobró del reparto por % sin asignar a ningún ahorro (§0.1.5). */
  unassigned_usd: number
  /** `true` cuando la suma de los ahorros de monto fijo supera el sobrante:
      la UI muestra ajuste manual en vez de la propuesta automática. */
  insufficient_for_fixed: boolean
}

/** Lo que el usuario confirma al cerrar un período — puede diferir de la
    propuesta si ajustó algún monto a mano. */
export interface SavingsClosureInput {
  period: string
  allocations: { goal_id: string; amount: number; from_account_id: string; to_account_id: string }[]
  /** `true` cuando decide no repartir nada ese mes — crea solo el cierre,
      cero transferencias. */
  skip?: boolean
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



/* ─── Perfiles (Sprint 8) ──────────────────────────────────────────────────── */

/**
 * Claves de paleta, no hexadecimales. El color de cada una vive en `theme.css`
 * como un set de 4 tokens; acá solo se guarda cuál le toca al perfil.
 *
 * ⚠️ El azul NO está y no puede estar: significa "ahorro" en toda la app desde
 * la Ronda 9 del Sprint 7, donde se eligió justamente porque con el verde de la
 * marca el botón "Ahorrar" se confundía con cualquier acción primaria. Un
 * perfil con acento azul recrearía ese bug dentro de ese perfil.
 */
export type AccentKey = 'verde' | 'naranja' | 'violeta' | 'magenta' | 'teal'

export const ACCENT_KEYS: AccentKey[] = ['verde', 'naranja', 'violeta', 'magenta', 'teal']

export function isAccentKey(v: unknown): v is AccentKey {
  return typeof v === 'string' && (ACCENT_KEYS as string[]).includes(v)
}

/**
 * Un cajón de finanzas aislado. Sin tipo (personal/empresa): lo que distingue a
 * un perfil es su nombre y su color — ver `contexto_finanzas.md` §7.4.
 */
export interface Profile {
  id: string
  name: string
  accent: AccentKey
  is_default: boolean
  archived: boolean
  sort_order: number
  /** Si este perfil genera notificaciones (Sprint 9). Se combina con los
      switches por tipo del usuario: un aviso sale solo si los dos dicen que sí. */
  notify: boolean
}

/**
 * Lo que la UI necesita para decidir si ofrece **Borrar** o **Archivar** sin
 * tener que intentarlo y comerse un 409.
 */
export interface ProfileWithUsage extends Profile {
  has_movements: boolean
}

export const PROFILE_COLS = 'id, name, accent, is_default, archived, sort_order, notify'

/**
 * A quién pertenece lo que se lee o se escribe (Sprint 8).
 *
 * Los dos ids cumplen papeles distintos y ninguno reemplaza al otro:
 *
 * - `profileId` **filtra**: es lo que aísla un perfil de otro.
 * - `userId` **escribe** y sirve para lo global (`fin_rates`, `fin_quotes`,
 *   `fin_settings`, que no pertenecen a ningún perfil), porque es lo que
 *   sostiene RLS.
 *
 * Va como objeto y no como dos parámetros sueltos a propósito: los dos son
 * `string`, así que dos parámetros posicionales dejarían pasar en silencio el
 * error de mandarlos al revés — que es exactamente la clase de bug que mezcla
 * perfiles sin que nadie se entere. Con el objeto, TypeScript lo hace
 * imposible.
 */
export interface Scope {
  userId: string
  profileId: string
}
