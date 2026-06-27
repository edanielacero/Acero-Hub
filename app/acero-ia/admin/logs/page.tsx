'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const MODEL_LABELS: Record<string, string> = {
  haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', 'gpt-image-2': 'Imagen',
}

interface LogEntry {
  id: string
  user_id: string
  userName: string
  model: string
  tokens_input: number
  tokens_output: number
  cost_usd: number
  created_at: string
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [modelFilter, setModelFilter] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const userIdFilter = searchParams.get('userId') || ''

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (modelFilter) params.set('model', modelFilter)
    if (userIdFilter) params.set('userId', userIdFilter)

    try {
      const res = await fetch(`/api/acero-ia/admin/logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [page, modelFilter, userIdFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleExportCSV = () => {
    const params = new URLSearchParams()
    params.set('format', 'csv')
    if (modelFilter) params.set('model', modelFilter)
    if (userIdFilter) params.set('userId', userIdFilter)
    window.open(`/api/acero-ia/admin/logs?${params}`, '_blank')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/acero-ia/admin')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--aia-text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h1 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>Logs de uso</h1>
          <span className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>{total} registros</span>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors duration-200"
          style={{ backgroundColor: 'var(--aia-bg-elevated)', color: 'var(--aia-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 px-4 py-3 text-[11px]" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--aia-text-muted)' }}>Modelo:</span>
          <div className="flex gap-1">
            {[{ value: '', label: 'Todos' }, { value: 'haiku', label: 'Haiku' }, { value: 'sonnet', label: 'Sonnet' }, { value: 'opus', label: 'Opus' }, { value: 'gpt-image-2', label: 'Imagen' }].map(m => (
              <button
                key={m.value}
                onClick={() => { setModelFilter(m.value); setPage(1) }}
                className="px-2 py-1 rounded cursor-pointer transition-colors duration-200"
                style={{
                  backgroundColor: modelFilter === m.value ? 'var(--aia-bg-hover)' : 'transparent',
                  color: modelFilter === m.value ? 'var(--aia-amber)' : 'var(--aia-text-secondary)',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {userIdFilter && (
          <button
            onClick={() => router.push('/acero-ia/admin/logs')}
            className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-[11px]"
            style={{ backgroundColor: 'var(--aia-bg-hover)', color: 'var(--aia-amber)' }}
          >
            Filtrado por usuario
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-10 rounded animate-pulse" style={{ backgroundColor: 'var(--aia-bg-elevated)' }} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--aia-text-muted)' }}>Sin logs</p>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--aia-border)' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ backgroundColor: 'var(--aia-bg-surface)' }}>
                    <th className="text-left px-3 py-2.5 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Fecha</th>
                    <th className="text-left px-3 py-2.5 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Usuario</th>
                    <th className="text-left px-3 py-2.5 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Modelo</th>
                    <th className="text-right px-3 py-2.5 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Input</th>
                    <th className="text-right px-3 py-2.5 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Output</th>
                    <th className="text-right px-3 py-2.5 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--aia-border)' }}>
                      <td className="px-3 py-2.5" style={{ color: 'var(--aia-text-secondary)' }}>
                        {new Date(l.created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--aia-text-primary)' }}>{l.userName}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--aia-text-secondary)' }}>{MODEL_LABELS[l.model] ?? l.model}</td>
                      <td className="px-3 py-2.5 text-right" style={{ color: 'var(--aia-text-muted)', fontFamily: 'var(--font-aia-mono)' }}>
                        {l.tokens_input > 0 ? l.tokens_input.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right" style={{ color: 'var(--aia-text-muted)', fontFamily: 'var(--font-aia-mono)' }}>
                        {l.tokens_output > 0 ? l.tokens_output.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right" style={{ color: 'var(--aia-text-primary)', fontFamily: 'var(--font-aia-mono)' }}>
                        ${l.cost_usd.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer"
                  style={{ backgroundColor: 'var(--aia-bg-elevated)', color: page <= 1 ? 'var(--aia-text-muted)' : 'var(--aia-text-secondary)', opacity: page <= 1 ? 0.5 : 1 }}
                >
                  Anterior
                </button>
                <span className="text-[12px]" style={{ color: 'var(--aia-text-muted)' }}>{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer"
                  style={{ backgroundColor: 'var(--aia-bg-elevated)', color: page >= totalPages ? 'var(--aia-text-muted)' : 'var(--aia-text-secondary)', opacity: page >= totalPages ? 0.5 : 1 }}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
