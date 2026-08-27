'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { AccountWithBalance, SavingsGoalWithBalance } from '@/lib/finanzas/types'
import {
  amountFromInput, crossCurrencySuggestion, decimalsFor, formatAmount, formatUSD,
  fromUsd, parseDecimalInput, roundFor, toUsd,
} from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { AmountField } from './amount-field'
import { CurrencyIcon } from './currency-icon'
import { Btn, ErrorNote, Label, TextField } from './ui'

/**
 * Mover un ahorro de una cuenta a otra (Ronda 8, rehecho en la 9).
 *
 * Es una transferencia, y ahora **se ve como una**: mismo formulario que
 * "Transferir" en el quick-add —monto grande arriba, *Desde*, *Hacia*, y
 * "cuánto llegó" cuando cambian de moneda— porque es exactamente la misma
 * operación. Lo único distinto es de qué bolsillo sale y a cuál entra: cada
 * cuenta tiene su sección de ahorros, y esto mueve de una a la otra.
 *
 * Las tarjetas muestran, por eso, **lo que este plan tiene guardado en cada
 * cuenta**, no el saldo entero: es lo que se puede mover y lo que va a cambiar.
 *
 * El saldo del ahorro no se toca — solo cambia dónde está (§4.12).
 */
export function SavingsMoveSheet({ goal, onClose, onSaved }: {
  goal: SavingsGoalWithBalance
  onClose: () => void
  onSaved: () => void
}) {
  const { accounts, rates, reload } = useFinanzas()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Cuánto de ESTE plan hay en cada cuenta. Es el tope real: de una cuenta
  // donde el plan no puso nada no se puede sacar nada, por más saldo que tenga.
  const guardadoEn = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of goal.by_account) {
      const cuenta = accounts.find(a => a.id === b.account_id)
      if (cuenta) m.set(b.account_id, fromUsd(b.amount_usd, cuenta.currency, rates))
    }
    return m
  }, [goal.by_account, accounts, rates])

  const origenes = accounts.filter(a => (guardadoEn.get(a.id) ?? 0) > 0)
  const [fromId, setFromId] = useState(origenes[0]?.id ?? '')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [toAmountTouched, setToAmountTouched] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const from = accounts.find(a => a.id === fromId)
  const to = accounts.find(a => a.id === toId)
  const destinos = accounts.filter(a => !a.archived && !a.is_investment && a.id !== fromId)

  const disponible = guardadoEn.get(fromId) ?? 0
  const fromDecimals = decimalsFor(from?.currency ?? goal.input_currency)
  const toDecimals = decimalsFor(to?.currency ?? goal.input_currency)
  const value = amountFromInput(amount, { decimals: fromDecimals })
  const excede = !!from && Number.isFinite(value) && value > disponible
  const sinFondos = !!from && disponible <= 0

  const crossCurrency = !!from && !!to && from.currency !== to.currency
  const sugerido = crossCurrency && Number.isFinite(value) && value > 0
    ? crossCurrencySuggestion(value, from!.currency, to!.currency, rates)
    : null

  // Igual que en una transferencia: la sugerencia se muestra hasta que la
  // toques, y a partir de ahí manda lo que escribiste.
  useEffect(() => {
    if (toAmountTouched || sugerido == null) return
    setToAmount(String(roundFor(sugerido, to!.currency)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerido, toAmountTouched])

  const llega = amountFromInput(toAmount, { decimals: toDecimals })
  const diferenciaUsd = crossCurrency && Number.isFinite(value) && Number.isFinite(llega) && value > 0
    ? toUsd(llega, to!.currency, rates) - toUsd(value, from!.currency, rates)
    : null

  async function submit() {
    setError('')
    if (!fromId) return setError('Elige de qué cuenta sale')
    if (!toId) return setError('Elige a qué cuenta entra')
    if (!Number.isFinite(value) || value <= 0) return setError('El monto debe ser mayor a cero')
    if (excede) {
      return setError(`De este ahorro hay ${formatAmount(disponible, from!.currency)} en ${from!.name}`)
    }
    if (crossCurrency && (!Number.isFinite(llega) || llega <= 0)) {
      return setError(`Indica cuánto llegó realmente a ${to!.name}`)
    }

    setSaving(true)
    const res = await fetch(`/api/finanzas/savings-goals/${goal.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_account_id: fromId,
        to_account_id: toId,
        amount: value,
        to_amount: crossCurrency ? llega : undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo mover')
    }
    await reload()
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label="Mover el ahorro de cuenta"
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-[-0.01em]">Mover entre cuentas</h2>
            <p className="text-[13px] text-[var(--fz-ink-3)] truncate">
              Los ahorros de {goal.name}
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] shrink-0"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        {origenes.length === 0 ? (
          <p className="px-5 pb-6 text-[14px] text-[var(--fz-ink-3)]">
            Este ahorro todavía no tiene plata guardada en ninguna cuenta.
          </p>
        ) : (
          <div className="px-5 pb-5 flex flex-col gap-4">
            <AmountField
              value={amount}
              onChange={setAmount}
              currency={from?.currency ?? null}
              decimals={fromDecimals}
              exceeded={excede}
              autoFocus
              available={from ? disponible : undefined}
              availableLabel="En ahorros"
              onMax={setAmount}
              maxDisabled={sinFondos}
            />

            <div>
              <Label>Desde</Label>
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {origenes.map(a => (
                  <SavingsAccountCard
                    key={a.id}
                    account={a}
                    guardado={guardadoEn.get(a.id) ?? 0}
                    selected={a.id === fromId}
                    onClick={() => {
                      setFromId(a.id)
                      if (toId === a.id) setToId('')
                      setToAmountTouched(false)
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label>Hacia</Label>
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {destinos.map(a => (
                  <SavingsAccountCard
                    key={a.id}
                    account={a}
                    guardado={guardadoEn.get(a.id) ?? 0}
                    selected={a.id === toId}
                    onClick={() => { setToId(a.id); setToAmountTouched(false) }}
                  />
                ))}
                {destinos.length === 0 && (
                  <p className="text-[13px] text-[var(--fz-ink-3)] py-2">No hay otra cuenta a dónde mover.</p>
                )}
              </div>
            </div>

            {/* Entre monedas distintas se guarda lo que REALMENTE llegó, en vez
                de derivarlo de la tasa y mentir sobre la operación — mismo
                criterio que cualquier transferencia. */}
            {crossCurrency && to && (
              <div>
                <Label>Cuánto llegó a {to.name} ({to.currency})</Label>
                <TextField
                  value={toAmount}
                  onChange={e => {
                    setToAmountTouched(true)
                    setToAmount(parseDecimalInput(e.target.value, { decimals: toDecimals }))
                  }}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="fz-num"
                />
                <p className="mt-1.5 text-[12px] px-0.5">
                  {diferenciaUsd != null && Math.abs(diferenciaUsd) >= 0.01 ? (
                    <span className={`font-medium fz-num ${diferenciaUsd < 0 ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-in-text)]'}`}>
                      {diferenciaUsd < 0 ? 'Comisión ≈ ' : 'A favor ≈ '}
                      {formatUSD(Math.abs(diferenciaUsd))}
                    </span>
                  ) : (
                    <span className="text-[var(--fz-ink-3)]">
                      {sugerido != null ? 'Según la tasa de hoy' : 'Pon el monto que llegó'}
                    </span>
                  )}
                </p>
              </div>
            )}

            <p className="text-[12.5px] text-[var(--fz-ink-3)]">
              El saldo de {goal.name} no cambia: solo se mueve de la sección de ahorros de una
              cuenta a la de la otra.
            </p>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Btn onClick={submit} disabled={saving || excede || sinFondos} full>
              {saving ? 'Moviendo…' : 'Mover'}
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * La tarjeta de cuenta del quick-add, pero mostrando **lo que este plan tiene
 * guardado ahí** en vez del saldo: es lo que se mueve y lo que va a cambiar.
 */
function SavingsAccountCard({ account, guardado, selected, onClick }: {
  account: AccountWithBalance; guardado: number; selected: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`shrink-0 w-[132px] rounded-[var(--fz-r-tile)] p-3 text-left border transition-colors ${
        selected
          ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
          : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <CurrencyIcon currency={account.currency} size={24} />
        <span className="text-[11px] font-bold text-[var(--fz-ink-3)] tracking-wide">{account.currency}</span>
      </div>
      <p className="mt-2 text-[13px] font-semibold truncate">{account.name}</p>
      <p className="text-[12px] text-[var(--fz-ink-3)] fz-num truncate">
        {guardado > 0 ? `${formatAmount(guardado, account.currency)} guardados` : 'Sin ahorros acá'}
      </p>
    </button>
  )
}
