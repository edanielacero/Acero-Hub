'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PRESET_VARIABLES } from '@/lib/trading/presets'
import VariablesContent from './variables-content'

// ─── Types ────────────────────────────────────────────────────────────────────

type VarType = 'text' | 'number' | 'select_single' | 'select_multiple' | 'boolean'

interface CustomVarDraft {
  id: string
  label: string
  type: VarType
  options: string[]
  is_required: boolean
}

interface Connection {
  id: string
  backtesting_id: string
  journal_id: string
  sync_paused: boolean
  other_session: { id: string; name: string; type: string } | null
}

interface Session {
  id: string
  type: 'backtesting' | 'journal'
  name: string
  description: string | null
  instrument: string | null
  capital_initial: number | null
  is_archived: boolean
  is_favorite: boolean
  is_read_only: boolean
  sync_paused: boolean
  created_at: string
  trade_count: number
  connections: Connection[]
}

interface ConnectData {
  connections: Connection[]
  available: { id: string; name: string }[]
}

type Tab    = 'backtesting' | 'journal'
type Accent = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'red'
type Mode   = 'dark' | 'light'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })
}

function api(path: string, opts?: RequestInit) {
  return fetch(`/api/trading-journal${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
}

function hubApi(path: string, opts?: RequestInit) {
  return fetch(`/api/hub${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IconChartBar({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function IconBook({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
}

function IconDots({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
    </svg>
  )
}

function IconStar({ filled, size = 15 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : 'currentColor'}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}

function IconLink({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}

function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function IconArchive({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
  )
}

function IconEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function IconCopy({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

function IconTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

function IconSettings({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2v-.5c0-.55.45-1 1-1h1.5c3.03 0 5.5-2.47 5.5-5.5C21.5 6.36 17.23 2 12 2z"/>
      <circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function IconShare({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5"  r="3"/><circle cx="6"  cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59"  y2="10.49"/>
    </svg>
  )
}

function IconBell({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

function IconSun({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function IconMoon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

// ─── Action Menu ──────────────────────────────────────────────────────────────

function IconVariables({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}

// ─── Share Sheet ──────────────────────────────────────────────────────────────

function ShareSessionSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSend() {
    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) { setErrorMsg('Ingresa un email válido'); return }
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/trading-journal/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, toEmail: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorMsg(data.error ?? 'Error al enviar'); setStatus('error') }
      else setStatus('success')
    } catch { setErrorMsg('Error de conexión'); setStatus('error') }
  }

  return (
    <BottomSheet title="Compartir sesión" onClose={onClose}>
      <div className="pb-2">
        {status === 'success' ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-600 dark:text-emerald-400">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">¡Invitación enviada!</p>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-5">
              El usuario recibirá una notificación para aceptar o rechazar la sesión.
            </p>
            <button onClick={onClose} className="w-full h-11 rounded-xl accent-btn font-semibold text-[14px] cursor-pointer">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-1 truncate">
              <span className="font-semibold text-slate-700 dark:text-zinc-200">&ldquo;{session.name}&rdquo;</span>
            </p>
            <p className="text-[13px] text-slate-600 dark:text-zinc-300 mb-4 mt-2">
              El receptor recibirá una copia independiente con todos los trades.
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="email"
                autoFocus
                value={email}
                onChange={e => { setEmail(e.target.value); if (errorMsg) setErrorMsg('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                placeholder="email@ejemplo.com"
                className="w-full h-12 px-4 rounded-xl border bg-white dark:bg-zinc-900 text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors border-slate-200 dark:border-zinc-700 focus:border-[rgb(var(--a5))] dark:focus:border-[rgb(var(--a5))]"
              />
              {errorMsg && <p className="text-[12px] text-rose-500 dark:text-rose-400 -mt-1">{errorMsg}</p>}
              <button
                onClick={handleSend}
                disabled={status === 'loading'}
                className="w-full h-11 rounded-xl accent-btn font-semibold text-[14px] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                {status === 'loading'
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><IconShare size={14} /> Enviar sesión</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function IconMerge({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/>
      <rect x="9" y="15" width="6" height="6" rx="1"/>
      <path d="M5 9v3a4 4 0 0 0 4 4h2M19 9v3a4 4 0 0 1-4 4h-2"/>
    </svg>
  )
}

// ─── Merge Sheet ──────────────────────────────────────────────────────────────

function MergeSheet({ session, allSessions, onClose, onDone }: {
  session: Session
  allSessions: Session[]
  onClose: () => void
  onDone: () => void
}) {
  const candidates = allSessions.filter(s =>
    s.id !== session.id && s.type === 'backtesting' && !s.is_read_only
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'mirror' | 'copy'>('mirror')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  // Auto-generate name from selected sessions
  useEffect(() => {
    const names = [session.name, ...candidates.filter(s => selected.has(s.id)).map(s => s.name)]
    if (names.length >= 2) setName(`Fusión — ${names.map(n => n.slice(0, 14)).join(' + ')}`)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (selected.size === 0) { setErrorMsg('Selecciona al menos una sesión más'); return }
    setStatus('loading')
    setErrorMsg('')
    const res = await fetch('/api/trading-journal/sessions/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim() || `Fusión — ${session.name}`,
        sourceSessionIds: [session.id, ...Array.from(selected)],
        mode,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Error al crear'); setStatus('error'); return }
    onDone()
    router.push(`/trading-journal/${data.session.id}`)
  }

  return (
    <BottomSheet title="Fusionar sesión" onClose={onClose}>
      <div className="flex flex-col gap-5 pb-2">

        {/* Mode */}
        <div className="flex gap-2">
          {([['mirror', 'Espejo (solo lectura)'], ['copy', 'Copia editable']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-3 px-3 rounded-xl text-[12px] font-semibold border-2 transition-all cursor-pointer text-center ${
                mode === m
                  ? 'accent-btn border-transparent'
                  : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-slate-500 dark:text-zinc-400 -mt-3">
          {mode === 'mirror'
            ? 'Refleja trades en tiempo real. No se pueden editar desde aquí.'
            : 'Copia todos los trades ahora. Puedes editarlos libremente después.'}
        </p>

        {/* Session picker */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2">
            Sesión base (esta)
          </p>
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 mb-3">
            <div className="w-4 h-4 rounded-md accent-btn flex items-center justify-center shrink-0">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100 truncate">{session.name}</span>
          </div>

          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2">
            Añadir sesiones · {selected.size} seleccionadas
          </p>
          {candidates.length === 0 ? (
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 py-2">No hay otras sesiones de backtesting.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {candidates.map(s => {
                const on = selected.has(s.id)
                return (
                  <button key={s.id} onClick={() => toggle(s.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      on
                        ? 'accent-tint accent-border-lo'
                        : 'bg-slate-50 dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:border-slate-200 dark:hover:border-zinc-700'
                    }`}>
                    <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${on ? 'accent-btn border-transparent' : 'border-slate-300 dark:border-zinc-600'}`}>
                      {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100 truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">{s.trade_count} trades</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Name */}
        <div>
          <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2">Nombre de la sesión</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej. Fusión Mayo 2025"
            className="w-full h-12 px-4 rounded-xl border bg-white dark:bg-zinc-900 text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors border-slate-200 dark:border-zinc-700 focus:border-[rgb(var(--a5))] dark:focus:border-[rgb(var(--a5))]"
          />
        </div>

        {errorMsg && <p className="text-[12px] text-rose-500 dark:text-rose-400 -mt-3">{errorMsg}</p>}

        <button
          onClick={handleCreate}
          disabled={status === 'loading' || selected.size === 0}
          className="w-full h-11 rounded-xl accent-btn font-semibold text-[14px] cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2">
          {status === 'loading'
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <><IconMerge size={14} /> Crear sesión fusionada</>
          }
        </button>
      </div>
    </BottomSheet>
  )
}

function ActionMenu({ session, onEdit, onDuplicate, onArchive, onDelete, onManageConnections, onCreateJournal, onVariables, onShare, onMerge }: {
  session: Session
  onEdit: () => void
  onDuplicate: () => void
  onArchive: () => void
  onDelete: () => void
  onManageConnections: () => void
  onCreateJournal: () => void
  onVariables: () => void
  onShare: () => void
  onMerge: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const items = [
    { icon: <IconEdit />, label: 'Editar', action: onEdit },
    { icon: <IconCopy />, label: 'Duplicar', action: onDuplicate },
    { icon: <IconVariables />, label: 'Configurar variables', action: onVariables },
    ...(session.type === 'backtesting' ? [
      { icon: <IconLink />, label: 'Gestionar Journals', action: onManageConnections },
      { icon: <IconBook size={14} />, label: 'Crear Journal', action: onCreateJournal },
    ] : []),
    ...(session.type === 'backtesting' && !session.is_read_only ? [
      { icon: <IconMerge size={14} />, label: 'Fusionar', action: onMerge },
    ] : []),
    { icon: <IconShare />, label: 'Compartir', action: onShare },
    { icon: <IconArchive />, label: session.is_archived ? 'Desarchivar' : 'Archivar', action: onArchive },
    { icon: <IconTrash />, label: 'Eliminar', action: onDelete, danger: true },
  ]

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Opciones"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors duration-150 cursor-pointer rounded-xl hover:bg-black/5 dark:hover:bg-white/5">
        <IconDots />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[60] w-52 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl shadow-slate-200/60 dark:shadow-black/60 overflow-hidden">
          {items.map((item, i) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left text-[13px] font-medium transition-colors duration-150 cursor-pointer min-h-[44px] ${
                item.danger
                  ? 'text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white'
              } ${i === 0 ? '' : 'border-t border-slate-200 dark:border-zinc-700/50'}`}>
              <span className={item.danger
                ? 'text-red-400'
                : 'text-slate-400 dark:text-zinc-400'
              }>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ session, onClick, onToggleFavorite, onEdit, onDuplicate, onArchive, onDelete, onManageConnections, onCreateJournal, onVariables, onShare, onMerge }: {
  session: Session
  onClick: () => void
  onToggleFavorite: () => void
  onEdit: () => void
  onDuplicate: () => void
  onArchive: () => void
  onDelete: () => void
  onManageConnections: () => void
  onCreateJournal: () => void
  onVariables: () => void
  onShare: () => void
  onMerge: () => void
}) {
  const isBt = session.type === 'backtesting'

  return (
    <div onClick={onClick} className={`relative flex rounded-2xl transition-all duration-150 ${
      session.is_archived ? 'opacity-40' : 'hover:bg-slate-50 dark:hover:bg-zinc-900'
    } bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600/60 shadow-sm dark:shadow-none cursor-pointer`}>

      {/* Left accent line */}
      <div className="w-[3px] shrink-0 self-stretch rounded-l-2xl accent-bar" />

      <div className="flex-1 px-4 py-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 mt-1">
            <span className="inline-flex items-center text-[10px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg border accent-badge">
              {isBt ? 'Backtest' : 'Journal'}
            </span>
            {session.is_read_only && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/30 uppercase tracking-[0.1em]">
                <IconMerge size={9} /> Espejo
              </span>
            )}
            {session.is_archived && (
              <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">archivado</span>
            )}
          </div>
          <div className="flex items-center shrink-0 -mr-1.5 -mt-1.5">
            <button
              onClick={e => { e.stopPropagation(); onToggleFavorite() }}
              aria-label="Marcar favorito"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150 text-slate-400 dark:text-zinc-400">
              <IconStar filled={session.is_favorite} />
            </button>
            <ActionMenu
              session={session}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDelete={onDelete}
              onManageConnections={onManageConnections}
              onCreateJournal={onCreateJournal}
              onVariables={onVariables}
              onShare={onShare}
              onMerge={onMerge}
            />
          </div>
        </div>

        {/* Name */}
        <p className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight tracking-tight mb-1">
          {session.name}
        </p>

        {/* Connections */}
        {session.connections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {session.connections.map(c => (
              <span key={c.id} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border ${
                c.sync_paused
                  ? 'bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
                  : 'accent-badge'
              }`}>
                <IconLink size={10} />
                {c.other_session?.name ?? (isBt ? 'Journal' : 'Backtest')}
                {c.sync_paused && <span className="opacity-50">· pausado</span>}
              </span>
            ))}
          </div>
        )}

        {/* Description preview */}
        {session.description && (
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 leading-relaxed mb-3 line-clamp-1">{session.description}</p>
        )}

        {/* Footer meta */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-700/50 mt-1">
          <span className={`text-[11px] font-semibold tabular-nums ${
            session.trade_count > 0
              ? 'text-slate-500 dark:text-zinc-400'
              : 'text-slate-500 dark:text-zinc-400'
          }`}>
            {session.trade_count === 0
              ? 'Sin trades'
              : `${session.trade_count} trade${session.trade_count !== 1 ? 's' : ''}`}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">{formatDate(session.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

function BottomSheet({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', h)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-[3px]" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-zinc-800 border-b-0 rounded-t-[32px] shadow-2xl shadow-slate-300/30 dark:shadow-black max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[3px] rounded-full bg-slate-200 dark:bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 shrink-0">
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors duration-150 cursor-pointer">
            <IconX size={16} />
          </button>
        </div>

        <div className="h-px bg-slate-100 dark:bg-zinc-800 mx-6 shrink-0" />
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ─── Form styles ──────────────────────────────────────────────────────────────

const inp = [
  'w-full bg-slate-50 dark:bg-zinc-900',
  'border border-slate-200 dark:border-zinc-700/60 rounded-xl',
  'px-4 py-3 text-[14px] text-slate-900 dark:text-white',
  'placeholder-slate-400 dark:placeholder-zinc-600',
  'outline-none accent-input transition-colors duration-150',
  'min-h-[48px]',
].join(' ')

const fieldLabel = 'block text-[11px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2'

// ─── Custom Var Mini-Form ──────────────────────────────────────────────────────

const VAR_TYPE_LABELS: Record<VarType, string> = {
  text:            'Texto',
  number:          'Número',
  select_single:   'Selección única',
  select_multiple: 'Selección múltiple',
  boolean:         'Sí / No',
}

function CustomVarMiniForm({ onAdd }: { onAdd: (v: CustomVarDraft) => void }) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<VarType>('text')
  const [options, setOptions] = useState<string[]>([])
  const [optionDraft, setOptionDraft] = useState('')
  const [isRequired, setIsRequired] = useState(false)

  const needsOptions = type === 'select_single' || type === 'select_multiple'

  const addOption = () => {
    const v = optionDraft.trim()
    if (!v || options.includes(v)) return
    setOptions(p => [...p, v])
    setOptionDraft('')
  }

  const handleAdd = () => {
    if (!label.trim()) return
    if (needsOptions && options.length === 0) return
    onAdd({ id: crypto.randomUUID(), label: label.trim(), type, options, is_required: isRequired })
    setLabel('')
    setType('text')
    setOptions([])
    setOptionDraft('')
    setIsRequired(false)
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800">
      {/* Label row */}
      <input
        className={inp}
        placeholder="Nombre de la variable..."
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!needsOptions) handleAdd() } }}
      />

      {/* Type — native select avoids overflow clipping inside BottomSheet */}
      <select
        value={type}
        onChange={e => { setType(e.target.value as VarType); setOptions([]) }}
        className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-xl px-4 py-3 text-[13px] font-semibold text-slate-700 dark:text-zinc-300 outline-none accent-input transition-colors duration-150 min-h-[48px] cursor-pointer appearance-none">
        {(Object.keys(VAR_TYPE_LABELS) as VarType[]).map(t => (
          <option key={t} value={t}>{VAR_TYPE_LABELS[t]}</option>
        ))}
      </select>

      {/* Required toggle */}
      <button type="button" onClick={() => setIsRequired(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 bg-white dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 cursor-pointer">
        <span className="text-[13px] text-slate-700 dark:text-zinc-300">Obligatoria</span>
        <div className={`w-10 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${isRequired ? 'accent-btn' : 'bg-slate-200 dark:bg-zinc-700'}`}>
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isRequired ? 'translate-x-4' : 'translate-x-0'}`} />
        </div>
      </button>

      {/* Options field */}
      {needsOptions && (
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-950 rounded-lg border border-slate-200 dark:border-zinc-800">
              <span className="flex-1 text-[12px] text-slate-700 dark:text-zinc-300">{opt}</span>
              <button type="button" onClick={() => setOptions(o => o.filter((_, j) => j !== i))}
                className="text-slate-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer w-6 h-6 flex items-center justify-center rounded">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              className={inp + ' flex-1 text-[13px]'}
              placeholder="Agregar opción..."
              value={optionDraft}
              onChange={e => setOptionDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
            />
            <button type="button" onClick={addOption} disabled={!optionDraft.trim()}
              className="shrink-0 min-w-[44px] min-h-[48px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!label.trim() || (needsOptions && options.length === 0)}
        className="w-full min-h-[40px] rounded-xl text-[12px] font-bold border-2 border-dashed border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-400 dark:hover:border-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer">
        + Agregar variable
      </button>
    </div>
  )
}

// ─── Session Form ─────────────────────────────────────────────────────────────

function SessionForm({ initial, onSave, onClose, loading }: {
  initial?: Partial<Session>
  onSave: (data: Record<string, unknown>) => void
  onClose: () => void
  loading: boolean
}) {
  const isEdit = !!initial?.id
  const [name, setName] = useState(initial?.name ?? '')
  const [type] = useState<Tab>(initial?.type ?? 'backtesting')
  const [capitalInitial, setCapitalInitial] = useState(String(initial?.capital_initial ?? ''))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selectedPresets, setSelectedPresets] = useState<string[]>([])
  const [showPresets, setShowPresets] = useState(false)
  const [customVars, setCustomVars] = useState<CustomVarDraft[]>([])
  const [showCustomVars, setShowCustomVars] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      type,
      capital_initial: type === 'journal' && capitalInitial ? Number(capitalInitial) : null,
      description: description.trim() || null,
      ...(!isEdit && {
        preset_keys: selectedPresets,
        custom_variables: customVars.map(({ label, type, options, is_required }) => ({ label, type, options, is_required })),
      }),
    })
  }

  const togglePreset = (key: string) =>
    setSelectedPresets(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className={fieldLabel}>Nombre *</label>
        <input
          className={inp}
          placeholder={type === 'backtesting' ? 'Ej. Estrategia ICT GBPUSD' : 'Ej. Live 2025 Q3'}
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>

      {type === 'journal' && (
        <div>
          <label className={fieldLabel}>Capital inicial (USD)</label>
          <input
            className={inp}
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="10000"
            value={capitalInitial}
            onChange={e => setCapitalInitial(e.target.value)}
          />
        </div>
      )}

      <div>
        <label className={fieldLabel}>Descripción</label>
        <textarea
          className={`${inp} resize-none`}
          rows={2}
          placeholder="Notas sobre la estrategia..."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {!isEdit && (
        <>
          {/* Presets */}
          <div>
            <button
              type="button"
              onClick={() => setShowPresets(v => !v)}
              className="w-full flex items-center justify-between mb-3 cursor-pointer group">
              <span className={fieldLabel + ' mb-0'}>
                Variables predefinidas
                {selectedPresets.length > 0 && (
                  <span className="ml-2 accent-txt normal-case tracking-normal font-black">
                    {selectedPresets.length} selec.
                  </span>
                )}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round"
                className={`transition-transform duration-200 ${showPresets ? 'rotate-180' : ''} stroke-slate-400 dark:stroke-zinc-400 group-hover:stroke-slate-600 dark:group-hover:stroke-zinc-200`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showPresets && (
              <div className="flex flex-wrap gap-2 p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 max-h-52 overflow-y-auto">
                {PRESET_VARIABLES.map(p => {
                  const active = selectedPresets.includes(p.key)
                  return (
                    <button
                      key={p.key}
                      type="button"
                      title={p.description}
                      onClick={() => togglePreset(p.key)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all duration-150 cursor-pointer whitespace-nowrap ${
                        active
                          ? 'accent-selected'
                          : 'bg-transparent border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200'
                      }`}>
                      {p.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Custom variables */}
          <div>
            <button
              type="button"
              onClick={() => setShowCustomVars(v => !v)}
              className="w-full flex items-center justify-between mb-3 cursor-pointer group">
              <span className={fieldLabel + ' mb-0'}>
                Variables personalizadas
                {customVars.length > 0 && (
                  <span className="ml-2 accent-txt normal-case tracking-normal font-black">
                    {customVars.length} creada{customVars.length !== 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round"
                className={`transition-transform duration-200 ${showCustomVars ? 'rotate-180' : ''} stroke-slate-400 dark:stroke-zinc-400 group-hover:stroke-slate-600 dark:group-hover:stroke-zinc-200`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showCustomVars && (
              <div className="flex flex-col gap-2">
                {/* List of added custom vars */}
                {customVars.map(cv => (
                  <div key={cv.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{cv.label}</span>
                      <span className="ml-2 text-[11px] text-slate-500 dark:text-zinc-400">{VAR_TYPE_LABELS[cv.type]}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomVars(p => p.filter(v => v.id !== cv.id))}
                      className="min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-150 cursor-pointer rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
                <CustomVarMiniForm onAdd={cv => setCustomVars(p => [...p, cv])} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-colors duration-150 cursor-pointer">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="flex-1 min-h-[50px] rounded-xl text-[13px] font-bold transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed accent-btn accent-btn-shadow">
          {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : `Crear ${type === 'backtesting' ? 'Backtest' : 'Journal'}`}
        </button>
      </div>
    </form>
  )
}

// ─── Connections Sheet ────────────────────────────────────────────────────────

function ConnectionsSheet({ session, onClose, onRefresh }: {
  session: Session
  onClose: () => void
  onRefresh: () => void
}) {
  const [data, setData] = useState<ConnectData | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    const res = await api(`/sessions/${session.id}/connect`).then(r => r.json())
    setData(res)
  }, [session.id])

  useEffect(() => { reload() }, [reload])

  const disconnect = async (connectionId: string) => {
    setLoading(true)
    await api(`/sessions/${session.id}/connect`, { method: 'DELETE', body: JSON.stringify({ connectionId }) })
    await reload()
    setLoading(false)
    onRefresh()
  }

  const togglePause = async (connectionId: string, current: boolean) => {
    await api(`/sessions/${session.id}/connect`, {
      method: 'PATCH',
      body: JSON.stringify({ connectionId, syncPaused: !current }),
    })
    await reload()
    onRefresh()
  }

  const connectExisting = async (journalId: string) => {
    setLoading(true)
    await api(`/sessions/${session.id}/connect`, { method: 'POST', body: JSON.stringify({ journalId }) })
    await reload()
    setLoading(false)
    onRefresh()
  }

  return (
    <BottomSheet title={`Journals · ${session.name}`} onClose={onClose}>
      {!data ? (
        <div className="py-8 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-slate-200 dark:border-zinc-800 accent-spin rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <p className={fieldLabel}>Conectados · {data.connections.length}</p>
            {data.connections.length === 0 ? (
              <p className="text-[13px] text-slate-500 dark:text-zinc-400 py-3">Sin journals conectados aún</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.connections.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 truncate">{c.other_session?.name ?? 'Journal'}</p>
                      {c.sync_paused && <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">Sincronización pausada</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => togglePause(c.id, c.sync_paused)}
                        className="text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white px-3 min-h-[36px] rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150 cursor-pointer font-semibold">
                        {c.sync_paused ? 'Reanudar' : 'Pausar'}
                      </button>
                      <button
                        onClick={() => disconnect(c.id)}
                        disabled={loading}
                        className="text-[11px] text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 px-3 min-h-[36px] rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150 cursor-pointer font-semibold disabled:opacity-40">
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.available.length > 0 && (
            <div>
              <p className={fieldLabel}>Conectar journal existente</p>
              <div className="flex flex-col gap-1.5">
                {data.available.map(j => (
                  <button
                    key={j.id}
                    onClick={() => connectExisting(j.id)}
                    disabled={loading}
                    className="flex items-center justify-between px-4 min-h-[48px] rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 accent-row transition-all duration-150 cursor-pointer text-left disabled:opacity-40">
                    <span className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">{j.name}</span>
                    <span className="text-[11px] accent-txt font-bold">Conectar</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

// ─── Create Journal Sheet ─────────────────────────────────────────────────────

function CreateJournalSheet({ session, onClose, onRefresh }: {
  session: Session
  onClose: () => void
  onRefresh: () => void
}) {
  const [name, setName] = useState(`Journal — ${session.name}`)
  const [capitalInitial, setCapitalInitial] = useState('')
  const [connect, setConnect] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await api(`/sessions/${session.id}/connect`, {
      method: 'POST',
      body: JSON.stringify({
        createJournal: true,
        name: name.trim(),
        capital_initial: capitalInitial ? Number(capitalInitial) : null,
        connect,
      }),
    })
    setLoading(false)
    onRefresh()
    onClose()
  }

  return (
    <BottomSheet title="Crear Journal desde Estrategia" onClose={onClose}>
      <form onSubmit={handleCreate} className="flex flex-col gap-5">
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 leading-relaxed">
          Se copiarán las variables de <span className="text-slate-900 dark:text-white font-semibold">{session.name}</span> al nuevo journal.
        </p>

        <div>
          <label className={fieldLabel}>Nombre del Journal *</label>
          <input className={inp} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className={fieldLabel}>Capital inicial (USD)</label>
          <input
            className={inp}
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="10000"
            value={capitalInitial}
            onChange={e => setCapitalInitial(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer min-h-[44px] px-1">
          <div className="relative">
            <input type="checkbox" checked={connect} onChange={e => setConnect(e.target.checked)} className="sr-only peer" />
            <div className={`w-11 h-6 rounded-full transition-colors duration-200 border ${
              connect
                ? 'accent-toggle-on'
                : 'bg-slate-200 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700'
            }`} />
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-all duration-200 ${
              connect ? 'bg-white translate-x-5' : 'bg-slate-400 dark:bg-zinc-500'
            }`} />
          </div>
          <span className="text-[13px] font-medium text-slate-700 dark:text-zinc-300">Conectar automáticamente</span>
        </label>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-colors duration-150 cursor-pointer">
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || loading}
            className="flex-1 min-h-[50px] rounded-xl text-[13px] font-bold accent-btn accent-btn-shadow transition-colors duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            {loading ? 'Creando...' : 'Crear Journal'}
          </button>
        </div>
      </form>
    </BottomSheet>
  )
}

// ─── Delete Confirm Sheet ─────────────────────────────────────────────────────

function DeleteSheet({ session, onConfirm, onClose }: {
  session: Session
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet title="Eliminar sesión" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/15">
          <p className="text-[14px] text-slate-600 dark:text-zinc-400 leading-relaxed">
            ¿Eliminar <span className="text-slate-900 dark:text-white font-bold">{session.name}</span>?
            {' '}Se eliminarán todos los trades y variables asociados.
            <span className="text-red-600 dark:text-red-400 font-semibold"> Esta acción no se puede deshacer.</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-[13px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-zinc-500 transition-colors duration-150 cursor-pointer">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 min-h-[50px] rounded-xl text-[13px] font-bold bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 hover:border-red-300 dark:hover:border-red-500/40 transition-all duration-150 cursor-pointer">
            Eliminar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ─── Settings Sheet ───────────────────────────────────────────────────────────

const ACCENT_OPTIONS: { key: Accent; label: string; color: string }[] = [
  { key: 'blue',    label: 'Azul',      color: '#3b82f6' },
  { key: 'violet',  label: 'Violeta',   color: '#8b5cf6' },
  { key: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { key: 'amber',   label: 'Ámbar',     color: '#f59e0b' },
  { key: 'rose',    label: 'Rosa',      color: '#f43f5e' },
  { key: 'red',     label: 'Rojo',      color: '#ef4444' },
]

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [accent, setAccent] = useState<Accent>('blue')
  const [mode, setMode] = useState<Mode>('dark')

  const tjRoot = () => document.getElementById('tj-root')

  useEffect(() => {
    const root = tjRoot()
    setAccent((root?.getAttribute('data-accent') ?? 'blue') as Accent)
    setMode((root?.getAttribute('data-mode') ?? 'dark') as Mode)
  }, [])

  const applyAccent = async (color: Accent) => {
    setAccent(color)
    tjRoot()?.setAttribute('data-accent', color)
    await hubApi('/preferences', { method: 'PATCH', body: JSON.stringify({ accent_color: color }) })
  }

  const applyMode = async (m: Mode) => {
    setMode(m)
    tjRoot()?.setAttribute('data-mode', m)
    await hubApi('/preferences', { method: 'PATCH', body: JSON.stringify({ color_mode: m }) })
  }

  return (
    <BottomSheet title="Apariencia" onClose={onClose}>
      <div className="flex flex-col gap-6">

        {/* Mode */}
        <div>
          <p className={fieldLabel}>Modo</p>
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { key: 'dark'  as Mode, label: 'Oscuro', icon: <IconMoon size={17} /> },
              { key: 'light' as Mode, label: 'Claro',  icon: <IconSun  size={17} /> },
            ]).map(opt => {
              const active = mode === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => applyMode(opt.key)}
                  className={`flex items-center justify-center gap-2.5 min-h-[54px] rounded-2xl text-[14px] font-bold border-2 transition-all duration-150 cursor-pointer ${
                    active
                      ? 'accent-btn border-transparent'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}>
                  {opt.icon}
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Accent color */}
        <div>
          <p className={fieldLabel}>Color de acento</p>
          <div className="grid grid-cols-3 gap-2">
            {ACCENT_OPTIONS.map(opt => {
              const active = accent === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => applyAccent(opt.key)}
                  className={`flex items-center gap-2.5 px-3 min-h-[50px] rounded-xl text-[13px] font-semibold border-2 transition-all duration-150 cursor-pointer ${
                    active
                      ? 'border-transparent text-white'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-600 hover:bg-slate-50 dark:hover:bg-zinc-800'
                  }`}
                  style={active ? { backgroundColor: opt.color } : undefined}>
                  <span
                    className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: active ? 'rgba(255,255,255,0.28)' : opt.color }}>
                    {active && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </BottomSheet>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ type, onCreate }: { type: Tab; onCreate: () => void }) {
  const isBt = type === 'backtesting'
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border accent-tint accent-border-lo accent-txt">
        {isBt ? <IconChartBar size={28} /> : <IconBook size={28} />}
      </div>
      <p className="text-[16px] font-bold text-slate-700 dark:text-zinc-300 mb-2">
        {isBt ? 'Sin backtestings aún' : 'Sin journals aún'}
      </p>
      <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-7 leading-relaxed max-w-[240px]">
        {isBt
          ? 'Crea tu primera estrategia para analizar trades en R'
          : 'Crea un journal para registrar tus trades reales en USD'}
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-6 min-h-[46px] rounded-xl text-[13px] font-bold transition-all duration-150 cursor-pointer accent-btn accent-btn-shadow">
        <IconPlus size={14} />
        {isBt ? 'Nuevo Backtest' : 'Nuevo Journal'}
      </button>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex rounded-2xl overflow-hidden bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/60/60 shadow-sm dark:shadow-none animate-pulse">
      <div className="w-[3px] shrink-0 self-stretch bg-slate-200 dark:bg-zinc-800 rounded-l-2xl" />
      <div className="flex-1 px-4 py-4">
        {/* Top row: badge + star */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="h-[22px] w-20 bg-slate-100 dark:bg-zinc-800 rounded-lg mt-1" />
          <div className="w-9 h-9 bg-slate-100 dark:bg-zinc-800 rounded-xl shrink-0 -mr-1.5 -mt-1.5" />
        </div>
        {/* Name */}
        <div className="h-[17px] w-2/3 bg-slate-100 dark:bg-zinc-800 rounded-lg mb-2" />
        {/* Description */}
        <div className="h-3 w-2/5 bg-slate-50 dark:bg-zinc-900 rounded-lg mb-4" />
        {/* Footer */}
        <div className="flex justify-between pt-3 border-t border-slate-200 dark:border-zinc-700/50">
          <div className="h-3 w-14 bg-slate-50 dark:bg-zinc-900 rounded" />
          <div className="h-3 w-24 bg-slate-50 dark:bg-zinc-900 rounded" />
        </div>
      </div>
    </div>
  )
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar({ tab, onTabChange, btCount, jnCount }: {
  tab: Tab
  onTabChange: (t: Tab) => void
  btCount: number
  jnCount: number
}) {
  return (
    <div className="sticky top-[72px] z-30 bg-white/95 dark:bg-[#080808]/95 backdrop-blur-sm">
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800">
          {([['backtesting', 'Backtesting', btCount],
             ['journal',     'Journal',     jnCount]] as const).map(([t, label, count]) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 cursor-pointer ${
                tab === t ? 'accent-tab shadow-sm' : 'accent-tab-off'
              }`}>
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                  tab === t
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-zinc-800/50 to-transparent" />
    </div>
  )
}

// ─── Notifications Bell ───────────────────────────────────────────────────────

function NotificationsBell() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    fetch('/api/trading-journal/notifications')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUnread(d.unread ?? 0) })
      .catch(() => {})
  }, [])

  return (
    <Link
      href="/trading-journal/notifications"
      aria-label="Notificaciones"
      className="relative min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
      <IconBell size={17} />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full accent-btn text-[9px] font-black flex items-center justify-center px-1 leading-none">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}

// ─── Module-level sessions cache (TTL: 30s) ───────────────────────────────────
let _sessionsCache: Session[] | null = null
let _sessionsCacheTime = 0
const SESSIONS_TTL = 30_000

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradingJournalPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>(_sessionsCache ?? [])
  const [loading, setLoading] = useState(_sessionsCache === null)
  const [tab, setTab] = useState<Tab>('backtesting')
  const [saving, setSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showArchived, setShowArchived] = useState<Record<Tab, boolean>>({ backtesting: false, journal: false })
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null)
  const [connectTarget, setConnectTarget] = useState<Session | null>(null)
  const [createJournalFrom, setCreateJournalFrom] = useState<Session | null>(null)
  const [variablesSession, setVariablesSession] = useState<Session | null>(null)
  const [shareTarget, setShareTarget] = useState<Session | null>(null)
  const [mergeTarget, setMergeTarget] = useState<Session | null>(null)

  const load = useCallback(async (invalidate = false) => {
    if (invalidate) _sessionsCacheTime = 0
    const now = Date.now()
    if (_sessionsCache !== null && now - _sessionsCacheTime < SESSIONS_TTL) return
    if (_sessionsCache === null) setLoading(true)
    const res = await api('/sessions').then(r => r.json()).catch(() => ({ sessions: [] }))
    _sessionsCache = res.sessions ?? []
    _sessionsCacheTime = Date.now()
    setSessions(_sessionsCache!)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const byType     = (t: Tab) => sessions.filter(s => s.type === t)
  const activeOf   = (t: Tab) => {
    const active = byType(t).filter(s => !s.is_archived)
    return [...active].sort((a, b) => (a.is_favorite === b.is_favorite ? 0 : a.is_favorite ? -1 : 1))
  }
  const archivedOf = (t: Tab) => byType(t).filter(s => s.is_archived)

  const btCount = byType('backtesting').length
  const jnCount = byType('journal').length

  const createSession = async (data: Record<string, unknown>) => {
    setSaving(true)
    const res = await api('/sessions', { method: 'POST', body: JSON.stringify(data) })
    setSaving(false)
    if (res.ok) { setShowCreate(false); load(true) }
  }

  const updateSession = async (id: string, data: Record<string, unknown>) => {
    setSaving(true)
    const res = await api(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    setSaving(false)
    if (res.ok) { setEditSession(null); load(true) }
  }

  const deleteSession = async (id: string) => {
    await api(`/sessions/${id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    load(true)
  }

  const duplicate = async (id: string) => {
    await api(`/sessions/${id}/duplicate`, { method: 'POST' })
    load(true)
  }

  const toggleFavorite = async (s: Session) => {
    setSaving(true)
    if (!s.is_favorite) {
      const prev = sessions.find(x => x.type === s.type && x.is_favorite && x.id !== s.id)
      if (prev) {
        await api(`/sessions/${prev.id}`, { method: 'PATCH', body: JSON.stringify({ is_favorite: false }) })
      }
      await api(`/sessions/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_favorite: true }) })
    } else {
      await api(`/sessions/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_favorite: false }) })
    }
    setSaving(false)
    load(true)
  }
  const toggleArchive  = (s: Session) => updateSession(s.id, { is_archived: !s.is_archived })
  const openCreate = () => setShowCreate(true)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080808]">

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-[#080808]/90 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-4 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-black tracking-[0.35em] uppercase text-slate-500 dark:text-zinc-400 mb-1">Acero Hub</p>
            <h1 className="text-[24px] font-black text-slate-900 dark:text-white tracking-tight leading-none">
              Trading Journal
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Ajustes"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors duration-150 cursor-pointer">
              <IconSettings size={18} />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 min-h-[42px] rounded-xl text-[13px] font-bold transition-all duration-200 cursor-pointer accent-btn accent-btn-shadow">
              <IconPlus size={14} />
              {tab === 'backtesting' ? 'Backtest' : 'Journal'}
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-zinc-800 to-transparent" />
      </div>

      {/* Tab bar */}
      <TabBar tab={tab} onTabChange={setTab} btCount={btCount} jnCount={jnCount} />

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pt-4 pb-12">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: Math.max(1, byType(tab).length || 3) }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : byType(tab).length === 0 ? (
          <EmptyState type={tab} onCreate={openCreate} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeOf(tab).map(s => (
              <SessionCard key={s.id} session={s}
                onClick={() => router.push(`/trading-journal/${s.id}`)}
                onToggleFavorite={() => toggleFavorite(s)}
                onEdit={() => setEditSession(s)}
                onDuplicate={() => duplicate(s.id)}
                onArchive={() => toggleArchive(s)}
                onDelete={() => setDeleteTarget(s)}
                onManageConnections={() => setConnectTarget(s)}
                onCreateJournal={() => setCreateJournalFrom(s)}
                onVariables={() => setVariablesSession(s)}
                onShare={() => setShareTarget(s)}
                onMerge={() => setMergeTarget(s)}
              />
            ))}

            {archivedOf(tab).length > 0 && (
              <div className="mt-5">
                <button
                  onClick={() => setShowArchived(v => ({ ...v, [tab]: !v[tab] }))}
                  className="w-full flex items-center gap-3 mb-2 cursor-pointer group">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800/60" />
                  <span className="flex items-center gap-1.5 text-[9px] font-black tracking-[0.2em] uppercase text-slate-500 dark:text-zinc-400 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors duration-150 select-none">
                    Archivadas · {archivedOf(tab).length}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                      className={`transition-transform duration-200 ${showArchived[tab] ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800/60" />
                </button>

                {showArchived[tab] && (
                  <div className="flex flex-col gap-2.5">
                    {archivedOf(tab).map(s => (
                      <SessionCard key={s.id} session={s}
                        onClick={() => router.push(`/trading-journal/${s.id}`)}
                        onToggleFavorite={() => toggleFavorite(s)}
                        onEdit={() => setEditSession(s)}
                        onDuplicate={() => duplicate(s.id)}
                        onArchive={() => toggleArchive(s)}
                        onDelete={() => setDeleteTarget(s)}
                        onManageConnections={() => setConnectTarget(s)}
                        onCreateJournal={() => setCreateJournalFrom(s)}
                        onVariables={() => setVariablesSession(s)}
                        onShare={() => setShareTarget(s)}
                        onMerge={() => setMergeTarget(s)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sheets */}
      {showCreate && (
        <BottomSheet title={`Nuevo ${tab === 'backtesting' ? 'Backtest' : 'Journal'}`} onClose={() => setShowCreate(false)}>
          <SessionForm
            initial={{ type: tab }}
            onSave={createSession}
            onClose={() => setShowCreate(false)}
            loading={saving}
          />
        </BottomSheet>
      )}

      {editSession && (
        <BottomSheet title="Editar sesión" onClose={() => setEditSession(null)}>
          <SessionForm
            initial={editSession}
            onSave={data => updateSession(editSession.id, data)}
            onClose={() => setEditSession(null)}
            loading={saving}
          />
        </BottomSheet>
      )}

      {deleteTarget && (
        <DeleteSheet
          session={deleteTarget}
          onConfirm={() => deleteSession(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {connectTarget && (
        <ConnectionsSheet
          session={connectTarget}
          onClose={() => setConnectTarget(null)}
          onRefresh={load}
        />
      )}

      {createJournalFrom && (
        <CreateJournalSheet
          session={createJournalFrom}
          onClose={() => setCreateJournalFrom(null)}
          onRefresh={load}
        />
      )}

      {shareTarget && (
        <ShareSessionSheet session={shareTarget} onClose={() => setShareTarget(null)} />
      )}

      {mergeTarget && (
        <MergeSheet
          session={mergeTarget}
          allSessions={sessions}
          onClose={() => setMergeTarget(null)}
          onDone={() => { setMergeTarget(null); load(true) }}
        />
      )}

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}

      {variablesSession && (
        <BottomSheet title={`Variables · ${variablesSession.name}`} onClose={() => setVariablesSession(null)}>
          <VariablesContent sessionId={variablesSession.id} />
        </BottomSheet>
      )}
    </div>
  )
}
