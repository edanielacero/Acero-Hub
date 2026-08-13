'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { api } from '@/lib/finanzas/api-client'
import { latestRateByPair, type ExchangeRate, type RatePair, type RateFetchResult } from '@/lib/finanzas/exchange-rates'

const PAIR_LABELS: Record<RatePair, { label: string; hint: string }> = {
  USD_BOB:  { label: 'USD → Bs (oficial)',   hint: 'Banco Central de Bolivia, vía dolarapi.com' },
  BOB_USDT: { label: 'Bs → USDT (paralelo)', hint: 'Promedio P2P, vía paralelo.bo' },
  BTC_USDT: { label: 'BTC → USDT',           hint: 'Vía Binance' },
}

export default function TipoCambioPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshErrors, setRefreshErrors] = useState<RateFetchResult[]>([])
  const [overridePair, setOverridePair] = useState<RatePair | null>(null)
  const [overrideValue, setOverrideValue] = useState('')

  async function load() {
    setLoading(true)
    const res = await api('/exchange-rates')
    const json = await res.json()
    setRates(json.rates ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const latest = useMemo(() => latestRateByPair(rates), [rates])

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshErrors([])
    const res = await api('/exchange-rates/refresh', { method: 'POST' })
    const json = await res.json()
    setRefreshing(false)
    if (res.ok) {
      const failed = (json.results ?? []).filter((r: RateFetchResult) => !r.ok)
      setRefreshErrors(failed)
      load()
    }
  }

  async function handleOverride() {
    if (!overridePair) return
    const value = Number(overrideValue)
    if (!Number.isFinite(value) || value <= 0) return
    await api('/exchange-rates', { method: 'POST', body: JSON.stringify({ pair: overridePair, rate: value }) })
    setOverridePair(null)
    setOverrideValue('')
    load()
  }

  return (
    <div>
      <div className="fz-safe-top px-4 pt-3 pb-4 flex items-start justify-between gap-3">
        <h1 className="fz-title">Tipo de cambio</h1>
        <button onClick={handleRefresh} disabled={refreshing} className="fz-icon-btn mt-1 disabled:opacity-40" aria-label="Actualizar">
          <IconRefresh size={16} stroke={1.8} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {refreshErrors.length > 0 && (
          <div className="fz-card p-3 flex flex-col gap-1">
            {refreshErrors.map(r => (
              <p key={r.pair} className="text-[12px]" style={{ color: 'var(--text-danger)' }}>
                {PAIR_LABELS[r.pair].label}: {!r.ok && r.error}
              </p>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <div className="fz-card">
            {(Object.keys(PAIR_LABELS) as RatePair[]).map(pair => {
              const rate = latest.get(pair)
              return (
                <button key={pair} onClick={() => { setOverridePair(pair); setOverrideValue(rate ? String(rate.rate) : '') }} className="fz-row w-full text-left cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px]" style={{ color: 'var(--text-primary)' }}>{PAIR_LABELS[pair].label}</p>
                    <p className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {rate
                        ? `${rate.source}${rate.is_manual_override ? ' · manual' : ''} · ${new Date(rate.fetched_at).toLocaleString('es-ES')}`
                        : PAIR_LABELS[pair].hint + ' · sin datos'}
                    </p>
                  </div>
                  <span className="fz-tabular font-semibold text-[15px] shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {rate ? rate.rate.toLocaleString('es-ES', { maximumFractionDigits: 4 }) : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {overridePair && (
        <div className="fz-sheet-overlay" onClick={() => setOverridePair(null)}>
          <div className="fz-sheet" onClick={e => e.stopPropagation()}>
            <div className="fz-sheet-handle" />
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setOverridePair(null)} className="fz-btn-text">Cancelar</button>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{PAIR_LABELS[overridePair].label}</span>
              <button onClick={handleOverride} className="fz-btn-text font-semibold">Guardar</button>
            </div>
            <div className="px-4 pb-2">
              <div className="fz-card">
                <div className="fz-row">
                  <span className="fz-field-label">Fijar manual</span>
                  <input type="number" step="0.0001" autoFocus value={overrideValue} onChange={e => setOverrideValue(e.target.value)} placeholder="0.0000" className="fz-field-input fz-tabular" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
