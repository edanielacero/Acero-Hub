'use client'

import { useState, useEffect, useRef } from 'react'
import { use } from 'react'
import { parseCSV, coerceDate, coerceDirection, coerceResult } from '@/lib/trading/csv-parser'

// ─── Types ─────────────────────────────────────────────────────────────────────

type SessionType = 'backtesting' | 'journal'
type Direction = 'long' | 'short'
type Result = 'tp' | 'sl' | 'be'
type VarType = 'text' | 'number' | 'select_single' | 'select_multiple' | 'boolean'

interface Session {
  id: string
  type: SessionType
  name: string
  instrument: string | null
  capital_initial: number | null
}

interface Variable {
  id: string
  key: string
  label: string
  type: VarType
  options: string[] | null
  is_required: boolean
}

interface Trade {
  id: string
  session_id: string
  linked_trade_id: string | null
  date_entry: string
  date_exit: string | null
  instrument: string | null
  direction: Direction | null
  result: Result | null
  rr_target: number | null
  rr_max: number | null
  rr_exit: number | null
  be_moved: boolean
  notes: string | null
  risk_percent: number | null
  pnl_usd: number | null
  capital_start: number | null
  capital_end: number | null
  custom_fields: Record<string, unknown>
}

interface ActiveConnection { id: string; journalId: string; journalName: string }
interface SyncedJournal { journalId: string; journalName: string; tradeId: string }

interface PageData {
  session: Session
  variables: Variable[]
  trades: Trade[]
  activeConnections: ActiveConnection[]
}

