'use client'

import { useState } from 'react'
import { IconAlertTriangle, IconChartPie, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import type { BudgetGeneralProgress, BudgetLineProgress, Currency, RateMap } from '@/lib/finanzas/types'
import { formatAmount, formatBOB, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
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
            {budgets.general && <GeneralBudgetCard general={budgets.general} hidden={hidden} rates={rates} />}

            <SectionTitle
              action={
                <Btn size="sm" onClick={() => setAdding(true)}>
                  <IconPlus size={15} stroke={2} /> Nuevo
                </Btn>
              }
            >
              Por categoría
            </SectionTitle>

            <div className="flex flex-col gap-3">
              {budgets.categories.map(line => (
                <BudgetLineCard
                  key={line.line_id}
                  line={line} hidden={hidden} icon={iconFor(line.category_id)}
                  onView={() => setViewing(line)}
                  onEdit={() => setEditingLine(line)}
                  onDelete={() => setDeleting(line)}
                />
              ))}
            </div>
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
 * es la suma de las de abajo. El Bs de abajo es solo de referencia, al tipo
 * de cambio de hoy — no es una segunda fuente de verdad.
 */
function GeneralBudgetCard({ general, hidden, rates }: { general: BudgetGeneralProgress; hidden: boolean; rates: RateMap }) {
  const capacity = general.amount_usd + general.extended_usd + general.carried_usd
  const pct = capacity > 0 ? Math.round((general.spent_usd / capacity) * 100) : 0
  const tickPct = general.days_in_period > 0 ? (general.day_of_period / general.days_in_period) * 100 : 0
  const alreadyOver = capacity > 0 && general.spent_usd > capacity
  const projectedOver = capacity > 0 && general.projected_usd > capacity

  return (
    <Panel className="flex flex-col gap-3">
      <SectionTitle>Presupuesto general</SectionTitle>

      <div>
        <div className="flex items-baseline gap-2">
          <span className={`text-[30px] font-bold fz-num tracking-[-0.02em] leading-none ${alreadyOver ? 'text-[var(--fz-out-text)]' : ''}`}>
            {hidden ? HIDDEN : formatUSD(general.spent_usd)}
          </span>
          {!hidden && (
            <span className="text-[14px] text-[var(--fz-ink-3)] fz-num">de {formatUSD(capacity)}</span>
          )}
        </div>
        {!hidden && (
          <p className="text-[12px] text-[var(--fz-ink-3)] fz-num">
            ≈ {formatBOB(fromUsd(general.spent_usd, 'BOB', rates))} de {formatBOB(fromUsd(capacity, 'BOB', rates))}
          </p>
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
 * Card por categoría — mismo tratamiento que el general (`<Panel>` a lo
 * ancho, no una mini-card), todo mostrado en la moneda que el usuario
 * eligió para ESTA línea (`input_currency`), aunque por dentro se compare
 * y se sume en USD.
 *
 * Tocar la card abre el detalle (`onView`), nunca la edición directa — el
 * ⋮ es el atajo para quien ya sabe que quiere Editar o Eliminar. El menú
 * va posicionado absoluto en la esquina, afuera del botón grande: un
 * <button> no puede anidar otro, así que son hermanos, no padre-hijo.
 */
function BudgetLineCard({ line, hidden, icon, onView, onEdit, onDelete }: {
  line: BudgetLineProgress
  hidden: boolean
  icon: string | null
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cur = line.input_currency
  // El % y los "¿ya te pasaste?" se deciden en USD (es donde vive el gasto
  // real congelado); lo que se MUESTRA es el nativo, que ya viene resuelto.
  const capacityUsd = (line.amount_usd ?? 0) + line.extended_usd + line.carried_usd
  const pct = capacityUsd > 0 ? Math.round((line.spent_usd / capacityUsd) * 100) : 0
  const tickPct = line.days_in_period > 0 ? (line.day_of_period / line.days_in_period) * 100 : 0
  const alreadyOver = capacityUsd > 0 && line.spent_usd > capacityUsd
  const projectedOver = capacityUsd > 0 && line.projected_usd > capacityUsd

  const spent = line.spent
  const capacity = (line.amount ?? 0) + line.extended + line.carried
  const displayName = line.name ?? line.category_name

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
          <CategoryIcon slug={icon} name={displayName} size={28} />
          <p className="text-[15px] font-semibold truncate min-w-0">{displayName}</p>
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-[20px] font-bold fz-num tracking-[-0.01em] leading-none ${alreadyOver ? 'text-[var(--fz-out-text)]' : ''}`}>
            {hidden ? HIDDEN : formatAmount(spent, cur)}
          </span>
          {!hidden && (
            <span className="text-[13px] text-[var(--fz-ink-3)] fz-num">
              de {line.amount == null ? '—' : formatAmount(capacity, cur)}
            </span>
          )}
        </div>

        <div className="relative h-2 rounded-full bg-[var(--fz-surface-sunk)] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: alreadyOver || pct >= 85 ? 'var(--fz-out)' : 'var(--fz-accent)',
            }}
          />
          <div className="absolute inset-y-0 w-[2px] bg-[var(--fz-ink-3)]" style={{ left: `${Math.min(100, tickPct)}%` }} aria-hidden />
        </div>

        {!hidden && (
          <p className="text-[12px] text-[var(--fz-ink-3)]">
            {alreadyOver
              ? `Ya te pasaste por ${formatAmount(spent - capacity, cur)}`
              : projectedOver
                ? `Te vas a pasar por ~${formatAmount(line.projected - capacity, cur)} si seguís así`
                : `A este ritmo: ${formatAmount(line.projected, cur)}`}
          </p>
        )}
      </button>
    </Panel>
  )
}

/**
 * El resumen que abre <DetailSheet> al tocar una card — todo en la moneda de
 * la línea, con los montos NATIVOS que ya vienen resueltos del server (nunca
 * reconvertidos desde USD: el monto que el usuario escribió es el dato real).
 *
 * El equivalente en la otra moneda sí es una referencia calculada al tipo de
 * cambio de HOY — por eso va junto a la tasa que se usó, para que se lea como
 * lo que es: una conversión del momento, no un segundo registro.
 */
function BudgetDetail({ line, hidden, rates, icon }: {
  line: BudgetLineProgress
  hidden: boolean
  rates: RateMap
  icon: string | null
}) {
  const cur = line.input_currency
  const fmt = (n: number) => formatAmount(n, cur)
  const capacity = (line.amount ?? 0) + line.extended + line.carried
  // Solo tiene sentido mostrar el tope aparte del monto cuando de verdad
  // difiere — si no hubo ampliación ni carry, es el mismo número dos veces.
  const hasAdjustment = line.extended > 0 || line.carried !== 0

  const otherCur: Currency = cur === 'USD' ? 'BOB' : 'USD'
  const bobRate = fromUsd(1, 'BOB', rates)

  return (
    <>
      <DeletePreview
        icon={<CategoryIcon slug={icon} name={line.name ?? line.category_name} size={40} />}
        title={line.name ?? line.category_name}
        subtitle={line.name ? line.category_name : undefined}
        amount={hidden ? HIDDEN : fmt(line.spent)}
      />
      <div>
        <DetailField label="Monto mensual" value={hidden ? null : (line.amount == null ? '—' : fmt(line.amount))} />
        <DetailField
          label={`Equivalente en ${otherCur}`}
          value={
            hidden || line.amount_usd == null
              ? null
              : `${formatAmount(fromUsd(line.amount_usd, otherCur, rates), otherCur)} (1 USD = ${formatAmount(bobRate, 'BOB')})`
          }
        />
        <DetailField label="Ampliado este mes" value={!hidden && line.extended > 0 ? fmt(line.extended) : null} />
        <DetailField
          label={line.carried >= 0 ? 'Llevado del mes pasado' : 'Restado del mes pasado'}
          value={!hidden && line.carried !== 0 ? fmt(Math.abs(line.carried)) : null}
        />
        {hasAdjustment && (
          <DetailField label="Tope total del mes" value={hidden ? null : fmt(capacity)} />
        )}
        <DetailField label="Comprometido (fijos pendientes)" value={!hidden && line.committed > 0 ? fmt(line.committed) : null} />
        <DetailField label="Gastado" value={hidden ? null : fmt(line.spent)} />
        <DetailField
          label="Disponible"
          value={hidden || line.available == null ? null : fmt(line.available)}
        />
      </div>
    </>
  )
}
