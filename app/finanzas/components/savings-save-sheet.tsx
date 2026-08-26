'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { SavingsGoalWithBalance } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { Btn, ErrorNote, Label, TextField } from './ui'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "julio de 2026" a partir de `2026-07-01`. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MESES[m - 1]} de ${y}`
}

/**
 * Guardar plata de un mes terminado en UN plan de ahorro (Ronda 9).
 *
 * Reemplaza al reparto global, que pedía una cuenta de origen y una de destino
 * para todos los ahorros juntos. Acá se decide plan por plan, que es como se
 * piensa el ahorro.
 *
 * Dos diferencias que importan:
 *
 * - **El origen no es un picker en blanco.** Se muestra en qué cuentas quedó
 *   plata de ese mes y cuánta sigue libre (`available_funds`), filtrado por la
 *   moneda del plan: guardar en un ahorro en Bs desde una cuenta en dólares
 *   escondería una decisión de tasa que nadie tomó.
 * - **El destino por defecto es la misma cuenta.** Guardar sin mover de banco
 *   es lo normal: la plata ya está donde tiene que estar, lo que cambia es que
 *   pasa a estar apartada.
 */
export function SavingsSaveSheet({ goal, period, sugerido, onClose, onSaved }: {
  goal: SavingsGoalWithBalance
  period: string
  /** Lo acordado según el reparto del plan, en la moneda del plan. */
  sugerido: number | null
  onClose: () => void
  onSaved: () => void
}) {
  // Un plan por PORCENTAJE no acordó un monto: acordó una proporción. Decirle
  // "acordaste guardar $75" esconde de dónde salió ese número y lo vuelve
  // incomparable con el mes siguiente, cuando el mismo 25% dé otra cosa. Se
  // dicen las dos cosas: el % que se pactó y cuánto es ese % este mes.
  const esPorcentaje = goal.allocation_type === 'percent' && goal.allocation_value != null
  const { accounts, savings, reload } = useFinanzas()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const cur = goal.input_currency
  const decimals = decimalsFor(cur)

  // De dónde puede salir: cuentas en la moneda del plan con plata libre.
  // NO se filtra por "lo que dejó ese mes en esta cuenta" — la plata es
  // fungible, y atarlo a la cuenta escondía saldo que sí estaba disponible.
  const origenes = useMemo(() => savings.available_funds
    .filter(f => f.currency === cur)
    .map(f => {
      const cuenta = accounts.find(a => a.id === f.account_id)
      return cuenta ? { cuenta, disponible: f.available } : null
    })
    .filter((x): x is { cuenta: NonNullable<typeof accounts[number]>; disponible: number } => !!x),
  [savings.available_funds, accounts, cur])

  // Lo que el mes sí dejó, pero en otra moneda: es lo que convierte un "no
  // se puede" en un "hacé esto primero".
  const otrasMonedas = useMemo(() => {
    const porMoneda = new Map<string, number>()
    for (const f of savings.available_funds) {
      if (f.currency === cur) continue
      porMoneda.set(f.currency, (porMoneda.get(f.currency) ?? 0) + f.available)
    }
    return [...porMoneda]
      .map(([currency, total]) => ({ currency: currency as typeof cur, total }))
      .sort((a, b) => b.total - a.total)
  }, [savings.available_funds, cur])

  const [fromId, setFromId] = useState(origenes[0]?.cuenta.id ?? '')
  const [toId, setToId] = useState(origenes[0]?.cuenta.id ?? '')
  const origen = origenes.find(o => o.cuenta.id === fromId)

  // El monto arranca en lo acordado, topeado por lo que de verdad hay.
  const inicial = origen ? Math.min(sugerido ?? origen.disponible, origen.disponible) : 0
  const [amount, setAmount] = useState(inicial > 0 ? String(roundFor(inicial, cur)) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const value = amountFromInput(amount, { decimals })
  const excede = !!origen && Number.isFinite(value) && value > origen.disponible
  // Guardar en otra cuenta es válido, pero la moneda tiene que coincidir o el
  // monto que llega deja de ser el que se acordó.
  const destinos = accounts.filter(a => !a.archived && !a.is_investment && a.currency === cur)

  async function submit() {
    setError('')
    if (!fromId) return setError('Elige de qué cuenta sale')
    if (!Number.isFinite(value) || value <= 0) return setError('El monto debe ser mayor a cero')
    if (excede) return setError(`${origen!.cuenta.name} tiene ${formatAmount(origen!.disponible, cur)} libres`)

    setSaving(true)
    const res = await fetch(`/api/finanzas/savings-goals/${goal.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, from_account_id: fromId, to_account_id: toId || fromId, amount: value }),
    })
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
        role="dialog" aria-modal="true" aria-label={`Ahorrar en ${goal.name}`}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <div className="min-w-0">
            <h2 className="text-[19px] font-bold tracking-[-0.01em] truncate">{goal.name}</h2>
            <p className="text-[13px] text-[var(--fz-ink-3)]">Organizando {periodLabel(period)}</p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] shrink-0"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {sugerido != null && sugerido > 0 && (
            <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-[var(--fz-r-field)] bg-[var(--fz-save-tint)]">
              <span className="text-[13px] font-medium text-[var(--fz-save)] min-w-0">
                {esPorcentaje
                  ? <>Acordaste el <span className="font-bold fz-num">{goal.allocation_value}%</span> de lo que sobró</>
                  : 'Acordaste guardar'}
              </span>
              <span className="text-[17px] font-bold text-[var(--fz-save)] fz-num shrink-0">
                {formatAmount(sugerido, cur)}
              </span>
            </div>
          )}

          {origenes.length === 0 ? (
            // Callejón sin salida si solo se dice "no hay": la plata del mes
            // suele estar, pero en otra moneda. Se dice qué hay y qué hacer.
            <div className="flex flex-col gap-2 py-2">
              <p className="text-[14px] text-[var(--fz-ink-2)]">
                No tenés plata libre en ninguna cuenta en{' '}
                <span className="font-semibold">{cur}</span>.
              </p>
              {otrasMonedas.length > 0 ? (
                <p className="text-[13.5px] text-[var(--fz-ink-3)]">
                  Sí tenés{' '}
                  <span className="font-semibold text-[var(--fz-ink-2)] fz-num">
                    {otrasMonedas.map(m => formatAmount(m.total, m.currency)).join(' · ')}
                  </span>. Convertí {otrasMonedas.map(m => m.currency).join(' o ')} a {cur} con una
                  transferencia entre tus cuentas, y después volvé acá a registrar el ahorro.
                </p>
              ) : (
                <p className="text-[13.5px] text-[var(--fz-ink-3)]">
                  Todo tu saldo está gastado o ya apartado en otros ahorros, así que no hay de
                  dónde guardar.
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label>¿De dónde sale?</Label>
                <div className="flex flex-col gap-2">
                  {origenes.map(({ cuenta, disponible }) => (
                    <button
                      key={cuenta.id}
                      type="button"
                      onClick={() => {
                        // El destino sigue al origen mientras no se lo toque a
                        // mano: guardar en la misma cuenta es lo normal.
                        if (toId === fromId) setToId(cuenta.id)
                        setFromId(cuenta.id)
                        setAmount(String(roundFor(Math.min(sugerido ?? disponible, disponible), cur)))
                      }}
                      aria-pressed={fromId === cuenta.id}
                      className={`flex items-center justify-between gap-3 min-h-12 px-3.5 rounded-[var(--fz-r-field)] border text-left transition-colors ${
                        fromId === cuenta.id
                          ? 'border-[var(--fz-accent)] bg-[var(--fz-accent-tint)]'
                          : 'border-[var(--fz-hairline)] bg-[var(--fz-surface-sunk)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-[14px] font-semibold min-w-0">
                        <CurrencyIcon currency={cuenta.currency} size={22} />
                        <span className="truncate">{cuenta.name}</span>
                      </span>
                      <span className="text-[13px] text-[var(--fz-ink-3)] fz-num shrink-0">
                        {formatAmount(disponible, cuenta.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>¿En qué cuenta ahorrar?</Label>
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {destinos.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setToId(a.id)}
                      aria-pressed={toId === a.id}
                      className={`shrink-0 flex items-center gap-2 h-11 pl-2 pr-3.5 rounded-[var(--fz-r-pill)] text-[14px] font-semibold transition-colors ${
                        toId === a.id
                          ? 'bg-[var(--fz-accent)] text-white'
                          : 'bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                      }`}
                    >
                      <CurrencyIcon currency={a.currency} size={22} />
                      {a.name}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[12px] text-[var(--fz-ink-3)] px-0.5">
                  {toId === fromId
                    ? 'Se queda en la misma cuenta, apartada de lo que podés gastar.'
                    : 'La plata se mueve a esa cuenta y queda apartada ahí.'}
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <Label>¿Cuánto?</Label>
                  {origen && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(roundFor(origen.disponible, cur)))}
                      className="text-[12px] font-bold text-[var(--fz-accent)]"
                    >
                      MÁX
                    </button>
                  )}
                </div>
                <TextField
                  value={amount}
                  onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
                  inputMode="decimal"
                  placeholder="0"
                />
                {origen && (
                  <p className={`mt-1.5 text-[12px] px-0.5 fz-num ${excede ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-3)]'}`}>
                    {origen.cuenta.name} tiene {formatAmount(origen.disponible, cur)} libres.
                  </p>
                )}
              </div>
            </>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}

          <Btn onClick={submit} disabled={saving || origenes.length === 0 || excede} full>
            {saving ? 'Guardando…' : 'Ahorrar'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
