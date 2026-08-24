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
export function computeGoalBalancesUsd(
  txs: GoalTaggedTx[],
  isSavingsAccount: (accountId: string) => boolean,
): Map<string, number> {
  const balances = new Map<string, number>()
  for (const tx of txs) {
    if (!tx.savings_goal_id) continue

    let delta = 0
    if (tx.type === 'ingreso') {
      delta = tx.amount_usd
    } else if (tx.type === 'gasto') {
      delta = -tx.amount_usd
    } else if (tx.type === 'transferencia') {
      if (isSavingsAccount(tx.account_id)) {
        delta = -tx.amount_usd
      } else if (tx.to_account_id && isSavingsAccount(tx.to_account_id)) {
        delta = tx.to_amount_usd ?? tx.amount_usd
      }
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
 * La propuesta de reparto del sobrante entre los ahorros activos (§4.3).
 *
 * Los de monto fijo se cubren primero; si no alcanzan, NO se prorratea ni se
 * prioriza sola — se marca `insufficientForFixed` y cada fijo viaja con su
 * monto pedido (`capped: true`) para que la UI muestre el ajuste manual
 * (Ronda 2: "la app pregunta qué hacer"). Lo que sobra después de los fijos
 * se reparte entre los de `%`; si no suman 100 el resto queda en
 * `unassignedUsd`, visible en la confirmación (§0.1.5) — nunca se fuerza a
 * completar 100 ni se rechaza si suman de más.
 *
 * Con `surplusUsd <= 0` no hay nada que proponer: la pantalla de cierre
 * pregunta aparte si se quiere retirar de algún ahorro para cubrir el rojo
 * (Ronda 3), eso no lo decide esta función.
 */
export function proposeAllocation(
  goals: SavingsGoalWithBalance[],
  surplus: number,
  rates: RateMap,
): AllocationResult {
  if (surplus <= 0) return { proposal: [], unassignedUsd: 0, insufficientForFixed: false }

  const active = goals.filter(g => !g.archived && !g.goal_reached)
  const fixed = active.filter(g => g.allocation_type === 'fixed')
  const pct = active.filter(g => g.allocation_type === 'percent')

  const fixedUsd = fixed.map(g => ({ goal: g, usd: round2(toUsd(g.allocation_value, g.input_currency, rates)) }))
  const sumFixedUsd = round2(fixedUsd.reduce((s, f) => s + f.usd, 0))

  if (sumFixedUsd > surplus) {
    const proposal: SavingsAllocationProposal[] = [
      ...fixedUsd.map(({ goal, usd }): SavingsAllocationProposal => ({
        goal_id: goal.id, name: goal.name, currency: goal.input_currency,
        amount: goal.allocation_value, amount_usd: usd, capped: true,
      })),
      ...pct.map((g): SavingsAllocationProposal => ({
        goal_id: g.id, name: g.name, currency: g.input_currency, amount: 0, amount_usd: 0, capped: true,
      })),
    ]
    return { proposal, unassignedUsd: 0, insufficientForFixed: true }
  }

  const restUsd = round2(surplus - sumFixedUsd)

  const fixedLines: SavingsAllocationProposal[] = fixedUsd.map(({ goal, usd }) => ({
    goal_id: goal.id, name: goal.name, currency: goal.input_currency,
    amount: goal.allocation_value, amount_usd: usd, capped: false,
  }))

  let assignedFromRest = 0
  const pctLines: SavingsAllocationProposal[] = pct.map(g => {
    const usd = round2(restUsd * (g.allocation_value / 100))
    assignedFromRest = round2(assignedFromRest + usd)
    return {
      goal_id: g.id, name: g.name, currency: g.input_currency,
      amount: fromUsd(usd, g.input_currency, rates), amount_usd: usd, capped: false,
    }
  })

  const unassignedUsd = Math.max(0, round2(restUsd - assignedFromRest))
  return { proposal: [...fixedLines, ...pctLines], unassignedUsd, insufficientForFixed: false }
}

/* ─── Validación ─────────────────────────────────────────────────────────── */

export function validateGoalName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'El ahorro necesita un nombre'
  return null
}

export function validateAllocation(type: unknown, value: unknown): string | null {
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
