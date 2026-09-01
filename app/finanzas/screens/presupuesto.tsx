'use client'

import { useState } from 'react'
import {
  IconAlertTriangle, IconArrowBackUp, IconChartHistogram, IconChartPie, IconListSearch,
  IconPencil, IconPlus, IconTrash,
} from '@tabler/icons-react'
import type { BudgetGeneralProgress, BudgetLineProgress, Currency, RateMap } from '@/lib/finanzas/types'
import { budgetBarView, periodStart, previousPeriod, type BudgetViewMode } from '@/lib/finanzas/budgets'
import { formatAmount, formatBOB, formatUSD, fromUsd, HIDDEN } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { HideToggle } from '../components/amount'
import { useBudgetViewPref } from '../components/budget-view-pref'
import { useFinanzas } from '../components/data-context'
import { CategoryIcon } from '../components/category-icon'
import { BudgetClosureSheet } from '../components/budget-closure-sheet'
import { BudgetLineSheet } from '../components/budget-line-sheet'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { DetailField, DetailSheet } from '../components/detail-sheet'
import { FzLink, useFzRouter } from '../components/router'
import { PageHeader } from '../components/tx-row'
import { Btn, EmptyState, Panel, RowMenu, SectionTitle } from '../components/ui'
import { fzFetch } from '../components/fz-fetch'
import { BudgetBar } from '../components/budget-bar'

