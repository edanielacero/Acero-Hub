import type { AllocationType, RateMap, SavingsAllocationProposal, SavingsGoal, SavingsGoalWithBalance, Transaction, TxType } from './types'
import { fromUsd, round2, toUsd } from './money'
import { gastoUsd, ingresoUsd } from './transactions'
import { nextPeriod, periodStart, previousPeriod } from './budgets'

export { periodStart, nextPeriod }

/**
 * Ahorro (Sprint 7): un ahorro (antes "motivo") es independiente de las
 * cuentas — su saldo se deriva de sus propios movimientos tageados con
 * `savings_goal_id`, nunca se guarda (§4.2 de sprint_7_ahorro.md). Módulo
 * puro, sin `next/*`: se compila con tsc para los tests igual que el resto
 * de `lib/finanzas`. `periodStart`/`nextPeriod` se reusan de `budgets.ts`
 * en vez de redefinirlos — son utilidades de calendario genéricas, no algo
 * propio de Presupuesto.
 */

/** El sobrante del mes: ingreso real menos gasto real, mismo filtro
    `isConsumo` que ya usan Presupuesto y Reportes (§4.1). */
export function surplusUsd(txs: Pick<Transaction, 'type' | 'amount_usd' | 'flow_type'>[]): number {
  return round2(ingresoUsd(txs) - gastoUsd(txs))
}

/**
 * El período vencido más viejo sin una fila en `fin_savings_closures` — la
 * ausencia de fila ES la pregunta pendiente (§3.4), mismo mecanismo que
 * `needsClosure` en `budgets.ts`. `null` si no hay ahorros todavía, o si
 * todos los períodos vencidos ya se decidieron.
 *
 * Arranca en el mes de creación del ahorro más viejo, pero nunca más atrás
 * que `max` meses (24 por default). El tope acota la ventana HACIA ATRÁS, no
 * cuántos meses se recorren: acotar el recorrido haría que, con más de 24
 * meses de historia ya cerrada, el barrido se agotara antes de llegar al mes
 * pendiente y devolviera `null` — escondiendo justo la pregunta reciente que
 * hay que responder.
 */
/** El mes al que pertenece una fecha, como primero del mes (`2026-07-01`). */
export function periodOfDate(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Que un valor sea un período válido: el primero de un mes, en ISO. */
export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-01$/.test(value)
}

/**
 * Los meses terminados desde que existe el ahorro hasta hoy, del más nuevo al
 * más viejo. Es la tabla de meses del detalle (Ronda 9): con un check si ese
 * mes recibió un aporte, con un guion si no.
 *
 * El mes en curso NO entra: todavía no terminó, así que marcarlo como "no
 * ahorrado" sería mentir.
 */
export function monthsSince(createdAt: string, today: string, max = 24): string[] {
  const desde = periodOfDate(createdAt.slice(0, 10))
  const hasta = periodOfDate(today)
  const meses: string[] = []
  const [y0, m0] = desde.split('-').map(Number)
  const [y1, m1] = hasta.split('-').map(Number)
  const inicio = y0 * 12 + (m0 - 1)
  const fin = y1 * 12 + (m1 - 1)
  for (let n = fin - 1; n >= inicio && meses.length < max; n--) {
    meses.push(`${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}-01`)
  }
  return meses
}

/**
 * Qué mes toca organizar: **el mes pasado**, y solo ese.
 *
 * ⚠️ **Reescrito el 2026-08-26.** Antes devolvía "el período vencido más viejo
 * sin una fila en `fin_savings_closures`", y esa tabla la escribía el reparto
 * global — que la Ronda 9 reemplazó por un botón por plan. Resultado: nadie
 * escribía más esa tabla y **el mes pendiente se quedaba clavado para
 * siempre**. Guardabas en todos tus planes, los botones desaparecían, y al mes
 * siguiente la app seguía ofreciendo organizar el mismo mes viejo: la feature
 * dejaba de funcionar en silencio a los treinta días de usarla.
 *
 * Ahora no depende de ninguna tabla de estado. El mes pasado es el mes pasado;
 * si ya guardaste en un plan, ese plan no muestra botón (lo dice
 * `saved_periods`), y cuando termine el mes en curso el ciclo arranca solo.
 *
 * Un mes que decidiste no fondear no queda pendiente para siempre: pasa, y
 * queda anotado con un guion en la tabla de meses del detalle. No hay "saltar"
 * porque no hace falta.
 *
 * Devuelve `null` si no hay ningún ahorro activo que ya existiera ese mes —
 * un plan creado hoy no tiene por qué ofrecer organizar el mes pasado.
 */
