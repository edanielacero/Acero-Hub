'use client'

import { useMemo, useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconArchive, IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react'
import type { PersonWithDebt } from '@/lib/finanzas/types'
import { formatUSD, HIDDEN } from '@/lib/finanzas/money'
import { useFinanzas } from '../../components/data-context'
import { DeleteConfirmSheet, DeletePreview } from '../../components/delete-confirm'
import { Btn, ErrorNote, Label, Panel, PersonAvatar, RowMenu, TextField } from '../../components/ui'
import { SettingsHeader, SettingsPage, useReorderSensors } from './shared'

export function AjustesPersonasScreen() {
  const { people, hidden, reload } = useFinanzas()

  const [newPerson, setNewPerson] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<PersonWithDebt | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function call(url: string, init: RequestInit, fallback: string): Promise<boolean> {
    setError('')
    const res = await fetch(url, init)
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

  async function addPerson() {
    const name = newPerson.trim()
    if (!name) return setError('La persona necesita un nombre')
    if (await call('/api/finanzas/people', json({ name }, 'POST'), 'No se pudo crear')) setNewPerson('')
  }

  function patchPerson(id: string, body: Record<string, unknown>) {
    void call(`/api/finanzas/people/${id}`, json(body, 'PATCH'), 'No se pudo actualizar')
  }

  async function reorderPeople(ids: string[]) {
    await call('/api/finanzas/people/reorder', json({ ids }, 'PATCH'), 'No se pudo reordenar')
  }

  async function confirmDelete() {
    if (!deleting) return
    setConfirming(true)
    await call(`/api/finanzas/people/${deleting.id}`, { method: 'DELETE' }, 'No se pudo borrar')
    setConfirming(false)
    setDeleting(null)
  }

  return (
    <SettingsPage>
      <SettingsHeader title="Personas" />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        <Panel>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
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
              onDelete={setDeleting}
              onReorder={reorderPeople}
            />
          )}
        </Panel>
      </div>

      <DeleteConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminar persona"
        confirming={confirming}
      >
        {deleting && (
          <DeletePreview
            icon={<PersonAvatar name={deleting.name} size={40} />}
            title={deleting.name}
            subtitle={
              deleting.open_usd > 0
                ? `Debe ${hidden ? HIDDEN : formatUSD(deleting.open_usd)}`
                : undefined
            }
          />
        )}
      </DeleteConfirmSheet>
    </SettingsPage>
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
