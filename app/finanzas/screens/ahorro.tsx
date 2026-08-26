'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconPigMoney, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import type { RateMap, SavingsGoalWithBalance } from '@/lib/finanzas/types'
import { ALLOCATION_TYPE_LABEL } from '@/lib/finanzas/savings'
import { formatAmount, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { CURRENCY_META } from '@/lib/finanzas/types'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CurrencyIcon } from '../components/currency-icon'
import { SavingsClosureSheet } from '../components/savings-closure-sheet'
import { SavingsGoalSheet } from '../components/savings-goal-sheet'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, formatDayLabel, Panel, RowMenu, SectionTitle } from '../components/ui'

export function AhorroScreen() {
  const { savings, hidden, rates, loading, reload } = useFinanzas()
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<SavingsGoalWithBalance | null>(null)
  const [editingGoal, setEditingGoal] = useState<SavingsGoalWithBalance | null>(null)
  const [deleting, setDeleting] = useState<SavingsGoalWithBalance | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)

  const hasAnything = savings.goals.length > 0

  async function confirmDelete() {
    if (!deleting) return
    setConfirmingDelete(true)
    await fetch(`/api/finanzas/savings-goals/${deleting.id}`, { method: 'DELETE' })
    await reload()
    setConfirmingDelete(false)
    setDeleting(null)
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Ahorros"
        subtitle="El sobrante de cada mes, repartido en tus ahorros"
        action={<HideToggle />}
      />

      <div className="flex flex-col gap-4">
        {savings.pending_period && (
          <Panel className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--fz-out-text)]">
              <IconAlertTriangle size={18} stroke={2} />
              Tienes un mes por repartir
            </span>
            <Btn size="sm" onClick={() => setClosureOpen(true)}>Revisar</Btn>
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
              action={<Btn onClick={() => setAdding(true)}>Crear el primero</Btn>}
            />
          </Panel>
        ) : (
          <>
            <SectionTitle
              action={
                <Btn size="sm" onClick={() => setAdding(true)}>
                  <IconPlus size={15} stroke={2} /> Nuevo
                </Btn>
              }
            >
              Tus ahorros
            </SectionTitle>

            <div className="flex flex-col gap-3">
              {savings.goals.filter(g => !g.archived).map(g => (
                <GoalCard
                  key={g.id}
                  goal={g} hidden={hidden} rates={rates}
                  onView={() => setViewing(g)}
                  onEdit={() => setEditingGoal(g)}
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
        {viewing && <GoalDetail goal={viewing} hidden={hidden} rates={rates} />}
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

      {closureOpen && (
        <SavingsClosureSheet onClose={() => setClosureOpen(false)} onDone={() => setClosureOpen(false)} />
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
function GoalCard({ goal, hidden, rates, onView, onEdit, onDelete }: {
  goal: SavingsGoalWithBalance
  hidden: boolean
  rates: RateMap
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cur = goal.input_currency
  const hasTarget = goal.target_amount != null
  const fillPct = hasTarget ? Math.min(100, Math.round((goal.balance / goal.target_amount!) * 100)) : 0

  return (
    <Panel className="relative">
      <div className="absolute top-4 right-4 z-10">
        <RowMenu
          items={[
            { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: onEdit },
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
    </Panel>
  )
}

function GoalDetail({ goal, hidden, rates }: {
  goal: SavingsGoalWithBalance
  hidden: boolean
  rates: RateMap
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
    </>
  )
}