export function pendingSavingsPeriod(
  goals: { archived: boolean; created_at: string }[],
  todayISO: string,
): string | null {
  const anterior = previousPeriod(periodStart(todayISO))
  const finDelMes = nextPeriod(anterior)

  const existiaYa = goals.some(g => !g.archived && periodStart(g.created_at.slice(0, 10)) < finDelMes)
  return existiaYa ? anterior : null
}

/**
 * Si un plan puede guardar en ese período: tiene que haber existido durante
 * el mes, y no haber guardado ya. Un plan creado en agosto no organiza julio.
 */
export function canSaveForPeriod(
  goal: { archived: boolean; created_at: string; saved_periods: string[] },
  period: string,
): boolean {
  if (goal.archived) return false
  if (goal.saved_periods.includes(period)) return false
  return periodStart(goal.created_at.slice(0, 10)) <= period
}

/** `true` cuando el ahorro tiene meta y ya la alcanzó — se excluye de la
    propuesta automática de reparto (§4.7). */
export function goalReached(goal: Pick<SavingsGoal, 'target_amount'>, balanceUsd: number, targetAmountUsd: number | null): boolean {
  return goal.target_amount != null && targetAmountUsd != null && balanceUsd >= targetAmountUsd
}

export interface GoalTaggedTx {
  savings_goal_id: string | null | undefined
  type: TxType
  account_id: string
  to_account_id: string | null | undefined
  amount_usd: number
  to_amount_usd: number | null | undefined
  /** Declarada, nunca deducida: 'aporte' suma al ahorro, 'retiro' le resta. */
  savings_flow?: string | null
  /** En la moneda de `account_id`. Solo lo usa `computeSavingsByAccount`. */
  amount?: number
  /** En la moneda de `to_account_id`; null si las dos cuentas comparten moneda. */
  to_amount?: number | null
}

/**
 * El saldo de cada ahorro, derivado de sus propios movimientos — nunca
 * guardado (§4.2).
 *
 * El lado que aporta usa lo que REALMENTE LLEGÓ (`to_amount_usd ?? amount_usd`,
 * mismo criterio que el resto de la app); el lado que retira usa lo que
 * salió (`amount_usd`, congelado con la tasa de origen).
 *
 * Un **traslado** (§4.12) no aparece acá con ningún signo: mover plata ya
 * ahorrada de una cuenta propia a otra no cambia cuánto tenés ahorrado, solo
 * dónde está. Es la razón de que exista como tercera dirección y no como un
 * par aporte+retiro, que sí habría movido el saldo dos veces.
 */
export function computeGoalBalancesUsd(txs: GoalTaggedTx[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const tx of txs) {
    if (!tx.savings_goal_id) continue
    if (tx.savings_flow === 'traslado') continue

    let delta = 0
    if (tx.type === 'ingreso') {
      delta = tx.amount_usd
    } else if (tx.type === 'gasto') {
      delta = -tx.amount_usd
    } else if (tx.type === 'transferencia') {
      // El signo lo dice `savings_flow`, que se declaró al escribir. Antes se
      // deducía de que el motivo estuviera vacío, lo cual confundía "es un
      // aporte" con "no puse motivo".
      delta = tx.savings_flow === 'retiro' ? -tx.amount_usd : (tx.to_amount_usd ?? tx.amount_usd)
    }

    balances.set(tx.savings_goal_id, round2((balances.get(tx.savings_goal_id) ?? 0) + delta))
  }
  return balances
}

