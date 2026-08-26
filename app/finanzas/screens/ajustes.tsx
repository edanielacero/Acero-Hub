'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconArchive, IconCheck, IconGripVertical, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import type { Category, CategoryKind, Currency, PersonWithDebt } from '@/lib/finanzas/types'
import { CURRENCY_META, RATED_CURRENCIES } from '@/lib/finanzas/types'
import type { BudgetViewMode } from '@/lib/finanzas/budgets'
import { PAIRS_FOR_CURRENCY, QUOTE_META } from '@/lib/finanzas/quotes'
import { amountFromInput, formatUSD, HIDDEN, parseDecimalInput } from '@/lib/finanzas/money'
import { CurrencyIcon } from '../components/currency-icon'
import { CategoryIcon, IconPickerGrid } from '../components/category-icon'
import { useBudgetViewPref } from '../components/budget-view-pref'
import { useFinanzas } from '../components/data-context'
import { DeleteConfirmSheet, DeletePreview } from '../components/delete-confirm'
import { PageHeader } from '../components/tx-row'
import { Btn, ErrorNote, Label, Panel, PersonAvatar, RowMenu, SectionTitle, SelectField, TextField } from '../components/ui'

/** "hace 3 min" es más útil que un timestamp para saber si una tasa está fresca. */
function relativo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.round(mins / 60)
  if (hs < 24) return `hace ${hs} h`
  return `hace ${Math.round(hs / 24)} d`
}

const BUDGET_VIEW_OPTIONS: { value: BudgetViewMode; label: string; hint: string }[] = [
  {
    value: 'gastado',
    label: 'Cuánto vas gastando',
    hint: 'La barra arranca vacía y el número grande es lo gastado, hasta llegar al tope.',
  },
  {
    value: 'disponible',
    label: 'Cuánto te queda',
    hint: 'La barra arranca llena con el presupuesto entero y se va descontando a medida que gastas.',
  },
]

