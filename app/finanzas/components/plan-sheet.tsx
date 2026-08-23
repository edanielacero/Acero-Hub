'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { Currency, DebtPlanWithCuotas, DebtWithContext, PlanFrequency, PlanMode } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatAmount, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { equalInstallments, installmentDate, planTotal } from '@/lib/finanzas/plans'
import { debtLabel } from '@/lib/finanzas/splits'
import { todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { Btn, DateField, ErrorNote, formatDayLabel, Label, PersonAvatar, Segmented, TextField } from './ui'

const MODE_OPTIONS: { value: PlanMode; label: string }[] = [
  { value: 'iguales', label: 'Cuotas iguales' },
  { value: 'manual', label: 'Manual' },
]

const FREQ_OPTIONS: { value: PlanFrequency; label: string }[] = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
]

interface CuotaDraft {
  amount: string
  incurred_on: string
}

/**
 * Poner una deuda en cuotas, o regenerar un plan que ya existe.
 *
 * No hay un tercer modo "crear desde cero": un plan siempre parte de una
 * deuda que ya se registró (persona, monto, concepto — el flujo de siempre en
 * el sheet de Deudas). Acá no se vuelven a tipear: se muestran fijos, y lo
 * único que se decide es cómo se reparte esa plata en el tiempo.
 *
 * `debt` presente = crear un plan sobre esa deuda. `plan` presente =
 * regenerar uno que ya existe (§4.6). Nunca los dos a la vez.
 */
