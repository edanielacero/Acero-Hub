'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconChartPie, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import type { BudgetGeneralProgress, BudgetLineProgress, RateMap } from '@/lib/finanzas/types'
import { formatAmount, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { HideToggle } from '../components/amount'
import { useFinanzas } from '../components/data-context'
import { CategoryIcon } from '../components/category-icon'
import { BudgetClosureSheet } from '../components/budget-closure-sheet'
import { BudgetLineSheet } from '../components/budget-line-sheet'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, Panel, RowMenu, SectionTitle } from '../components/ui'

export function PresupuestoScreen() {
  const { budgets, categories, rates, hidden, loading, reload } = useFinanzas()
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<BudgetLineProgress | null>(null)
  const [editingLine, setEditingLine] = useState<BudgetLineProgress | null>(null)
  const [deleting, setDeleting] = useState<BudgetLineProgress | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)

  const hasAnything = budgets.categories.length > 0
  const pendingCount = budgets.pending_closures.length

  const iconFor = (categoryId: string) => categories.find(c => c.id === categoryId)?.icon ?? null

  async function confirmDelete() {
    if (!deleting) return
    setConfirmingDelete(true)
    await fetch(`/api/finanzas/budgets/${deleting.line_id}`, { method: 'DELETE' })
    await reload()
    setConfirmingDelete(false)
    setDeleting(null)
  }

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

              <div className="grid grid-cols-2 min-[600px]:grid-cols-3 gap-2.5 mt-3">
                {budgets.categories.map(line => (
                  <BudgetLineMiniCard
                    key={line.line_id}
                    line={line} hidden={hidden} rates={rates} icon={iconFor(line.category_id)}
                    onView={() => setViewing(line)}
                    onEdit={() => setEditingLine(line)}
                    onDelete={() => setDeleting(line)}
                  />
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>

      {adding && (
        <BudgetLineSheet
          onClose={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {editingLine && (
        <BudgetLineSheet
          editing={editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={() => setEditingLine(null)}
        />
      )}

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Presupuesto"
        onEdit={() => { const l = viewing!; setViewing(null); setEditingLine(l) }}
        onDelete={() => { const l = viewing!; setViewing(null); setDeleting(l) }}
      >
        {viewing && <BudgetDetail line={viewing} hidden={hidden} rates={rates} icon={iconFor(viewing.category_id)} />}
      </DetailSheet>

      <DeleteConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminar presupuesto"
        confirming={confirmingDelete}
      >
        {deleting && (
          <DeletePreview
            icon={<CategoryIcon slug={iconFor(deleting.category_id)} name={deleting.name ?? deleting.category_name} size={40} />}
            title={deleting.name ?? deleting.category_name}
            subtitle="Se borra la configuración — tus movimientos ya registrados no se tocan"
          />
        )}
      </DeleteConfirmSheet>

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
 *
 * Tocar la card abre el detalle (`onView`), nunca la edición directa — el
 * ⋮ es el atajo para quien ya sabe que quiere Editar o Eliminar. El menú
 * va posicionado absoluto en la esquina, afuera del botón grande: un
 * <button> no puede anidar otro, así que son hermanos, no padre-hijo.
 */
function BudgetLineMiniCard({ line, hidden, rates, icon, onView, onEdit, onDelete }: {
  line: BudgetLineProgress
  hidden: boolean
  rates: RateMap
  icon: string | null
  onView: () => void
  onEdit: () => void
  onDelete: () => void
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
    <div className="relative rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] min-w-0">
      <div className="absolute top-2 right-2 z-10">
        <RowMenu
          items={[
            { label: 'Editar', icon: <IconPencil size={16} stroke={1.8} />, onClick: onEdit },
            { label: 'Eliminar', icon: <IconTrash size={16} stroke={1.8} />, onClick: onDelete, danger: true },
          ]}
        />
      </div>

      <button type="button" onClick={onView} className="w-full text-left p-3 flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 pr-7">
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
    </div>
  )
}

/** El resumen que abre <DetailSheet> al tocar una mini-card — todo en la
    moneda de la línea, igual que la card. */
function BudgetDetail({ line, hidden, rates, icon }: {
  line: BudgetLineProgress
  hidden: boolean
  rates: RateMap
  icon: string | null
}) {
  const cur = line.input_currency
  const conv = (usd: number) => formatAmount(fromUsd(usd, cur, rates), cur)
  const capacityUsd = (line.amount_usd ?? 0) + line.extended_usd + line.carried_usd

  return (
    <>
      <DeletePreview
        icon={<CategoryIcon slug={icon} name={line.name ?? line.category_name} size={40} />}
        title={line.name ?? line.category_name}
        subtitle={line.name ? line.category_name : undefined}
        amount={hidden ? HIDDEN : conv(line.spent_usd)}
      />
      <div>
        <DetailField label="Monto mensual" value={hidden ? null : (line.amount_usd == null ? '—' : conv(line.amount_usd))} />
        <DetailField label="Ampliado este mes" value={!hidden && line.extended_usd > 0 ? conv(line.extended_usd) : null} />
        <DetailField
          label={line.carried_usd >= 0 ? 'Llevado del mes pasado' : 'Restado del mes pasado'}
          value={!hidden && line.carried_usd !== 0 ? conv(Math.abs(line.carried_usd)) : null}
        />
        <DetailField label="Comprometido (fijos pendientes)" value={!hidden && line.committed_usd > 0 ? conv(line.committed_usd) : null} />
        <DetailField label="Gastado" value={hidden ? null : conv(line.spent_usd)} />
        <DetailField
          label="Disponible"
          value={hidden || line.available_usd == null ? null : conv(line.available_usd)}
        />
        <DetailField label="Tope total del mes" value={hidden ? null : conv(capacityUsd)} />
      </div>
    </>
  )
}
