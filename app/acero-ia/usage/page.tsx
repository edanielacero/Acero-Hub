'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const MODEL_LABELS: Record<string, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  'gpt-image-2': 'Imagen',
}

interface UsageData {
  spent: number
  limit: number
  isUnlimited: boolean
  percentage: number
  byModel: Record<string, number>
  daily: { date: string; cost: number }[]
  recentLogs: { model: string; tokensInput: number; tokensOutput: number; cost: number; date: string }[]
  daysRemaining: number
  projectedTotal: number
  projectedLimitDate: string | null
  periodStart: string
  periodEnd: string
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/acero-ia/usage')
      .then(res => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--aia-bg-elevated)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const barColor = data.percentage >= 80 ? 'var(--aia-error)' : data.percentage >= 50 ? 'var(--aia-warning)' : 'var(--aia-success)'
  const maxDaily = Math.max(...data.daily.map(d => d.cost), 0.001)

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <button
          onClick={() => router.push('/acero-ia')}
          className="p-1 rounded cursor-pointer"
          style={{ color: 'var(--aia-text-muted)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>
          Consumo
        </h1>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Summary card */}
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
          <div className="flex justify-between items-end mb-3">
            <div>
              <p className="text-[11px] mb-1" style={{ color: 'var(--aia-text-muted)' }}>Gasto del período</p>
              <p className="text-[28px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-primary)' }}>
                ${data.spent.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] mb-1" style={{ color: 'var(--aia-text-muted)' }}>
                {data.isUnlimited ? 'Ilimitado' : `Límite: $${data.limit.toFixed(2)}`}
              </p>
              <p className="text-[13px]" style={{ color: 'var(--aia-text-secondary)' }}>
                {data.daysRemaining} días restantes
              </p>
            </div>
          </div>
          {!data.isUnlimited && (
            <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--aia-bg-hover)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${data.percentage}%`, backgroundColor: barColor }}
              />
            </div>
          )}
          {data.projectedLimitDate && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--aia-warning)' }}>
              A este ritmo, llegarás al límite el {new Date(data.projectedLimitDate).toLocaleDateString('es', { day: 'numeric', month: 'long' })}
            </p>
          )}
        </div>

        {/* By model */}
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
          <h2 className="text-[13px] font-medium mb-3" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
            Desglose por modelo
          </h2>
          <div className="space-y-2.5">
            {Object.entries(data.byModel)
              .sort(([, a], [, b]) => b - a)
              .map(([model, cost]) => {
                const pct = data.spent > 0 ? (cost / data.spent) * 100 : 0
                return (
                  <div key={model}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span style={{ color: 'var(--aia-text-secondary)' }}>{MODEL_LABELS[model] ?? model}</span>
                      <span style={{ color: 'var(--aia-text-primary)' }}>${cost.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--aia-bg-hover)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--aia-amber)' }}
                      />
                    </div>
                  </div>
                )
              })}
            {Object.keys(data.byModel).length === 0 && (
              <p className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>Sin uso aún</p>
            )}
          </div>
        </div>

        {/* Daily chart */}
        {data.daily.length > 0 && (
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
            <h2 className="text-[13px] font-medium mb-3" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
              Historial diario
            </h2>
            <div className="flex items-end gap-1 h-24">
              {data.daily.slice(-14).map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm min-h-[2px]"
                    style={{
                      height: `${Math.max(2, (d.cost / maxDaily) * 80)}px`,
                      backgroundColor: 'var(--aia-amber)',
                      opacity: 0.7,
                    }}
                  />
                  <span className="text-[8px]" style={{ color: 'var(--aia-text-muted)' }}>
                    {new Date(d.date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent logs */}
        <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
          <h2 className="text-[13px] font-medium mb-3" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
            Últimas interacciones
          </h2>
          {data.recentLogs.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>Sin interacciones aún</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ color: 'var(--aia-text-muted)' }}>
                    <th className="text-left pb-2 font-medium">Fecha</th>
                    <th className="text-left pb-2 font-medium">Modelo</th>
                    <th className="text-right pb-2 font-medium">Tokens</th>
                    <th className="text-right pb-2 font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentLogs.map((log, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--aia-border)' }}>
                      <td className="py-2" style={{ color: 'var(--aia-text-secondary)' }}>
                        {new Date(log.date).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2" style={{ color: 'var(--aia-text-secondary)' }}>
                        {MODEL_LABELS[log.model] ?? log.model}
                      </td>
                      <td className="py-2 text-right" style={{ color: 'var(--aia-text-muted)', fontFamily: 'var(--font-aia-mono)' }}>
                        {log.tokensInput + log.tokensOutput > 0 ? `${log.tokensInput + log.tokensOutput}` : '—'}
                      </td>
                      <td className="py-2 text-right" style={{ color: 'var(--aia-text-primary)', fontFamily: 'var(--font-aia-mono)' }}>
                        ${log.cost.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
