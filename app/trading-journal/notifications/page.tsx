'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface NotifPayload {
  invitationId: string
  fromName:     string
  fromUserId:   string
  sessionName:  string
  sessionId:    string
}

interface Notification {
  id:         string
  type:       string
  payload:    NotifPayload
  read:       boolean
  created_at: string
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  )
}
function IconBell({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function IconShare({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5"  r="3"/><circle cx="6"  cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59"  y2="10.49"/>
    </svg>
  )
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0)  return `Hace ${d}d`
  if (h > 0)  return `Hace ${h}h`
  if (m > 0)  return `Hace ${m}min`
  return 'Ahora'
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)
  const [processing, setProcessing]       = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/trading-journal/notifications')
    if (res.ok) {
      const d = await res.json()
      setNotifications(d.notifications ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markAllRead() {
    await fetch('/api/trading-journal/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read_all' }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function handleAction(notifId: string, action: 'accept' | 'reject') {
    setProcessing(p => ({ ...p, [notifId]: true }))
    const res = await fetch('/api/trading-journal/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: notifId, action }),
    })
    if (res.ok && action === 'accept') {
      const d = await res.json()
      if (d.sessionId) {
        router.push(`/trading-journal/${d.sessionId}`)
        return
      }
    }
    await load()
    setProcessing(p => ({ ...p, [notifId]: false }))
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080d1a]">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="sticky top-0 z-20 bg-slate-50/90 dark:bg-[#080d1a]/90 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 pt-5 pb-4">
            <Link
              href="/trading-journal"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-200/60 dark:hover:bg-white/[0.07] transition-colors">
              <IconChevronLeft />
            </Link>
            <h1 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight flex-1">
              Notificaciones
            </h1>
            {notifications.some(n => !n.read) && (
              <button
                onClick={markAllRead}
                className="text-[12px] accent-txt font-semibold px-3 h-8 rounded-xl hover:opacity-80 transition-opacity cursor-pointer">
                Marcar leídas
              </button>
            )}
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-zinc-800 to-transparent" />
        </div>

        {/* Content */}
        <div className="px-4 pt-4 pb-16">
          {loading ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-zinc-800 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500">
                <IconBell size={28} />
              </div>
              <p className="text-[15px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">Sin notificaciones</p>
              <p className="text-[13px] text-slate-500 dark:text-zinc-500">
                Aquí verás cuando alguien te comparta una sesión de trading.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notifications.map(n => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  busy={processing[n.id] ?? false}
                  onAccept={() => handleAction(n.id, 'accept')}
                  onReject={() => handleAction(n.id, 'reject')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NotificationCard({ notification: n, busy, onAccept, onReject }: {
  notification: Notification
  busy:         boolean
  onAccept:     () => void
  onReject:     () => void
}) {
  const payload = n.payload

  // Determine if invitation is still pending by checking read status
  // After accept/reject the notification is marked read + gets re-fetched
  // We track by read flag: unread = pending action; read = processed
  const isPending = !n.read

  return (
    <div className={`rounded-2xl border transition-all duration-150 ${
      isPending
        ? 'bg-white dark:bg-[#0e1729] border-slate-200 dark:border-white/[0.10] shadow-sm'
        : 'bg-slate-50 dark:bg-[#080d1a] border-slate-100 dark:border-zinc-800/60'
    }`}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
            isPending
              ? 'accent-tint accent-txt'
              : 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500'
          }`}>
            <IconShare size={15} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-[13.5px] font-semibold leading-snug ${
                isPending ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-zinc-400'
              }`}>
                {payload.fromName} te compartió una sesión
              </p>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 mt-0.5">
                {fmtRelative(n.created_at)}
              </span>
            </div>
            <p className={`text-[12px] mt-0.5 truncate ${
              isPending ? 'text-slate-500 dark:text-zinc-400' : 'text-slate-400 dark:text-zinc-500'
            }`}>
              &ldquo;{payload.sessionName}&rdquo;
            </p>
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={onAccept}
              disabled={busy}
              className="flex-1 h-9 rounded-xl accent-btn text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {busy ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Aceptar'}
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              Rechazar
            </button>
          </div>
        )}

        {!isPending && n.read && (
          <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-2">
            Procesada
          </p>
        )}
      </div>
    </div>
  )
}
