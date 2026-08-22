'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconRotateClockwise2, IconTrash, IconX } from '@tabler/icons-react'
import type { PasanakuWithState } from '@/lib/finanzas/types'
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
 */
export function PasanakuSheet({ editing, onClose, onSaved }: {
  editing: PasanakuWithState | null
  onClose: () => void
  onSaved: () => void
}) {
  const { accounts, rates, reload } = useFinanzas()
  // Sin cuentas de inversión: sus ajustes de valor son 'gasto/ingreso ·
  // movimiento' igual que un aporte/recepción de pasanaku, así que
  // isInvestmentAdjustment() (lib/finanzas/transactions.ts) no podría
  // distinguirlos — el aporte quedaría tratado como "Actualizar valor" y
  // desaparecería de Movimientos, además de saltarse el tope de saldo. Mismo
  // criterio que ya usa el quick-add para Gasto/Ingreso.
  const candidatas = useMemo(() => accounts.filter(a => !a.archived && !a.is_investment), [accounts])

  const [name, setName] = useState(editing?.name ?? 'Pasanaku')
  const [accountId, setAccountId] = useState(editing?.account_id ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.contribution_amount) : '')
  const [totalSlots, setTotalSlots] = useState(editing ? String(editing.total_slots) : '')
  const [mySlot, setMySlot] = useState(editing ? String(editing.my_slot) : '')
  const [startDate, setStartDate] = useState(editing?.start_date ?? todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removing, setRemoving] = useState(false)

  const account = candidatas.find(a => a.id === accountId) ?? accounts.find(a => a.id === accountId)
  const decimals = decimalsFor(account?.currency ?? 'BOB')

  // El monto es un número denominado en la moneda de LA CUENTA elegida — sin
  // esto, cambiar de cuenta a otra moneda dejaba el mismo número tal cual
  // ("300" pasaba de Bs a valer 300 USD, ~7x de más) en vez de convertirlo.
  // El ref guarda en qué moneda está el número ahora mismo, así que solo se
  // convierte cuando la moneda de verdad cambia — no en cada tecla tipeada,
  // ni en el primer render.
  const amountCurrencyRef = useRef(account?.currency)
  useEffect(() => {
    const prev = amountCurrencyRef.current
    const next = account?.currency
    if (prev && next && prev !== next) {
      const val = amountFromInput(amount, { decimals: decimalsFor(prev) })
      if (Number.isFinite(val) && val > 0) {
        const convertido = crossCurrencySuggestion(val, prev, next, rates)
        if (convertido != null) setAmount(String(convertido))
      }
    }
    amountCurrencyRef.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.currency])

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
      account_id: accountId,
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
            <Label>Aporte por mes {account && `(${account.currency})`}</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal" placeholder="300.00" className="fz-num"
            />
          </div>

          <div>
            <Label>De qué cuenta sale y a cuál entra</Label>
            {candidatas.length === 0 ? (
              <p className="text-[13px] text-[var(--fz-out-text)]">
                Todavía no tenés cuentas. Creá una en Cuentas primero.
              </p>
            ) : (
              <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {candidatas.map(a => (
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
            )}
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
            amount={account && formatAmount(editing.contribution_amount, account.currency)}
          />
        )}
      </DeleteConfirmSheet>
    </div>
  )
}
