'use client'

import { useEffect, useState } from 'react'
import { IconArchive, IconCheck, IconPlus, IconTrash } from '@tabler/icons-react'
import type { Category, CategoryKind } from '@/lib/finanzas/types'
import { amountFromInput, parseDecimalInput } from '@/lib/finanzas/money'
import { useFinanzas } from '../components/data-context'
import { PageHeader } from '../components/tx-row'
import { Btn, ErrorNote, IconChip, Label, Panel, SectionTitle, SelectField, TextField, tintFor } from '../components/ui'

export default function AjustesPage() {
  const { categories, settings, reload } = useFinanzas()

  const [rate, setRate] = useState('')
  const [savingRate, setSavingRate] = useState(false)
  const [rateSaved, setRateSaved] = useState(false)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<CategoryKind>('gasto')
  const [newEmoji, setNewEmoji] = useState('')
  const [seeding, setSeeding] = useState(false)

  useEffect(() => { setRate(String(settings.usd_bob_rate)) }, [settings.usd_bob_rate])

  async function saveRate() {
    setError('')
    const value = amountFromInput(rate)
    if (!Number.isFinite(value) || value <= 0) return setError('La tasa debe ser mayor a cero')

    setSavingRate(true)
    const res = await fetch('/api/finanzas/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usd_bob_rate: value }),
    })
    setSavingRate(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar la tasa')
    }
    await reload()
    setRateSaved(true)
    setTimeout(() => setRateSaved(false), 2000)
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
      body: JSON.stringify({ name: newName.trim(), kind: newKind, emoji: newEmoji || null }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo crear')
    }
    setNewName('')
    setNewEmoji('')
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

  const gastos = categories.filter(c => c.kind === 'gasto')
  const ingresos = categories.filter(c => c.kind === 'ingreso')

  const updated = new Date(settings.updated_at)

  return (
    <div className="px-4 pt-6 min-[900px]:px-0 min-[900px]:pt-0">
      <PageHeader title="Ajustes" subtitle="Tasa y categorías" />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        <Panel>
          <SectionTitle>Tipo de cambio</SectionTitle>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-3">
            Bolivianos por 1 dólar. Cada movimiento congela la tasa vigente al momento de
            registrarlo, así que cambiarla acá <strong>no altera</strong> nada de lo ya guardado.
          </p>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Bs por 1 USD</Label>
              <TextField
                value={rate}
                onChange={e => setRate(parseDecimalInput(e.target.value))}
                inputMode="decimal"
                className="fz-num"
              />
            </div>
            <Btn onClick={saveRate} disabled={savingRate}>
              {rateSaved ? <IconCheck size={18} stroke={2.2} /> : savingRate ? 'Guardando…' : 'Guardar'}
            </Btn>
          </div>

          <p className="text-[12px] text-[var(--fz-ink-3)] mt-2">
            Última edición: {updated.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
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

          <div className="grid gap-2 min-[900px]:grid-cols-[80px_1fr_150px_auto] items-end">
            <div>
              <Label>Emoji</Label>
              <TextField
                value={newEmoji}
                onChange={e => setNewEmoji(e.target.value.slice(0, 2))}
                placeholder="🍽️"
                className="text-center"
              />
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

          {categories.length === 0 ? (
            <p className="text-[14px] text-[var(--fz-ink-3)] py-6 text-center">
              Todavía no hay categorías. Sembrá las 14 iniciales o creá la tuya.
            </p>
          ) : (
            <div className="grid gap-5 min-[900px]:grid-cols-2 mt-5">
              <CategoryList title="Gastos" items={gastos} onPatch={patchCategory} onRemove={removeCategory} />
              <CategoryList title="Ingresos" items={ingresos} onPatch={patchCategory} onRemove={removeCategory} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function CategoryList({ title, items, onPatch, onRemove }: {
  title: string
  items: Category[]
  onPatch: (id: string, body: Record<string, unknown>) => void
  onRemove: (id: string) => void
}) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-[var(--fz-ink-2)] mb-2">{title}</h3>
      <div className="flex flex-col divide-y divide-[var(--fz-hairline)]">
        {items.map(c => (
          <div key={c.id} className={`flex items-center gap-3 py-2.5 ${c.archived ? 'opacity-50' : ''}`}>
            <IconChip tint={tintFor(c.name)} size={36}>{c.emoji ?? '•'}</IconChip>
            <input
              defaultValue={c.name}
              onBlur={e => {
                const next = e.target.value.trim()
                if (next && next !== c.name) onPatch(c.id, { name: next })
              }}
              aria-label={`Nombre de ${c.name}`}
              className="flex-1 min-w-0 bg-transparent text-[15px] font-semibold outline-none focus:underline decoration-[var(--fz-accent)] underline-offset-4"
            />
            <button
              type="button"
              onClick={() => onPatch(c.id, { archived: !c.archived })}
              aria-label={c.archived ? 'Restaurar' : 'Archivar'}
              title={c.archived ? 'Restaurar' : 'Archivar'}
              className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-surface-sunk)] hover:text-[var(--fz-ink)]"
            >
              <IconArchive size={16} stroke={1.8} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              aria-label="Borrar"
              title="Borrar"
              className="grid place-items-center w-8 h-8 rounded-full text-[var(--fz-ink-3)] hover:bg-[var(--fz-out-tint)] hover:text-[var(--fz-out-text)]"
            >
              <IconTrash size={16} stroke={1.8} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
