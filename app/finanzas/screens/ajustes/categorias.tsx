'use client'

import { useMemo, useState } from 'react'
import {
  DndContext, closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  IconArchive, IconGripVertical, IconPlus, IconTrash,
  IconTrendingDown, IconTrendingUp,
} from '@tabler/icons-react'
import type { Category, CategoryKind } from '@/lib/finanzas/types'
import { CategoryIcon, IconPickerGrid } from '../../components/category-icon'
import { useFinanzas } from '../../components/data-context'
import { fzFetch } from '../../components/fz-fetch'
import { DeleteConfirmSheet, DeletePreview } from '../../components/delete-confirm'
import { Btn, ErrorNote, Label, Panel, RowMenu, TextField } from '../../components/ui'
import {
  AJUSTES_HOME, SettingsHeader, SettingsMenu, SettingsPage, useReorderSensors,
  type SettingsMenuItem,
} from './shared'

const CATEGORIAS_HOME = '/finanzas/ajustes/categorias'

/**
 * Gasto e ingreso no comparten pantalla: son listas independientes —cada una
 * con su propio orden arrastrable y su propio formulario— y mezclarlas obligaba
 * a elegir el tipo en un select antes de crear nada. Acá el tipo lo decide la
 * pantalla en la que estás, así que el formulario queda con un campo menos.
 */
const KIND_META: Record<CategoryKind, { title: string; label: string; description: string; placeholder: string }> = {
  gasto: {
    title: 'Categorías de gasto',
    label: 'Gasto',
    description: 'En qué se te va la plata: cada gasto y cada fijo entra por una de estas.',
    placeholder: 'Supermercado',
  },
  ingreso: {
    title: 'Categorías de ingreso',
    label: 'Ingreso',
    description: 'De dónde viene la plata: sueldo, freelance, reembolsos.',
    placeholder: 'Sueldo',
  },
}

/* ─── Acciones ────────────────────────────────────────────────────────────────
   Las cuatro pantallas de categorías pegan contra los mismos endpoints; el hook
   centraliza el fetch + `reload()` + el mensaje de error para no repetirlo. */

function useCategoryActions() {
  const { reload } = useFinanzas()
  const [error, setError] = useState('')
  const [seeding, setSeeding] = useState(false)

  async function call(url: string, init: RequestInit, fallback: string): Promise<boolean> {
    setError('')
    const res = await fzFetch(url, init)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? fallback)
      return false
    }
    await reload()
    return true
  }

  const json = (body: unknown, method: string): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return {
    error,
    setError,
    seeding,
    seed: async () => {
      setSeeding(true)
      await call('/api/finanzas/seed', { method: 'POST' }, 'No se pudo sembrar')
      setSeeding(false)
    },
    addCategory: (body: { name: string; kind: CategoryKind; icon: string | null }) =>
      call('/api/finanzas/categories', json(body, 'POST'), 'No se pudo crear'),
    patchCategory: (id: string, body: Record<string, unknown>) => {
      void call(`/api/finanzas/categories/${id}`, json(body, 'PATCH'), 'No se pudo actualizar')
    },
    removeCategory: async (id: string) => {
      await call(`/api/finanzas/categories/${id}`, { method: 'DELETE' }, 'No se pudo borrar')
    },
    reorderCategories: async (ids: string[]) => {
      await call('/api/finanzas/categories/reorder', json({ ids }, 'PATCH'), 'No se pudo reordenar')
    },
  }
}

/* ─── Submenú ─────────────────────────────────────────────────────────────── */

export function AjustesCategoriasScreen() {
  const { categories } = useFinanzas()
  const { error, seed, seeding } = useCategoryActions()

  const activas = (kind: CategoryKind) => categories.filter(c => c.kind === kind && !c.archived).length

  const items: SettingsMenuItem[] = [
    {
      href: `${CATEGORIAS_HOME}/gasto`,
      label: KIND_META.gasto.title,
      description: KIND_META.gasto.description,
      Icon: IconTrendingDown,
      meta: categories.length ? `${activas('gasto')}` : undefined,
    },
    {
      href: `${CATEGORIAS_HOME}/ingreso`,
      label: KIND_META.ingreso.title,
      description: KIND_META.ingreso.description,
      Icon: IconTrendingUp,
      meta: categories.length ? `${activas('ingreso')}` : undefined,
    },
  ]

  return (
    <SettingsPage>
      <SettingsHeader
        title="Categorías"
        back={AJUSTES_HOME}
        action={
          categories.length === 0 ? (
            <Btn size="sm" variant="soft" onClick={seed} disabled={seeding}>
              {seeding ? 'Sembrando…' : 'Sembrar iniciales'}
            </Btn>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>
        <SettingsMenu items={items} />
      </div>
    </SettingsPage>
  )
}

/* ─── Una lista por tipo ──────────────────────────────────────────────────── */

export function AjustesCategoriasGastoScreen() {
  return <KindScreen kind="gasto" />
}

export function AjustesCategoriasIngresoScreen() {
  return <KindScreen kind="ingreso" />
}

function KindScreen({ kind }: { kind: CategoryKind }) {
  const { categories, budgets, recurring } = useFinanzas()
  const { error, setError, seed, seeding, addCategory, patchCategory, removeCategory, reorderCategories } =
    useCategoryActions()

  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState<string | null>(null)
  const [newIconOpen, setNewIconOpen] = useState(false)

  const meta = KIND_META[kind]
  const items = categories.filter(c => c.kind === kind)

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

  async function submit() {
    if (!newName.trim()) return setError('La categoría necesita un nombre')
    const ok = await addCategory({ name: newName.trim(), kind, icon: newIcon })
    if (!ok) return
    setNewName('')
    setNewIcon(null)
    setNewIconOpen(false)
  }

  return (
    <SettingsPage>
      <SettingsHeader title={meta.title} back={CATEGORIAS_HOME} backLabel="Categorías" />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        <Panel>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">{meta.description}</p>

          <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[56px_1fr_auto] items-end">
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
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
                placeholder={meta.placeholder}
              />
            </div>
            <Btn onClick={submit}><IconPlus size={18} stroke={2} /> Agregar</Btn>
          </div>

          {newIconOpen && (
            <div className="mt-3 rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3">
              <IconPickerGrid
                value={newIcon}
                onChange={slug => { setNewIcon(slug); setNewIconOpen(false) }}
              />
            </div>
          )}

          {items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[14px] text-[var(--fz-ink-3)]">
                Todavía no hay categorías de {meta.label.toLowerCase()}.
              </p>
              {categories.length === 0 && (
                <Btn size="sm" variant="soft" onClick={seed} disabled={seeding} className="mt-3">
                  {seeding ? 'Sembrando…' : 'Sembrar las 14 iniciales'}
                </Btn>
              )}
            </div>
          ) : (
            <CategoryList
              items={items}
              onPatch={patchCategory}
              onRemove={removeCategory}
              onReorder={reorderCategories}
              budgetFor={budgetFor}
              fijosCon={fijosCon}
            />
          )}
        </Panel>
      </div>
    </SettingsPage>
  )
}

function CategoryList({ items, onPatch, onRemove, onReorder, budgetFor, fijosCon }: {
  items: Category[]
  onPatch: (id: string, body: Record<string, unknown>) => void
  onRemove: (id: string) => Promise<void>
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
    <section className="mt-5">
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