/**
 * Dónde está físicamente cada ahorro: cuánto de él vive en cada cuenta, en
 * USD. Es lo que hace posible el traslado — para mover Bs 500 del "auto" de
 * Efectivo a Banco hay que saber que en Efectivo hay al menos Bs 500 de ese
 * ahorro, no solo que la cuenta tiene ahorros por algún lado.
 *
 * La clave es `${goalId}:${accountId}`.
 */
export function computeGoalBalancesByAccountUsd(txs: GoalTaggedTx[]): Map<string, number> {
  const porAhorroYCuenta = new Map<string, number>()
  const suma = (goalId: string, accountId: string, delta: number) => {
    const k = `${goalId}:${accountId}`
    porAhorroYCuenta.set(k, round2((porAhorroYCuenta.get(k) ?? 0) + delta))
  }

  for (const tx of txs) {
    const goal = tx.savings_goal_id
    if (!goal) continue

    if (tx.type === 'ingreso') {
      suma(goal, tx.account_id, tx.amount_usd)
    } else if (tx.type === 'gasto') {
      suma(goal, tx.account_id, -tx.amount_usd)
    } else if (tx.type === 'transferencia' && tx.to_account_id) {
      if (tx.savings_flow === 'retiro') {
        suma(goal, tx.account_id, -tx.amount_usd)
      } else if (tx.savings_flow === 'traslado') {
        // Los dos lados se mueven: sale de una cuenta y entra en la otra.
        suma(goal, tx.account_id, -tx.amount_usd)
        suma(goal, tx.to_account_id, tx.to_amount_usd ?? tx.amount_usd)
      } else {
        suma(goal, tx.to_account_id, tx.to_amount_usd ?? tx.amount_usd)
      }
    }
  }
  return porAhorroYCuenta
}

export interface AllocationResult {
  proposal: SavingsAllocationProposal[]
  unassignedUsd: number
  insufficientForFixed: boolean
}

/**
 * Cuánto le falta a un ahorro para llegar a su meta, en USD. `Infinity` si no
 * tiene meta: no hay techo, acumula para siempre.
 */
function faltaParaMetaUsd(g: SavingsGoalWithBalance, rates: RateMap): number {
  if (g.target_amount == null) return Infinity
  return Math.max(0, round2(toUsd(g.target_amount, g.input_currency, rates) - g.balance_usd))
}

/** Una línea de la propuesta, con el monto nativo resuelto. `nativoExacto` es
    el número que el usuario escribió (el `allocation_value` de un fijo) y se
    usa tal cual cuando el aporte NO se capeó — así "50" sigue diciendo 50 en
    vez de volver de un round-trip por USD como 49,99. */
function linea(
  g: SavingsGoalWithBalance,
  usd: number,
  rates: RateMap,
  nativoExacto?: number,
): SavingsAllocationProposal {
  return {
    goal_id: g.id,
    name: g.name,
    currency: g.input_currency,
    amount: nativoExacto ?? fromUsd(usd, g.input_currency, rates),
    amount_usd: usd,
    capped: false,
  }
}

/**
 * La propuesta de reparto del sobrante entre los ahorros activos (§4.3).
 *
 * El orden es: **primero los fijos, después los porcentuales sobre lo que
 * queda, y al final el cajón de sastre se lleva todo el resto.**
 *
 * Dos reglas que definió el usuario en la revisión del 2026-08-24:
 *
 * - **Ningún aporte automático se pasa de la meta.** Un fijo de $50 al que
 *   solo le faltan $20 recibe $20, no $50 — el reparto automático pone
 *   exactamente lo necesario. Pasarse sigue siendo posible a mano desde el
 *   quick-add (§4.7), que es donde el usuario lo decide explícitamente.
 * - **No queda "sin asignar".** Lo que sobra después de todo va al ahorro
 *   marcado como cajón de sastre (`is_catchall`), que es el ÚNICO que ignora
 *   su propia meta al recibir: si la respetara volvería a quedar un
 *   remanente, que es justo lo que vino a evitar. Sin ningún cajón de sastre
 *   marcado, el remanente sí queda en `unassignedUsd` — el comportamiento
 *   anterior sigue siendo el fallback.
 *
 * Si los fijos piden más que el sobrante, NO se prorratea ni se prioriza solo:
 * se marca `insufficientForFixed` y cada fijo viaja con su monto pedido
 * (`capped: true`) para que la UI muestre el ajuste manual (Ronda 2, "la app
 * pregunta qué hacer").
 *
 * Con `surplusUsd <= 0` no hay nada que proponer: la pantalla de cierre
 * pregunta aparte qué hacer con un mes en rojo (Ronda 3).
 */
