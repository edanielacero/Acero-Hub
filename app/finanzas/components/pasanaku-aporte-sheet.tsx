'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconRotateClockwise2, IconX } from '@tabler/icons-react'
import type { PasanakuWithState } from '@/lib/finanzas/types'
import { amountFromInput, crossCurrencySuggestion, decimalsFor, formatAmount, parseDecimalInput, roundFor } from '@/lib/finanzas/money'
import { todayISO } from '@/lib/finanzas/transactions'
import { AmountField } from './amount-field'
import { useFinanzas } from './data-context'
import { CurrencyIcon } from './currency-icon'
import { Btn, DateField, ErrorNote, IconChip, Label, SearchField, TextField } from './ui'

/**
 * Registrar un aporte del mes — o uno viejo que ya diste y todavía no
 * cargaste. Un `gasto` como cualquier otro: no puede superar el saldo de la
 * cuenta elegida.
 *
 * El pasanaku no tiene cuenta propia — se elige acá, cada vez, igual que
 * "Sale de" en RegisterSheet (Fijos): cada aporte puede salir de una cuenta
 * distinta (un mes en efectivo, otro desde el banco) sin que eso afecte a los
 * ya registrados, que guardan su propio `account_id`. Sin cuentas de
 * inversión: el server las rechaza igual (ver POST /pasanaku/[id]/aporte).
 *
 * Todo aporte que se registra acá mueve plata de una cuenta real. Los
 * "aportes de antes de usar la app" (fin_pasanaku_historico) ya no se cargan
 * desde acá — los que existen se siguen viendo y borrando desde el detalle.
 */
