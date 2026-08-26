'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconGift, IconX } from '@tabler/icons-react'
import type { PasanakuWithState } from '@/lib/finanzas/types'
import { amountFromInput, crossCurrencySuggestion, decimalsFor, formatAmount, parseDecimalInput } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { Btn, DateField, ErrorNote, IconChip, Label, SearchField, TextField } from './ui'

/**
 * Registrar UN cobro de tu turno — la parte de un jugador, no el pozo entero
 * de una vez. Se abre una vez por cada uno de los demás puestos que te van
 * pagando ("lista de cobro", revisión del 2026-08-21). No hay flag de
 * "recibido" aparte: `loadPasanaku` deriva `received` de que la suma de
 * estos cobros (`collected_amount`) alcance `collection_target`.
 *
 * El pasanaku no tiene cuenta propia — se elige acá, cada vez, igual que en
 * <PasanakuAporteSheet>: cada cobro puede entrar a una cuenta distinta.
 */
export function PasanakuCobroSheet({ pasanaku, onClose, onDone }: {
  pasanaku: PasanakuWithState
  onClose: () => void
  onDone: () => void
}) {
  const { accounts, rates, reload } = useFinanzas()
  const candidatas = useMemo(() => accounts.filter(a => !a.archived && !a.is_investment), [accounts])
  const [search, setSearch] = useState('')
  const filtradas = useMemo(
    () => candidatas.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase())),
    [candidatas, search],
  )

  // El pasanaku no tiene cuenta propia — pero si ya cobraste antes en una,
  // esta pantalla la sugiere. Puede no haber ninguna.
  const [accountId, setAccountId] = useState(pasanaku.account_id ?? '')
  const account = candidatas.find(a => a.id === accountId)
  const decimals = decimalsFor(account?.currency ?? pasanaku.currency)

  // La parte de UN jugador (`contribution_amount`) está denominada en
  // `pasanaku.currency`, no en la cuenta elegida acá — sin esto, cobrar en
  // una cuenta de otra moneda dejaba el mismo número tal cual en vez de
  // convertirlo con la tasa de hoy.
  const crossCurrencyAmount = account
    ? crossCurrencySuggestion(pasanaku.contribution_amount, pasanaku.currency, account.currency, rates)
    : null
  const suggested = account ? (crossCurrencyAmount ?? pasanaku.contribution_amount) : 0

  // Ya convertido si la cuenta recordada (línea 37) es de otra moneda que el
  // pasanaku — si no, el primer render mostraba el número crudo sin
  // convertir hasta que el efecto de más abajo lo corregía recién después
  // del primer pintado (bug encontrado en la revisión del 2026-08-22).
  const [amount, setAmount] = useState(String(crossCurrencyAmount ?? pasanaku.contribution_amount))
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Se dispara solo cuando la MONEDA cambia, no en cada cambio de cuenta —
  // mismo criterio que RegisterSheet (Fijos): así no pisa un monto que ya
  // editaste a mano al elegir otra cuenta de la misma moneda.
  useEffect(() => {
    if (!account) return
    setAmount(String(suggested))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.currency])

  const value = amountFromInput(amount, { decimals })

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
    if (!accountId) return setError('Elige a qué cuenta entra')
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un monto mayor a cero')

    setSaving(true)
    const res = await fetch(`/api/finanzas/pasanaku/${pasanaku.id}/recibir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: value, date, account_id: accountId }),
    })
    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo registrar')
    }
    await reload()
    onDone()
  }

  const faltan = Math.max(0, pasanaku.total_slots - 1 - pasanaku.cobros.length)

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={`Registrar un pago recibido de ${pasanaku.name}`}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.01em]">
            <IconChip tint="in"><IconGift size={18} stroke={1.8} /></IconChip>
            Pago recibido
          </h2>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--fz-surface-sunk)] text-[var(--fz-ink-2)]"
          >
            <IconX size={18} stroke={1.8} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <p className="text-[13px] text-[var(--fz-ink-2)] -mt-1">
            {pasanaku.cobros.length} de {pasanaku.total_slots - 1} jugadores ya te pagaron
            {faltan > 0 && ` · faltan ${faltan}`}. Registrá acá el de uno.
          </p>

          <div>
            <Label>Monto {account && `(${account.currency})`}</Label>
            <TextField
              value={amount}
              onChange={e => setAmount(parseDecimalInput(e.target.value, { decimals }))}
              inputMode="decimal" placeholder="0.00" className="fz-num"
            />
            {account && crossCurrencyAmount != null && (
              <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
                La parte de cada uno es {formatAmount(pasanaku.contribution_amount, pasanaku.currency)}. Según la
                tasa de hoy, unos {formatAmount(crossCurrencyAmount, account.currency)}.
                <button
                  type="button"
                  onClick={() => setAmount(String(crossCurrencyAmount))}
                  className="ml-1.5 font-semibold text-[var(--fz-accent)]"
                >
                  Usar {formatAmount(crossCurrencyAmount, account.currency)}
                </button>
              </p>
            )}
          </div>

          <div>
            <Label>Entra a</Label>
            {candidatas.length === 0 ? (
              <p className="text-[13px] text-[var(--fz-out-text)]">
                Todavía no tienes cuentas. Crea una en Cuentas para poder registrar el cobro.
              </p>
            ) : (
              <>
                {candidatas.length > 4 && (
                  <div className="mb-2">
                    <SearchField value={search} onChange={setSearch} placeholder="Buscar cuenta…" />
                  </div>
                )}
                <div className="fz-scroll-x flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                  {filtradas.map(a => (
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
                  {filtradas.length === 0 && (
                    <p className="text-[13px] text-[var(--fz-ink-3)] py-2">Ninguna cuenta coincide.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <Label>Fecha</Label>
            <DateField value={date} onChange={setDate} today={todayISO()} />
          </div>

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving} full>
            {saving ? 'Registrando…' : 'Registrar pago recibido'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
