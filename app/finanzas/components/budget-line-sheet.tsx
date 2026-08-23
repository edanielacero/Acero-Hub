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
import { Btn, ErrorNote, Label, Segmented, TextField } from './ui'

interface Target {
  categoryId: string
  categoryName: string
}

/**
 * Crea una línea nueva, o edita el monto (y el alias) de ESTE mes de una
 * existente.
 *
 * La categoría, la moneda de entrada y la retroactividad (§3.1 del spec)
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

  // Las categorías elegibles se capturan al abrir: crear una línea las saca
  // de `categories_without_line` en el próximo reload, y leerlas en vivo las
  // haría desaparecer del selector bajo el propio dedo del usuario.
  const [pickable] = useState(() => budgets.categories_without_line)

  const [selected, setSelected] = useState<Target | undefined>(undefined)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [amount, setAmount] = useState('')
  const [retroactive, setRetroactive] = useState<'si' | 'no'>('si')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(undefined)
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

  // Editando, la categoría ya está fija en `editing`; creando, es la que se
  // haya elegido en el selector de acá abajo (o nada todavía).
  const activeTarget: Target | undefined = editing
    ? { categoryId: editing.category_id, categoryName: editing.category_name }
    : selected

  const decimals = decimalsFor(currency)
  // El nombre de la categoría tal cual, sin alias — es lo que el campo
  // "Nombre" usa como placeholder: a qué vuelve si se vacía, no cómo se
  // llama ahora mismo si ya tiene un alias puesto.
  const fallbackName = activeTarget?.categoryName ?? ''
  // Para el encabezado en modo edición sí importa el alias actual, si hay
  // uno — es el mismo nombre que ya se ve en la card y en el resto de la app.
  const currentDisplayName = editing ? (editing.name ?? fallbackName) : fallbackName
  const nothingLeftToPick = !editing && pickable.length === 0

  async function submit() {
    if (!activeTarget) return setError('Elegí una categoría')
    const value = amountFromInput(amount, { decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Poné un monto mayor a cero')

    setSaving(true)

    if (editing) {
      const newName = name.trim() || null
      const [periodRes, nameRes] = await Promise.all([
        fetch(`/api/finanzas/budgets/${editing.line_id}/period`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: periodStart(todayISO()), amount: value }),
        }),
        newName !== editing.name
          ? fetch(`/api/finanzas/budgets/${editing.line_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: newName }),
            })
          : Promise.resolve(null),
      ])
      setSaving(false)

      const bad = !periodRes.ok ? periodRes : (nameRes && !nameRes.ok ? nameRes : null)
      if (bad) {
        const data = await bad.json().catch(() => ({}))
        return setError(data.error ?? 'No se pudo guardar')
      }
    } else {
      const res = await fetch('/api/finanzas/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: activeTarget.categoryId,
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
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] overflow-y-auto bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
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
          {editing ? (
            <p className="text-[15px] font-semibold">{currentDisplayName}</p>
          ) : (
            <div>
              <Label>Categoría</Label>
              {nothingLeftToPick ? (
                <p className="text-[13px] text-[var(--fz-ink-3)] py-2">
                  Ya tenés presupuesto en todas las categorías.
                </p>
              ) : (
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {pickable.map(c => (
                    <PickChip
                      key={c.id}
                      label={c.name}
                      selected={selected?.categoryId === c.id}
                      onClick={() => setSelected({ categoryId: c.id, categoryName: c.name })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

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
            <Label>Monto mensual ({currency})</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal"
              placeholder="0.00"
              className="fz-num"
              autoFocus={!!editing}
            />
          </div>

          {!editing && (
            <div>
              <Label>¿Contar lo que ya gastaste este mes en esta categoría?</Label>
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
