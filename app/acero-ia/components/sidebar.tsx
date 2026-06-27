'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useUsage } from './shell'

interface Conversation {
  id: string
  title: string | null
  last_model_used: string | null
  updated_at: string
}

interface SidebarProps {
  userId: string
  onOpenPresets: () => void
}

export default function Sidebar({ userId, onOpenPresets }: SidebarProps) {
  const { usage } = useUsage()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [archivedConversations, setArchivedConversations] = useState<Conversation[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const activeId = pathname.startsWith('/acero-ia/') && pathname !== '/acero-ia'
    ? pathname.split('/')[2]
    : null

  const fetchConversations = useCallback(async () => {
    try {
      const [activeRes, archivedRes] = await Promise.all([
        fetch('/api/acero-ia/conversations'),
        fetch('/api/acero-ia/conversations?archived=true'),
      ])
      if (activeRes.ok) setConversations(await activeRes.json())
      if (archivedRes.ok) setArchivedConversations(await archivedRes.json())
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations, pathname])

  const handleNewConversation = useCallback(() => {
    router.push('/acero-ia')
    setIsOpen(false)
  }, [router])

  const handleSelectConversation = useCallback((id: string) => {
    router.push(`/acero-ia/${id}`)
    setIsOpen(false)
  }, [router])

  const handleArchiveConversation = useCallback(async (e: React.MouseEvent, id: string, archived: boolean) => {
    e.stopPropagation()
    await fetch(`/api/acero-ia/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: !archived }),
    })
    fetchConversations()
    if (activeId === id && !archived) router.push('/acero-ia')
  }, [activeId, router, fetchConversations])

  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const confirmed = window.confirm('¿Eliminar esta conversación?')
    if (!confirmed) return

    await fetch(`/api/acero-ia/conversations/${id}`, { method: 'DELETE' })
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeId === id) router.push('/acero-ia')
  }, [activeId, router])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = diff / (1000 * 60 * 60)

    if (hours < 1) return 'Hace un momento'
    if (hours < 24) return `Hace ${Math.floor(hours)}h`
    if (hours < 48) return 'Ayer'
    return date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  }

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <polygon points="12,2 20,8 17,18 7,18 4,8" />
          <line x1="12" y1="2" x2="17" y2="18" />
          <line x1="12" y1="2" x2="7" y2="18" />
          <line x1="4" y1="8" x2="20" y2="8" />
        </svg>
        <span
          className="text-[15px] font-semibold tracking-tight"
          style={{ fontFamily: 'var(--font-aia-heading)', color: 'var(--aia-text-primary)' }}
        >
          Acero IA
        </span>
      </div>

      {/* New conversation button */}
      <div className="px-3 mb-2">
        <button
          onClick={handleNewConversation}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-colors duration-200"
          style={{
            border: '1px solid var(--aia-border)',
            color: 'var(--aia-text-primary)',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nueva conversación
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="px-3 space-y-3 mt-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--aia-bg-hover)', width: `${60 + i * 8}%` }} />
                <div className="h-3 w-16 rounded animate-pulse" style={{ backgroundColor: 'var(--aia-bg-hover)' }} />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-[12px] px-3 mt-4" style={{ color: 'var(--aia-text-muted)' }}>
            Sin conversaciones aún
          </p>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className="group flex items-center justify-between px-3 py-2.5 rounded-xl mb-0.5 cursor-pointer transition-colors duration-200"
              style={{
                backgroundColor: activeId === conv.id ? 'var(--aia-bg-hover)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (activeId !== conv.id) e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)'
              }}
              onMouseLeave={e => {
                if (activeId !== conv.id) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] truncate font-medium"
                  style={{ color: activeId === conv.id ? 'var(--aia-text-primary)' : 'var(--aia-text-secondary)' }}
                >
                  {conv.title || 'Nueva conversación'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--aia-text-muted)' }}>
                  {formatDate(conv.updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                  onClick={(e) => handleArchiveConversation(e, conv.id, false)}
                  className="p-1 rounded cursor-pointer"
                  style={{ color: 'var(--aia-text-muted)' }}
                  title="Archivar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                </button>
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="p-1 rounded cursor-pointer"
                  style={{ color: 'var(--aia-text-muted)' }}
                  title="Eliminar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}

        {/* Archived section */}
        {archivedConversations.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] cursor-pointer w-full"
              style={{ color: 'var(--aia-text-muted)' }}
            >
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 200ms' }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Archivadas ({archivedConversations.length})
            </button>
            {showArchived && archivedConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv.id)}
                className="group flex items-center justify-between px-3 py-2 rounded-xl mb-0.5 cursor-pointer transition-colors duration-200"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <p className="text-[12px] truncate flex-1 min-w-0" style={{ color: 'var(--aia-text-muted)' }}>
                  {conv.title || 'Sin título'}
                </p>
                <button
                  onClick={(e) => handleArchiveConversation(e, conv.id, true)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded cursor-pointer transition-opacity duration-200"
                  style={{ color: 'var(--aia-text-muted)' }}
                  title="Desarchivar"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--aia-border)' }}>
        <a
          href="/acero-ia/usage"
          className="block rounded-xl p-3 cursor-pointer transition-colors duration-200 no-underline"
          style={{ backgroundColor: 'var(--aia-bg-elevated)' }}
          onClick={() => setIsOpen(false)}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
        >
          {usage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--aia-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--aia-text-secondary)' }}>Consumo</span>
                </div>
                <span className="text-[11px] font-medium" style={{ color: usage.percentage >= 80 ? 'var(--aia-error)' : 'var(--aia-text-primary)' }}>
                  {usage.isUnlimited ? 'Ilimitado' : `${usage.percentage}%`}
                </span>
              </div>
              {!usage.isUnlimited && (
                <>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--aia-bg-deep)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(usage.percentage, 2)}%`,
                        backgroundColor: usage.percentage >= 80 ? 'var(--aia-error)' : usage.percentage >= 50 ? 'var(--aia-warning)' : 'var(--aia-amber)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px]" style={{ color: 'var(--aia-text-muted)' }}>
                    <span>${usage.spent.toFixed(2)} usado</span>
                    <span>${usage.limit.toFixed(2)} límite</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-[11px]">
                <span style={{ color: 'var(--aia-text-muted)' }}>Consumo</span>
                <div className="h-3 w-10 rounded animate-pulse" style={{ backgroundColor: 'var(--aia-bg-hover)' }} />
              </div>
              <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--aia-bg-deep)' }} />
              <div className="flex justify-between">
                <div className="h-2.5 w-14 rounded animate-pulse" style={{ backgroundColor: 'var(--aia-bg-hover)' }} />
                <div className="h-2.5 w-14 rounded animate-pulse" style={{ backgroundColor: 'var(--aia-bg-hover)' }} />
              </div>
            </div>
          )}
        </a>

        <div className="flex gap-2">
          <button
            onClick={() => { onOpenPresets(); setIsOpen(false) }}
            className="flex-1 h-8 rounded-lg flex items-center justify-center text-[11px] cursor-pointer transition-colors duration-200"
            style={{ backgroundColor: 'var(--aia-bg-elevated)', color: 'var(--aia-text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
          >
            Presets
          </button>
          <a
            href="/acero-ia/gallery"
            onClick={() => setIsOpen(false)}
            className="flex-1 h-8 rounded-lg flex items-center justify-center text-[11px] no-underline cursor-pointer transition-colors duration-200"
            style={{ backgroundColor: 'var(--aia-bg-elevated)', color: 'var(--aia-text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--aia-bg-elevated)')}
          >
            Galería
          </a>
        </div>

        {/* Back to hub */}
        <a
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-colors duration-200"
          style={{ color: 'var(--aia-text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--aia-text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--aia-text-muted)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Volver al Hub
        </a>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden p-2 rounded-xl cursor-pointer transition-colors duration-200"
        style={{ backgroundColor: 'var(--aia-bg-surface)', border: '1px solid var(--aia-border)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aia-text-primary)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-[280px] flex flex-col
          transition-transform duration-300 ease-out
          md:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          backgroundColor: 'var(--aia-bg-surface)',
          borderRight: '1px solid var(--aia-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Mobile close */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 md:hidden p-1 rounded cursor-pointer"
          style={{ color: 'var(--aia-text-muted)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {sidebarContent}
      </aside>
    </>
  )
}
