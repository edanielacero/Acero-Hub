'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { RecurringWithState } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { resolveSplits } from '@/lib/finanzas/recurring'
import { shareBreakdown } from '@/lib/finanzas/splits'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { Btn, ErrorNote, Label, TextField } from './ui'

/**
 * Confirmar un gasto fijo del período.
 *
 * **Nunca se postea solo.** La app te dice qué falta; el gasto lo confirmás
 * vos. Si posteara sola, el día que Spotify te suba el precio o te rebote el
 * pago tendrías un gasto que no ocurrió y un saldo que no cuadra con la cuenta.
 */
export function RegisterSheet({ recurring, onClose, onDone }: {
  recurring: RecurringWithState
  onClose: () => void
  onDone: () => void
}) {
  const { accounts, people, reload } = useFinanzas()
  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])

  const [amount, setAmount] = useState(String(recurring.amount))
  const [accountId, setAccountId] = useState(recurring.account_id)
  const [date, setDate] = useState(recurring.due)
  const [updateTemplate, setUpdateTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const account = active.find(a => a.id === accountId)
  const decimals = decimalsFor(account?.currency)
  const cur = account?.currency ?? recurring.currency
  const value = amountFromInput(amount, { decimals })

  const cambioDePrecio = Number.isFinite(value) && value !== recurring.amount

  // El reparto se calcula con el monto de ESTE mes, no con el de la plantilla.
  const partes = useMemo(
    () => (Number.isFinite(value) && value > 0
      ? resolveSplits(recurring.splits, value, cur)
      : []),
    [recurring.splits, value, cur],
  )
  const { mine, kind } = shareBreakdown(Number.isFinite(value) ? value : 0, partes, cur)
  const nombreDe = (id: string) => people.find(p => p.id === id)?.name ?? 'Persona'

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
    if (!Number.isFinite(value) || value <= 0) return setError('Poné un monto mayor a cero')

    setSaving(true)
    const res = await fetch(`/api/finanzas/recurring/${recurring.id}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: value,
        account_id: accountId,
        date,
        update_template: updateTemplate,
      }),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo registrar')
    }
    await reload()
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={`Registrar ${recurring.name}`}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">
            Registrar {recurring.emoji ? `${recurring.emoji} ` : ''}{recurring.name}
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
            <Label>Monto {account ? `(${account.currency})` : ''}</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal" placeholder="0.00" className="fz-num"
            />
            {cambioDePrecio && (
              <button
                type="button"
                onClick={() => setUpdateTemplate(v => !v)}
                aria-pressed={updateTemplate}
                className="flex items-center gap-2 mt-2 text-[13px] font-medium text-[var(--fz-ink-2)]"
              >
                <span
                  aria-hidden
                  className={`grid place-items-center w-[18px] h-[18px] rounded-[5px] border-2 text-white text-[11px] transition-colors ${
                    updateTemplate ? 'bg-[var(--fz-accent)] border-[var(--fz-accent)]' : 'border-[var(--fz-ink-3)]'
                  }`}
                >
                  {updateTemplate && '✓'}
                </span>
                Cambiar también el monto del fijo
              </button>
            )}
          </div>

          <div>
            <Label>Sale de</Label>
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {active.map(a => (
                <button
                  key={a.id} type="button" onClick={() => setAccountId(a.id)}
                  aria-pressed={a.id === accountId}
                  className={`shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold whitespace-nowrap transition-colors ${
                    a.id === accountId
                      ? 'bg-[var(--fz-accent)] text-white'
                      : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                  }`}
                >
                  <CurrencyIcon currency={a.currency} size={18} />
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Fecha</Label>
            <TextField type="date" value={date} onChange={e => setDate(e.target.value)} />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
              Viene puesta en el día que le toca, no en hoy: el cargo fue ese día.
            </p>
          </div>

          {partes.length > 0 && (
            <div className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5">
              <Label>Se van a generar estas deudas</Label>
              <div className="flex flex-col">
                {partes.map(pt => (
                  <div key={pt.person_id} className="flex items-center gap-3 h-9">
                    <span className="flex-1 text-[14px] font-medium truncate">{nombreDe(pt.person_id)}</span>
                    <span className="fz-num text-[14px] font-semibold">{formatAmount(pt.amount, cur)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 h-9 border-t border-[var(--fz-hairline)] mt-1 pt-1">
                  <span className="flex-1 text-[14px] font-semibold">
                    {kind === 'ganas' ? 'Ganás' : 'Tu parte'}
                  </span>
                  <span
                    className="fz-num text-[14px] font-bold"
                    style={kind === 'ganas' ? { color: 'var(--fz-in-text)' } : undefined}
                  >
                    {formatAmount(Math.abs(mine), cur)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving} full>
            {saving ? 'Registrando…' : 'Registrar gasto'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
