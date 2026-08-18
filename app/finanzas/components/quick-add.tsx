'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import type { AccountWithBalance, Currency, TxType } from '@/lib/finanzas/types'
import { todayISO } from '@/lib/finanzas/transactions'
import { amountFromInput, parseDecimalInput } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { useQuickAddApi } from './quick-add-context'
import { Btn, ErrorNote, Label, Segmented, TextField } from './ui'

const LAST_ACCOUNT_KEY = 'fz:lastAccount'

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: 'gasto', label: 'Gasto' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'transferencia', label: 'Transferir' },
]

function symbolOf(currency: Currency | undefined): string {
  return currency === 'BOB' ? 'Bs' : '$'
}

export function QuickAdd() {
  const { open, editing, close } = useQuickAddApi()
  const { accounts, categories, reload } = useFinanzas()

  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])

  const [type, setType] = useState<TxType>('gasto')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const amountRef = useRef<HTMLInputElement>(null)

  // Al abrir: modo edición carga el movimiento; modo alta arranca en Gasto con
  // la última cuenta usada y el foco puesto en el monto.
  useEffect(() => {
    if (!open) return
    setError('')
    if (editing) {
      setType(editing.type)
      setAmount(String(editing.amount))
      setToAmount(editing.to_amount != null ? String(editing.to_amount) : '')
      setAccountId(editing.account_id)
      setToAccountId(editing.to_account_id ?? '')
      setCategoryId(editing.category_id ?? '')
      setDate(editing.date)
      setDescription(editing.description ?? '')
    } else {
      const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
      setType('gasto')
      setAmount('')
      setToAmount('')
      setAccountId(active.some(a => a.id === last) ? last : (active[0]?.id ?? ''))
      setToAccountId('')
      setCategoryId('')
      setDate(todayISO())
      setDescription('')
    }
    const t = setTimeout(() => amountRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // `active` queda fuera de las dependencias a propósito: es un array nuevo
    // en cada recarga de cuentas, y al guardar un movimiento se recarga ANTES
    // de cerrar el sheet. Si estuviera acá, el formulario se reseteaba solo
    // mientras el usuario todavía lo estaba viendo. El valor capturado es el
    // del momento en que se abrió, que es exactamente el que corresponde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  // Si las cuentas todavía no habían llegado cuando se abrió el sheet, se
  // completa la cuenta por defecto en cuanto aparecen — sin pisar nada que el
  // usuario ya haya elegido.
  useEffect(() => {
    if (!open || accountId || active.length === 0) return
    const last = window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''
    setAccountId(active.some(a => a.id === last) ? last : active[0].id)
  }, [open, accountId, active])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  const from = active.find(a => a.id === accountId)
  const to = active.find(a => a.id === toAccountId)
  const crossCurrency = type === 'transferencia' && !!from && !!to && from.currency !== to.currency

  const visibleCategories = useMemo(
    () => categories.filter(c => !c.archived && c.kind === (type === 'ingreso' ? 'ingreso' : 'gasto')),
    [categories, type],
  )

  if (!open) return null

  async function submit() {
    setError('')
    const value = amountFromInput(amount)
    if (!Number.isFinite(value) || value <= 0) return setError('Poné un monto mayor a cero')
    if (!accountId) return setError('Elegí una cuenta')
    if (type === 'transferencia' && !toAccountId) return setError('Elegí la cuenta destino')

    const payload: Record<string, unknown> = {
      type,
      date,
      account_id: accountId,
      amount: value,
      description: description.trim() || null,
    }
    if (type === 'transferencia') {
      payload.to_account_id = toAccountId
      const received = amountFromInput(toAmount)
      payload.to_amount = crossCurrency ? received : null
      if (crossCurrency && (!Number.isFinite(received) || received <= 0)) {
        return setError(`Indicá cuánto llegó realmente a ${to?.name}`)
      }
    } else {
      payload.category_id = categoryId || null
    }

    setSaving(true)
    const res = await fetch(
      editing ? `/api/finanzas/transactions/${editing.id}` : '/api/finanzas/transactions',
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

    window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
    await reload()
    close()
  }

  async function remove() {
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/finanzas/transactions/${editing.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo borrar')
    }
    await reload()
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={close} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Editar movimiento' : 'Nuevo movimiento'}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        {/* Handle de arrastre: solo tiene sentido en el bottom sheet. */}
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">
            {editing ? 'Editar movimiento' : 'Nuevo movimiento'}
          </h2>
          <button
            type="button" onClick={close} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />

          {/* El monto es lo primero y lo más grande: es el dato que siempre se escribe. */}
          <div className="flex items-center gap-2 justify-center py-2">
            <span className="text-[28px] font-bold text-[var(--fz-ink-3)]">{symbolOf(from?.currency)}</span>
            <input
              ref={amountRef}
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Monto"
              className="fz-num w-full max-w-[220px] bg-transparent text-[40px] font-bold tracking-[-0.02em] outline-none placeholder:text-[var(--fz-ink-3)]"
            />
          </div>

          <div>
            <Label>{type === 'transferencia' ? 'Desde' : 'Cuenta'}</Label>
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {active.map(a => (
                <ChipButton
                  key={a.id}
                  selected={a.id === accountId}
                  onClick={() => setAccountId(a.id)}
                  label={`${a.name} · ${a.currency}`}
                />
              ))}
            </div>
          </div>

          {type === 'transferencia' ? (
            <>
              <div>
                <Label>Hacia</Label>
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {active.filter(a => a.id !== accountId).map(a => (
                    <ChipButton
                      key={a.id}
                      selected={a.id === toAccountId}
                      onClick={() => setToAccountId(a.id)}
                      label={`${a.name} · ${a.currency}`}
                    />
                  ))}
                </div>
              </div>

              {/* Solo entre monedas distintas: se guarda lo que REALMENTE llegó,
                  en vez de derivarlo de la tasa y mentir sobre la operación. */}
              {crossCurrency && (
                <div>
                  <Label>Cuánto llegó a {to?.name} ({to?.currency})</Label>
                  <TextField
                    value={toAmount}
                    onChange={e => setToAmount(parseDecimalInput(e.target.value))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="fz-num"
                  />
                </div>
              )}
            </>
          ) : (
            <div>
              <Label>Categoría</Label>
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {visibleCategories.map(c => (
                  <ChipButton
                    key={c.id}
                    selected={c.id === categoryId}
                    onClick={() => setCategoryId(c.id === categoryId ? '' : c.id)}
                    label={`${c.emoji ?? ''} ${c.name}`.trim()}
                  />
                ))}
                {visibleCategories.length === 0 && (
                  <p className="text-[13px] text-[var(--fz-ink-3)] py-2">
                    Todavía no hay categorías. Sembralas desde Ajustes.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <TextField type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Descripción</Label>
              <TextField
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            {editing && (
              <Btn variant="danger" onClick={remove} disabled={saving}>
                <IconTrash size={18} stroke={1.8} />
              </Btn>
            )}
            <Btn onClick={submit} disabled={saving} full>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChipButton({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void
}) {
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