export function PlanSheet({ plan, debt, onClose, onSaved }: {
  plan: DebtPlanWithCuotas | null
  debt: DebtWithContext | null
  onClose: () => void
  onSaved: () => void
}) {
  const { reload } = useFinanzas()
  const regenerando = !!plan

  const currency: Currency = (plan?.currency ?? debt?.currency ?? 'USD')
  const personName = plan?.person.name ?? debt?.person.name ?? ''
  const concepto = plan ? plan.concept : debt ? debtLabel(debt) : ''

  // El saldo pendiente del plan viejo es el capital que tiene sentido
  // sugerir al regenerar: lo cobrado y lo condonado no vuelven a repartirse.
  // `roundFor` y no una suma cruda: sumar montos ya redondeados en JS puede
  // dejar basura de punto flotante, y sin redondear eso se ve literal en el
  // campo de texto — acá el valor va directo a `String()` para precargarlo.
  const saldoRestante = useMemo(
    () => roundFor(
      plan?.cuotas.filter(c => c.state === 'pendiente').reduce((s, c) => s + c.amount, 0) ?? 0,
      currency,
    ),
    [plan, currency],
  )

  const decimals = decimalsFor(currency)

  // En "crear" el capital es fijo — es el monto de la deuda que se está
  // partiendo, no algo que se vuelva a escribir. Solo se edita al regenerar.
  const [principal, setPrincipal] = useState(regenerando ? String(saldoRestante || '') : '')
  const [interestMode, setInterestMode] = useState<'sin' | 'con'>('sin')
  const [interestRate, setInterestRate] = useState('')
  const [installments, setInstallments] = useState(regenerando ? '' : '2')
  const [frequency, setFrequency] = useState<PlanFrequency>(plan?.frequency ?? 'mensual')
  const [startsOn, setStartsOn] = useState(todayISO())
  const [mode, setMode] = useState<PlanMode>('iguales')
  const [cuotas, setCuotas] = useState<CuotaDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hoy = todayISO()
  const n = Math.max(0, Math.trunc(Number(installments) || 0))
  const principalNum = regenerando ? amountFromInput(principal, { decimals }) : (debt?.amount ?? 0)
  const interestNum = interestMode === 'con' ? amountFromInput(interestRate, { decimals: 3 }) : null
  const total = Number.isFinite(principalNum) && principalNum > 0
    ? planTotal(principalNum, interestNum, currency)
    : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // El array de cuotas sigue siempre a la cantidad tipeada: crece o se recorta
  // sin pisar lo que ya se cargó en modo manual.
  useEffect(() => {
    setCuotas(prev => {
      const next = prev.slice(0, n)
      while (next.length < n) next.push({ amount: '', incurred_on: '' })
      return next
    })
  }, [n])

  // En "Cuotas iguales" el calendario se recalcula solo. Mismo guard por
  // clave que <SplitEditor>: si no, volver a "iguales" después de tocar algo
  // a mano no recalculaba nada y el usuario quedaba trabado.
  const lastKey = useRef('')
  useEffect(() => {
    if (mode !== 'iguales') { lastKey.current = ''; return }
    if (!total || n < 1 || !startsOn) return
    const key = `${total}|${n}|${currency}|${startsOn}|${frequency}`
    if (key === lastKey.current) return
    lastKey.current = key

    const amounts = equalInstallments(total, n, currency)
    setCuotas(amounts.map((amount, i) => ({
      amount: String(amount),
      incurred_on: installmentDate(startsOn, frequency, i),
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, total, n, currency, startsOn, frequency])

  function updateCuota(i: number, patch: Partial<CuotaDraft>) {
    setCuotas(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  async function submit() {
    setError('')
    if (regenerando && (!Number.isFinite(principalNum) || principalNum <= 0)) {
      return setError('El capital debe ser mayor a cero')
    }
    if (n < 1) return setError('Elige al menos una cuota')
    if (!startsOn) return setError('Elige desde cuándo arranca')
    if (interestMode === 'con' && (!Number.isFinite(interestNum) || (interestNum ?? -1) < 0)) {
      return setError('El interés no puede ser negativo')
    }

    const cuotasPayload = cuotas.map(c => ({
      amount: amountFromInput(c.amount, { decimals }),
      incurred_on: c.incurred_on,
    }))
    const malaCuota = cuotasPayload.find(c => !Number.isFinite(c.amount) || c.amount <= 0 || !c.incurred_on)
    if (malaCuota) return setError('Cada cuota necesita un monto mayor a cero y una fecha')

    const body: Record<string, unknown> = {
      interest_rate: interestMode === 'con' ? interestNum : null,
      installments: n,
      frequency,
      starts_on: startsOn,
      mode,
      cuotas: mode === 'manual' ? cuotasPayload : undefined,
    }
    if (regenerando) {
      body.principal = principalNum
    } else {
      body.debt_id = debt!.id
    }

    setSaving(true)
    const res = await fetch(
      regenerando ? `/api/finanzas/debt-plans/${plan!.id}/regenerate` : '/api/finanzas/debt-plans',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
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
        role="dialog" aria-modal="true" aria-label={regenerando ? 'Regenerar plan' : 'Nuevo plan de pago'}
        className="fz-sheet relative w-full min-[900px]:w-[480px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">
            {regenerando ? 'Regenerar plan' : 'Poner en cuotas'}
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* La deuda (o el plan) de origen: persona, concepto, capital y
              moneda se muestran fijos — nada de esto se vuelve a tipear. */}
          <div className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] px-3.5 py-3 flex items-center gap-3">
            <PersonAvatar name={personName} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold truncate">{personName}</p>
              <p className="text-[12px] text-[var(--fz-ink-3)] truncate">{concepto}</p>
            </div>
            <span className="fz-num text-[15px] font-bold shrink-0">
              {formatAmount(regenerando ? saldoRestante : principalNum, currency)}
            </span>
          </div>

          {regenerando && (
            <p className="text-[12px] text-[var(--fz-ink-3)] -mt-2">
              Las cuotas ya cobradas o perdonadas no se tocan. Solo se reparte de nuevo lo pendiente.
            </p>
          )}

          {regenerando && (
            <div>
              <Label>Capital a repartir</Label>
              <TextField
                value={principal}
                onChange={e => setPrincipal(parseDecimalInput(e.target.value, { decimals }))}
                inputMode="decimal" placeholder="0.00" className="fz-num"
              />
              <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
                Sugerido: lo que sigue pendiente. Editable.
              </p>
            </div>
          )}

          <div>
            <Label>Interés</Label>
            <Segmented
              options={[{ value: 'sin', label: 'Sin interés' }, { value: 'con', label: '% simple' }]}
              value={interestMode} onChange={setInterestMode}
            />
            {interestMode === 'con' && (
              <TextField
                value={interestRate}
                onChange={e => setInterestRate(parseDecimalInput(e.target.value, { decimals: 3 }))}
                inputMode="decimal" placeholder="0.0" className="fz-num mt-2"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Cuotas</Label>
              <TextField
                value={installments}
                onChange={e => setInstallments(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric" placeholder="10" className="fz-num"
              />
            </div>
            <div>
              <Label>Frecuencia</Label>
              <Segmented options={FREQ_OPTIONS} value={frequency} onChange={setFrequency} />
            </div>
          </div>

          <div>
            <Label>Empieza</Label>
            <DateField value={startsOn} onChange={setStartsOn} today={hoy} />
          </div>

          {total > 0 && (
            <p className="text-[13px] font-medium">
              Total a cobrar: <span className="fz-num font-bold">{formatAmount(total, currency)}</span>
            </p>
          )}

          {n > 0 && (
            <div className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-3.5 flex flex-col gap-3">
              <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />

              <div className="flex flex-col divide-y divide-[var(--fz-hairline)] max-h-[260px] overflow-y-auto">
                {cuotas.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <span className="w-14 shrink-0 text-[12px] font-semibold text-[var(--fz-ink-3)]">
                      {i + 1}/{n}
                    </span>
                    {mode === 'manual' ? (
                      <>
                        <input
                          type="date"
                          value={c.incurred_on}
                          onChange={e => updateCuota(i, { incurred_on: e.target.value })}
                          className="h-10 flex-1 min-w-0 px-2.5 rounded-[var(--fz-r-field)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[14px] font-medium outline-none focus:border-[var(--fz-accent)]"
                        />
                        <input
                          value={c.amount}
                          onChange={e => updateCuota(i, { amount: parseDecimalInput(e.target.value, { decimals }) })}
                          inputMode="decimal" placeholder="0.00" aria-label={`Monto de la cuota ${i + 1}`}
                          className="fz-num w-[100px] h-10 px-2.5 text-right rounded-[var(--fz-r-field)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[14px] font-semibold outline-none focus:border-[var(--fz-accent)]"
                        />
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-[13px] text-[var(--fz-ink-3)]">
                          {c.incurred_on ? formatDayLabel(c.incurred_on, hoy) : '—'}
                        </span>
                        <span className="fz-num text-[14px] font-semibold">
                          {formatAmount(Number(c.amount) || 0, currency)}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving} full>
            {saving ? 'Guardando…' : regenerando ? 'Regenerar plan' : 'Crear plan'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