export function AjustesScreen() {
  const { categories, people, rates, rateList, budgets, recurring, hidden, reload } = useFinanzas()

  // Antes de borrar una categoría hay que saber si tiene un presupuesto
  // activo colgando. Si es la ÚNICA categoría de esa línea, borrarla se
  // lleva el presupuesto entero (§ trigger de limpieza); si la línea tiene
  // otras, solo sale de ahí y el presupuesto sigue con las demás — el aviso
  // tiene que distinguir los dos casos, no asustar de más ni de menos.
  // Un fijo NO puede quedarse sin categoría (la FK está en RESTRICT): hay que
  // reasignarlo antes. Se avisa acá para que el usuario no descubra el bloqueo
  // recién al deslizar para confirmar.
  const fijosCon = (categoryId: string) =>
    recurring.recurring.filter(r => r.category_id === categoryId).map(r => r.name)

  const budgetFor = (categoryId: string) => {
    const line = budgets.categories.find(c => c.category_ids.includes(categoryId))
    if (!line) return null
    return { name: line.name ?? line.category_names.join(', '), sole: line.category_ids.length === 1 }
  }
  const { mode: budgetView, setMode: setBudgetView } = useBudgetViewPref()

  const [draftRates, setDraftRates] = useState<Partial<Record<Currency, string>>>({})
  const [savingRate, setSavingRate] = useState<Currency | null>(null)
  const [savedRate, setSavedRate] = useState<Currency | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<CategoryKind>('gasto')
  const [newIcon, setNewIcon] = useState<string | null>(null)
  const [newIconOpen, setNewIconOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const [newPerson, setNewPerson] = useState('')
  const [deletingPerson, setDeletingPerson] = useState<PersonWithDebt | null>(null)
  const [confirmingPerson, setConfirmingPerson] = useState(false)

  useEffect(() => {
    setDraftRates(Object.fromEntries(RATED_CURRENCIES.map(c => [c, String(rates[c] ?? CURRENCY_META[c].defaultRate)])))
  }, [rates])

  async function patchRate(currency: Currency, body: Record<string, unknown>) {
    setError('')
    setSavingRate(currency)
    const res = await fetch('/api/finanzas/rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, ...body }),
    })
    setSavingRate(null)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar la tasa')
    }
    await reload()
    setSavedRate(currency)
    setTimeout(() => setSavedRate(null), 2000)
  }

  async function saveManualRate(currency: Currency) {
    const value = amountFromInput(draftRates[currency] ?? '', { decimals: 8 })
    if (!Number.isFinite(value) || value <= 0) return setError('La tasa debe ser mayor a cero')
    await patchRate(currency, { rate: value, auto: false })
  }

  async function refreshNow() {
    setError('')
    setRefreshing(true)
    const res = await fetch('/api/finanzas/rates/refresh', { method: 'POST' })
    setRefreshing(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudieron traer las cotizaciones')
    }
    await reload()
  }

  async function seed() {
    setError('')
    setSeeding(true)
    const res = await fetch('/api/finanzas/seed', { method: 'POST' })
    setSeeding(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo sembrar')
    }
    await reload()
  }

  async function addCategory() {
    setError('')
    if (!newName.trim()) return setError('La categoría necesita un nombre')

    const res = await fetch('/api/finanzas/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), kind: newKind, icon: newIcon }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear')
    }
    setNewName('')
    setNewIcon(null)
    setNewIconOpen(false)
    await reload()
  }

  async function patchCategory(id: string, body: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/finanzas/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo actualizar')
    }
    await reload()
  }

  async function removeCategory(id: string) {
    setError('')
    const res = await fetch(`/api/finanzas/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
  }

  async function reorderCategories(ids: string[]) {
    setError('')
    const res = await fetch('/api/finanzas/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo reordenar')
    }
    await reload()
  }

  async function addPerson() {
    setError('')
    const name = newPerson.trim()
    if (!name) return setError('La persona necesita un nombre')

    const res = await fetch('/api/finanzas/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear')
    }
    setNewPerson('')
    await reload()
  }

  async function patchPerson(id: string, body: Record<string, unknown>) {
    setError('')
    const res = await fetch(`/api/finanzas/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo actualizar')
    }
    await reload()
  }

  async function removePerson(p: PersonWithDebt) {
    setError('')
    const res = await fetch(`/api/finanzas/people/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
  }

  async function reorderPeople(ids: string[]) {
    setError('')
    const res = await fetch('/api/finanzas/people/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'No se pudo reordenar')
    }
    await reload()
  }

  async function confirmDeletePerson() {
    if (!deletingPerson) return
    setConfirmingPerson(true)
    await removePerson(deletingPerson)
    setConfirmingPerson(false)
    setDeletingPerson(null)
  }

  const gastos = categories.filter(c => c.kind === 'gasto')
  const ingresos = categories.filter(c => c.kind === 'ingreso')


  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader title="Ajustes" subtitle="Tasas y categorías" />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        <Panel>
          <SectionTitle>Presupuesto</SectionTitle>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
            Cómo mostrar el progreso — aplica igual en Presupuesto y en la Home.
          </p>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Cómo ver el presupuesto">
            {BUDGET_VIEW_OPTIONS.map(o => {
              const selected = budgetView === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setBudgetView(o.value)}
                  className={`flex items-center gap-3 text-left p-3.5 rounded-[var(--fz-r-tile)] border transition-colors ${
                    selected
                      ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
                      : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-[14px] font-semibold ${selected ? 'text-[var(--fz-accent)]' : ''}`}>{o.label}</p>
                    <p className="text-[12px] text-[var(--fz-ink-3)]">{o.hint}</p>
                  </div>
                  {selected && <IconCheck size={18} stroke={2.4} className="text-[var(--fz-accent)] shrink-0" />}
                </button>
              )
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            action={
              <Btn size="sm" variant="soft" onClick={refreshNow} disabled={refreshing}>
                <IconRefresh size={16} stroke={2} />
                {refreshing ? 'Trayendo…' : 'Actualizar'}
              </Btn>
            }
          >
            Tipo de cambio
          </SectionTitle>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
            Se actualizan solas cuando abres la app. Cada movimiento congela la tasa
            del momento en que lo registras, así que esto <strong>no altera</strong> nada
            de lo ya guardado — solo cuánto vale hoy tu patrimonio.
          </p>

          <div className="flex flex-col gap-4">
            {RATED_CURRENCIES.map(c => {
              const meta = CURRENCY_META[c]
              const row = rateList.find(r => r.currency === c)
              const opciones = PAIRS_FOR_CURRENCY[c] ?? []
              const auto = row?.auto ?? true
              return (
                <div key={c} className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <CurrencyIcon currency={c} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{meta.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {row ? `${row.source} · ${relativo(row.updated_at)}` : meta.rateLabel}
                      </p>
                    </div>
                    <p className="text-[20px] font-bold fz-num shrink-0">
                      {(row?.rate ?? meta.defaultRate).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </p>
                  </div>

                  {/* El Bs es el único con dos cotizaciones posibles. */}
                  {auto && opciones.length > 1 && (
                    <div className="flex gap-2 mb-2">
                      {opciones.map(pair => (
                        <button
                          key={pair}
                          type="button"
                          onClick={() => patchRate(c, { quote_pair: pair, auto: true })}
                          aria-pressed={row?.quote_pair === pair}
                          className={`flex-1 h-9 rounded-[var(--fz-r-pill)] text-[12px] font-semibold transition-colors ${
                            row?.quote_pair === pair
                              ? 'bg-[var(--fz-accent)] text-white'
                              : 'bg-[var(--fz-surface)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                          }`}
                        >
                          {QUOTE_META[pair].hint}
                        </button>
                      ))}
                    </div>
                  )}

                  {auto ? (
                    <button
                      type="button"
                      onClick={() => patchRate(c, { auto: false })}
                      className="text-[12px] font-semibold text-[var(--fz-ink-3)] hover:text-[var(--fz-ink)]"
                    >
                      Fijar a mano
                    </button>
                  ) : (
                    <div className="flex flex-col min-[420px]:flex-row gap-2 min-[420px]:items-end">
                      <div className="flex-1 min-w-0">
                        <Label>{meta.rateLabel}</Label>
                        <TextField
                          value={draftRates[c] ?? ''}
                          onChange={e => setDraftRates(d => ({ ...d, [c]: parseDecimalInput(e.target.value, { decimals: 8 }) }))}
                          inputMode="decimal"
                          className="fz-num"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Btn onClick={() => saveManualRate(c)} disabled={savingRate === c} className="flex-1">
                          {savedRate === c ? <IconCheck size={18} stroke={2.2} /> : 'Guardar'}
                        </Btn>
                        <Btn variant="ghost" onClick={() => patchRate(c, { auto: true })}>Auto</Btn>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            action={
              categories.length === 0 ? (
                <Btn size="sm" variant="soft" onClick={seed} disabled={seeding}>
                  {seeding ? 'Sembrando…' : 'Sembrar categorías iniciales'}
                </Btn>
              ) : undefined
            }
          >
            Categorías
          </SectionTitle>

          <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[56px_1fr_150px_auto] items-end">
            <div>
              <Label>Ícono</Label>
              <button
                type="button"
                onClick={() => setNewIconOpen(v => !v)}
                aria-expanded={newIconOpen}
                aria-label="Elegir ícono"
                className="mx-auto min-[900px]:mx-0"
              >
                <CategoryIcon slug={newIcon} name={newName || '?'} size={48} />
              </button>
            </div>
            <div>
              <Label>Nombre</Label>
              <TextField
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nueva categoría"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <SelectField value={newKind} onChange={e => setNewKind(e.target.value as CategoryKind)}>
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </SelectField>
            </div>
            <Btn onClick={addCategory}><IconPlus size={18} stroke={2} /> Agregar</Btn>
          </div>

          {newIconOpen && (
            <div className="mt-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3">
              <IconPickerGrid
                value={newIcon}
                onChange={slug => { setNewIcon(slug); setNewIconOpen(false) }}
              />
            </div>
          )}

          {categories.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              Todavía no hay categorías. Siembra las 14 iniciales o crea la tuya.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2 mt-5">
              <CategoryList title="Gastos" items={gastos} onPatch={patchCategory} onRemove={removeCategory} onReorder={reorderCategories} budgetFor={budgetFor} fijosCon={fijosCon} />
              <CategoryList title="Ingresos" items={ingresos} onPatch={patchCategory} onRemove={removeCategory} onReorder={reorderCategories} budgetFor={budgetFor} fijosCon={fijosCon} />
            </div>
          )}
        </Panel>

        <Panel>
          <SectionTitle>Personas</SectionTitle>
          <p className="text-[13px] text-[var(--fz-ink-2)] -mt-2 mb-3">
            Con quiénes compartes gastos. Son etiquetas tuyas: nadie más las ve ni entra a la app.
          </p>

          <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[1fr_auto] items-end">
            <div>
              <Label>Nombre</Label>
              <TextField
                value={newPerson}
                onChange={e => setNewPerson(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addPerson() } }}
                placeholder="Ana"
              />
            </div>
            <Btn onClick={addPerson}><IconPlus size={18} stroke={2} /> Agregar</Btn>
          </div>

          {people.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              Todavía no hay personas. También puedes crearlas al vuelo desde el quick-add.
            </p>
          ) : (
            <PersonList
              items={people}
              onPatch={patchPerson}
              onDelete={setDeletingPerson}
              onReorder={reorderPeople}
            />
          )}
        </Panel>
      </div>

      <DeleteConfirmSheet
        open={!!deletingPerson}
        onClose={() => setDeletingPerson(null)}
        onConfirm={confirmDeletePerson}
        title="Eliminar persona"
        confirming={confirmingPerson}
      >
        {deletingPerson && (
          <DeletePreview
            icon={<PersonAvatar name={deletingPerson.name} size={40} />}
            title={deletingPerson.name}
            subtitle={
              deletingPerson.open_usd > 0
                ? `Debe ${hidden ? HIDDEN : formatUSD(deletingPerson.open_usd)}`
                : undefined
            }
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}

/** Sensores compartidos por las tres listas arrastrables de Ajustes — mismo
    umbral que ya usa Cuentas: `distance: 6` deja que un tap normal (editar,
    abrir el menú) no dispare un drag por 1px de temblor del dedo. */
function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

function CategoryList({ title, items, onPatch, onRemove, onReorder, budgetFor, fijosCon }: {
  title: string
  items: Category[]
  onPatch: (id: string, body: Record<string, unknown>) => void
  onRemove: (id: string) => void
  onReorder: (ids: string[]) => Promise<void>
  budgetFor: (categoryId: string) => { name: string; sole: boolean } | null
  fijosCon: (categoryId: string) => string[]
}) {
  // El ícono se edita en el lugar: tocar el chip abre la grilla justo debajo
  // de esa fila, y elegir cierra — no hay un modo edición aparte que mantener.
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Orden optimista durante y justo después de un drag — mismo motivo que en
  // Cuentas (`app/finanzas/screens/cuentas.tsx`): sin esto la fila soltada
  // rebota a su posición vieja hasta que `reload()` trae el orden real.
  const [order, setOrder] = useState<string[] | null>(null)
  const ordered = useMemo(() => {
    if (!order) return items
    const byId = new Map(items.map(c => [c.id, c]))
    const withOrder = order.map(id => byId.get(id)).filter((c): c is Category => !!c)
    const missing = items.filter(c => !order.includes(c.id))
    return [...withOrder, ...missing]
  }, [items, order])

  const sensors = useReorderSensors()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = ordered.map(c => c.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(ids, oldIndex, newIndex)
    setOrder(next)
    await onReorder(next)
    setOrder(null)
  }

  async function confirmDelete() {
    if (!deleting) return
    setConfirming(true)
    await onRemove(deleting.id)
    setConfirming(false)
    setDeleting(null)
  }

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-[var(--fz-ink-2)] mb-2">{title}</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ordered.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
            {ordered.map(c => (
              <CategoryRow
                key={c.id}
                category={c}
                open={openId === c.id}
                onToggleOpen={() => setOpenId(openId === c.id ? null : c.id)}
                onPatch={onPatch}
                onDelete={() => setDeleting(c)}
                budget={budgetFor(c.id)}
                fijos={fijosCon(c.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <DeleteConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminar categoría"
        confirming={confirming}
      >
        {deleting && (() => {
          const budget = budgetFor(deleting.id)
          const fijos = fijosCon(deleting.id)
          // El fijo manda sobre el presupuesto en el aviso: es lo que de verdad
          // BLOQUEA el borrado, no solo una consecuencia de hacerlo.
          const subtitle = fijos.length > 0
            ? `No se puede borrar: la usa ${fijos.length === 1 ? 'el fijo' : `${fijos.length} fijos`} ${fijos.slice(0, 2).join(', ')}`
            : !budget
              ? (deleting.kind === 'gasto' ? 'Gasto' : 'Ingreso')
              : budget.sole
                ? `Se borra con su presupuesto "${budget.name}"`
                : `Sale del presupuesto "${budget.name}", que sigue con sus otras categorías`
          return (
            <DeletePreview
              icon={<CategoryIcon slug={deleting.icon} name={deleting.name} size={40} />}
              title={deleting.name}
              subtitle={subtitle}
            />
          )
        })()}
      </DeleteConfirmSheet>
    </section>
  )
}

function CategoryRow({ category: c, open, onToggleOpen, onPatch, onDelete, budget, fijos }: {
  category: Category
  open: boolean
  onToggleOpen: () => void
  onPatch: (id: string, body: Record<string, unknown>) => void
  onDelete: () => void
  budget: { name: string; sole: boolean } | null
  fijos: string[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={c.archived ? 'opacity-50' : ''}>
      <div className="flex items-center gap-2.5 py-2.5">
        {/* El handle es el único punto de la fila que arrastra — tocar el
            ícono sigue abriendo el picker y el input sigue editable, sin
            ambigüedad con el gesto de arrastre. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${c.name}`}
          className="grid place-items-center w-7 h-7 shrink-0 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)] cursor-grab active:cursor-grabbing touch-none"
        >
          <IconGripVertical size={16} stroke={1.8} />
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-label={`Cambiar ícono de ${c.name}`}
          className="shrink-0"
        >
          <CategoryIcon slug={c.icon} name={c.name} size={36} />
        </button>
        <input
          defaultValue={c.name}
          onBlur={e => {
            const next = e.target.value.trim()
            if (next && next !== c.name) onPatch(c.id, { name: next })
          }}
          aria-label={`Nombre de ${c.name}`}
          className="flex-1 min-w-0 bg-transparent text-[16px] font-semibold outline-none focus:underline decoration-[var(--fz-accent)] underline-offset-4"
        />
        <RowMenu
          items={[
            {
              label: c.archived ? 'Restaurar' : 'Archivar',
              icon: <IconArchive size={16} stroke={1.8} />,
              onClick: () => onPatch(c.id, { archived: !c.archived }),
            },
            {
              label: 'Borrar',
              icon: <IconTrash size={16} stroke={1.8} />,
              onClick: onDelete,
              danger: true,
              title: fijos.length > 0
                ? `La usa ${fijos.length === 1 ? 'un fijo' : `${fijos.length} fijos`}: cambia su categoría antes de borrarla`
                : budget?.sole ? `Se borra con su presupuesto "${budget.name}"` : undefined,
            },
          ]}
        />
      </div>
      {open && (
        <div className="mb-3 ml-[86px] rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3">
          <IconPickerGrid
            value={c.icon}
            onChange={slug => { onPatch(c.id, { icon: slug }); onToggleOpen() }}
          />
        </div>
      )}
    </div>
  )
}

function PersonList({ items, onPatch, onDelete, onReorder }: {
  items: PersonWithDebt[]
  onPatch: (id: string, body: Record<string, unknown>) => void
  onDelete: (p: PersonWithDebt) => void
  onReorder: (ids: string[]) => Promise<void>
}) {
  const [order, setOrder] = useState<string[] | null>(null)
  const ordered = useMemo(() => {
    if (!order) return items
    const byId = new Map(items.map(p => [p.id, p]))
    const withOrder = order.map(id => byId.get(id)).filter((p): p is PersonWithDebt => !!p)
    const missing = items.filter(p => !order.includes(p.id))
    return [...withOrder, ...missing]
  }, [items, order])

  const sensors = useReorderSensors()

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = ordered.map(p => p.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(ids, oldIndex, newIndex)
    setOrder(next)
    await onReorder(next)
    setOrder(null)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ordered.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col divide-y divide-[var(--fz-hairline)] mt-4">
          {ordered.map(p => (
            <PersonRow key={p.id} person={p} onPatch={onPatch} onDelete={() => onDelete(p)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function PersonRow({ person: p, onPatch, onDelete }: {
  person: PersonWithDebt
  onPatch: (id: string, body: Record<string, unknown>) => void
  onDelete: () => void
}) {
  // El toggle de ocultar montos vale en TODA la app, también acá: lo que se
  // le debe a alguien es tan sensible como cualquier saldo.
  const { hidden } = useFinanzas()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2.5 py-2.5 ${p.archived ? 'opacity-50' : ''}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${p.name}`}
        className="grid place-items-center w-7 h-7 shrink-0 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)] cursor-grab active:cursor-grabbing touch-none"
      >
        <IconGripVertical size={16} stroke={1.8} />
      </button>
      <PersonAvatar name={p.name} size={36} />

      <input
        defaultValue={p.name}
        onBlur={e => {
          const next = e.target.value.trim()
          if (next && next !== p.name) onPatch(p.id, { name: next })
        }}
        aria-label={`Nombre de ${p.name}`}
        className="flex-1 min-w-0 bg-transparent text-[16px] font-semibold outline-none focus:underline decoration-[var(--fz-accent)] underline-offset-4"
      />

      {p.open_usd > 0 && (
        <span className="shrink-0 text-[13px] font-semibold fz-num text-[var(--fz-out-text)]">
          debe {hidden ? HIDDEN : formatUSD(p.open_usd)}
        </span>
      )}

      <RowMenu
        items={[
          {
            label: p.archived ? 'Restaurar' : 'Archivar',
            icon: <IconArchive size={16} stroke={1.8} />,
            onClick: () => {
              // Archivar a alguien que todavía te debe es válido, pero
              // conviene saberlo antes: la deuda no desaparece con la persona.
              if (!p.archived && p.open_usd > 0 &&
                  !window.confirm(`${p.name} todavía te debe ${hidden ? HIDDEN : formatUSD(p.open_usd)}. ¿Archivar igual?`)) return
              onPatch(p.id, { archived: !p.archived })
            },
          },
          {
            label: 'Borrar',
            icon: <IconTrash size={16} stroke={1.8} />,
            onClick: onDelete,
            danger: true,
            title: p.open_count > 0 ? 'Tiene historial: archivala en vez de borrarla' : undefined,
          },
        ]}
      />
    </div>
  )
}