interface TradeFormState {
  date_entry: string
  date_exit: string
  instrument: string
  direction: Direction | ''
  result: Result | ''
  rr_target: string
  rr_max: string
  rr_exit: string
  be_moved: boolean
  notes: string
  risk_percent: string
  pnl_usd: string
  capital_start: string
  capital_end: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const RESULT_CONFIG: Record<Result, { label: string; bar: string; badge: string }> = {
  tp: { label: 'TP', bar: 'bg-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' },
  sl: { label: 'SL', bar: 'bg-rose-500',    badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' },
  be: { label: 'BE', bar: 'bg-zinc-400',    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' },
}

const IMPORT_FIELDS = [
  { key: 'date_entry',    label: 'Fecha entrada',          required: true  },
  { key: 'date_exit',     label: 'Fecha salida'                             },
  { key: 'instrument',    label: 'Instrumento'                              },
  { key: 'direction',     label: 'Dirección (long/short)'                  },
  { key: 'result',        label: 'Resultado (tp/sl/be)'                    },
  { key: 'rr_target',     label: 'RR objetivo'                             },
  { key: 'rr_max',        label: 'RR máximo'                               },
  { key: 'rr_exit',       label: 'RR salida'                               },
  { key: 'notes',         label: 'Notas'                                   },
  { key: 'risk_percent',  label: '% riesgo'                                },
  { key: 'pnl_usd',       label: 'PnL USD'                                 },
  { key: 'capital_start', label: 'Capital inicio'                          },
  { key: 'capital_end',   label: 'Capital fin'                             },
]

const EMPTY_FORM: TradeFormState = {
  date_entry: '', date_exit: '',  instrument: '',
  direction: '',  result: '',     rr_target: '',
  rr_max: '',     rr_exit: '',    be_moved: false,
  notes: '',      risk_percent: '', pnl_usd: '',
  capital_start: '', capital_end: '',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function api(path: string, opts?: RequestInit) {
  return fetch(`/api/trading-journal${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
}

function n(v: string): number | null {
  const x = parseFloat(v)
  return isNaN(x) ? null : x
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function fmtPnL(val: number | null) {
  if (val == null) return null
  const sign = val >= 0 ? '+' : ''
  return `${sign}$${Math.abs(val).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function tradeToForm(t: Trade): TradeFormState {
  return {
    date_entry: toDatetimeLocal(t.date_entry),
    date_exit:  toDatetimeLocal(t.date_exit),
    instrument: t.instrument ?? '',
    direction:  t.direction ?? '',
    result:     t.result ?? '',
    rr_target:  t.rr_target?.toString() ?? '',
    rr_max:     t.rr_max?.toString() ?? '',
    rr_exit:    t.rr_exit?.toString() ?? '',
    be_moved:   t.be_moved,
    notes:      t.notes ?? '',
    risk_percent:  t.risk_percent?.toString() ?? '',
    pnl_usd:       t.pnl_usd?.toString() ?? '',
    capital_start: t.capital_start?.toString() ?? '',
    capital_end:   t.capital_end?.toString() ?? '',
  }
}

function formToPayload(f: TradeFormState, cf: Record<string, unknown>) {
  return {
    date_entry: f.date_entry ? new Date(f.date_entry).toISOString() : null,
    date_exit:  f.date_exit  ? new Date(f.date_exit).toISOString()  : null,
    instrument: f.instrument || null,
    direction:  f.direction  || null,
    result:     f.result     || null,
    rr_target:  n(f.rr_target),
    rr_max:     n(f.rr_max),
    rr_exit:    n(f.rr_exit),
    be_moved:   f.be_moved,
    notes:      f.notes || null,
    risk_percent:  n(f.risk_percent),
    pnl_usd:       n(f.pnl_usd),
    capital_start: n(f.capital_start),
    capital_end:   n(f.capital_end),
    custom_fields: cf,
  }
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
function IconEdit({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IconTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IconUpload({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}
function IconCheck({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IconSync({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
    </svg>
  )
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const inp = [
  'w-full bg-slate-50 dark:bg-zinc-900',
  'border border-slate-200 dark:border-zinc-700/60 rounded-xl',
  'px-4 py-3 text-[14px] text-slate-900 dark:text-white',
  'placeholder-slate-400 dark:placeholder-zinc-600',
  'outline-none transition-colors duration-150',
  'min-h-[48px]',
].join(' ')

const fieldLabel = 'block text-[11px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-[0.1em] mb-2'

// ─── Bottom Sheet ──────────────────────────────────────────────────────────────

function BottomSheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
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
        className="relative w-full max-w-lg bg-white dark:bg-[#0c0c0c] border border-slate-200 dark:border-zinc-800 border-b-0 rounded-t-[32px] shadow-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-[3px] rounded-full bg-slate-200 dark:bg-zinc-700" />
        </div>
        <div className="flex items-center justify-between px-6 py-3.5 shrink-0">
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            <IconX size={16} />
          </button>
        </div>
        <div className="h-px bg-slate-100 dark:bg-zinc-800 mx-6 shrink-0" />
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ─── Variable Input ────────────────────────────────────────────────────────────

function VariableInput({ variable, value, onChange }: {
  variable: Variable; value: unknown; onChange: (v: unknown) => void
}) {
  if (variable.type === 'boolean') {
    const checked = Boolean(value)
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-xl">
        <span className="text-[13px] text-slate-600 dark:text-zinc-400">{checked ? 'Sí' : 'No'}</span>
        <button type="button" role="switch" aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
            checked ? 'bg-[color:var(--accent)]' : 'bg-slate-200 dark:bg-zinc-700'
          }`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`} />
        </button>
      </div>
    )
  }

  if (variable.type === 'text') {
    return (
      <input type="text" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)}
        className={inp} placeholder={variable.label} />
    )
  }

  if (variable.type === 'number') {
    return (
      <input type="number" step="any"
        value={(value as number | null) ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        className={inp} placeholder="0" />
    )
  }

  const opts = variable.options ?? []

  if (variable.type === 'select_single') {
    const selected = (value as string) ?? ''
    if (opts.length > 7) {
      return (
        <select value={selected} onChange={e => onChange(e.target.value)} className={inp}>
          <option value="">— Ninguno —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    return (
      <div className="flex flex-wrap gap-2">
        {opts.map(o => (
          <button key={o} type="button" onClick={() => onChange(selected === o ? '' : o)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
              selected === o
                ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
            }`}>
            {o}
          </button>
        ))}
      </div>
    )
  }

  if (variable.type === 'select_multiple') {
    const selected = (value as string[]) ?? []
    return (
      <div className="flex flex-wrap gap-2">
        {opts.map(o => {
          const active = selected.includes(o)
          return (
            <button key={o} type="button"
              onClick={() => onChange(active ? selected.filter(x => x !== o) : [...selected, o])}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
                active
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/10 text-[color:var(--accent)]'
                  : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
              }`}>
              {o}
            </button>
          )
        })}
      </div>
    )
  }

  return null
}

// ─── Trade Card ────────────────────────────────────────────────────────────────

function TradeCard({ trade, sessionType, onEdit, onDelete }: {
  trade: Trade; sessionType: SessionType; onEdit: () => void; onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const cfg = trade.result ? RESULT_CONFIG[trade.result] : null

  const rrLabel = (() => {
    if (!trade.rr_exit) return null
    if (trade.result === 'sl') return `-${trade.rr_exit.toFixed(1)}R`
    if (trade.result === 'be') return '0R'
    return `+${trade.rr_exit.toFixed(1)}R`
  })()

  return (
    <div className="flex gap-3 px-4 py-3.5 bg-white dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800 rounded-2xl">
      <div className={`w-1 rounded-full shrink-0 ${cfg?.bar ?? 'bg-zinc-200 dark:bg-zinc-700'}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] text-slate-400 dark:text-zinc-500 font-mono tabular-nums">
            {fmtDate(trade.date_entry)}
          </span>
          {trade.instrument && (
            <span className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{trade.instrument}</span>
          )}
          {trade.direction && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
              trade.direction === 'long'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400'
            }`}>
              {trade.direction === 'long' ? '▲ L' : '▼ S'}
            </span>
          )}
          {trade.linked_trade_id && (
            <span className="text-slate-300 dark:text-zinc-600"><IconSync size={10} /></span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {cfg && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${cfg.badge}`}>{cfg.label}</span>
          )}
          {sessionType === 'backtesting' && rrLabel && (
            <span className={`text-[13px] font-mono font-semibold ${
              trade.result === 'tp' ? 'text-emerald-600 dark:text-emerald-400' :
              trade.result === 'sl' ? 'text-rose-600 dark:text-rose-400' :
              'text-zinc-500 dark:text-zinc-400'
            }`}>
              {rrLabel}
            </span>
          )}
          {sessionType === 'journal' && trade.pnl_usd != null && (
            <span className={`text-[13px] font-mono font-semibold ${
              trade.pnl_usd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {fmtPnL(trade.pnl_usd)}
            </span>
          )}
          {sessionType === 'journal' && trade.risk_percent != null && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">{trade.risk_percent}%R</span>
          )}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button onClick={() => setMenuOpen(o => !o)}
          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-300 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Opciones">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-10 z-20 w-36 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); onEdit() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
              <IconEdit size={13} /> Editar
            </button>
            <div className="h-px bg-slate-100 dark:bg-zinc-800" />
            <button
              onClick={() => { setMenuOpen(false); onDelete() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer">
              <IconTrash size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  if (trades.length === 0) return null

  const total   = trades.length
  const winners = trades.filter(t => t.result === 'tp').length
  const losers  = trades.filter(t => t.result === 'sl').length
  const be      = trades.filter(t => t.result === 'be').length
  const winrate = Math.round(winners / total * 100)

  const totalRR = trades.reduce((acc, t) => {
    if (t.result === 'tp' && t.rr_exit) return acc + t.rr_exit
    if (t.result === 'sl' && t.rr_exit) return acc - t.rr_exit
    return acc
  }, 0)

  const totalPnL = trades.reduce((acc, t) => acc + (t.pnl_usd ?? 0), 0)

  const c = 'flex flex-col items-center gap-0.5'
  const v = 'text-[15px] font-bold text-slate-900 dark:text-zinc-100 tabular-nums'
  const l = 'text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider'
  const sep = <div className="w-px self-stretch bg-slate-100 dark:bg-zinc-800" />

  return (
    <div className="mx-4 mb-3 px-4 py-3 bg-white dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800 rounded-2xl">
      <div className="flex justify-between items-stretch gap-2">
        <div className={c}><span className={v}>{total}</span><span className={l}>Total</span></div>
        {sep}
        <div className={c}><span className={`${v} text-emerald-600 dark:text-emerald-400`}>{winners}</span><span className={l}>Ganados</span></div>
        <div className={c}><span className={`${v} text-rose-500 dark:text-rose-400`}>{losers}</span><span className={l}>Perdidos</span></div>
        {be > 0 && <div className={c}><span className={`${v} text-zinc-500`}>{be}</span><span className={l}>BE</span></div>}
        {sep}
        <div className={c}>
          <span className={`${v} ${winrate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {winrate}%
          </span>
          <span className={l}>Winrate</span>
        </div>
        {sep}
        {sessionType === 'backtesting' ? (
          <div className={c}>
            <span className={`${v} font-mono ${totalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {totalRR >= 0 ? '+' : ''}{totalRR.toFixed(1)}R
            </span>
            <span className={l}>Expect.</span>
          </div>
        ) : (
          <div className={c}>
            <span className={`${v} font-mono ${totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {fmtPnL(totalPnL)}
            </span>
            <span className={l}>PnL total</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Delete Confirm Sheet ──────────────────────────────────────────────────────

function DeleteConfirmSheet({ onConfirm, onClose, loading }: {
  onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  return (
    <BottomSheet title="Eliminar trade" onClose={onClose}>
      <p className="text-[14px] text-slate-600 dark:text-zinc-400 mb-6">
        ¿Estás seguro? Esta acción no se puede deshacer.
      </p>
      <div className="flex flex-col gap-2">
        <button onClick={onConfirm} disabled={loading}
          className="w-full min-h-[50px] rounded-xl bg-rose-500 text-white font-semibold text-[14px] disabled:opacity-50 cursor-pointer transition-opacity">
          {loading ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
        <button onClick={onClose}
          className="w-full min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 font-medium text-[14px] hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
          Cancelar
        </button>
      </div>
    </BottomSheet>
  )
}

// ─── Sync Modal ────────────────────────────────────────────────────────────────

function SyncModal({ synced, btTrade, onDone }: {
  synced: SyncedJournal[]; btTrade: Trade; onDone: () => void
}) {
  type JF = { risk_percent: string; capital_start: string; capital_end: string; pnl_usd: string }
  const [forms, setForms]   = useState<Record<string, JF>>(
    Object.fromEntries(synced.map(s => [s.tradeId, { risk_percent: '', capital_start: '', capital_end: '', pnl_usd: '' }]))
  )
  const [saved, setSaved]   = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  function setField(tid: string, field: keyof JF, val: string) {
    setForms(prev => ({ ...prev, [tid]: { ...prev[tid], [field]: val } }))
  }

  async function save(s: SyncedJournal) {
    setSaving(p => ({ ...p, [s.tradeId]: true }))
    const f = forms[s.tradeId]
    await fetch(`/api/trading-journal/trades/${s.tradeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        risk_percent:  n(f.risk_percent),
        capital_start: n(f.capital_start),
        capital_end:   n(f.capital_end),
        pnl_usd:       n(f.pnl_usd),
      }),
    })
    setSaving(p => ({ ...p, [s.tradeId]: false }))
    setSaved(p => ({ ...p, [s.tradeId]: true }))
  }

  return (
    <BottomSheet title="Trade sincronizado" onClose={onDone}>
      <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-5">
        El trade fue copiado a los siguientes journals. Agrega los datos de capital ahora o cierra para después.
      </p>
      <div className="flex flex-col gap-5">
        {synced.map(s => {
          const f = forms[s.tradeId]
          const isSaved = saved[s.tradeId]
          return (
            <div key={s.tradeId} className="border border-slate-200 dark:border-zinc-700 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-slate-400 dark:text-zinc-500"><IconSync size={13} /></span>
                <span className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{s.journalName}</span>
                {isSaved && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <IconCheck size={12} /> Guardado
                  </span>
                )}
              </div>
              {!isSaved && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[
                      { key: 'capital_start' as keyof JF, label: 'Capital inicio', ph: '10 000' },
                      { key: 'risk_percent'  as keyof JF, label: '% Riesgo',       ph: '1'      },
                      { key: 'pnl_usd'       as keyof JF, label: 'PnL USD',         ph: '0'      },
                      { key: 'capital_end'   as keyof JF, label: 'Capital fin',     ph: '10 100' },
                    ].map(({ key, label, ph }) => (
                      <div key={key}>
                        <label className={fieldLabel}>{label}</label>
                        <input type="number" step="any" placeholder={ph} className={inp}
                          value={f[key]} onChange={e => setField(s.tradeId, key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => save(s)} disabled={saving[s.tradeId]}
                    className="w-full min-h-[44px] rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[13px] disabled:opacity-50 cursor-pointer transition-opacity">
                    {saving[s.tradeId] ? 'Guardando…' : 'Guardar datos del journal'}
                  </button>
                </>
              )}
              <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-600">
                BT ref: {btTrade.direction?.toUpperCase() ?? '—'} · {btTrade.result?.toUpperCase() ?? '—'}
                {btTrade.rr_exit != null && ` · ${btTrade.rr_exit}R`}
              </p>
            </div>
          )
        })}
      </div>
      <button onClick={onDone}
        className="mt-5 w-full min-h-[50px] rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 font-medium text-[14px] hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
        Cerrar
      </button>
    </BottomSheet>
  )
}

// ─── Import Sheet ──────────────────────────────────────────────────────────────

type ImportStep = 'upload' | 'mapping' | 'preview' | 'done'

function ImportSheet({ session, onClose, onImported }: {
  session: Session; onClose: () => void; onImported: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]       = useState<ImportStep>('upload')
  const [csvData, setCsvData] = useState<ReturnType<typeof parseCSV> | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [result, setResult]   = useState<{ inserted: number; errors: { index: number; message: string }[] } | null>(null)
  const [loading, setLoading] = useState(false)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (!parsed.headers.length) return
      setCsvData(parsed)
      const autoMap: Record<string, string> = {}
      for (const field of IMPORT_FIELDS) {
        const match = parsed.headers.find(h => h.trim().toLowerCase() === field.key.toLowerCase())
        if (match) autoMap[field.key] = match
      }
      setMapping(autoMap)
      setStep('mapping')
    }
    reader.readAsText(file)
  }

  const previewRows = csvData?.rows.slice(0, 5).map(row => {
    const t: Record<string, string> = {}
    for (const [field, col] of Object.entries(mapping)) {
      if (col) t[field] = row[col] ?? ''
    }
    return t
  }) ?? []

  async function handleImport() {
    if (!csvData) return
    setLoading(true)
    const trades = csvData.rows.map(row => {
      const t: Record<string, unknown> = {}
      for (const [field, col] of Object.entries(mapping)) {
        if (!col) continue
        const val = row[col]?.trim()
        if (!val) continue
        if (['rr_target','rr_max','rr_exit','risk_percent','pnl_usd','capital_start','capital_end'].includes(field)) {
          t[field] = parseFloat(val)
        } else if (field === 'date_entry' || field === 'date_exit') {
          t[field] = coerceDate(val)
        } else if (field === 'direction') {
          t[field] = coerceDirection(val)
        } else if (field === 'result') {
          t[field] = coerceResult(val)
        } else {
          t[field] = val
        }
      }
      return t
    })

    const res = await fetch(`/api/trading-journal/sessions/${session.id}/trades/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades }),
    })
    const data = await res.json()
    setResult(data)
    setStep('done')
    setLoading(false)
    if (data.inserted > 0) onImported()
  }

  return (
    <BottomSheet title="Importar CSV" onClose={onClose}>
      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">
            Sube un archivo CSV con tus trades. La primera fila debe ser el encabezado de columnas.
          </p>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-3 w-full py-10 border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-2xl text-slate-400 dark:text-zinc-500 hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors cursor-pointer">
            <IconUpload size={24} />
            <span className="text-[14px] font-medium">Seleccionar archivo .csv</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {step === 'mapping' && csvData && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">
            {csvData.rows.length} filas detectadas. Asigna columnas del CSV a campos del trade.
          </p>
          <div className="flex flex-col gap-2.5">
            {IMPORT_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-3">
                <span className="text-[12px] text-slate-600 dark:text-zinc-400 w-36 shrink-0">
                  {field.label}{field.required && <span className="text-rose-500 ml-0.5">*</span>}
                </span>
                <select value={mapping[field.key] ?? ''}
                  onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="flex-1 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-zinc-200 outline-none">
                  <option value="">— No mapear —</option>
                  {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setStep('upload')}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 text-[13px] font-medium cursor-pointer">
              Atrás
            </button>
            <button onClick={() => setStep('preview')} disabled={!mapping['date_entry']}
              className="flex-1 min-h-[44px] rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[13px] disabled:opacity-40 cursor-pointer transition-opacity">
              Vista previa
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">
            Primeras {previewRows.length} filas (de {csvData?.rows.length ?? 0} totales):
          </p>
          <div className="flex flex-col gap-2">
            {previewRows.map((row, i) => (
              <div key={i} className="px-3 py-2.5 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 mr-2">#{i + 1}</span>
                {Object.entries(row).filter(([, v]) => v).map(([k, v]) => (
                  <span key={k} className="text-[11px] mr-2">
                    <span className="text-slate-400 dark:text-zinc-500">{k}:</span>{' '}
                    <span className="text-slate-700 dark:text-zinc-300">{v}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setStep('mapping')}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 text-[13px] font-medium cursor-pointer">
              Atrás
            </button>
            <button onClick={handleImport} disabled={loading}
              className="flex-1 min-h-[44px] rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[13px] disabled:opacity-50 cursor-pointer transition-opacity">
              {loading ? 'Importando…' : `Importar ${csvData?.rows.length} trades`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <IconCheck size={24} />
          </div>
          <p className="text-[16px] font-semibold text-slate-900 dark:text-zinc-100">
            {result.inserted} trade{result.inserted !== 1 ? 's' : ''} importados
          </p>
          {result.errors.length > 0 && (
            <p className="text-[12px] text-rose-500">{result.errors.length} filas con error ignoradas</p>
          )}
          <button onClick={onClose}
            className="mt-2 w-full min-h-[50px] rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[14px] cursor-pointer">
            Listo
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

// ─── Trade Form Sheet ──────────────────────────────────────────────────────────

function TradeFormSheet({ session, variables, initial, onClose, onSave }: {
  session: Session
  variables: Variable[]
  initial: Trade | null
  onClose: () => void
  onSave: (trade: Trade, synced: SyncedJournal[]) => void
}) {
  const isEdit = Boolean(initial)
  const [f, setF]   = useState<TradeFormState>(initial ? tradeToForm(initial) : EMPTY_FORM)
  const [cf, setCf] = useState<Record<string, unknown>>(initial?.custom_fields ?? {})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function upd(key: keyof TradeFormState, val: unknown) {
    setF(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'result' && val === 'be') next.be_moved = true
      return next
    })
  }

  const calcHint = (() => {
    const cs = n(f.capital_start)
    const rp = n(f.risk_percent)
    const re = n(f.rr_exit)
    if (!cs || !rp) return null
    if (f.result === 'tp' && re) return { pnl: cs * (rp / 100) * re, ce: cs + cs * (rp / 100) * re }
    if (f.result === 'sl')       return { pnl: -(cs * rp / 100),     ce: cs - cs * rp / 100       }
    if (f.result === 'be')       return { pnl: 0,                     ce: cs                       }
    return null
  })()

  async function handleSave() {
    if (!f.date_entry) { setError('La fecha de entrada es requerida'); return }
    setError(null)
    setSaving(true)
    try {
      const payload = formToPayload(f, cf)
      if (isEdit && initial) {
        const res = await fetch(`/api/trading-journal/trades/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
        onSave(data.trade, [])
      } else {
        const res = await fetch(`/api/trading-journal/sessions/${session.id}/trades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
        onSave(data.trade, data.synced ?? [])
      }
    } finally {
      setSaving(false)
    }
  }

  const sec = 'text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.1em] mb-3'
  const div = 'h-px bg-slate-100 dark:bg-zinc-800 my-5'

  return (
    <BottomSheet title={isEdit ? 'Editar trade' : 'Nuevo trade'} onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Fecha y par */}
        <div>
          <p className={sec}>Fecha y par</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className={fieldLabel}>Entrada <span className="text-rose-500">*</span></label>
              <input type="datetime-local" value={f.date_entry} onChange={e => upd('date_entry', e.target.value)} className={inp} />
            </div>
            <div>
              <label className={fieldLabel}>Salida</label>
              <input type="datetime-local" value={f.date_exit} onChange={e => upd('date_exit', e.target.value)} className={inp} />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>Instrumento</label>
            <input type="text" value={f.instrument} onChange={e => upd('instrument', e.target.value)}
              placeholder={session.instrument ?? 'EURUSD'} className={inp} />
          </div>
        </div>

        <div className={div} />

        {/* Ejecución */}
        <div>
          <p className={sec}>Ejecución</p>

          <div className="mb-3">
            <label className={fieldLabel}>Dirección</label>
            <div className="flex gap-2">
              {(['long', 'short'] as Direction[]).map(d => (
                <button key={d} type="button" onClick={() => upd('direction', f.direction === d ? '' : d)}
                  className={`flex-1 min-h-[44px] rounded-xl text-[13px] font-semibold border transition-colors cursor-pointer ${
                    f.direction === d
                      ? d === 'long'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                      : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                  }`}>
                  {d === 'long' ? '▲ Long' : '▼ Short'}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className={fieldLabel}>Resultado</label>
            <div className="flex gap-2">
              {(['tp', 'sl', 'be'] as Result[]).map(r => {
                const c = RESULT_CONFIG[r]
                return (
                  <button key={r} type="button" onClick={() => upd('result', f.result === r ? '' : r)}
                    className={`flex-1 min-h-[44px] rounded-xl text-[13px] font-semibold border transition-colors cursor-pointer ${
                      f.result === r ? `${c.badge} border-transparent` : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                    }`}>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {([
              { key: 'rr_target' as keyof TradeFormState, label: 'RR objetivo', ph: '2' },
              { key: 'rr_max'    as keyof TradeFormState, label: 'RR máximo',   ph: '3' },
              { key: 'rr_exit'   as keyof TradeFormState, label: 'RR salida',   ph: '2' },
            ]).map(({ key, label, ph }) => (
              <div key={key}>
                <label className={fieldLabel}>{label}</label>
                <input type="number" step="any" min="0" placeholder={ph} className={inp}
                  value={f[key] as string} onChange={e => upd(key, e.target.value)} />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-xl">
            <span className="text-[13px] text-slate-700 dark:text-zinc-300 font-medium">BE movido</span>
            <button type="button" role="switch" aria-checked={f.be_moved}
              onClick={() => upd('be_moved', !f.be_moved)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                f.be_moved ? 'bg-[color:var(--accent)]' : 'bg-slate-200 dark:bg-zinc-700'
              }`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                f.be_moved ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        <div className={div} />

        {/* Notas */}
        <div>
          <label className={fieldLabel}>Notas</label>
          <textarea value={f.notes} onChange={e => upd('notes', e.target.value)}
            placeholder="Observaciones sobre el trade…"
            className={`${inp} min-h-[90px] resize-none py-3`} />
        </div>

        {/* Journal fields */}
        {session.type === 'journal' && (
          <>
            <div className={div} />
            <div>
              <p className={sec}>Capital y riesgo</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'risk_percent'  as keyof TradeFormState, label: '% Riesgo',      ph: '1'      },
                  { key: 'capital_start' as keyof TradeFormState, label: 'Capital inicio', ph: '10 000' },
                  { key: 'pnl_usd'       as keyof TradeFormState, label: 'PnL USD',         ph: '0'      },
                  { key: 'capital_end'   as keyof TradeFormState, label: 'Capital fin',     ph: '10 100' },
                ]).map(({ key, label, ph }) => (
                  <div key={key}>
                    <label className={fieldLabel}>{label}</label>
                    <input type="number" step="any" placeholder={ph} className={inp}
                      value={f[key] as string} onChange={e => upd(key, e.target.value)} />
                  </div>
                ))}
              </div>
              {calcHint && (
                <button type="button"
                  onClick={() => { upd('pnl_usd', calcHint.pnl.toFixed(2)); upd('capital_end', calcHint.ce.toFixed(2)) }}
                  className="mt-2 w-full text-[12px] text-[color:var(--accent)] py-2 px-3 rounded-lg border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 hover:bg-[color:var(--accent)]/10 transition-colors cursor-pointer text-left">
                  Calcular: PnL ≈ {fmtPnL(calcHint.pnl)} · Capital fin ≈ ${calcHint.ce.toFixed(0)}
                  <span className="ml-1 opacity-60">→ Aplicar</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Variable fields */}
        {variables.length > 0 && (
          <>
            <div className={div} />
            <div>
              <p className={sec}>Variables</p>
              <div className="flex flex-col gap-4">
                {variables.map(v => (
                  <div key={v.key}>
                    <label className={fieldLabel}>
                      {v.label}
                      {v.is_required && <span className="text-rose-500 ml-0.5">*</span>}
                    </label>
                    <VariableInput variable={v} value={cf[v.key]} onChange={val => setCf(p => ({ ...p, [v.key]: val }))} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="text-[13px] text-rose-500 text-center">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full min-h-[52px] rounded-2xl bg-[color:var(--accent)] text-white font-bold text-[15px] disabled:opacity-50 cursor-pointer transition-opacity mt-2">
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar trade'}
        </button>
      </div>
    </BottomSheet>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SessionDashboardPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)

  const [data, setData]       = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editTrade, setEditTrade]   = useState<Trade | null>(null)
  const [delTrade, setDelTrade]     = useState<Trade | null>(null)
  const [deleting, setDeleting]     = useState(false)
  const [syncInfo, setSyncInfo]     = useState<{ synced: SyncedJournal[]; btTrade: Trade } | null>(null)
  const [showImport, setShowImport] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api(`/sessions/${sessionId}/trades`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave(trade: Trade, synced: SyncedJournal[]) {
    setShowForm(false)
    setEditTrade(null)
    setData(prev => {
      if (!prev) return prev
      const exists = prev.trades.find(t => t.id === trade.id)
      const trades = exists
        ? prev.trades.map(t => t.id === trade.id ? trade : t)
        : [trade, ...prev.trades]
      return { ...prev, trades }
    })
    if (synced.length > 0) setSyncInfo({ synced, btTrade: trade })
  }

  async function handleDelete() {
    if (!delTrade) return
    setDeleting(true)
    const res = await api(`/trades/${delTrade.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      setData(prev => prev ? { ...prev, trades: prev.trades.filter(t => t.id !== delTrade.id) } : prev)
      setDelTrade(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-zinc-700 border-t-[color:var(--accent)] rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-slate-400 dark:text-zinc-500 text-[14px]">Error al cargar la sesión</p>
      </div>
    )
  }

  const { session, variables, trades, activeConnections } = data

  return (
    <div className="flex flex-col pb-10">

      <div className="pt-4">
        <StatsBar trades={trades} sessionType={session.type} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 mb-4">
        <button
          onClick={() => { setEditTrade(null); setShowForm(true) }}
          className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-2xl bg-[color:var(--accent)] text-white font-semibold text-[14px] cursor-pointer transition-opacity active:opacity-80">
          <IconPlus size={18} />
          Nuevo trade
        </button>
        <button onClick={() => setShowImport(true)}
          className="flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
          <IconUpload size={15} />
          CSV
        </button>
      </div>

      {/* Sync banner */}
      {session.type === 'backtesting' && activeConnections.length > 0 && (
        <div className="mx-4 mb-4 flex items-center gap-2 px-4 py-2.5 bg-[color:var(--accent)]/8 border border-[color:var(--accent)]/20 rounded-xl">
          <span className="text-[color:var(--accent)]"><IconSync size={11} /></span>
          <p className="text-[11px] text-[color:var(--accent)] font-medium">
            Sync activo con: {activeConnections.map(c => c.journalName).join(', ')}
          </p>
        </div>
      )}

      {/* Trade list */}
      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[color:var(--accent)]/10 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3 className="text-[16px] font-semibold text-slate-800 dark:text-zinc-200 mb-1">Sin trades aún</h3>
          <p className="text-[13px] text-slate-400 dark:text-zinc-500 max-w-xs">
            Registra tu primer trade o importa desde un archivo CSV.
          </p>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-2">
          {trades.map(trade => (
            <TradeCard
              key={trade.id}
              trade={trade}
              sessionType={session.type}
              onEdit={() => { setEditTrade(trade); setShowForm(true) }}
              onDelete={() => setDelTrade(trade)}
            />
          ))}
        </div>
      )}

      {/* Sheets & Modals */}
      {showForm && (
        <TradeFormSheet
          session={session}
          variables={variables}
          initial={editTrade}
          onClose={() => { setShowForm(false); setEditTrade(null) }}
          onSave={handleSave}
        />
      )}
      {delTrade && (
        <DeleteConfirmSheet
          onConfirm={handleDelete}
          onClose={() => setDelTrade(null)}
          loading={deleting}
        />
      )}
      {syncInfo && (
        <SyncModal
          synced={syncInfo.synced}
          btTrade={syncInfo.btTrade}
          onDone={() => setSyncInfo(null)}
        />
      )}
      {showImport && (
        <ImportSheet
          session={session}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
    </div>
  )
}