export function proposeAllocation(
  goals: SavingsGoalWithBalance[],
  surplus: number,
  rates: RateMap,
): AllocationResult {
  if (surplus <= 0) return { proposal: [], unassignedUsd: 0, insufficientForFixed: false }

  const vivos = goals.filter(g => !g.archived)
  const catchall = vivos.find(g => g.is_catchall) ?? null

  // El cajón de sastre no compite en el reparto normal: cobra al final, con lo
  // que sobre. Y su `goal_reached` no lo saca de la lista, a diferencia del
  // resto — es el que tiene que quedarse con el remanente igual.
  // Sin regla propia no participa del reparto: es el caso del cajón de sastre
  // (que cobra al final) y la red por si alguna fila quedara a medias.
  const enJuego = vivos.filter(g =>
    !g.goal_reached && g.id !== catchall?.id && g.allocation_type != null && g.allocation_value != null)
  const fixed = enJuego.filter(g => g.allocation_type === 'fixed')
  const pct = enJuego.filter(g => g.allocation_type === 'percent')

  // El pedido de cada fijo, ya topeado por lo que le falta para su meta.
  const fixedUsd = fixed.map(g => {
    const pedidoUsd = round2(toUsd(g.allocation_value!, g.input_currency, rates))
    const techoUsd = faltaParaMetaUsd(g, rates)
    const usd = round2(Math.min(pedidoUsd, techoUsd))
    return { goal: g, usd, topeado: usd < pedidoUsd }
  })
  const sumFixedUsd = round2(fixedUsd.reduce((s, f) => s + f.usd, 0))

  if (sumFixedUsd > surplus) {
    const proposal: SavingsAllocationProposal[] = [
      ...fixedUsd.map(({ goal, usd, topeado }): SavingsAllocationProposal => ({
        ...linea(goal, usd, rates, topeado ? undefined : goal.allocation_value!),
        capped: true,
      })),
      ...pct.map((g): SavingsAllocationProposal => ({
        goal_id: g.id, name: g.name, currency: g.input_currency, amount: 0, amount_usd: 0, capped: true,
      })),
      ...(catchall ? [{
        goal_id: catchall.id, name: catchall.name, currency: catchall.input_currency,
        amount: 0, amount_usd: 0, capped: true,
      }] : []),
    ]
    return { proposal, unassignedUsd: 0, insufficientForFixed: true }
  }

  const restUsd = round2(surplus - sumFixedUsd)

  const fixedLines = fixedUsd.map(({ goal, usd, topeado }) =>
    linea(goal, usd, rates, topeado ? undefined : goal.allocation_value!))

  let asignadoDelResto = 0
  const pctLines = pct.map(g => {
    const cuotaUsd = round2(restUsd * (g.allocation_value! / 100))
    const usd = round2(Math.min(cuotaUsd, faltaParaMetaUsd(g, rates)))
    asignadoDelResto = round2(asignadoDelResto + usd)
    return linea(g, usd, rates)
  })

  const sobranteUsd = Math.max(0, round2(restUsd - asignadoDelResto))

  // El cajón de sastre se lleva todo lo que quedó, sin techo de meta.
  if (catchall && sobranteUsd > 0) {
    return {
      proposal: [...fixedLines, ...pctLines, linea(catchall, sobranteUsd, rates)],
      unassignedUsd: 0,
      insufficientForFixed: false,
    }
  }

  return { proposal: [...fixedLines, ...pctLines], unassignedUsd: sobranteUsd, insufficientForFixed: false }
}

