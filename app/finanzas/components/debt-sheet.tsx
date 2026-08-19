'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { Currency, DebtWithContext, Person } from '@/lib/finanzas/types'
import { CURRENCIES, CURRENCY_META } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { PersonPicker } from './person-picker'
import { Btn, DateField, ErrorNote, Label, TextField } from './ui'

/**
 * Alta y edición de una deuda **suelta**: alguien te debe plata sin que haya
 * ningún gasto tuyo detrás.
 *
 * Es la diferencia con un fijo compartido, que genera sus deudas solo al
 * registrarse. Acá prestaste efectivo, cubriste algo, te deben una cuota — y
 * nada de eso pasa por tus gastos.
 */
export function DebtSheet({ editing, onClose, onSaved }: {
  editing: DebtWithContext | null
  onClose: () => void
  onSaved: () => void
}) {
  const { accounts, reload } = useFinanzas()

  const [personId, setPersonId] = useState(editing?.person_id ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [currency, setCurrency] = useState<Currency>(
    // La moneda más usada por sus cuentas es mejor default que USD a secas.
    () => editing?.currency ?? accounts.find(a => !a.archived)?.currency ?? 'USD',
  )
  const [concept, setConcept] = useState(editing?.concept ?? '')
  const [date, setDate] = useState(editing?.incurred_on ?? todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Una deuda que vino de un gasto hereda de él la persona y la moneda: eso no
  // se toca desde acá, se toca en el gasto.
  const desdeGasto = Boolean(editing?.transaction_id)
  const decimals = decimalsFor(currency)

  const hoy = todayISO()


  const seleccion = useMemo(() => (personId ? [personId] : []), [personId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  async function submit() {
    setError('')
    const value = amountFromInput(amount, { decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Poné un monto mayor a cero')
    if (!editing && !personId) return setError('Elegí quién te debe')
    if (!desdeGasto && !concept.trim()) return setError('Decí de qué es la deuda')

    setSaving(true)
    const res = await fetch(
      editing ? `/api/finanzas/debts/${editing.id}` : '/api/finanzas/debts',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { amount: value, concept: concept.trim() || null, incurred_on: date }
            : { person_id: personId, amount: value, currency, concept: concept.trim(), incurred_on: date },
        ),
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

  async function remove() {
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/finanzas/debts/${editing.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={editing ? 'Editar deuda' : 'Nueva deuda'}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">
            {editing ? 'Editar deuda' : 'Nueva deuda'}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {editing ? (
            <div className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] px-3.5 py-3">
              <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">Te debe</p>
              <p className="text-[16px] font-semibold">{editing.person.name}</p>
              {desdeGasto && (
                <p className="text-[12px] text-[var(--fz-ink-3)] mt-1">
                  Vino de un gasto: la persona y la moneda se cambian ahí.
                </p>
              )}
            </div>
          ) : (
            <div>
              <Label>Quién te debe</Label>
              {/* Una deuda es de UNA persona: elegir otra reemplaza. */}
              <PersonPicker
                selected={seleccion}
                onToggle={(p: Person) => setPersonId(prev => (prev === p.id ? '' : p.id))}
                onCreated={(p: Person) => setPersonId(p.id)}
              />
            </div>
          )}

          <div>
            <Label>Monto</Label>
            <div className="flex gap-2">
              <TextField
                value={amount}
                onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
                inputMode="decimal" placeholder="0.00" className="fz-num flex-1"
              />
              {!editing && (
                <div className="fz-scroll-x flex gap-1.5 overflow-x-auto">
                  {CURRENCIES.map(c => (
                    <button
                      key={c} type="button" onClick={() => setCurrency(c)}
                      aria-pressed={c === currency}
                      title={CURRENCY_META[c].name}
                      className={`shrink-0 grid place-items-center w-12 h-12 rounded-[var(--fz-r-field)] border transition-colors ${
                        c === currency
                          ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
                          : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
                      }`}
                    >
                      <CurrencyIcon currency={c} size={22} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>De qué es</Label>
            <TextField
              value={concept}
              onChange={e => setConcept(e.target.value)}
              placeholder="Le presté para el pasaje"
            />
          </div>

          <div>
            <Label>Desde cuándo</Label>
            <DateField value={date} onChange={setDate} today={hoy} />
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            {editing && (
              <Btn variant="danger" onClick={remove} disabled={saving}>Borrar</Btn>
            )}
            <Btn onClick={submit} disabled={saving} full>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar deuda'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
