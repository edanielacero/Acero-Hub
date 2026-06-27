'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface LimitRow {
  id: string
  user_id: string
  monthly_limit: number
  is_unlimited: boolean
  userName: string
}

export default function AdminLimitsPage() {
  const [limits, setLimits] = useState<LimitRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const router = useRouter()

  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch('/api/acero-ia/admin/limits')
      if (res.ok) setLimits(await res.json())
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLimits()
  }, [fetchLimits])

  const handleToggleUnlimited = async (userId: string, currentlyUnlimited: boolean) => {
    await fetch('/api/acero-ia/admin/limits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isUnlimited: !currentlyUnlimited }),
    })
    setLimits(prev => prev.map(l => l.user_id === userId ? { ...l, is_unlimited: !currentlyUnlimited } : l))
  }

  const handleSaveLimit = async (userId: string) => {
    const value = parseFloat(editValue)
    if (isNaN(value) || value <= 0) return

    await fetch('/api/acero-ia/admin/limits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, monthlyLimit: value }),
    })
    setLimits(prev => prev.map(l => l.user_id === userId ? { ...l, monthly_limit: value } : l))
    setEditingUserId(null)
    setEditValue('')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <button onClick={() => router.push('/acero-ia/admin')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--aia-text-muted)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>Gestión de límites</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--aia-bg-elevated)' }} />
            ))}
          </div>
        ) : limits.length === 0 ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--aia-text-muted)' }}>Sin usuarios con límites configurados</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--aia-border)' }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--aia-bg-surface)' }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Usuario</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Límite mensual</th>
                  <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Ilimitado</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {limits.map(l => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--aia-border)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--aia-text-primary)' }}>{l.userName}</td>
                    <td className="px-4 py-3 text-right">
                      {editingUserId === l.user_id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span style={{ color: 'var(--aia-text-muted)' }}>$</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            className="w-20 px-2 py-1 rounded text-right bg-transparent outline-none text-[12px]"
                            style={{ border: '1px solid var(--aia-border)', color: 'var(--aia-text-primary)' }}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveLimit(l.user_id); if (e.key === 'Escape') setEditingUserId(null) }}
                          />
                          <button
                            onClick={() => handleSaveLimit(l.user_id)}
                            className="px-2 py-1 rounded cursor-pointer text-[11px]"
                            style={{ backgroundColor: 'var(--aia-amber)', color: '#08090a' }}
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-aia-mono)', color: l.is_unlimited ? 'var(--aia-text-muted)' : 'var(--aia-text-primary)' }}>
                          ${l.monthly_limit.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleUnlimited(l.user_id, l.is_unlimited)}
                        className="w-9 h-5 rounded-full cursor-pointer transition-colors duration-200 relative"
                        style={{ backgroundColor: l.is_unlimited ? 'var(--aia-amber)' : 'var(--aia-bg-hover)' }}
                      >
                        <div
                          className="w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all duration-200"
                          style={{
                            backgroundColor: l.is_unlimited ? '#08090a' : 'var(--aia-text-muted)',
                            left: l.is_unlimited ? '18px' : '3px',
                          }}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEditingUserId(l.user_id); setEditValue(String(l.monthly_limit)) }}
                        className="px-2 py-1 rounded cursor-pointer text-[11px] transition-colors duration-200"
                        style={{ color: 'var(--aia-text-muted)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-text-secondary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-muted)')}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
