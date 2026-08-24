'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { AllocationType, SavingsGoalWithBalance } from '@/lib/finanzas/types'
import { CURRENCIES, type Currency } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, parseDecimalInput } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { Btn, ErrorNote, Label, Segmented, TextField } from './ui'

const ALLOCATION_OPTIONS: { value: AllocationType; label: string }[] = [
  { value: 'fixed', label: 'Monto fijo' },
  { value: 'percent', label: 'Porcentaje' },
]

/**
 * Crea o edita un ahorro (Sprint 7). La moneda solo se elige al crear —
 * mismo criterio que Presupuesto tras su rediseño (`sprint_6_presupuesto.md`
 * §0.3): es la moneda en la que el usuario piensa este ahorro, no algo que
 * tenga sentido cambiar después.
 *
 * El reparto (fijo o %) SÍ es editable siempre — a diferencia de
 * `retroactive` en Presupuesto, acá no hay nada que recalcular hacia atrás
 * (§0 Ronda 3 de sprint_7_ahorro.md): el cambio rige desde el próximo cierre.
 */
export function SavingsGoalSheet({ editing, onClose, onSaved }: {
  editing?: SavingsGoalWithBalance | null
  onClose: () => void
  onSaved: () => void
}) {
  const { reload } = useFinanzas()

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [allocationType, setAllocationType] = useState<AllocationType>('fixed')
  const [allocationValue, setAllocationValue] = useState('')
  const [hasTarget, setHasTarget] = useState<'si' | 'no'>('no')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(editing?.name ?? '')
    setCurrency(editing?.input_currency ?? 'USD')
    setAllocationType(editing?.allocation_type ?? 'fixed')
    setAllocationValue(editing ? String(editing.allocation_value) : '')
    setHasTarget(editing?.target_amount != null ? 'si' : 'no')
    setTargetAmount(editing?.target_amount != null ? String(editing.target_amount) : '')
    setTargetDate(editing?.target_date ?? '')
    setError('')
  }, [editing])

  const decimals = decimalsFor(currency)

  async function submit() {
    if (!name.trim()) return setError('El ahorro necesita un nombre')
    const value = amountFromInput(allocationValue, { decimals: allocationType === 'percent' ? 2 : decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un reparto mayor a cero')
    if (allocationType === 'percent' && value > 100) return setError('Un porcentaje no puede superar 100')

    const target = hasTarget === 'si' ? amountFromInput(targetAmount, { decimals }) : null
    if (hasTarget === 'si' && (!Number.isFinite(target) || target! <= 0)) {
      return setError('Pon una meta mayor a cero, o desactivá la meta')
    }

    setSaving(true)

    const res = await fetch(
      editing ? `/api/finanzas/savings-goals/${editing.id}` : '/api/finanzas/savings-goals',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(editing ? {} : { currency }),
          allocation_type: allocationType,
          allocation_value: value,
          target_amount: target,
          target_date: hasTarget === 'si' ? (targetDate || null) : null,
        }),
      },
    )
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
    }

    await reload()
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={editing ? 'Editar ahorro' : 'Nuevo ahorro'}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] overflow-y-auto bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{editing ? 'Editar ahorro' : 'Nuevo ahorro'}</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div>
            <Label>Nombre</Label>
            <TextField
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Emergencia, Viaje, Crecimiento…"
              autoFocus
            />
          </div>

          {!editing && (
            <div>
              <Label>Moneda de este ahorro</Label>
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
            <Label>Reparto</Label>
            <Segmented options={ALLOCATION_OPTIONS} value={allocationType} onChange={setAllocationType} />
          </div>

          <div>
            <Label>{allocationType === 'fixed' ? `Monto mensual (${currency})` : 'Porcentaje del sobrante mensual'}</Label>
            <TextField
              value={allocationValue}
              onChange={e => setAllocationValue(parseDecimalInput(e.target.value, { decimals: allocationType === 'percent' ? 2 : decimals }))}
              inputMode="decimal"
              placeholder={allocationType === 'percent' ? '0' : '0.00'}
              className="fz-num"
            />
          </div>

          <div>
            <Label>¿Tiene una meta?</Label>
            <Segmented
              options={[{ value: 'no', label: 'No, solo acumula' }, { value: 'si', label: 'Sí, un monto' }]}
              value={hasTarget}
              onChange={setHasTarget}
            />
          </div>

          {hasTarget === 'si' && (
            <>
              <div>
                <Label>Meta ({currency})</Label>
                <TextField
                  value={targetAmount}
                  onChange={e => setTargetAmount(parseDecimalInput(e.target.value, { decimals }))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="fz-num"
                />
              </div>
              <div>
                <Label>Fecha meta (opcional)</Label>
                <TextField type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
              </div>
            </>
          )}

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving} full>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear ahorro'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
