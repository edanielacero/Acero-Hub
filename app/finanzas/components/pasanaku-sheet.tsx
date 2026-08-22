'use client'

import { useEffect, useRef, useState } from 'react'
import { IconRotateClockwise2, IconTrash, IconX } from '@tabler/icons-react'
import type { Currency, PasanakuWithState } from '@/lib/finanzas/types'
import { CURRENCIES } from '@/lib/finanzas/types'
import { amountFromInput, crossCurrencySuggestion, decimalsFor, formatAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { validatePasanaku } from '@/lib/finanzas/pasanaku'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { Btn, ErrorNote, IconChip, Label, TextField } from './ui'

/**
 * Crear o editar un pasanaku. Personal a propósito — sin participantes ni
 * rondas ajenas (decisión del 2026-08-21, ver sprint_5_pasanaku.md): solo tu
 * lado — cuánto aportás, cuántos puestos son, y cuál es el tuyo. La fecha de
 * tu turno se muestra pero no se pide: se deriva de `start_date` + `my_slot`.
 *
 * Sin cuenta a propósito — igual que un fijo (RecurringSheet): la cuenta se
 * elige recién al registrar cada aporte o la recepción, no acá. Lo único que
 * hace falta saber de antemano es en qué moneda está pensado el aporte.
 */
export function PasanakuSheet({ editing, onClose, onSaved }: {
  editing: PasanakuWithState | null
  onClose: () => void
  onSaved: () => void
}) {
  const { rates, reload } = useFinanzas()

  const [name, setName] = useState(editing?.name ?? 'Pasanaku')
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? 'BOB')
  const [amount, setAmount] = useState(editing ? String(editing.contribution_amount) : '')
  const [totalSlots, setTotalSlots] = useState(editing ? String(editing.total_slots) : '')
  const [mySlot, setMySlot] = useState(editing ? String(editing.my_slot) : '')
  const [startDate, setStartDate] = useState(editing?.start_date ?? todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)

  const decimals = decimalsFor(currency)

  // El monto es un número denominado en LA MONEDA elegida — sin esto, cambiar
  // de moneda dejaba el mismo número tal cual ("300" pasaba de Bs a valer 300
  // USD, ~7x de más) en vez de convertirlo.
  const currencyRef = useRef(currency)
  useEffect(() => {
    const prev = currencyRef.current
    if (prev !== currency) {
      const val = amountFromInput(amount, { decimals: decimalsFor(prev) })
      if (Number.isFinite(val) && val > 0) {
        const convertido = crossCurrencySuggestion(val, prev, currency, rates)
        if (convertido != null) setAmount(String(convertido))
      }
    }
    currencyRef.current = currency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

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

    const payload = {
      name: name.trim() || 'Pasanaku',
      currency,
      contribution_amount: amountFromInput(amount, { decimals }),
      total_slots: Number(totalSlots),
      my_slot: Number(mySlot),
      start_date: startDate,
    }

    const invalid = validatePasanaku(payload)
    if (invalid) return setError(invalid)

    setSaving(true)
    const res = await fetch(
      editing ? `/api/finanzas/pasanaku/${editing.id}` : '/api/finanzas/pasanaku',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    setRemoving(true)
    const res = await fetch(`/api/finanzas/pasanaku/${editing.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setRemoving(false)
      setConfirmDelete(false)
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
    setRemoving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={editing ? 'Editar pasanaku' : 'Nuevo pasanaku'}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">
            {editing ? 'Editar pasanaku' : 'Nuevo pasanaku'}
          </h2>
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
            <TextField value={name} onChange={e => setName(e.target.value)} placeholder="Pasanaku" />
          </div>

          <div>
            <Label>Aporte por mes ({currency})</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal" placeholder="300.00" className="fz-num"
            />
          </div>

          <div>
            <Label>Moneda</Label>
            {/* De qué cuenta sale y a cuál entra se elige recién al aportar o
                recibir (§ PasanakuAporteSheet / PasanakuRecibirSheet) — acá
                solo hace falta saber en qué moneda está el monto. */}
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {CURRENCIES.map(c => (
                <button
                  key={c} type="button" onClick={() => setCurrency(c)}
                  aria-pressed={c === currency}
                  className={`shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    c === currency
                      ? 'bg-[var(--fz-accent)] text-white'
                      : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                  }`}
                >
                  <CurrencyIcon currency={c} size={18} />
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Puestos en total</Label>
              <TextField
                value={totalSlots}
                onChange={e => setTotalSlots(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="8" className="fz-num"
              />
            </div>
            <div>
              <Label>Tu puesto</Label>
              <TextField
                value={mySlot}
                onChange={e => setMySlot(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="4" className="fz-num"
              />
            </div>
          </div>

          <div>
            <Label>Primer aporte (mes 1)</Label>
            <TextField type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
              De acá se calcula cuándo te toca recibir: este mes más los puestos que faltan para el tuyo.
            </p>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            {editing && (
              <Btn variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <IconTrash size={18} stroke={1.8} />
              </Btn>
            )}
            <Btn onClick={submit} disabled={saving} full>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear pasanaku'}
            </Btn>
          </div>
        </div>
      </div>

      <DeleteConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Eliminar pasanaku"
        confirming={removing}
      >
        {editing && (
          <DeletePreview
            icon={<IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>}
            title={editing.name}
            subtitle={`Puesto ${editing.my_slot} de ${editing.total_slots}`}
            amount={formatAmount(editing.contribution_amount, editing.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}
