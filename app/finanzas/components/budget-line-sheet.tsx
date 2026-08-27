'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { BudgetLineProgress } from '@/lib/finanzas/types'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, parseDecimalInput } from '@/lib/finanzas/money'
import { periodStart } from '@/lib/finanzas/budgets'
import { todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { Btn, ErrorNote, Label, SearchField, Segmented, TextField } from './ui'
import { AmountField } from './amount-field'

/**
 * Crea una línea nueva, o edita el monto (y el alias) de ESTE mes de una
 * existente.
 *
 * Las categorías, la moneda de entrada y la retroactividad (§3.1 del spec)
 * solo se preguntan al crear — quedan fijas para siempre, no hay ningún
 * camino de edición que las vuelva a tocar. El alias sí se puede cambiar
 * cuando sea: es cosmético, no estructural.
 */
export function BudgetLineSheet({ editing, onClose, onSaved }: {
  editing?: BudgetLineProgress | null
  onClose: () => void
  onSaved: () => void
}) {
  const { budgets, reload } = useFinanzas()

  // Mientras el sheet está abierto, el fondo no se toca: ni scroll ni clicks
  // sueltos. Sin esto la lista de atrás seguía desplazándose bajo el dedo y
  // se podía interactuar con ella — el sheet parecía un panel más de la
  // página, no un formulario que te pide una decisión. Mismo efecto que ya
  // tenían los otros once sheets de la mini-app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Las categorías elegibles se capturan al abrir: crear una línea las saca
  // de `categories_without_line` en el próximo reload, y leerlas en vivo las
  // haría desaparecer del selector bajo el propio dedo del usuario.
  //
  // Editando, las que ya son de ESTA línea también son elegibles: si no,
  // aparecerían como no seleccionables justo las que hay que poder destildar.
  const [pickable] = useState(() => {
    const libres = budgets.categories_without_line
    if (!editing) return libres
    const propias = editing.category_ids.map((id, i) => ({ id, name: editing.category_names[i] ?? '' }))
    return [...propias, ...libres].sort((a, b) => a.name.localeCompare(b.name))
  })

  // Varias categorías por línea (rediseño post-Sprint 6): acá se juntan los
  // ids elegidos, tocando cada chip prende o apaga su selección.
  const [selected, setSelected] = useState<string[]>([])
  const [categorySearch, setCategorySearch] = useState('')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [amount, setAmount] = useState('')
  const [retroactive, setRetroactive] = useState<'si' | 'no'>('si')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Editando arranca con las que ya tiene marcadas, para poder sumar o
    // sacar sin volver a armar el grupo entero desde cero.
    setSelected(editing ? editing.category_ids : [])
    setName(editing?.name ?? '')
    setCurrency(editing?.input_currency ?? 'USD')
    // El monto que se precarga es el NATIVO guardado, tal cual se escribió —
    // no una reconversión del USD, que haría aparecer "2.400,02" donde el
    // usuario había puesto 2.400.
    setAmount(editing?.amount != null ? String(editing.amount) : '')
    setRetroactive('si')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function toggleCategory(id: string) {
    setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]))
  }

  const decimals = decimalsFor(currency)
  // Los nombres de las categorías tal cual, sin alias — es lo que el campo
  // "Nombre" usa como placeholder: a qué vuelve si se vacía, no cómo se
  // llama ahora mismo si ya tiene un alias puesto. Sale de lo que está
  // marcado AHORA, no de lo guardado: si se suma una categoría, el
  // placeholder ya la incluye.
  const fallbackName = selected.map(id => pickable.find(c => c.id === id)?.name).filter(Boolean).join(', ')
  const nothingLeftToPick = pickable.length === 0

  /**
   * El filtro del buscador. Acá se marcan VARIAS categorías, así que las ya
   * elegidas se mantienen siempre visibles aunque no coincidan: si se
   * escondieran, escribir en el buscador parecería haber deseleccionado lo que
   * ya estaba marcado.
   */
  const visibles = (() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return pickable
    const coinciden = pickable.filter(c => c.name.toLowerCase().includes(q))
    const yaMarcadas = pickable.filter(c => selected.includes(c.id) && !coinciden.includes(c))
    return [...yaMarcadas, ...coinciden]
  })()

  async function submit() {
    if (selected.length === 0) return setError('Elige al menos una categoría')
    const value = amountFromInput(amount, { decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un monto mayor a cero')

    setSaving(true)

    if (editing) {
      const newName = name.trim() || null
      // Las categorías solo viajan si de verdad cambiaron: mandarlas iguales
      // haría reescribir la tabla puente sin ninguna razón.
      const sameCategories =
        selected.length === editing.category_ids.length
        && selected.every(id => editing.category_ids.includes(id))
      const linePatch: Record<string, unknown> = {}
      if (newName !== editing.name) linePatch.name = newName
      if (!sameCategories) linePatch.category_ids = selected

      const [periodRes, lineRes] = await Promise.all([
        fetch(`/api/finanzas/budgets/${editing.line_id}/period`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: periodStart(todayISO()), amount: value }),
        }),
        Object.keys(linePatch).length > 0
          ? fetch(`/api/finanzas/budgets/${editing.line_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(linePatch),
            })
          : Promise.resolve(null),
      ])
      setSaving(false)

      const bad = !periodRes.ok ? periodRes : (lineRes && !lineRes.ok ? lineRes : null)
      if (bad) {
        const data = await bad.json().catch(() => ({}))
        return setError(data.error ?? 'No se pudo guardar')
      }
    } else {
      const res = await fetch('/api/finanzas/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_ids: selected,
          name: name.trim() || null,
          amount: value,
          currency,
          retroactive: retroactive === 'si',
        }),
      })
      setSaving(false)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return setError(data.error ?? 'No se pudo guardar')
      }
    }

    await reload()
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div>
            <Label>Categorías (una o varias)</Label>
            {nothingLeftToPick ? (
              <p className="text-[13px] text-[var(--fz-ink-3)] py-2">
                Ya tienes presupuesto en todas las categorías.
              </p>
            ) : (
              <>
                {pickable.length > 4 && (
                  <div className="mb-2">
                    <SearchField value={categorySearch} onChange={setCategorySearch} placeholder="Buscar categoría…" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {visibles.map(c => (
                    <PickChip
                      key={c.id}
                      label={c.name}
                      selected={selected.includes(c.id)}
                      onClick={() => toggleCategory(c.id)}
                    />
                  ))}
                  {visibles.length === 0 && (
                    <p className="text-[13px] text-[var(--fz-ink-3)] py-2">Ninguna categoría coincide.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <Label>Nombre (opcional)</Label>
            <TextField
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={fallbackName || 'Por defecto, el nombre de la categoría'}
            />
          </div>

          {!editing && (
            <div>
              <Label>Moneda de este presupuesto</Label>
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {CURRENCIES.map(c => {
                  const isSelected = currency === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      aria-pressed={isSelected}
                      className={`shrink-0 flex items-center gap-2 h-11 pl-2 pr-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold transition-colors ${
                        isSelected
                          ? 'bg-[var(--fz-accent)] text-white'
                          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                      }`}
                    >
                      <CurrencyIcon currency={c} size={24} />
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <AmountField
              value={amount}
              onChange={setAmount}
              currency={currency}
              decimals={decimals}
              autoFocus={!!editing}
            />
          </div>

          {!editing && (
            <div>
              <Label>¿Contar lo que ya gastaste este mes en esas categorías?</Label>
              <Segmented
                options={[
                  { value: 'si', label: 'Sí, contarlo' },
                  { value: 'no', label: 'Arrancar desde hoy' },
                ]}
                value={retroactive}
                onChange={setRetroactive}
              />
            </div>
          )}

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving || nothingLeftToPick} full>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear presupuesto'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

function PickChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`shrink-0 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
        selected
          ? 'bg-[var(--fz-accent)] text-white'
          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
      }`}
    >
      {label}
    </button>
  )
}