export function PresupuestoScreen() {
  const { budgets, categories, rates, hidden, loading, reload } = useFinanzas()
  const { navigate } = useFzRouter()
  const { mode: viewMode } = useBudgetViewPref()
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<BudgetLineProgress | null>(null)
  const [editingLine, setEditingLine] = useState<BudgetLineProgress | null>(null)
  const [deleting, setDeleting] = useState<BudgetLineProgress | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)
  const [undoingCarry, setUndoingCarry] = useState(false)

  const hasAnything = budgets.categories.length > 0
  const pendingCount = budgets.pending_closures.length

  const iconFor = (categoryId: string) => categories.find(c => c.id === categoryId)?.icon ?? null

  async function confirmDelete() {
    if (!deleting) return
    setConfirmingDelete(true)
    await fzFetch(`/api/finanzas/budgets/${deleting.line_id}`, { method: 'DELETE' })
    await reload()
    setConfirmingDelete(false)
    setDeleting(null)
  }

  /**
   * Deshace el "llevar al próximo mes" del cierre anterior: el mes pasado
   * sigue cerrado y con su sobrante congelado, pero deja de sumarse acá, así
   * que este mes vuelve a su presupuesto original.
   *
   * El período que se toca es el ANTERIOR al vigente — es de donde sale el
   * carry que se está viendo (`carriedInto` mira un solo salto atrás).
   */
  async function deshacerCarry(line: BudgetLineProgress) {
    setUndoingCarry(true)
    const res = await fzFetch(`/api/finanzas/budgets/${line.line_id}/close`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: previousPeriod(periodStart(todayISO())), carried: false }),
    })
    if (res.ok) await reload()
    setUndoingCarry(false)
    setViewing(null)
  }

  /**
   * Los gastos que hay detrás del número de la card. Va a Movimientos con los
   * filtros puestos por URL — mismo mes del presupuesto, esa categoría, y solo
   * gastos — así que la pantalla se puede recargar o compartir y sigue
   * mostrando lo mismo.
   */
  function verMovimientos(line: BudgetLineProgress) {
    const params = new URLSearchParams({
      category: line.category_ids.join(','),
      type: 'gasto',
      month: todayISO().slice(0, 7),
    })
    navigate(`/finanzas/movimientos?${params}`)
  }

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader
        title="Presupuesto"
        subtitle="Cuánto te queda por categoría, y en general"
        action={
          <>
            {/* Mismo tamaño y forma que el ojo: los dos son atajos de la
                cabecera, no acciones del contenido. */}
            <FzLink
              href="/finanzas/presupuesto/historial"
              aria-label="Historial de presupuestos"
              className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] hover:text-[var(--fz-ink)] transition-colors"
            >
              <IconChartHistogram size={18} stroke={1.8} />
            </FzLink>
            <HideToggle />
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {pendingCount > 0 && (
          <Panel className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--fz-out-text)]">
              <IconAlertTriangle size={18} stroke={2} />
              {/* Cuenta presupuestos-mes, no meses: tres líneas con agosto sin
                  responder son tres preguntas, no tres meses. */}
              Tienes {pendingCount} {pendingCount === 1 ? 'presupuesto' : 'presupuestos'} por cerrar
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
              description="Pon un tope por categoría —Comida, Transporte, lo que sea— y la app te avisa antes de pasarte. El total se arma solo, sumando tus categorías."
              action={<Btn onClick={() => setAdding(true)}>Crear el primero</Btn>}
            />
          </Panel>
        ) : (
          <>
            {budgets.general && <GeneralBudgetCard general={budgets.general} hidden={hidden} rates={rates} mode={viewMode} />}

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
                  line={line} hidden={hidden} mode={viewMode} icon={iconFor(line.category_ids[0])}
                  onView={() => setViewing(line)}
                  onEdit={() => setEditingLine(line)}
                  onDelete={() => setDeleting(line)}
                  onSeeMovements={() => verMovimientos(line)}
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
        {viewing && (
          <BudgetDetail
            line={viewing} hidden={hidden} rates={rates} icon={iconFor(viewing.category_ids[0])}
            undoingCarry={undoingCarry}
            onUndoCarry={() => deshacerCarry(viewing)}
          />
        )}
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
            icon={<CategoryIcon slug={iconFor(deleting.category_ids[0])} name={deleting.name ?? deleting.category_names.join(', ')} size={40} />}
            title={deleting.name ?? deleting.category_names.join(', ')}
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
function GeneralBudgetCard({ general, hidden, rates, mode }: {
  general: BudgetGeneralProgress; hidden: boolean; rates: RateMap; mode: BudgetViewMode
}) {
  const capacity = general.amount_usd + general.extended_usd + general.carried_usd
  const view = budgetBarView({
    mode, spentUsd: general.spent_usd, availableUsd: general.available_usd, capacityUsd: capacity,
    committedUsd: general.committed_usd,
    spent: general.spent_usd, available: general.available_usd,
    day: general.day_of_period, days: general.days_in_period,
  })

  return (
    <Panel className="flex flex-col gap-3">
      <SectionTitle>Presupuesto total</SectionTitle>

      <div>
        <p className="text-[11px] font-bold text-[var(--fz-ink-3)] uppercase tracking-[0.08em]">
          {mode === 'disponible' ? 'Disponible' : 'Gastado'}
        </p>
        <div className="flex items-baseline gap-2">
          <span className={`text-[30px] font-bold fz-num tracking-[-0.02em] leading-none ${view.danger ? 'text-[var(--fz-out-text)]' : ''}`}>
            {hidden ? HIDDEN : formatUSD(view.value)}
          </span>
          {!hidden && (
            <span className="text-[14px] text-[var(--fz-ink-3)] fz-num">de {formatUSD(capacity)}</span>
          )}
        </div>
        {!hidden && (
          <p className="text-[12px] text-[var(--fz-ink-3)] fz-num">
            ≈ {formatBOB(fromUsd(view.value, 'BOB', rates))} de {formatBOB(fromUsd(capacity, 'BOB', rates))}
          </p>
        )}
      </div>

      <BudgetBar view={view} />

      {/* En modo "disponible" el número grande es lo que queda, no lo gastado
          — sin esto no había ningún lugar que dijera el acumulado real. El
          reservado va al lado porque es la otra mitad de la explicación: el
          disponible ya lo descontó, y el tramo tenue de la barra es ese. */}
      {!hidden && (mode === 'disponible' || general.committed_usd > 0) && (
        <p className="text-[13px] text-[var(--fz-ink-3)]">
          {mode === 'disponible' && `Llevas gastado ${formatUSD(general.spent_usd)}`}
          {mode === 'disponible' && general.committed_usd > 0 && ' · '}
          {general.committed_usd > 0 && `${formatUSD(general.committed_usd)} reservados para Gastos Fijos`}
        </p>
      )}
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
function BudgetLineCard({ line, hidden, mode, icon, onView, onEdit, onDelete, onSeeMovements }: {
  line: BudgetLineProgress
  hidden: boolean
  mode: BudgetViewMode
  icon: string | null
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onSeeMovements: () => void
}) {
  const cur = line.input_currency
  const capacityUsd = (line.amount_usd ?? 0) + line.extended_usd + line.carried_usd
  const capacity = (line.amount ?? 0) + line.extended + line.carried
  const view = budgetBarView({
    mode, spentUsd: line.spent_usd, availableUsd: line.available_usd ?? 0, capacityUsd,
    committedUsd: line.committed_usd,
    spent: line.spent, available: line.available ?? 0,
    day: line.day_of_period, days: line.days_in_period,
  })
  const displayName = line.name ?? line.category_names.join(', ')

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

        <div>
          <p className="text-[11px] font-bold text-[var(--fz-ink-3)] uppercase tracking-[0.08em]">
            {mode === 'disponible' ? 'Disponible' : 'Gastado'}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-[20px] font-bold fz-num tracking-[-0.01em] leading-none ${view.danger ? 'text-[var(--fz-out-text)]' : ''}`}>
              {hidden ? HIDDEN : formatAmount(view.value, cur)}
            </span>
            {!hidden && (
              <span className="text-[13px] text-[var(--fz-ink-3)] fz-num">
                de {line.amount == null ? '—' : formatAmount(capacity, cur)}
              </span>
            )}
          </div>
        </div>

        <BudgetBar view={view} size="sm" />

        {!hidden && (mode === 'disponible' || line.committed > 0) && (
          <p className="text-[12px] text-[var(--fz-ink-3)]">
            {mode === 'disponible' && `Llevas gastado ${formatAmount(line.spent, cur)}`}
            {mode === 'disponible' && line.committed > 0 && ' · '}
            {line.committed > 0 && `${formatAmount(line.committed, cur)} reservados para Gastos Fijos`}
          </p>
        )}
      </button>

      {/* Afuera del <button> de arriba: un botón no puede anidar otro. */}
      <div className="mt-3 pt-3 border-t border-[var(--fz-hairline)]">
        <button
          type="button" onClick={onSeeMovements}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--fz-accent)]"
        >
          <IconListSearch size={15} stroke={1.8} /> Ver movimientos
        </button>
      </div>
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
function BudgetDetail({ line, hidden, rates, icon, undoingCarry, onUndoCarry }: {
  line: BudgetLineProgress
  hidden: boolean
  rates: RateMap
  icon: string | null
  undoingCarry: boolean
  /** Devuelve el mes a su presupuesto original, sin lo que vino del anterior. */
  onUndoCarry: () => void
}) {
  const cur = line.input_currency
  const fmt = (n: number) => formatAmount(n, cur)
  const capacity = (line.amount ?? 0) + line.extended + line.carried
  // Solo tiene sentido mostrar el tope aparte del monto cuando de verdad
  // difiere — si no hubo ampliación ni carry, es el mismo número dos veces.
  const hasAdjustment = line.extended > 0 || line.carried !== 0

  const otherCur: Currency = cur === 'USD' ? 'BOB' : 'USD'
  const bobRate = fromUsd(1, 'BOB', rates)

  const categoryNames = line.category_names.join(', ')
  // Solo hace falta mostrar las categorías aparte cuando el alias las tapa,
  // o cuando son varias — con una sola y sin alias, el título ya lo dice.
  const showCategories = !!line.name || line.category_ids.length > 1

  return (
    <>
      <DeletePreview
        icon={<CategoryIcon slug={icon} name={line.name ?? categoryNames} size={40} />}
        title={line.name ?? categoryNames}
        subtitle={line.name ? categoryNames : undefined}
        amount={hidden ? HIDDEN : fmt(line.spent)}
      />
      <div>
        <DetailField label="Categorías" value={showCategories ? categoryNames : null} />
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
        {/* Cambiar de idea sobre el mes pasado sin tener que ir a buscarlo:
            es acá donde se ve el efecto, así que es acá donde se deshace. */}
        {line.carried !== 0 && (
          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--fz-hairline)] last:border-0">
            <span className="text-[13px] text-[var(--fz-ink-2)]">
              {line.carried >= 0
                ? 'Ese sobrante no tiene por qué quedarse'
                : 'Ese sobregasto no tiene por qué quedarse'}
            </span>
            <Btn size="sm" variant="ghost" onClick={onUndoCarry} disabled={undoingCarry}>
              <IconArrowBackUp size={15} stroke={2} /> Deshacer
            </Btn>
          </div>
        )}
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