/* ─── Validación ─────────────────────────────────────────────────────────── */

export function validateGoalName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'El ahorro necesita un nombre'
  return null
}

/**
 * Valida el reparto. `isCatchall` lo vuelve opcional: el cajón de sastre se
 * lleva lo que sobra en vez de seguir una regla propia, así que su
 * `allocation_type`/`allocation_value` nunca se leen (`proposeAllocation` lo
 * excluye del reparto normal). Exigirlos era pedir un número muerto — y uno
 * que el usuario no puede saber, porque depende de cuánto sobre.
 */
export function validateAllocation(type: unknown, value: unknown, isCatchall = false): string | null {
  if (isCatchall && type == null && value == null) return null
  if (type !== 'fixed' && type !== 'percent') return 'Tipo de reparto inválido'
  const n = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n) || n <= 0) return 'El reparto debe ser mayor a cero'
  if (type === 'percent' && n > 100) return 'Un porcentaje no puede superar 100'
  return null
}

export function validateTargetAmount(value: unknown): string | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n) || n <= 0) return 'La meta debe ser mayor a cero'
  return null
}

export const ALLOCATION_TYPE_LABEL: Record<AllocationType, string> = {
  fixed: 'Monto fijo',
  percent: 'Porcentaje',
}

/**
 * Cuánto del saldo de cada cuenta está apartado como ahorro, en USD.
 *
 * Idea del usuario (2026-08-26): una cuenta puede tener plata libre y plata
 * apartada mezcladas, y lo útil es poder decir "tenés $500, de los cuales
 * $200 son ahorro". Sale de los mismos movimientos etiquetados que alimentan
 * el saldo de cada ahorro — no hay ningún dato nuevo que mantener ni que se
 * pueda desincronizar.
 *
 * Un aporte suma en la cuenta que RECIBIÓ, un retiro resta de la que ENTREGÓ.
 * Nunca baja de cero: si la etiqueta quedó desbalanceada (por ejemplo, se
 * borró el aporte pero no el retiro), un negativo diría algo falso.
 */
/**
 * Lo mismo, pero **en la moneda de cada cuenta** y sin pasar por USD.
 *
 * Es la que usa la pantalla de Cuentas y el piso de `assertBalance`, porque
 * este número se resta de un saldo que también está en la moneda de la cuenta.
 * Convertir a USD y volver arrastraba centavos: aportar Bs 700 y ver "Bs
 * 699,99 apartados" es un número que el usuario sabe que está mal, y encima
 * dejaba el tope un centavo corrido.
 *
 * No hace falta ninguna tasa: `amount` ya está en la moneda de `account_id` y
 * `to_amount` en la de `to_account_id` — exactamente el mismo par de campos
 * con el que `computeBalances` deriva los saldos.
 */
export function computeSavingsByAccount(txs: GoalTaggedTx[]): Map<string, number> {
  return acumularPorCuenta(txs, {
    salida: tx => tx.amount ?? 0,
    entrada: tx => tx.to_amount ?? tx.amount ?? 0,
    redondear: n => n,
  })
}

export function computeSavingsByAccountUsd(txs: GoalTaggedTx[]): Map<string, number> {
  return acumularPorCuenta(txs, {
    salida: tx => tx.amount_usd,
    entrada: tx => tx.to_amount_usd ?? tx.amount_usd,
    redondear: round2,
  })
}

