'use client'

import { useEffect, useRef, useState } from 'react'
import { IconTrash, IconX } from '@tabler/icons-react'
import { todayISO, valueUpdateDelta } from '@/lib/finanzas/transactions'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { SignedAmount } from './amount'
import { DeleteConfirmSheet, DeletePreview } from './delete-confirm'
import { useAccountValueApi } from './account-value-context'
import { Btn, DateField, ErrorNote, Label } from './ui'

/**
 * "Actualizar valor" (§7.2 de contexto_finanzas.md): la puerta de entrada
 * para ajustar una cuenta de inversión, separada de Gasto/Ingreso. Sin
 * selector de tipo, cuenta ni categoría — todo eso ya viene decidido por
 * cómo se abrió. Un solo campo: cuánto vale la cuenta HOY, no un delta con
 * signo. Por debajo arma el mismo `gasto`/`ingreso` de siempre contra
 * `/api/finanzas/transactions` — `flow_type` lo sigue decidiendo el server.
 */
export function AccountValueSheet() {
  const { open, account, editing, close } = useAccountValueApi()
  const { reload } = useFinanzas()

  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const valueRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setDeleteError('')
    if (account) setValue(String(account.balance))
    setDate(editing ? editing.date : todayISO())
    const t = setTimeout(() => valueRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // `account` queda fuera a propósito — mismo motivo que en QuickAdd: es un
    // array nuevo en cada recarga, y guardar dispara un reload() ANTES de
    // cerrar. Si estuviera acá, el campo se resetearía solo mientras el
    // usuario todavía lo está viendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

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

  if (!open || !account) return null

  const hoy = todayISO()
  const decimals = decimalsFor(account.currency)
  const typed = amountFromInput(value, { allowNegative: true, decimals })

  // El saldo real de hoy es siempre la referencia, nunca una reconstrucción
  // histórica por fecha (§7.2): el saldo de una cuenta ya es una suma
  // acumulada sin orden, así que "el dato más reciente" es siempre el de
  // hoy, sea cual sea la fecha que se le ponga al registro.
  const resolved = Number.isFinite(typed)
    ? valueUpdateDelta(account.balance, typed, account.currency, editing)
    : null

  async function submit() {
    setError('')
    if (!Number.isFinite(typed)) return setError('Poné un valor válido')
    if (!resolved) return setError('El valor no cambió')

    const payload = {
      type: resolved.type,
      date,
      account_id: account!.id,
      amount: resolved.amount,
      category_id: null,
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

    await reload()
    close()
  }

  async function remove() {
    if (!editing) return
    setRemoving(true)
    setDeleteError('')
    const res = await fetch(`/api/finanzas/transactions/${editing.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setRemoving(false)
      return setDeleteError(data.error ?? 'No se pudo borrar')
    }
    await reload()
    setRemoving(false)
    setConfirmDelete(false)
    close()
  }

  const title = editing ? 'Editar actualización' : 'Actualizar valor'

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={close} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{title}</h2>
          <button
            type="button" onClick={close} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] px-3.5 py-3 flex items-center gap-3">
            <CurrencyIcon currency={account.currency} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold truncate">{account.name}</p>
              <p className="text-[12px] text-[var(--fz-ink-3)] truncate">
                Saldo actual · {formatAmount(account.balance, account.currency)}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 py-2">
            <p className="text-[13px] font-medium text-[var(--fz-ink-2)]">¿Cuánto vale hoy?</p>
            <div className="flex items-center justify-center gap-3">
              <span className="flex items-center gap-2 shrink-0">
                <CurrencyIcon currency={account.currency} size={26} />
                <span className="w-[48px] text-[13px] font-bold text-[var(--fz-ink-3)] tracking-wide">
                  {account.currency}
                </span>
              </span>
              <input
                ref={valueRef}
                value={value}
                onChange={e => setValue(parseDecimalInput(e.target.value, { allowNegative: true, decimals }))}
                inputMode="decimal"
                placeholder="0.00"
                aria-label={`Valor actual en ${account.currency}`}
                className="fz-num w-full min-w-0 max-w-[190px] bg-transparent text-[40px] font-bold tracking-[-0.02em] leading-none outline-none placeholder:text-[var(--fz-ink-3)]"
              />
            </div>
            {resolved && (
              <p
                className="text-[13px] font-semibold fz-num"
                style={{ color: resolved.type === 'ingreso' ? 'var(--fz-in-text)' : 'var(--fz-out-text)' }}
              >
                {resolved.type === 'ingreso' ? '↑ +' : '↓ −'}{formatAmount(resolved.amount, account.currency)}
              </p>
            )}
          </div>

          <div>
            <Label>Fecha</Label>
            <DateField value={date} onChange={setDate} today={hoy} />
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex gap-2 pt-1">
            {editing && (
              <Btn variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <IconTrash size={18} stroke={1.8} />
              </Btn>
            )}
            <Btn onClick={submit} disabled={saving || !resolved} full>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar'}
            </Btn>
          </div>
        </div>
      </div>

      <DeleteConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Eliminar actualización"
        confirming={removing}
        error={deleteError}
      >
        {editing && (
          <DeletePreview
            icon={<CurrencyIcon currency={account.currency} size={40} />}
            title={account.name}
            subtitle="Actualización de valor"
            amount={<SignedAmount value={editing.amount} currency={editing.currency} type={editing.type} />}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}
