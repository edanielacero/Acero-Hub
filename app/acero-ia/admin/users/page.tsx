'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface UserRow {
  userId: string
  userName: string
  spent: number
  limit: number
  isUnlimited: boolean
  percentage: number
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function load() {
      try {
        const [limitsRes, logsRes] = await Promise.all([
          fetch('/api/acero-ia/admin/limits'),
          fetch('/api/acero-ia/admin/logs?page=1'),
        ])

        const limitsArr = limitsRes.ok ? await limitsRes.json() : []
        const logsData = logsRes.ok ? await logsRes.json() : { logs: [] }

        const spentByUser: Record<string, number> = {}
        for (const log of logsData.logs || []) {
          spentByUser[log.user_id] = (spentByUser[log.user_id] || 0) + Number(log.cost_usd)
        }

        // If there are more pages, fetch all to get complete totals
        if (logsData.totalPages > 1) {
          const allPages = await Promise.all(
            Array.from({ length: logsData.totalPages - 1 }, (_, i) =>
              fetch(`/api/acero-ia/admin/logs?page=${i + 2}`).then(r => r.json())
            )
          )
          for (const pageData of allPages) {
            for (const log of pageData.logs || []) {
              spentByUser[log.user_id] = (spentByUser[log.user_id] || 0) + Number(log.cost_usd)
            }
          }
        }

        const result: UserRow[] = (Array.isArray(limitsArr) ? limitsArr : []).map((l: { user_id: string; monthly_limit: number; is_unlimited: boolean; userName: string }) => {
          const spent = spentByUser[l.user_id] || 0
          return {
            userId: l.user_id,
            userName: l.userName,
            spent,
            limit: l.monthly_limit,
            isUnlimited: l.is_unlimited,
            percentage: l.is_unlimited ? 0 : Math.min(100, Math.round((spent / l.monthly_limit) * 100)),
          }
        })

        result.sort((a, b) => b.spent - a.spent)
        setUsers(result)
      } catch {
        // silent
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--aia-border)' }}>
        <button onClick={() => router.push('/acero-ia/admin')} className="p-1 rounded cursor-pointer" style={{ color: 'var(--aia-text-muted)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="text-[16px] font-semibold" style={{ fontFamily: 'var(--font-aia-heading)' }}>Costos por usuario</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--aia-bg-elevated)' }} />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="text-[13px] text-center py-10" style={{ color: 'var(--aia-text-muted)' }}>Sin usuarios registrados</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--aia-border)' }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--aia-bg-surface)' }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Usuario</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Gasto</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Límite</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--aia-text-muted)' }}>Uso</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u.userId}
                    className="cursor-pointer transition-colors duration-200"
                    style={{ borderTop: '1px solid var(--aia-border)' }}
                    onClick={() => router.push(`/acero-ia/admin/logs?userId=${u.userId}`)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--aia-text-primary)' }}>{u.userName}</td>
                    <td className="px-4 py-3 text-right" style={{ fontFamily: 'var(--font-aia-mono)', color: 'var(--aia-text-primary)' }}>
                      ${u.spent.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--aia-text-secondary)' }}>
                      {u.isUnlimited ? 'Ilimitado' : `$${u.limit.toFixed(2)}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span style={{ color: u.percentage >= 80 ? 'var(--aia-error)' : u.percentage >= 50 ? 'var(--aia-warning)' : 'var(--aia-text-secondary)' }}>
                        {u.isUnlimited ? '—' : `${u.percentage}%`}
                      </span>
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
