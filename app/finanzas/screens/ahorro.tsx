'use client'

import { useMemo, useState } from 'react'
import { IconArrowsLeftRight, IconCheck, IconLock, IconMinus, IconPigMoney, IconPencil, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import type { AccountWithBalance, RateMap, SavingsGoalWithBalance } from '@/lib/finanzas/types'
import { ALLOCATION_TYPE_LABEL, canSaveForPeriod, monthsSince, proposeAllocation } from '@/lib/finanzas/savings'
import { formatAmount, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { CURRENCY_META } from '@/lib/finanzas/types'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CurrencyIcon } from '../components/currency-icon'
import { SavingsGoalSheet } from '../components/savings-goal-sheet'
import { SavingsMoveSheet } from '../components/savings-move-sheet'
import { SavingsSaveSheet, periodLabel } from '../components/savings-save-sheet'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PageHeader } from '../components/tx-row'
import { FzLink } from '../components/router'
import { Btn, EmptyState, formatDayLabel, Panel, RowMenu, SectionTitle } from '../components/ui'
import { fzFetch } from '../components/fz-fetch'

export function AhorroScreen() {
  const { savings, accounts, hidden, rates, loading, reload } = useFinanzas()
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<SavingsGoalWithBalance | null>(null)
  const [editingGoal, setEditingGoal] = useState<SavingsGoalWithBalance | null>(null)
  const [deleting, setDeleting] = useState<SavingsGoalWithBalance | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [moving, setMoving] = useState<SavingsGoalWithBalance | null>(null)
  const [ahorrando, setAhorrando] = useState<SavingsGoalWithBalance | null>(null)

  const hasAnything = savings.goals.length > 0

  /**
   * Cuánto le toca a cada plan del mes pendiente, y cuáles todavía no se
   * guardaron. Se reusa `proposeAllocation` —la misma regla que aplicaba el
   * reparto global— para que lo que dice la card sea exactamente lo que el
   * plan pidió, y no un segundo cálculo que pueda desincronizarse.
   */
  const acordado = useMemo(() => {
    if (!savings.pending_period) return new Map<string, number>()
    const { proposal } = proposeAllocation(savings.goals, savings.pending_surplus_usd, rates)
    return new Map(proposal.map(l => [l.goal_id, l.amount]))
  }, [savings.goals, savings.pending_period, savings.pending_surplus_usd, rates])

  /**
   * Por qué no se puede ahorrar todavía, si es que no se puede. Se calcula
   * acá y no en cada card: es una condición de la cuenta entera, no de un
   * plan, y así los ocho botones dicen exactamente lo mismo.
   */
  const bloqueoDeAhorro = savings.budget_pending_closures > 0
    ? 'Primero cierra el mes pasado'
    : savings.budget_reserved_usd > 0 && savings.savable_usd <= 0
      ? `Tu presupuesto reserva ${formatUSD(savings.budget_reserved_usd)}`
      : null

  const pendientes = savings.pending_period
    ? savings.goals.filter(g => canSaveForPeriod(g, savings.pending_period!))
    : []

  async function confirmDelete() {
    if (!deleting) return
    setConfirmingDelete(true)
    await fzFetch(`/api/finanzas/savings-goals/${deleting.id}`, { method: 'DELETE' })
    await reload()
    setConfirmingDelete(false)
    setDeleting(null)
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Ahorros"
        subtitle="El sobrante de cada mes, repartido en tus ahorros"
        action={
          <>
            <HideToggle />
            <Btn size="sm" onClick={() => setAdding(true)}>
              <IconPlus size={18} stroke={2} /> Nuevo
            </Btn>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Invitación, no alerta. Antes decía "Tienes un mes por repartir" con
            un triángulo de advertencia: parecía que algo había fallado, cuando
            en realidad es la mejor noticia del mes. Y ya no lleva botón — el
            reparto se hace plan por plan, en la card de cada uno. */}
        {/* Primero se presupuesta, después se ahorra. Va ARRIBA de la
            invitación a repartir: si no se puede ahorrar todavía, es lo
            primero que hay que saber, antes de que la card de un plan te
            invite a hacerlo. */}
        {/* El orden completo: cerrar el mes pasado → queda definido este mes →
            recién ahí ahorrar. Cada aviso reemplaza al siguiente. */}
        {savings.budget_pending_closures > 0 && (
          <Panel className="flex items-center gap-3 border-[color-mix(in_srgb,var(--fz-out)_22%,transparent)] bg-[var(--fz-out-tint)]">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-out)] text-white shrink-0">
              <IconLock size={18} stroke={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--fz-out-text)]">
                Primero cierra el mes pasado
              </p>
              <p className="text-[12.5px] text-[var(--fz-ink-2)]">
                Te {savings.budget_pending_closures === 1 ? 'queda 1 presupuesto' : `quedan ${savings.budget_pending_closures} presupuestos`} sin
                decidir qué pasa con lo que sobró. Hasta entonces no se sabe cuánto reserva este mes.{' '}
                <FzLink href="/finanzas/presupuesto" className="font-semibold text-[var(--fz-out-text)] underline">
                  Ir a Presupuesto
                </FzLink>
              </p>
            </div>
          </Panel>
        )}

        {savings.budget_pending_closures === 0 && savings.budget_reserved_usd > 0 && savings.savable_usd > 0 && (
          <p className="text-[12.5px] text-[var(--fz-ink-3)] px-1">
            Puedes apartar hasta <span className="font-semibold fz-num">{formatUSD(savings.savable_usd)}</span> —
            tus presupuestos reservan {formatUSD(savings.budget_reserved_usd)} de los{' '}
            {formatUSD(savings.free_usd)} que tienes libres.
          </p>
        )}

        {savings.budget_pending_closures === 0 && savings.pending_period && pendientes.length > 0 && (
          <Panel className="flex items-center gap-3 border-[color-mix(in_srgb,var(--fz-save)_22%,transparent)] bg-[var(--fz-save-tint)]">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-save)] text-white shrink-0">
              <IconSparkles size={18} stroke={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--fz-save)]">Es hora de organizar tus ahorros</p>
              <p className="text-[12.5px] text-[var(--fz-ink-2)]">
                {periodLabel(savings.pending_period)} ya terminó. Guarda lo que dejó en cada plan.
              </p>
            </div>
          </Panel>
        )}

        {loading && !hasAnything ? (
          <Panel><p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p></Panel>
        ) : !hasAnything ? (
          <Panel>
            <EmptyState
              icon={IconPigMoney}
              title="Todavía no armaste ningún ahorro"
              description="Creá uno para Emergencia, un viaje, lo que sea — y cada mes te va a proponer cuánto separar del sobrante."
              action={<Btn onClick={() => setAdding(true)}>Nuevo plan de ahorro</Btn>}
            />
          </Panel>
        ) : (
          <>
            <SectionTitle>Tus ahorros</SectionTitle>

            <div className="flex flex-col gap-3">
              {savings.goals.filter(g => !g.archived).map(g => (
                <GoalCard
                  key={g.id}
                  goal={g} hidden={hidden} rates={rates}
                  pendingPeriod={savings.pending_period}
                  acordado={acordado.get(g.id) ?? null}
                  bloqueo={bloqueoDeAhorro}
                  onSave={() => setAhorrando(g)}
                  onView={() => setViewing(g)}
                  onEdit={() => setEditingGoal(g)}
                  onMove={() => setMoving(g)}
                  onDelete={() => setDeleting(g)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {adding && (
        <SavingsGoalSheet onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />
      )}
      {editingGoal && (
        <SavingsGoalSheet editing={editingGoal} onClose={() => setEditingGoal(null)} onSaved={() => setEditingGoal(null)} />
      )}

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Ahorro"
        onEdit={() => { const g = viewing!; setViewing(null); setEditingGoal(g) }}
        onDelete={() => { const g = viewing!; setViewing(null); setDeleting(g) }}
      >
        {viewing && <GoalDetail goal={viewing} hidden={hidden} rates={rates} accounts={accounts} />}
      </DetailSheet>

      <DeleteConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminar ahorro"
        confirming={confirmingDelete}
      >
        {deleting && (
          <DeletePreview
            icon={<span className="grid place-items-center w-10 h-10 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]"><IconPigMoney size={20} stroke={1.8} /></span>}
            title={deleting.name}
            subtitle="Se borra la configuración — tus movimientos ya registrados no se tocan"
          />
        )}
      </DeleteConfirmSheet>

      {ahorrando && savings.pending_period && (
        <SavingsSaveSheet
          goal={ahorrando}
          period={savings.pending_period}
          sugerido={acordado.get(ahorrando.id) ?? null}
          onClose={() => setAhorrando(null)}
          onSaved={() => setAhorrando(null)}
        />
      )}

      {moving && (
        <SavingsMoveSheet goal={moving} onClose={() => setMoving(null)} onSaved={() => setMoving(null)} />
      )}

    </div>
  )
}

/**
 * Cómo reparte este ahorro, en una línea. El cajón de sastre no tiene regla
 * propia — se lleva lo que sobra — así que decirlo es más honesto que mostrar
 * un porcentaje inventado.
 */
function repartoLabel(goal: SavingsGoalWithBalance): string {
  if (goal.is_catchall || goal.allocation_type == null || goal.allocation_value == null) {
    return 'Recibe lo que sobre del reparto'
  }
  return goal.allocation_type === 'fixed'
    ? `${formatAmount(goal.allocation_value, goal.input_currency)} fijo por mes`
    : `${goal.allocation_value}% del sobrante cada mes`
}

/**
 * Card de un ahorro: si tiene meta, barra de progreso contra ella; si no,
 * solo el saldo acumulado — no hay nada contra qué medir el relleno.
 */
function GoalCard({ goal, hidden, rates, pendingPeriod, acordado, bloqueo, onSave, onView, onEdit, onMove, onDelete }: {
  goal: SavingsGoalWithBalance
  hidden: boolean
  rates: RateMap
  pendingPeriod: string | null
  acordado: number | null
  /** Por qué no se puede ahorrar todavía, o `null` si sí se puede. El botón
      queda deshabilitado y esto es lo que se lee en su lugar. */
  bloqueo: string | null
  onSave: () => void
  onView: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const cur = goal.input_currency
  const hasTarget = goal.target_amount != null
  const fillPct = hasTarget ? Math.min(100, Math.round((goal.balance / goal.target_amount!) * 100)) : 0
  // Un plan creado en agosto no tiene por qué ofrecer organizar julio.
  const puedeAhorrar = !!pendingPeriod && canSaveForPeriod(goal, pendingPeriod)

  return (
    <Panel className="relative">
      <div className="absolute top-4 right-4 z-10">
        <RowMenu
          items={[
            { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: onEdit },
            ...(goal.by_account.length > 0
              ? [{ label: 'Mover de cuenta', icon: <IconArrowsLeftRight size={16} stroke={1.8} />, onClick: onMove }]
              : []),
            { label: 'Eliminar', icon: <IconTrash size={16} stroke={1.8} />, onClick: onDelete, danger: true },
          ]}
        />
      </div>

      <button type="button" onClick={onView} className="w-full text-left flex flex-col gap-2.5 min-w-0 pr-9">
        <div className="flex items-center gap-2.5 min-w-0">
          <CurrencyIcon currency={cur} size={28} />
          <p className="text-[15px] font-semibold truncate min-w-0">{goal.name}</p>
          {goal.goal_reached && (
            <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--fz-in-tint)] text-[var(--fz-in-text)]">
              🎉 Meta cumplida
            </span>
          )}
          {goal.is_catchall && (
            <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--fz-accent-tint)] text-[var(--fz-accent)]">
              Recibe el resto
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-bold fz-num tracking-[-0.01em] leading-none">
            {hidden ? HIDDEN : formatAmount(goal.balance, cur)}
          </span>
          {hasTarget && !hidden && (
            <span className="text-[13px] text-[var(--fz-ink-3)] fz-num">de {formatAmount(goal.target_amount!, cur)}</span>
          )}
        </div>

        {hasTarget && (
          <div className="relative h-2 rounded-full bg-[var(--fz-hairline)] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--fz-accent)]"
              style={{ width: `${fillPct}%` }}
            />
          </div>
        )}

        <p className="text-[12px] text-[var(--fz-ink-3)]">{repartoLabel(goal)}</p>
      </button>

      {/* El reparto ya no es un trámite mensual global: cada plan tiene su
          propio botón y su propia decisión. Desaparece en cuanto ese mes se
          guardó, y vuelve cuando termina el siguiente. */}
      {puedeAhorrar && (
        <div className="mt-3 pt-3 border-t border-[var(--fz-hairline)] flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-[var(--fz-ink-3)] min-w-0 truncate">
            {/* Con el botón apagado, el texto de al lado deja de ser "cuánto
                acordaste" y pasa a ser POR QUÉ no se puede: un botón muerto
                sin explicación al lado se lee como que la app se rompió. */}
            {bloqueo ?? (acordado != null && acordado > 0
              // Un plan por % acordó una proporción, no un monto: se dicen las
              // dos cosas para que el número no aparezca de la nada.
              ? goal.allocation_type === 'percent' && goal.allocation_value != null
                ? <><span className="font-semibold text-[var(--fz-ink-2)] fz-num">{goal.allocation_value}%</span>{' '}
                    = <span className="font-semibold text-[var(--fz-ink-2)] fz-num">{formatAmount(acordado, cur)}</span></>
                : <>Acordaste <span className="font-semibold text-[var(--fz-ink-2)] fz-num">{formatAmount(acordado, cur)}</span></>
              : `Lo que dejó ${periodLabel(pendingPeriod!)}`)}
          </span>
          <Btn size="sm" variant="save" onClick={onSave} disabled={!!bloqueo}>Ahorrar</Btn>
        </div>
      )}
    </Panel>
  )
}

function GoalDetail({ goal, hidden, rates, accounts }: {
  goal: SavingsGoalWithBalance
  hidden: boolean
  rates: RateMap
  accounts: AccountWithBalance[]
}) {
  const cur = goal.input_currency
  const otherCur = cur === 'USD' ? 'BOB' : 'USD'
  const bobRate = fromUsd(1, 'BOB', rates)

  return (
    <>
      <DeletePreview
        icon={<CurrencyIcon currency={cur} size={40} />}
        title={goal.name}
        subtitle={CURRENCY_META[cur].name}
        amount={hidden ? HIDDEN : formatAmount(goal.balance, cur)}
      />
      <div>
        <DetailField label="Saldo" value={hidden ? null : formatAmount(goal.balance, cur)} />
        <DetailField
          label={`Equivalente en ${otherCur}`}
          value={hidden ? null : `${formatAmount(fromUsd(goal.balance_usd, otherCur, rates), otherCur)} (1 USD = ${formatAmount(bobRate, 'BOB')})`}
        />
        <DetailField label="Meta" value={hidden || goal.target_amount == null ? null : formatAmount(goal.target_amount, cur)} />
        <DetailField label="Fecha meta" value={goal.target_date ? formatDayLabel(goal.target_date, todayISO()) : null} />
        <DetailField label="Reparto" value={repartoLabel(goal)} />
        <DetailField label="Acá va lo que sobre" value={goal.is_catchall ? 'Sí — recibe lo que el reparto no asigne' : null} />
        <DetailField label="Estado" value={goal.goal_reached ? '🎉 Meta cumplida' : null} />
      </div>

      <DondeEstaGuardado goal={goal} hidden={hidden} rates={rates} accounts={accounts} />
      <MesesAhorrados goal={goal} />
    </>
  )
}

/**
 * En qué cuentas vive este ahorro, una por fila.
 *
 * Antes era un `DetailField` con todo pegado en una línea
 * (`Efectivo: Bs 400 · Banco Unión: Bs 300`): con dos cuentas ya se leía mal y
 * con tres se cortaba. Es una lista, así que se dibuja como una — misma caja
 * con filas que la tabla de meses de acá abajo.
 */
function DondeEstaGuardado({ goal, hidden, rates, accounts }: {
  goal: SavingsGoalWithBalance
  hidden: boolean
  rates: RateMap
  accounts: AccountWithBalance[]
}) {
  const filas = goal.by_account
    .map(b => {
      const cuenta = accounts.find(a => a.id === b.account_id)
      return cuenta ? { cuenta, monto: fromUsd(b.amount_usd, cuenta.currency, rates) } : null
    })
    .filter((x): x is { cuenta: AccountWithBalance; monto: number } => !!x)

  if (filas.length === 0) return null

  return (
    <div className="mt-5">
      <SectionTitle>Dónde está guardado</SectionTitle>
      <div className="mt-2 rounded-[var(--fz-r-field)] border border-[var(--fz-hairline)] overflow-hidden">
        {filas.map(({ cuenta, monto }, i) => (
          <div
            key={cuenta.id}
            className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
              i > 0 ? 'border-t border-[var(--fz-hairline)]' : ''
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <CurrencyIcon currency={cuenta.currency} size={22} />
              <span className="text-[13.5px] font-medium truncate">{cuenta.name}</span>
              {cuenta.archived && (
                <span className="shrink-0 text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-3)]">
                  Archivada
                </span>
              )}
            </span>
            <span className="text-[14px] font-semibold fz-num shrink-0">
              {hidden ? HIDDEN : formatAmount(monto, cuenta.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Los meses de este plan, uno por fila: check si ese mes recibió un aporte,
 * guion plomo si no hubo ninguno.
 *
 * El mes en curso no aparece: todavía no terminó, así que marcarlo como "no
 * ahorrado" sería mentir. Y se lee de `saved_periods`, que cuenta tanto lo que
 * se guardó en el reparto de fin de mes como lo que puso un fijo de ahorro —
 * las dos cosas son ahorrar.
 */
function MesesAhorrados({ goal }: { goal: SavingsGoalWithBalance }) {
  const meses = monthsSince(goal.created_at, todayISO())
  const guardados = new Set(goal.saved_periods)
  if (meses.length === 0) return null

  return (
    <div className="mt-5">
      <SectionTitle>Mes a mes</SectionTitle>
      <div className="mt-2 rounded-[var(--fz-r-field)] border border-[var(--fz-hairline)] overflow-hidden">
        {meses.map((m, i) => {
          const ahorrado = guardados.has(m)
          return (
            <div
              key={m}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
                i > 0 ? 'border-t border-[var(--fz-hairline)]' : ''
              }`}
            >
              <span className={`text-[13.5px] capitalize ${ahorrado ? 'font-medium' : 'text-[var(--fz-ink-3)]'}`}>
                {periodLabel(m)}
              </span>
              {ahorrado ? (
                <span className="grid place-items-center w-6 h-6 rounded-full bg-[var(--fz-in-tint)] text-[var(--fz-in-text)] shrink-0">
                  <IconCheck size={14} stroke={2.4} />
                </span>
              ) : (
                <span className="grid place-items-center w-6 h-6 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-3)] shrink-0">
                  <IconMinus size={14} stroke={2.4} />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
