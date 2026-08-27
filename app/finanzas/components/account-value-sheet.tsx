'use client'

import { useEffect, useRef, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { todayISO, valueUpdateDelta } from '@/lib/finanzas/transactions'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { AmountField } from './amount-field'
import { CurrencyIcon } from './currency-icon'
import { useAccountValueApi } from './account-value-context'
import { Btn, ErrorNote } from './ui'

/**
 * "Actualizar valor" (§7.2 de contexto_finanzas.md): la puerta de entrada
 * para ajustar una cuenta de inversión, separada de Gasto/Ingreso. Sin
 * selector de tipo, cuenta, categoría ni fecha — todo eso ya viene decidido
 * por cómo se abrió, o directamente no aplica: esto no es un movimiento de
 * cuentas, es una foto de cuánto vale la inversión ahora mismo, así que
 * siempre queda fechado hoy. Por debajo arma el mismo `gasto`/`ingreso` de
 * siempre contra `/api/finanzas/transactions` — `flow_type` lo sigue
 * decidiendo el server, y `loadTransactions` lo excluye de Movimientos.
 */
export function AccountValueSheet() {
  const { open, account, close } = useAccountValueApi()
  const { reload } = useFinanzas()

  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const valueRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    if (account) setValue(String(account.balance))
    const t = setTimeout(() => valueRef.current?.focus(), 120)
    return () => clearTimeout(t)
    // `account` queda fuera a propósito — mismo motivo que en QuickAdd: es un
    // array nuevo en cada recarga, y guardar dispara un reload() ANTES de
    // cerrar. Si estuviera acá, el campo se resetearía solo mientras el
    // usuario todavía lo está viendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  const decimals = decimalsFor(account.currency)
  const typed = amountFromInput(value, { allowNegative: true, decimals })

  // El saldo real de hoy es siempre la referencia, nunca una reconstrucción
  // histórica por fecha (§7.2): el saldo de una cuenta ya es una suma
  // acumulada sin orden, así que "el dato más reciente" es siempre el de hoy.
  const resolved = Number.isFinite(typed) ? valueUpdateDelta(account.balance, typed, account.currency) : null

  async function submit() {
    setError('')
    if (!Number.isFinite(typed)) return setError('Pon un valor válido')
    if (!resolved) return setError('El valor no cambió')

    const payload = {
      type: resolved.type,
      date: todayISO(),
      account_id: account!.id,
      amount: resolved.amount,
      category_id: null,
    }

    setSaving(true)
    const res = await fetch('/api/finanzas/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar')
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
        aria-label="Actualizar valor"
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">Actualizar valor</h2>
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

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-[var(--fz-ink-2)] text-center">¿Cuánto hay en tu inversión hoy?</p>
            <AmountField
              inputRef={valueRef}
              value={value}
              onChange={setValue}
              currency={account.currency}
              decimals={decimals}
              allowNegative
              ariaLabel={`Valor actual en ${account.currency}`}
            />
            {resolved && (
              <p
                className="text-[13px] font-semibold fz-num"
                style={{ color: resolved.type === 'ingreso' ? 'var(--fz-in-text)' : 'var(--fz-out-text)' }}
              >
                {resolved.type === 'ingreso' ? '↑ +' : '↓ −'}{formatAmount(resolved.amount, account.currency)}
              </p>
            )}
          </div>

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving || !resolved} full>
            {saving ? 'Guardando…' : 'Guardar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
