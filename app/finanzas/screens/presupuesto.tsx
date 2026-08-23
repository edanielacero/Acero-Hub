'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconChartPie, IconPencil, IconPlus, IconWand } from '@tabler/icons-react'
import type { BudgetLineProgress, RateMap } from '@/lib/finanzas/types'
import { formatBOB, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CategoryIcon } from '../components/category-icon'
import { BudgetClosureSheet } from '../components/budget-closure-sheet'
import { BudgetLineSheet } from '../components/budget-line-sheet'
import { BudgetWizardSheet } from '../components/budget-wizard-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, Panel, SectionTitle } from '../components/ui'

export function PresupuestoScreen() {
  const { budgets, categories, rates, hidden, loading } = useFinanzas()
  const [editingLine, setEditingLine] = useState<BudgetLineProgress | null>(null)
  const [addingCategory, setAddingCategory] = useState<{ id: string; name: string } | null>(null)
  const [addingGeneral, setAddingGeneral] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)

  const hasAnything = !!budgets.general || budgets.categories.length > 0
  const pendingCount = budgets.pending_closures.length

  const iconFor = (categoryId: string | null) =>
    categoryId ? categories.find(c => c.id === categoryId)?.icon ?? null : null

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
              description="Poné un tope por categoría —Comida, Transporte, lo que sea— y la app te avisa antes de pasarte."
              action={
                <div className="flex gap-2">
                  <Btn variant="soft" onClick={() => setWizardOpen(true)}>
                    <IconWand size={16} stroke={1.8} /> Armar con el wizard
                  </Btn>
                  <Btn onClick={() => setAddingGeneral(true)}>Crear el primero</Btn>
                </div>
              }
            />
          </Panel>
        ) : (
          <>
            {budgets.general && (
              <Panel>
                <SectionTitle>General</SectionTitle>
                <BudgetLineCard
                  line={budgets.general} hidden={hidden} rates={rates} icon={null}
                  onEdit={() => setEditingLine(budgets.general)}
                />
              </Panel>
            )}

            <Panel>
              <SectionTitle
                action={
                  budgets.categories_without_line.length > 0 ? (
                    <Btn size="sm" variant="soft" onClick={() => setWizardOpen(true)}>
                      <IconWand size={15} stroke={1.8} /> Wizard
                    </Btn>
                  ) : undefined
                }
              >
                Por categoría
              </SectionTitle>

              {budgets.categories.length > 0 && (
                <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
                  {budgets.categories.map(line => (
                    <div key={line.line_id} className="py-4 first:pt-0 last:pb-0">
                      <BudgetLineCard
                        line={line} hidden={hidden} rates={rates} icon={iconFor(line.category_id)}
                        onEdit={() => setEditingLine(line)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {budgets.categories_without_line.length > 0 && (
                <div className={budgets.categories.length > 0 ? 'mt-4 pt-4 border-t border-[var(--fz-hairline)]' : ''}>
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

              {!budgets.general && (
                <div className="mt-4">
                  <Btn variant="ghost" size="sm" onClick={() => setAddingGeneral(true)}>
                    <IconPlus size={16} stroke={2} /> Agregar presupuesto general
                  </Btn>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>

      {(addingCategory || addingGeneral) && (
        <BudgetLineSheet
          target={addingCategory
            ? { categoryId: addingCategory.id, categoryName: addingCategory.name }
            : { categoryId: null, categoryName: 'Presupuesto general' }}
          onClose={() => { setAddingCategory(null); setAddingGeneral(false) }}
          onSaved={() => { setAddingCategory(null); setAddingGeneral(false) }}
        />
      )}

      {editingLine && (
        <BudgetLineSheet
          editing={editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={() => setEditingLine(null)}
        />
      )}

      {wizardOpen && (
        <BudgetWizardSheet onClose={() => setWizardOpen(false)} onDone={() => setWizardOpen(false)} />
      )}

      {closureOpen && (
        <BudgetClosureSheet onClose={() => setClosureOpen(false)} onDone={() => setClosureOpen(false)} />
      )}
    </div>
  )
}

function BudgetLineCard({ line, hidden, rates, icon, onEdit }: {
  line: BudgetLineProgress
  hidden: boolean
  rates: RateMap
  icon: string | null
  onEdit: () => void
}) {
  const capacity = (line.amount_usd ?? 0) + line.extended_usd + line.carried_usd
  const pct = capacity > 0 ? Math.round((line.spent_usd / capacity) * 100) : 0
  const tickPct = line.days_in_period > 0 ? (line.day_of_period / line.days_in_period) * 100 : 0
  const alreadyOver = capacity > 0 && line.spent_usd > capacity
  const projectedOver = capacity > 0 && line.projected_usd > capacity
  const bob = fromUsd(line.spent_usd, 'BOB', rates)

  return (
    <button type="button" onClick={onEdit} className="w-full text-left group">
      <div className="flex items-center gap-2.5 mb-2">
        <CategoryIcon slug={icon} name={line.category_name ?? 'General'} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold truncate">{line.name ?? line.category_name ?? 'Presupuesto general'}</p>
          {(line.extended_usd > 0 || line.carried_usd !== 0) && (
            <p className="text-[11px] text-[var(--fz-ink-3)] truncate">
              {line.extended_usd > 0 && `+${formatUSD(line.extended_usd)} ampliado`}
              {line.extended_usd > 0 && line.carried_usd !== 0 && ' · '}
              {line.carried_usd !== 0 && `${line.carried_usd > 0 ? '+' : ''}${formatUSD(line.carried_usd)} del mes pasado`}
            </p>
          )}
        </div>
        <IconPencil size={14} stroke={1.8} className="text-[var(--fz-ink-3)] opacity-0 group-hover:opacity-100 shrink-0" />
        <span className={`text-[13px] font-semibold fz-num shrink-0 ${alreadyOver ? 'text-[var(--fz-out-text)]' : ''}`}>
          {hidden ? HIDDEN : `${formatUSD(line.spent_usd)} / ${line.amount_usd == null ? '—' : formatUSD(capacity)}`}
        </span>
      </div>

      <div className="relative h-2 rounded-full bg-[var(--fz-surface-sunk)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: alreadyOver || pct >= 85 ? 'var(--fz-out)' : 'var(--fz-accent)',
          }}
        />
        {/* El tick de referencia: "acá deberías estar hoy" según el día del mes. */}
        <div className="absolute inset-y-0 w-[2px] bg-[var(--fz-ink-3)]" style={{ left: `${Math.min(100, tickPct)}%` }} aria-hidden />
      </div>

      <p className="mt-1.5 text-[12px] text-[var(--fz-ink-3)]">
        {!hidden && `${formatBOB(bob)} · `}
        {alreadyOver
          ? `Ya te pasaste por ${formatUSD(line.spent_usd - capacity)}`
          : projectedOver
            ? `Te vas a pasar por ~${formatUSD(line.projected_usd - capacity)} si seguís así`
            : `A este ritmo: ${formatUSD(line.projected_usd)} el día ${line.days_in_period}`}
      </p>
    </button>
  )
}
