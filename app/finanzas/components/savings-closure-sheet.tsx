'use client'

import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import type { SavingsClosureProposal } from '@/lib/finanzas/types'
import { amountFromInput, decimalsFor, formatUSD, parseDecimalInput } from '@/lib/finanzas/money'
import { monthLabel, todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { Btn, ErrorNote, Label, SelectField, TextField } from './ui'

/**
 * La confirmación mensual del reparto (§4.4/§7 de sprint_7_ahorro.md).
 *
 * Simplificación deliberada respecto del mockup original: una sola cuenta de
 * origen y una sola cuenta de ahorro de destino para TODO el reparto de este
 * cierre, en vez de un picker por línea — el modelo de datos sí soporta
 * cuentas distintas por ahorro (§4.4), pero pedirlo por línea acá hacía la
 * pantalla bastante más pesada por un caso de uso que puede resolverse
 * después con la misma API. Con un mes en rojo, tampoco arma un flujo de
 * retiro dentro de este sheet: "Entendido, no repartir nada" solo cierra la
 * pregunta pendiente (§3.4) — retirar de un ahorro para cubrirlo se hace
 * como cualquier retiro normal, desde Ahorros o el quick-add.
 */
export function SavingsClosureSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { accounts, reload } = useFinanzas()
  const [data, setData] = useState<SavingsClosureProposal | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const regularAccounts = accounts.filter(a => !a.archived && !a.is_savings && !a.is_investment)
  const savingsAccounts = accounts.filter(a => !a.archived && a.is_savings)

  useEffect(() => {
    let cancelled = false
    // El día del usuario, no el del servidor (Vercel corre en UTC): de él
    // depende qué mes ya terminó. Mismo criterio que /bootstrap.
    fetch(`/api/finanzas/savings-goals/close?today=${todayISO()}`)
      .then(r => r.json())
      .then((d: SavingsClosureProposal) => {
        if (cancelled) return
        setData(d)
        const initial: Record<string, string> = {}
        for (const line of d.proposal) initial[line.goal_id] = String(line.amount)
        setAmounts(initial)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (regularAccounts.length > 0 && !fromAccountId) setFromAccountId(regularAccounts[0].id)
    if (savingsAccounts.length > 0 && !toAccountId) setToAccountId(savingsAccounts[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts])

  // Nada pendiente (se repartió desde otra pestaña, o el banner quedó viejo):
  // se avisa por efecto, NUNCA durante el render — llamar a `onDone` acá
  // adentro es un setState del padre en pleno render del hijo, que React
  // castiga con un warning y un re-render extra. Mismo patrón que
  // <BudgetClosureSheet>.
  const nothingPending = !!data && !data.pending_period
  useEffect(() => {
    if (nothingPending) onDone()
  }, [nothingPending, onDone])

  if (!data || !data.pending_period) return null

  const period = data.pending_period
  const sobra = data.surplus_usd >= 0

  async function post(body: Record<string, unknown>) {
    setSaving(true)
    setError('')
    const res = await fetch('/api/finanzas/savings-goals/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, today: todayISO() }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'No se pudo guardar')
      return false
    }
    await reload()
    return true
  }

  async function skip() {
    if (await post({ period, allocations: [], skip: true })) onDone()
  }

  async function confirm() {
    if (!fromAccountId) return setError('Elige de qué cuenta sale')
    if (!toAccountId) return setError('Elige a qué cuenta de ahorro entra')

    const allocations = data!.proposal
      .map(line => {
        const amount = amountFromInput(amounts[line.goal_id] ?? '', { decimals: decimalsFor(line.currency) })
        return {
          goal_id: line.goal_id,
          amount: Number.isFinite(amount) ? amount : 0,
          from_account_id: fromAccountId,
          to_account_id: toAccountId,
        }
      })
      .filter(a => a.amount > 0)

    if (allocations.length === 0) return setError('No hay nada que repartir — usa "No repartir este mes" en vez')
    if (await post({ period, allocations })) onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label="Repartir el sobrante del mes"
        className="fz-sheet relative w-full min-[900px]:w-[440px] max-h-[92dvh] overflow-y-auto bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-[19px] font-bold tracking-[-0.01em]">{monthLabel(period.slice(0, 7))}</h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-6 flex flex-col gap-4">
          {!sobra ? (
            <>
              <p className="text-[15px]">
                Este mes cerró en rojo: <strong className="text-[var(--fz-out-text)]">{formatUSD(Math.abs(data.surplus_usd))}</strong>.
                No hay sobrante para repartir.
              </p>
              <ErrorNote>{error}</ErrorNote>
              <Btn onClick={skip} disabled={saving} full>
                {saving ? 'Guardando…' : 'Entendido, no repartir nada'}
              </Btn>
            </>
          ) : (
            <>
              <p className="text-[15px]">
                Tu sobrante fue <strong>{formatUSD(data.surplus_usd)}</strong>.
              </p>

              {data.insufficient_for_fixed && (
                <p className="text-[13px] font-medium text-[var(--fz-out-text)] bg-[var(--fz-out-tint)] rounded-[var(--fz-r-field)] px-3.5 py-2.5">
                  Tus ahorros de monto fijo piden más de lo que tenés de sobrante — ajustá los montos abajo.
                </p>
              )}

              {data.proposal.length === 0 ? (
                <p className="text-[13px] text-[var(--fz-ink-3)]">No hay ahorros activos para repartir.</p>
              ) : savingsAccounts.length === 0 || regularAccounts.length === 0 ? (
                /* Sin una cuenta de cada lado no hay transferencia posible.
                   Antes el selector quedaba vacío y "Confirmar" fallaba con un
                   "Elige de qué cuenta sale" imposible de satisfacer — el
                   usuario no tenía forma de saber que le faltaba crear la
                   cuenta. */
                <p className="text-[13px] font-medium text-[var(--fz-out-text)] bg-[var(--fz-out-tint)] rounded-[var(--fz-r-field)] px-3.5 py-2.5">
                  {savingsAccounts.length === 0
                    ? 'Todavía no tenés ninguna cuenta marcada como "de ahorro". Creala o marcá una en Cuentas y volvé acá.'
                    : 'No tenés ninguna cuenta regular de la que pueda salir el aporte.'}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-2">
                    <div>
                      <Label>De qué cuenta sale</Label>
                      <SelectField value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}>
                        {regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </SelectField>
                    </div>
                    <div>
                      <Label>A qué cuenta de ahorro entra</Label>
                      <SelectField value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                        {savingsAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </SelectField>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {data.proposal.map(line => (
                      <div key={line.goal_id}>
                        <Label>
                          {line.name}
                          {line.capped && <span className="font-normal text-[var(--fz-ink-3)]"> · pedido</span>}
                        </Label>
                        <TextField
                          value={amounts[line.goal_id] ?? ''}
                          onChange={e => setAmounts(a => ({
                            ...a,
                            [line.goal_id]: parseDecimalInput(e.target.value, { decimals: decimalsFor(line.currency) }),
                          }))}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="fz-num"
                        />
                      </div>
                    ))}
                  </div>

                  {data.unassigned_usd > 0 && (
                    <p className="text-[12px] text-[var(--fz-ink-3)]">Sin asignar: {formatUSD(data.unassigned_usd)}</p>
                  )}
                </>
              )}

              <ErrorNote>{error}</ErrorNote>

              <div className="flex flex-col gap-2">
                <Btn
                  onClick={confirm}
                  disabled={saving || data.proposal.length === 0 || savingsAccounts.length === 0 || regularAccounts.length === 0}
                  full
                >
                  {saving ? 'Guardando…' : 'Confirmar reparto'}
                </Btn>
                <Btn variant="ghost" onClick={skip} disabled={saving} full>
                  No repartir este mes
                </Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
