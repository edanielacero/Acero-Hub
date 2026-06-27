'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const MODEL_LABELS: Record<string, string> = {
  haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', 'gpt-image-2': 'Imagen',
}

interface DashboardData {
  totalSpent: number
  activeUsers: number
  totalConversations: number
  totalMessages: number
  byModel: Record<string, number>
  daily: { date: string; cost: number }[]
  topUsers: { userId: string; name: string; spent: number; percentage: number }[]
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/acero-ia/admin/dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--aia-bg-elevated)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const maxDaily = Math.max(...data.daily.map(d => d.cost), 0.001)

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/acero-ia')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--aia-text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h1 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>Admin</h1>
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Usuarios', href: '/acero-ia/admin/users' },
            { label: 'Límites', href: '/acero-ia/admin/limits' },
            { label: 'Logs', href: '/acero-ia/admin/logs' },
          ].map(tab => (
            <a
              key={tab.href}
              href={tab.href}
              className="px-3 py-1.5 rounded-lg text-[12px] no-underline cursor-pointer transition-colors duration-200"
              style={{ backgroundColor: 'var(--aia-bg-elevated)', color: 'var(--aia-text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Gasto del mes', value: `$${data.totalSpent.toFixed(2)}` },
            { label: 'Usuarios activos', value: String(data.activeUsers) },
            { label: 'Conversaciones', value: String(data.totalConversations) },
            { label: 'Mensajes', value: String(data.totalMessages) },
          ].map(card => (
            <div key={card.label} className="rounded-xl p-4" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
              <p className="text-[11px] mb-1" style={{ color: 'var(--aia-text-muted)' }}>{card.label}</p>
              <p className="text-[20px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Daily chart */}
        {data.daily.length > 0 && (
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
            <h2 className="text-[13px] font-medium mb-3" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
              Gasto diario
            </h2>
            <div className="flex items-end gap-1 h-28">
              {data.daily.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm min-h-[2px]"
                    style={{ height: `${Math.max(2, (d.cost / maxDaily) * 100)}px`, backgroundColor: 'var(--aia-amber)', opacity: 0.7 }}
                  />
                  <span className="text-[8px]" style={{ color: 'var(--aia-text-muted)' }}>
                    {new Date(d.date + 'T12:00:00').toLocaleDateString('es', { day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* By model */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
            <h2 className="text-[13px] font-medium mb-3" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
              Desglose por modelo
            </h2>
            <div className="space-y-2.5">
              {Object.entries(data.byModel).sort(([, a], [, b]) => b - a).map(([model, cost]) => {
                const pct = data.totalSpent > 0 ? (cost / data.totalSpent) * 100 : 0
                return (
                  <div key={model}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span style={{ color: 'var(--aia-text-secondary)' }}>{MODEL_LABELS[model] ?? model}</span>
                      <span style={{ color: 'var(--aia-text-primary)' }}>${cost.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--aia-bg-hover)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--aia-amber)' }} />
                    </div>
                  </div>
                )
              })}
              {Object.keys(data.byModel).length === 0 && (
                <p className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>Sin uso</p>
              )}
            </div>
          </div>

          {/* Top users */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--aia-bg-elevated)' }}>
            <h2 className="text-[13px] font-medium mb-3" style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-secondary)' }}>
              Top usuarios
            </h2>
            {data.topUsers.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>Sin datos</p>
            ) : (
              <div className="space-y-2">
                {data.topUsers.map((u, i) => (
                  <div key={u.userId} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center" style={{ color: 'var(--aia-text-muted)' }}>{i + 1}</span>
                      <span style={{ color: 'var(--aia-text-primary)' }}>{u.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{ color: 'var(--aia-text-muted)' }}>{u.percentage}%</span>
                      <span style={{ color: 'var(--aia-text-primary)', fontFamily: 'var(--font-aia-mono)' }}>${u.spent.toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