/** El recorrido que comparten las dos: cambia solo de qué campo sale el monto. */
function acumularPorCuenta(
  txs: GoalTaggedTx[],
  lado: {
    salida: (tx: GoalTaggedTx) => number
    entrada: (tx: GoalTaggedTx) => number
    redondear: (n: number) => number
  },
): Map<string, number> {
  const porCuenta = new Map<string, number>()
  const suma = (id: string, delta: number) =>
    porCuenta.set(id, lado.redondear((porCuenta.get(id) ?? 0) + delta))

  for (const tx of txs) {
    if (!tx.savings_goal_id) continue

    if (tx.type === 'ingreso') {
      suma(tx.account_id, lado.salida(tx))
    } else if (tx.type === 'gasto') {
      suma(tx.account_id, -lado.salida(tx))
    } else if (tx.type === 'transferencia' && tx.to_account_id) {
      // Un retiro saca lo apartado de la cuenta de origen; un aporte lo suma
      // a la de destino. En los dos casos se mueve UN solo lado: la otra
      // cuenta no gana ni pierde plata *ahorrada* por el paso de la plata.
      //
      // El traslado es la excepción, y para eso existe: mueve los dos lados a
      // la vez, que es justo lo que un aporte no sabía hacer (marcar un
      // traslado como aporte dejaba la plata apartada en las DOS cuentas).
      if (tx.savings_flow === 'retiro') {
        suma(tx.account_id, -lado.salida(tx))
      } else if (tx.savings_flow === 'traslado') {
        suma(tx.account_id, -lado.salida(tx))
        suma(tx.to_account_id, lado.entrada(tx))
      } else {
        suma(tx.to_account_id, lado.entrada(tx))
      }
    }
  }

  for (const [id, valor] of porCuenta) porCuenta.set(id, Math.max(0, valor))
  return porCuenta
}

/* ─── El presupuesto reserva antes que el ahorro ────────────────────────────
   Ver documentos/finanzas/sprint_10_presupuesto_antes_que_ahorro.md.

   Hasta acá la asimetría era que el ahorro se hacía cumplir (`assertBalance`
   pone un piso y un gasto común no puede bajar de ahí) y el presupuesto no
   reservaba nada. Repartir todo el sobrante a ahorros dejaba sin saldo un
   gasto que estaba perfectamente dentro del presupuesto.

   La corrección es asimétrica a propósito: la reserva del presupuesto NO
   frena un gasto —existe justamente para gastarse— pero sí frena que esa
   plata se guarde y quede bajo llave. */

export interface BudgetEnvelope {
  /** Lo que queda por gastar, ya neto de los fijos pendientes. */
  available_usd: number | null
  /** Los fijos de esas categorías que todavía no se pagaron. */
  committed_usd: number
  category_ids: string[]
}

export interface PendingRecurring {
  category_id: string | null
  active: boolean
  status: string
  amountUsd: number
}

/**
 * Cuánta plata tiene que quedar en las cuentas para cubrir lo que ya está
 * comprometido este mes.
 *
 * Por línea se reserva `available + committed`, o sea lo que queda del sobre
 * entero: los fijos también tienen que salir de la cuenta, así que sumarlos
 * de vuelta no es contarlos dos veces — `available` ya los había restado.
 *
 * Una línea pasada de tope se cuenta como 0 y no como negativo: haberse
 * excedido en Comida no libera plata para ahorrar, solo significa que ese
 * sobre ya está vacío.
 */
export function budgetReservedUsd(
  lines: BudgetEnvelope[],
  recurring: PendingRecurring[],
): number {
  const delPresupuesto = lines.reduce(
    (s, l) => s + Math.max(0, (l.available_usd ?? 0) + l.committed_usd), 0)

  // Los fijos que ninguna línea mira también necesitan efectivo, y ahí nadie
  // los reservó todavía.
  const cubiertas = new Set(lines.flatMap(l => l.category_ids))
  const fijosSueltos = recurring
    .filter(r => r.active && (r.status === 'pendiente' || r.status === 'vencido'))
    .filter(r => r.category_id == null || !cubiertas.has(r.category_id))
    .reduce((s, r) => s + r.amountUsd, 0)

  return round2(delPresupuesto + fijosSueltos)
}

/**
 * Cuánto se puede apartar a ahorros: la plata libre de todas las cuentas
 * menos lo que el presupuesto reserva. Nunca negativo — "estás pasado" se
 * responde con `budgetReservedUsd` contra `freeUsd`, no con un tope raro.
 */
export function savableUsd(freeUsd: number, reservedUsd: number): number {
  return round2(Math.max(0, freeUsd - reservedUsd))
}
