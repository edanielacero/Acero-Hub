'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Connection {
  id: string
  backtesting_id: string
  journal_id: string
  sync_paused: boolean
  other_session: { id: string; name: string; type: string } | null
}
interface ConnectData {
  connections: Connection[]
  available: { id: string; name: string }[]
}

function api(path: string, opts?: RequestInit) {
  return fetch(`/api/trading-journal${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
}

function IconSync({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
      <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
    </svg>
  )
}
function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}
function IconPause() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  )
}

// ─── Connections Sheet ─────────────────────────────────────────────────────────

function ConnectionsSheet({ sessionId, sessionName, onClose, onUpdate }: {
  sessionId: string; sessionName: string; onClose: () => void; onUpdate: () => void
}) {
  const [data, setData] = useState<ConnectData | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const res = await api(`/sessions/${sessionId}/connect`).then(r => r.json())
    setData(res)
  }, [sessionId])

  useEffect(() => {
    reload()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [reload, onClose])

  async function disconnect(connId: string) {
    setBusy(true)
    await api(`/sessions/${sessionId}/connect`, { method: 'DELETE', body: JSON.stringify({ connectionId: connId }) })
    await reload()
    onUpdate()
    setBusy(false)
  }

  async function togglePause(connId: string, current: boolean) {
    await api(`/sessions/${sessionId}/connect`, { method: 'PATCH', body: JSON.stringify({ connectionId: connId, syncPaused: !current }) })
    await reload()
    onUpdate()
  }

  async function connectJournal(journalId: string) {
    setBusy(true)
    await api(`/sessions/${sessionId}/connect`, { method: 'POST', body: JSON.stringify({ journalId }) })
    await reload()
    onUpdate()
    setBusy(false)
  }

  const connected   = data?.connections ?? []
  const available   = data?.available   ?? []
  const hasActive   = connected.some(c => !c.sync_paused)
  const hasPaused   = connected.some(c => c.sync_paused)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-[3px]" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-zinc-800 border-b-0 rounded-t-[32px] shadow-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[3px] rounded-full bg-slate-200 dark:bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-2 pb-4 shrink-0">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">
              Sincronización
            </h2>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">{sessionName}</p>
          </div>
          <button onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            <IconX />
          </button>
        </div>
        <div className="h-px bg-slate-100 dark:bg-zinc-800 mx-6 shrink-0" />

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {!data ? (
            <div className="py-10 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-slate-200 dark:border-zinc-800 accent-spin rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              {/* Status summary */}
              {connected.length > 0 && (
                <div className="flex gap-2">
                  {hasActive && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl accent-badge text-[12px] font-semibold border">
                      <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      {connected.filter(c => !c.sync_paused).length} activo{connected.filter(c => !c.sync_paused).length !== 1 ? 's' : ''}
                    </div>
                  )}
                  {hasPaused && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[12px] font-semibold">
                      <IconPause />
                      {connected.filter(c => c.sync_paused).length} pausado{connected.filter(c => c.sync_paused).length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Connected journals */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-3">
                  Journals conectados · {connected.length}
                </p>
                {connected.length === 0 ? (
                  <p className="text-[13px] text-slate-500 dark:text-zinc-400 py-2">Sin journals conectados</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {connected.map(c => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                        <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${c.sync_paused ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100 truncate">
                            {c.other_session?.name ?? 'Journal'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            {c.sync_paused ? 'Pausado' : 'Activo — sincronizando trades'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => togglePause(c.id, c.sync_paused)}
                            className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white px-3 min-h-[36px] rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer font-semibold">
                            {c.sync_paused ? 'Reanudar' : 'Pausar'}
                          </button>
                          <button onClick={() => disconnect(c.id)} disabled={busy}
                            className="text-[11px] text-rose-500 dark:text-rose-400 hover:text-rose-600 px-3 min-h-[36px] rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer font-semibold disabled:opacity-40">
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Connect existing */}
              {available.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-3">
                    Conectar journal existente
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {available.map(j => (
                      <button key={j.id} onClick={() => connectJournal(j.id)} disabled={busy}
                        className="flex items-center justify-between px-4 min-h-[52px] rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 accent-row transition-all duration-150 cursor-pointer text-left disabled:opacity-40">
                        <span className="text-[13px] font-medium text-slate-800 dark:text-zinc-100">{j.name}</span>
                        <span className="text-[11px] accent-txt font-bold shrink-0 ml-3">Conectar →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Session Actions ───────────────────────────────────────────────────────────

export function SessionActions({ sessionId, sessionName, sessionType }: {
  sessionId: string; sessionName: string; sessionType: 'backtesting' | 'journal'
}) {
  const [open, setOpen]               = useState(false)
  const [mounted, setMounted]         = useState(false)
  const [connections, setConnections] = useState<Connection[] | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const loadConnections = useCallback(async () => {
    if (sessionType !== 'backtesting') return
    try {
      const res = await api(`/sessions/${sessionId}/connect`)
      if (res.ok) {
        const d = await res.json() as ConnectData
        setConnections(d.connections)
      }
    } catch { /* silent */ }
  }, [sessionId, sessionType])

  useEffect(() => { loadConnections() }, [loadConnections])

  if (sessionType !== 'backtesting' || !connections || connections.length === 0) return null

  const hasActive = connections.some(c => !c.sync_paused)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Gestionar sincronización"
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
          hasActive
            ? 'accent-badge'
            : 'border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
        }`}>
        <IconSync />
        {hasActive ? (connections.length > 1 ? `${connections.length} activos` : 'Activo') : 'Pausado'}
      </button>

      {open && mounted && createPortal(
        <ConnectionsSheet
          sessionId={sessionId}
          sessionName={sessionName}
          onClose={() => setOpen(false)}
          onUpdate={loadConnections}
        />,
        document.getElementById('tj-root') ?? document.body
      )}
    </>
  )
}
