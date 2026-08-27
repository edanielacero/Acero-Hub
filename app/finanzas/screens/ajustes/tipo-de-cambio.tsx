'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconRefresh } from '@tabler/icons-react'
import type { Currency } from '@/lib/finanzas/types'
import { CURRENCY_META, RATED_CURRENCIES } from '@/lib/finanzas/types'
import { PAIRS_FOR_CURRENCY, QUOTE_META } from '@/lib/finanzas/quotes'
import { amountFromInput, parseDecimalInput } from '@/lib/finanzas/money'
import { CurrencyIcon } from '../../components/currency-icon'
import { useFinanzas } from '../../components/data-context'
import { Btn, ErrorNote, Label, Panel, TextField } from '../../components/ui'
import { SettingsHeader, SettingsPage } from './shared'
import { fzFetch } from '../../components/fz-fetch'

/** "hace 3 min" es más útil que un timestamp para saber si una tasa está fresca. */
function relativo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.round(mins / 60)
  if (hs < 24) return `hace ${hs} h`
  return `hace ${Math.round(hs / 24)} d`
}

export function AjustesTipoCambioScreen() {
  const { rates, rateList, reload } = useFinanzas()

  const [draftRates, setDraftRates] = useState<Partial<Record<Currency, string>>>({})
  const [savingRate, setSavingRate] = useState<Currency | null>(null)
  const [savedRate, setSavedRate] = useState<Currency | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftRates(Object.fromEntries(RATED_CURRENCIES.map(c => [c, String(rates[c] ?? CURRENCY_META[c].defaultRate)])))
  }, [rates])

  async function patchRate(currency: Currency, body: Record<string, unknown>) {
    setError('')
    setSavingRate(currency)
    const res = await fzFetch('/api/finanzas/rates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, ...body }),
    })
    setSavingRate(null)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudo guardar la tasa')
    }
    await reload()
    setSavedRate(currency)
    setTimeout(() => setSavedRate(null), 2000)
  }

  async function saveManualRate(currency: Currency) {
    const value = amountFromInput(draftRates[currency] ?? '', { decimals: 8 })
    if (!Number.isFinite(value) || value <= 0) return setError('La tasa debe ser mayor a cero')
    await patchRate(currency, { rate: value, auto: false })
  }

  async function refreshNow() {
    setError('')
    setRefreshing(true)
    const res = await fzFetch('/api/finanzas/rates/refresh', { method: 'POST' })
    setRefreshing(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error ?? 'No se pudieron traer las cotizaciones')
    }
    await reload()
  }

  return (
    <SettingsPage>
      <SettingsHeader
        title="Tipo de cambio"
        action={
          <Btn size="sm" variant="soft" onClick={refreshNow} disabled={refreshing}>
            <IconRefresh size={16} stroke={2} />
            {refreshing ? 'Trayendo…' : 'Actualizar'}
          </Btn>
        }
      />

      <div className="flex flex-col gap-4">
        <ErrorNote>{error}</ErrorNote>

        <Panel>
          <p className="text-[13px] text-[var(--fz-ink-2)] mb-4">
            Se actualizan solas cuando abres la app. Cada movimiento congela la tasa
            del momento en que lo registras, así que esto <strong>no altera</strong> nada
            de lo ya guardado — solo cuánto vale hoy tu patrimonio.
          </p>

          <div className="flex flex-col gap-4">
            {RATED_CURRENCIES.map(c => {
              const meta = CURRENCY_META[c]
              const row = rateList.find(r => r.currency === c)
              const opciones = PAIRS_FOR_CURRENCY[c] ?? []
              const auto = row?.auto ?? true
              return (
                <div key={c} className="rounded-[var(--fz-r-tile)] bg-[var(--fz-surface-sunk)] p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <CurrencyIcon currency={c} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{meta.name}</p>
                      <p className="text-[12px] text-[var(--fz-ink-3)]">
                        {row ? `${row.source} · ${relativo(row.updated_at)}` : meta.rateLabel}
                      </p>
                    </div>
                    <p className="text-[20px] font-bold fz-num shrink-0">
                      {(row?.rate ?? meta.defaultRate).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                    </p>
                  </div>

                  {/* El Bs es el único con dos cotizaciones posibles. */}
                  {auto && opciones.length > 1 && (
                    <div className="flex gap-2 mb-2">
                      {opciones.map(pair => (
                        <button
                          key={pair}
                          type="button"
                          onClick={() => patchRate(c, { quote_pair: pair, auto: true })}
                          aria-pressed={row?.quote_pair === pair}
                          className={`flex-1 h-9 rounded-[var(--fz-r-pill)] text-[12px] font-semibold transition-colors ${
                            row?.quote_pair === pair
                              ? 'bg-[var(--fz-accent)] text-white'
                              : 'bg-[var(--fz-surface)] text-[var(--fz-ink-2)] border border-[var(--fz-hairline)]'
                          }`}
                        >
                          {QUOTE_META[pair].hint}
                        </button>
                      ))}
                    </div>
                  )}

                  {auto ? (
                    <button
                      type="button"
                      onClick={() => patchRate(c, { auto: false })}
                      className="text-[12px] font-semibold text-[var(--fz-ink-3)] hover:text-[var(--fz-ink)]"
                    >
                      Fijar a mano
                    </button>
                  ) : (
                    <div className="flex flex-col min-[420px]:flex-row gap-2 min-[420px]:items-end">
                      <div className="flex-1 min-w-0">
                        <Label>{meta.rateLabel}</Label>
                        <TextField
                          value={draftRates[c] ?? ''}
                          onChange={e => setDraftRates(d => ({ ...d, [c]: parseDecimalInput(e.target.value, { decimals: 8 }) }))}
                          inputMode="decimal"
                          className="fz-num"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Btn onClick={() => saveManualRate(c)} disabled={savingRate === c} className="flex-1">
                          {savedRate === c ? <IconCheck size={18} stroke={2.2} /> : 'Guardar'}
                        </Btn>
                        <Btn variant="ghost" onClick={() => patchRate(c, { auto: true })}>Auto</Btn>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
    </SettingsPage>
  )
}
