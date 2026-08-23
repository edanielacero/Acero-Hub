'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconChartPie, IconPlus } from '@tabler/icons-react'
import type { BudgetGeneralProgress, BudgetLineProgress, RateMap } from '@/lib/finanzas/types'
import { formatAmount, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CategoryIcon } from '../components/category-icon'
import { BudgetClosureSheet } from '../components/budget-closure-sheet'
import { BudgetLineSheet } from '../components/budget-line-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, Panel, SectionTitle } from '../components/ui'

export function PresupuestoScreen() {
  const { budgets, categories, rates, hidden, loading } = useFinanzas()
  const [editingLine, setEditingLine] = useState<BudgetLineProgress | null>(null)
  // Sin target: el propio sheet muestra el selector de categoría. Con target:
  // atajo desde un chip puntual — el sheet lo arranca ya elegido igual.
  const [adding, setAdding] = useState(false)
  const [addingCategory, setAddingCategory] = useState<{ id: string; name: string } | null>(null)
  const [closureOpen, setClosureOpen] = useState(false)

  const hasAnything = budgets.categories.length > 0
  const pendingCount = budgets.pending_closures.length

  const iconFor = (categoryId: string) => categories.find(c => c.id === categoryId)?.icon ?? null

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Presupuesto"
        subtitle="Cuánto te queda por categoría, y en general"
        action={<HideToggle />}
      />

      <div className="flex flex-col gap-4">
        {pendingCount > 0 && (
          <Panel className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--fz-out-text)]">
              <IconAlertTriangle size={18} stroke={2} />
              Tenés {pendingCount} {pendingCount === 1 ? 'mes' : 'meses'} por cerrar
            </span>
            <Btn size="sm" onClick={() => setClosureOpen(true)}>Revisar</Btn>
          </Panel>
        )}

        {loading && !hasAnything ? (
          <Panel><p className="text-[14px] text-[var(--fz-ink-3)] py-8 text-center">Cargando…</p></Panel>
        ) : !hasAnything ? (
          <Panel>
            <EmptyState
              icon={IconChartPie}
              title="Todavía no armaste tu presupuesto"
              description="Poné un tope por categoría —Comida, Transporte, lo que sea— y la app te avisa antes de pasarte. El general se arma solo, sumando tus categorías."
              action={<Btn onClick={() => setAdding(true)}>Crear el primero</Btn>}
            />
          </Panel>
        ) : (
          <>
            {budgets.general && <GeneralBudgetCard general={budgets.general} hidden={hidden} />}

            <Panel>
              <SectionTitle
                action={
                  <button
                    type="button" onClick={() => setAdding(true)}
                    className="flex items-center gap-1 text-[13px] font-semibold text-[var(--fz-accent)]"
                  >
                    <IconPlus size={15} stroke={2} /> Nuevo
                  </button>
                }
              >
                Por categoría
              </SectionTitle>

              {budgets.categories.length > 0 && (
                <div className="grid grid-cols-2 min-[600px]:grid-cols-3 gap-2.5 mt-3">
                  {budgets.categories.map(line => (
                    <BudgetLineMiniCard
                      key={line.line_id}
                      line={line} hidden={hidden} rates={rates} icon={iconFor(line.category_id)}
                      onEdit={() => setEditingLine(line)}
                    />
                  ))}
                </div>
              )}

              {budgets.categories_without_line.length > 0 && (
                <div className={budgets.categories.length > 0 ? 'mt-4 pt-4 border-t border-[var(--fz-hairline)]' : 'mt-3'}>
                  <p className="text-[13px] font-medium text-[var(--fz-ink-2)] mb-2">Agregar categoría</p>
                  <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                    {budgets.categories_without_line.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAddingCategory(c)}
                        className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]"
                      >
                        <IconPlus size={15} stroke={2} /> {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>

      {(adding || addingCategory) && (
        <BudgetLineSheet
          target={addingCategory ? { categoryId: addingCategory.id, categoryName: addingCategory.name } : undefined}
          onClose={() => { setAdding(false); setAddingCategory(null) }}
          onSaved={() => { setAdding(false); setAddingCategory(null) }}
        />
      )}

      {editingLine && (
        <BudgetLineSheet
          editing={editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={() => setEditingLine(null)}
        />
      )}

      {closureOpen && (
        <BudgetClosureSheet onClose={() => setClosureOpen(false)} onDone={() => setClosureOpen(false)} />
      )}
    </div>
  )
}

/**
 * El card grande: el agregado de todas las categorías presupuestadas,
 * siempre en USD (cada categoría puede tener su propia moneda de entrada —
 * sumarlas necesita una unidad común). No se puede tocar: no es una línea,
 * es la suma de las de abajo.
 */
function GeneralBudgetCard({ general, hidden }: { general: BudgetGeneralProgress; hidden: boolean }) {
  const capacity = general.amount_usd + general.extended_usd + general.carried_usd
  const pct = capacity > 0 ? Math.round((general.spent_usd / capacity) * 100) : 0
  const tickPct = general.days_in_period > 0 ? (general.day_of_period / general.days_in_period) * 100 : 0
  const alreadyOver = capacity > 0 && general.spent_usd > capacity
  const projectedOver = capacity > 0 && general.projected_usd > capacity

  return (
    <Panel className="flex flex-col gap-3">
      <SectionTitle>Presupuesto general</SectionTitle>

      <div className="flex items-baseline gap-2">
        <span className={`text-[30px] font-bold fz-num tracking-[-0.02em] leading-none ${alreadyOver ? 'text-[var(--fz-out-text)]' : ''}`}>
          {hidden ? HIDDEN : formatUSD(general.spent_usd)}
        </span>
        {!hidden && (
          <span className="text-[14px] text-[var(--fz-ink-3)] fz-num">de {formatUSD(capacity)}</span>
        )}
      </div>

      <div className="relative h-3 rounded-full bg-[var(--fz-surface-sunk)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: alreadyOver || pct >= 85 ? 'var(--fz-out)' : 'var(--fz-accent)',
          }}
        />
        <div className="absolute inset-y-0 w-[2px] bg-[var(--fz-ink-3)]" style={{ left: `${Math.min(100, tickPct)}%` }} aria-hidden />
      </div>

      <p className="text-[13px] text-[var(--fz-ink-3)]">
        {alreadyOver
          ? `Ya te pasaste por ${formatUSD(general.spent_usd - capacity)}`
          : projectedOver
            ? `Te vas a pasar por ~${formatUSD(general.projected_usd - capacity)} si seguís así`
            : `A este ritmo: ${formatUSD(general.projected_usd)} el día ${general.days_in_period}`}
      </p>
    </Panel>
  )
}

/**
 * Mini-card por categoría. Todo se muestra en la moneda que el usuario
 * eligió para ESTA línea (`input_currency`) — nunca en USD, aunque por
 * dentro se compare y se sume en USD.
 */
function BudgetLineMiniCard({ line, hidden, rates, icon, onEdit }: {
  line: BudgetLineProgress
  hidden: boolean
  rates: RateMap
  icon: string | null
  onEdit: () => void
}) {
  const cur = line.input_currency
  const capacityUsd = (line.amount_usd ?? 0) + line.extended_usd + line.carried_usd
  const pct = capacityUsd > 0 ? Math.round((line.spent_usd / capacityUsd) * 100) : 0
  const tickPct = line.days_in_period > 0 ? (line.day_of_period / line.days_in_period) * 100 : 0
  const alreadyOver = capacityUsd > 0 && line.spent_usd > capacityUsd
  const projectedOver = capacityUsd > 0 && line.projected_usd > capacityUsd

  const spent = fromUsd(line.spent_usd, cur, rates)
  const capacity = fromUsd(capacityUsd, cur, rates)
  const displayName = line.name ?? line.category_name

  return (
    <button
      type="button" onClick={onEdit}
      className="text-left rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3 flex flex-col gap-2 min-w-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <CategoryIcon slug={icon} name={displayName} size={22} />
        <p className="text-[13px] font-semibold truncate min-w-0">{displayName}</p>
      </div>

      <div className="relative h-1.5 rounded-full bg-[var(--fz-surface)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: alreadyOver || pct >= 85 ? 'var(--fz-out)' : 'var(--fz-accent)',
          }}
        />
        <div className="absolute inset-y-0 w-[2px] bg-[var(--fz-ink-3)]" style={{ left: `${Math.min(100, tickPct)}%` }} aria-hidden />
      </div>

      <span className={`text-[12px] font-semibold fz-num truncate ${alreadyOver ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-2)]'}`}>
        {hidden ? HIDDEN : `${formatAmount(spent, cur)} / ${line.amount_usd == null ? '—' : formatAmount(capacity, cur)}`}
      </span>

      {!hidden && (
        <p className="text-[11px] text-[var(--fz-ink-3)] truncate">
          {alreadyOver
            ? `+${formatAmount(fromUsd(line.spent_usd - capacityUsd, cur, rates), cur)} pasado`
            : projectedOver
              ? `~${formatAmount(fromUsd(line.projected_usd - capacityUsd, cur, rates), cur)} de más`
              : `Ritmo: ${formatAmount(fromUsd(line.projected_usd, cur, rates), cur)}`}
        </p>
      )}
    </button>
  )
}
