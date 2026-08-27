'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconCheck, IconX } from '@tabler/icons-react'
import type { PersonDebt } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, formatUSD, fromUsd, parseDecimalInput, round2, roundFor } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { debtLabelInPlan } from '@/lib/finanzas/splits'
import { AmountField } from './amount-field'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { PersonAvatar, SearchField, formatDayLabel } from './ui'
import { Btn, DateField, ErrorNote, Label, TextField } from './ui'

const LAST_ACCOUNT_KEY = 'fz:lastAccount'

/**
 * Registrar que te pagaron.
 *
 * Preselecciona todas las deudas abiertas de la persona: el caso "Ana me paga
 * julio y agosto juntos" es lo normal, no la excepción, y forzar un cobro por
 * deuda inventaría dos movimientos donde hubo una sola transferencia.
 */
export function SettleSheet({ debt, onClose, onDone }: {
  debt: PersonDebt
  onClose: () => void
  onDone: () => void
}) {
  const { accounts, rates, plans } = useFinanzas()
  const active = useMemo(() => accounts.filter(a => !a.archived), [accounts])

  const [picked, setPicked] = useState<string[]>(() => debt.debts.map(s => s.id))
  const [accountId, setAccountId] = useState(() => {
    const last = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_ACCOUNT_KEY) ?? '' : ''
    return active.some(a => a.id === last) ? last : (active[0]?.id ?? '')
  })
  const [accountSearch, setAccountSearch] = useState('')
  /** El filtro del buscador. La cuenta ya elegida se mantiene visible aunque no
      coincida — mismo criterio que el picker del quick-add. */
  const visibles = useMemo(() => {
    const q = accountSearch.trim().toLowerCase()
    if (!q) return active
    const coinciden = active.filter(a => a.name.toLowerCase().includes(q))
    if (!accountId || coinciden.some(a => a.id === accountId)) return coinciden
    const elegida = active.find(a => a.id === accountId)
    return elegida ? [elegida, ...coinciden] : coinciden
  }, [active, accountSearch, accountId])
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const account = active.find(a => a.id === accountId)
  const decimals = decimalsFor(account?.currency)

  const elegidos = debt.debts.filter(s => picked.includes(s.id))
  const totalUsd = round2(elegidos.reduce((n, s) => n + s.amount_usd, 0))

  // Cuánto de lo elegido es margen — mismo cálculo que hace el server al
  // cobrar (§ debts/settle): esa parte va a contar como ingreso del mes, el
  // resto no. Se avisa acá para que no sea una sorpresa.
  const principalUsd = round2(elegidos.reduce((n, s) => n + s.principal_usd, 0))
  const margenUsd = round2(Math.max(0, totalUsd - principalUsd))
  const marginRatio = totalUsd > 0 ? margenUsd / totalUsd : 0

  /**
   * Lo que debería llegar, en la moneda de la cuenta destino. Es una sugerencia:
   * lo que se guarda es lo que realmente entró, que casi nunca coincide exacto
   * por la comisión de la plataforma.
   *
   * Si las deudas ya están en la moneda de la cuenta, se suman directo. Pasar
   * por USD y volver introduce centavos que no existen: Bs 25 + Bs 87.50 son
   * Bs 112.50, no los Bs 112.47 que salen de redondear a dólares y deshacerlo.
   */
  const sugerido = useMemo(() => {
    if (!account || elegidos.length === 0) return null
    const mismaMoneda = elegidos.every(s => s.currency === account.currency)
    return mismaMoneda
      ? roundFor(elegidos.reduce((n, s) => n + s.amount, 0), account.currency)
      : fromUsd(totalUsd, account.currency, rates)
    // `elegidos` se recalcula en cada render; las dependencias reales son qué
    // está tildado, la cuenta y las tasas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, account?.id, account?.currency, totalUsd, rates])

  useEffect(() => {
    if (touched || sugerido == null) return
    setAmount(sugerido > 0 ? String(sugerido) : '')
  }, [sugerido, touched])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  function toggle(id: string) {
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
    setTouched(false)
  }

  async function submit() {
    setError('')
    if (picked.length === 0) return setError('Elige al menos una deuda')
    if (!accountId) return setError('Elige a qué cuenta entró la plata')

    const value = amountFromInput(amount, { decimals })
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un monto mayor a cero')

    setSaving(true)
    const res = await fetch('/api/finanzas/debts/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        split_ids: picked,
        account_id: accountId,
        amount: value,
        date,
        description: note.trim() || undefined,
      }),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo registrar el cobro')
    }
    window.localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
    onDone()
  }

  const hoy = todayISO()

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cobrar a ${debt.person.name}`}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.01em]">
            <PersonAvatar name={debt.person.name} size={28} />
            Cobrar a {debt.person.name}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="flex flex-col rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-1">
            {debt.debts.map(s => {
              const on = picked.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={on}
                  className="flex items-center gap-3 min-h-12 px-2.5 py-2 text-left rounded-[var(--fz-r-field)] hover:bg-[var(--fz-surface)]"
                >
                  <span
                    aria-hidden
                    className={`grid place-items-center w-5 h-5 shrink-0 rounded-[6px] border-2 transition-colors ${
                      on ? 'bg-[var(--fz-accent)] border-[var(--fz-accent)] text-white' : 'border-[var(--fz-ink-3)]'
                    }`}
                  >
                    {on && <IconCheck size={13} stroke={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate">
                      {debtLabelInPlan(s, plans)}
                    </span>
                    <span className="block text-[12px] text-[var(--fz-ink-2)]">
                      {formatDayLabel(s.incurred_on, hoy)}
                    </span>
                  </span>
                  <span className="fz-num text-[14px] font-semibold shrink-0">
                    {formatAmount(s.amount, s.currency)}
                  </span>
                </button>
              )
            })}
          </div>

          <div>
            <Label>Entra a</Label>
            {active.length > 4 && (
              <div className="mb-2">
                <SearchField value={accountSearch} onChange={setAccountSearch} placeholder="Buscar cuenta…" />
              </div>
            )}
            <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
              {visibles.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setAccountId(a.id); setTouched(false) }}
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
              {visibles.length === 0 && (
                <p className="text-[13px] text-[var(--fz-ink-3)] py-2">Ninguna cuenta coincide.</p>
              )}
            </div>
          </div>

          <AmountField
            value={amount}
            onChange={v => { setTouched(true); setAmount(v) }}
            currency={account?.currency ?? null}
            decimals={decimals}
            footer={
              <>
                <span className="text-[12.5px] text-[var(--fz-ink-2)] fz-num min-w-0 truncate">
                  Deuda {formatUSD(totalUsd)}
                  {account && account.currency !== 'USD' && sugerido != null && (
                    <span className="text-[var(--fz-ink-3)]"> · sugerido a la tasa de hoy</span>
                  )}
                </span>
                {touched && sugerido != null && sugerido > 0 && (
                  <button
                    type="button"
                    onClick={() => { setTouched(false); setAmount(String(sugerido)) }}
                    className="shrink-0 h-7 px-2.5 rounded-[var(--fz-r-pill)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[11.5px] font-bold text-[var(--fz-accent)]"
                  >
                    Usar {formatAmount(sugerido, account!.currency)}
                  </button>
                )}
              </>
            }
          />

          <div>
            <Label>Fecha</Label>
            <DateField value={date} onChange={setDate} today={hoy} />
          </div>

          <div>
            <Label>Nota</Label>
            <TextField
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={`Cobro a ${debt.person.name}`}
            />
          </div>

          {/* La regla dicha en voz alta, en el único lugar donde se podría dudar
              de qué va a pasar con este número. */}
          {(() => {
            const value = amountFromInput(amount, { decimals })
            const cur = account?.currency ?? 'USD'
            const ganancia = marginRatio > 0 && Number.isFinite(value) && value > 0
              ? roundFor(value * marginRatio, cur)
              : 0
            return ganancia > 0 ? (
              <p className="text-[12px] text-[var(--fz-ink-3)] leading-snug">
                De esto, <strong className="text-[var(--fz-ink-2)]">{formatAmount(ganancia, cur)}</strong> es
                ganancia — sí cuenta como ingreso del mes. El resto es reembolso: sube el
                saldo, pero no cuenta como ingreso.
              </p>
            ) : (
              <p className="text-[12px] text-[var(--fz-ink-3)] leading-snug">
                Se registra como movimiento: sube el saldo de la cuenta, pero no cuenta
                como ingreso del mes.
              </p>
            )
          })()}

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving || picked.length === 0} full>
            {saving ? 'Registrando…' : 'Registrar cobro'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