export function PasanakuAporteSheet({ pasanaku, onClose, onDone }: {
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

  // El pasanaku no tiene cuenta propia (se elige acá, cada vez) — pero si ya
  // aportaste antes desde una, esta pantalla la sugiere igual que
  // RegisterSheet recuerda la última cuenta usada. Puede no haber ninguna.
  const [accountId, setAccountId] = useState(pasanaku.account_id ?? '')
  const account = candidatas.find(a => a.id === accountId)
  const decimals = decimalsFor(account?.currency ?? pasanaku.currency)

  // `contribution_amount` está denominado en `pasanaku.currency`, no en la
  // cuenta elegida acá — sin esto, elegir una cuenta en otra moneda dejaba el
  // mismo número tal cual (300 Bs pasaba a "valer" 300 USD, ~7x de más) en
  // vez de convertirlo.
  const sugerido = account
    ? crossCurrencySuggestion(pasanaku.contribution_amount, pasanaku.currency, account.currency, rates)
    : null
  const crossCurrency = sugerido != null

  // Ya convertido si la cuenta recordada de más arriba es de otra moneda que el
  // pasanaku — si no, el primer render mostraba el número crudo sin
  // convertir hasta que el efecto de más abajo lo corregía recién después
  // del primer pintado (bug encontrado en la revisión del 2026-08-22).
  const [amount, setAmount] = useState(String(sugerido ?? pasanaku.contribution_amount))
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Se dispara solo cuando la MONEDA cambia, no en cada cambio de cuenta —
  // mismo criterio que RegisterSheet (Fijos): así no pisa un monto que ya
  // editaste a mano al elegir otra cuenta de la misma moneda.
  useEffect(() => {
    if (!account) return
    setAmount(String(account.currency === pasanaku.currency ? pasanaku.contribution_amount : sugerido))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.currency])

  const value = amountFromInput(amount, { decimals })
  // Un aporte tampoco puede comerse lo apartado como ahorro: mismo piso que
  // aplica el servidor en `assertBalance`. Para aportar con plata ahorrada hay
  // que retirarla antes, a mano y con su motivo.
  const apartado = account?.savings_balance ?? 0
  const disponible = account
    ? Math.max(0, roundFor((account.balance ?? 0) - apartado, account.currency))
    : 0
  const excede = !!account && Number.isFinite(value) && value > disponible
  const sinFondos = !!account && disponible <= 0

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
    if (!Number.isFinite(value) || value <= 0) return setError('Pon un monto mayor a cero')

    if (!accountId) return setError('Elige de qué cuenta sale')
    if (excede) return setError(`${account!.name} tiene ${formatAmount(disponible, account!.currency)} disponibles`)

    setSaving(true)
    const res = await fetch(`/api/finanzas/pasanaku/${pasanaku.id}/aporte`, {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end min-[900px]:items-center min-[900px]:justify-center">
      <div className="fz-backdrop absolute inset-0 bg-[rgba(16,24,40,0.35)]" onClick={onClose} aria-hidden />

      <div
        role="dialog" aria-modal="true" aria-label={`Registrar aporte de ${pasanaku.name}`}
        className="fz-sheet relative w-full min-[900px]:w-[420px] max-h-[92dvh] min-[900px]:max-h-[86dvh] overflow-y-auto overflow-x-hidden bg-[var(--fz-surface)] shadow-[var(--fz-sh-modal)]"
      >
        <div className="min-[900px]:hidden pt-2.5 pb-1 flex justify-center" aria-hidden>
          <span className="w-9 h-1 rounded-full bg-[var(--fz-hairline)]" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.01em]">
            <IconChip><IconRotateClockwise2 size={18} stroke={1.8} /></IconChip>
            Registrar aporte
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
            <AmountField
              value={amount}
              onChange={setAmount}
              currency={account?.currency ?? null}
              decimals={decimals}
              exceeded={excede}
              footer={account ? (
                <>
                  <span className={`text-[12.5px] font-medium fz-num min-w-0 truncate ${excede || sinFondos ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-2)]'}`}>
                    Disponible {formatAmount(disponible, account.currency)}
                    {apartado > 0 && (
                      <span className="text-[var(--fz-ink-3)] font-normal">
                        {' '}· {formatAmount(apartado, account.currency)} en ahorros
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={sinFondos}
                    onClick={() => setAmount(String(roundFor(disponible, account.currency)))}
                    className="shrink-0 h-7 px-2.5 rounded-[var(--fz-r-pill)] bg-[var(--fz-surface)] border border-[var(--fz-hairline)] text-[11.5px] font-bold tracking-wide text-[var(--fz-ink-2)] disabled:opacity-40 disabled:pointer-events-none"
                  >
                    MÁX
                  </button>
                </>
              ) : undefined}
            />
            {crossCurrency && account && sugerido != null && (
              <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-[var(--fz-ink-3)] mt-1.5">
                El aporte es {formatAmount(pasanaku.contribution_amount, pasanaku.currency)}. Según la tasa de
                hoy, unos {formatAmount(sugerido, account.currency)}.
                <button
                  type="button"
                  onClick={() => setAmount(String(sugerido))}
                  className="font-semibold text-[var(--fz-accent)]"
                >
                  Usar {formatAmount(sugerido, account.currency)}
                </button>
              </p>
            )}
          </div>

          <div>
            <Label>Sale de</Label>
            {candidatas.length === 0 ? (
              <p className="text-[13px] text-[var(--fz-out-text)]">
                Todavía no tienes cuentas. Crea una en Cuentas para poder registrar el aporte.
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
                {account && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[13px] font-medium fz-num ${excede || sinFondos ? 'text-[var(--fz-out-text)]' : 'text-[var(--fz-ink-2)]'}`}>
                      Disponible {formatAmount(disponible, account.currency)}
                      {apartado > 0 && (
                        <span className="text-[var(--fz-ink-3)]">
                          {' '}· {formatAmount(apartado, account.currency)} en ahorros
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAmount(String(roundFor(disponible, account.currency)))}
                      disabled={sinFondos}
                      className="h-6 px-2 rounded-[var(--fz-r-pill)] bg-[var(--fz-accent-tint)] text-[var(--fz-accent)] text-[11px] font-bold tracking-wide disabled:opacity-40 disabled:pointer-events-none"
                    >
                      MAX
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <Label>Fecha</Label>
            <DateField value={date} onChange={setDate} today={todayISO()} />
            <p className="text-[12px] text-[var(--fz-ink-3)] mt-1.5">
              También puedes cargar acá los aportes de meses anteriores que ya diste.
            </p>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <Btn onClick={submit} disabled={saving || excede || sinFondos} full>
            {saving ? 'Registrando…'
              : sinFondos ? 'Sin saldo disponible'
              : excede ? 'Supera el saldo'
              : 'Registrar aporte'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
