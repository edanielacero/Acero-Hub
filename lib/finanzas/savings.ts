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
export function pendingSavingsPeriod(
  earliestGoalCreatedOn: string | null,
  closures: { period: string }[],
  todayISO: string,
  max = 24,
): string | null {
  if (!earliestGoalCreatedOn) return null
  const current = periodStart(todayISO)

  // El piso de la ventana: `max` meses antes del período vigente.
  let floor = current
  for (let i = 0; i < max; i++) floor = previousPeriod(floor)

  const created = periodStart(earliestGoalCreatedOn)
  let p = created > floor ? created : floor

  while (p < current) {
    if (!closures.some(c => c.period === p)) return p
    p = nextPeriod(p)
  }
  return null
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
}

/**
 * El saldo de cada ahorro, derivado de sus propios movimientos — nunca
 * guardado (§4.2). Una `transferencia` tageada solo puede tener UN lado en
 * una cuenta de ahorro: entre dos cuentas de ahorro no se tagea (§0.1.2), así
 * que no hay ambigüedad sobre qué lado mirar.
 *
 * El lado que aporta usa lo que REALMENTE LLEGÓ (`to_amount_usd ?? amount_usd`,
 * mismo criterio que el resto de la app); el lado que retira usa lo que
 * salió (`amount_usd`, congelado con la tasa de origen).
 */
export function computeGoalBalancesUsd(txs: GoalTaggedTx[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const tx of txs) {
    if (!tx.savings_goal_id) continue

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
export function computeSavingsByAccountUsd(txs: GoalTaggedTx[]): Map<string, number> {
  const porCuenta = new Map<string, number>()
  const suma = (id: string, delta: number) =>
    porCuenta.set(id, round2((porCuenta.get(id) ?? 0) + delta))

  for (const tx of txs) {
    if (!tx.savings_goal_id) continue

    if (tx.type === 'ingreso') {
      suma(tx.account_id, tx.amount_usd)
    } else if (tx.type === 'gasto') {
      suma(tx.account_id, -tx.amount_usd)
    } else if (tx.type === 'transferencia' && tx.to_account_id) {
      // Un retiro saca lo apartado de la cuenta de origen; un aporte lo suma
      // a la de destino. Solo se mueve un lado: la otra cuenta no gana ni
      // pierde plata *ahorrada* por el traslado.
      if (tx.savings_flow === 'retiro') suma(tx.account_id, -tx.amount_usd)
      else suma(tx.to_account_id, tx.to_amount_usd ?? tx.amount_usd)
    }
  }

  for (const [id, valor] of porCuenta) porCuenta.set(id, Math.max(0, valor))
  return porCuenta
}
