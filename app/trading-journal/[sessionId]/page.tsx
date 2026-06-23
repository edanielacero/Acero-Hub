'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { use } from 'react'
import { parseCSV, coerceDate, coerceDirection, coerceResult } from '@/lib/trading/csv-parser'
import {
  calcExpectancy, calcProfitFactor, calcZScore, calcPValue,
  calcStdDevRR, calcMonthlyConsistency, calcStreaks, calcMaxDrawdown,
  calcStrategyConfidence,
} from '@/lib/trading/metrics'
import { calcSweetSpot } from '@/lib/trading/sweetspot'

// ─── Types ─────────────────────────────────────────────────────────────────────

type SessionType = 'backtesting' | 'journal'
type Direction = 'long' | 'short'
type Result = 'tp' | 'sl' | 'be'
type VarType = 'text' | 'number' | 'select_single' | 'select_multiple' | 'boolean'
type TradeView = 'table' | 'calendar'
type SortDir   = 'asc' | 'desc'
type SortCol   = 'date' | 'result' | 'rr' | 'direction' | 'instrument' | 'risk' | string

interface FilterState {
  dateFrom: string; dateTo: string
  results: Result[]; directions: Direction[]
  instruments: string[]
  vars: Record<string, string[]>
}

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
  analysis_link: string
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

const RESULT_CFG: Record<Result, { label: string; bar: string; badge: string }> = {
  tp: { label: 'TP', bar: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  sl: { label: 'SL', bar: 'bg-rose-500',    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20'             },
  be: { label: 'BE', bar: 'bg-zinc-400',    badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700' },
}

const EMPTY_FILTER: FilterState = { dateFrom: '', dateTo: '', results: [], directions: [], instruments: [], vars: {} }

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
  notes: '',      analysis_link: '', risk_percent: '', pnl_usd: '',
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
    date_entry: t.date_entry ? t.date_entry.slice(0, 10) : '',
    date_exit:  toDatetimeLocal(t.date_exit),
    instrument: t.instrument ?? '',
    direction:  t.direction ?? '',
    result:     t.result ?? '',
    rr_target:  t.rr_target?.toString() ?? '',
    rr_max:     t.rr_max?.toString() ?? '',
    rr_exit:    t.rr_exit?.toString() ?? '',
    be_moved:   t.be_moved,
    notes:      t.notes ?? '',
    analysis_link: (t.custom_fields?.analysis_link as string) ?? '',
    risk_percent:  t.risk_percent?.toString() ?? '',
    pnl_usd:       t.pnl_usd?.toString() ?? '',
    capital_start: t.capital_start?.toString() ?? '',
    capital_end:   t.capital_end?.toString() ?? '',
  }
}

function formToPayload(f: TradeFormState, cf: Record<string, unknown>) {
  const mergedCf = { ...cf }
  if (f.analysis_link) mergedCf.analysis_link = f.analysis_link
  else delete mergedCf.analysis_link
  return {
    date_entry: f.date_entry ? new Date(f.date_entry + 'T12:00:00').toISOString() : null,
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
    custom_fields: mergedCf,
  }
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function tradeValue(t: Trade, sessionType: SessionType): number {
  if (sessionType === 'journal') return t.pnl_usd ?? 0
  if (t.result === 'tp' && t.rr_exit) return t.rr_exit
  if (t.result === 'sl' && t.rr_exit) return -t.rr_exit
  return 0
}

function fmtTradeValue(t: Trade, sessionType: SessionType): string {
  if (sessionType === 'journal') {
    return t.pnl_usd != null ? (fmtPnL(t.pnl_usd) ?? '—') : '—'
  }
  if (!t.rr_exit) return '—'
  if (t.result === 'be') return '0R'
  return t.result === 'sl' ? `-${t.rr_exit.toFixed(2)}R` : `+${t.rr_exit.toFixed(2)}R`
}

function activeFilterCount(f: FilterState): number {
  let n = 0
  if (f.dateFrom || f.dateTo) n++
  if (f.results.length)       n++
  if (f.directions.length)    n++
  if (f.instruments.length)   n++
  if (f.vars && Object.values(f.vars).some(arr => arr.length > 0)) n++
  return n
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

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}
function IconFilter() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IconChevron({ dir = 'down', size = 14 }: { dir?: 'up' | 'down' | 'left' | 'right'; size?: number }) {
  const deg = { up: 180, down: 0, left: 90, right: -90 }[dir]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ transform: `rotate(${deg}deg)`, display: 'block' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
function IconCalendarView() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  )
}
function IconColumns() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
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
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
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
            checked ? 'accent-toggle-on' : 'bg-slate-200 dark:bg-zinc-700'
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
                ? 'accent-selected'
                : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
            }`}>
            {o}
          </button>
        ))}
      </div>
    )
  }

  if (variable.type === 'select_multiple') {
    const selected = Array.isArray(value) ? value as string[] : []
    return (
      <div className="flex flex-wrap gap-2">
        {opts.map(o => {
          const active = selected.includes(o)
          return (
            <button key={o} type="button"
              onClick={() => onChange(active ? selected.filter(x => x !== o) : [...selected, o])}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
                active
                  ? 'accent-selected'
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

  const valueLabel = (() => {
    if (sessionType === 'journal' && trade.pnl_usd != null) return fmtPnL(trade.pnl_usd)
    return rrLabel
  })()

  const valueColor = trade.result === 'tp'
    ? 'text-emerald-600 dark:text-emerald-400'
    : trade.result === 'sl' ? 'text-rose-500 dark:text-rose-400'
    : 'text-zinc-400 dark:text-zinc-500'

  return (
    <div className="flex gap-3 pl-3 pr-2 py-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none min-h-[62px] items-stretch transition-all duration-150 hover:bg-slate-50 dark:hover:bg-zinc-900 hover:border-slate-200 dark:hover:border-zinc-700/60">
      <div className={`w-[3px] rounded-full shrink-0 self-stretch ${cfg?.bar ?? 'bg-zinc-200 dark:bg-zinc-700'}`} />

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        {/* Row 1: date · instrument · direction · value */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono tabular-nums shrink-0">
            {fmtDate(trade.date_entry)}
          </span>
          {trade.instrument && (
            <span className="text-[13px] font-bold text-slate-800 dark:text-zinc-100 truncate">{trade.instrument}</span>
          )}
          {trade.direction && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
              trade.direction === 'long'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400'
            }`}>
              {trade.direction === 'long' ? '▲ L' : '▼ S'}
            </span>
          )}
          {trade.linked_trade_id && (
            <span className="text-slate-300 dark:text-zinc-500 shrink-0"><IconSync size={10} /></span>
          )}
          {valueLabel && (
            <span className={`ml-auto text-[15px] font-bold font-mono shrink-0 ${valueColor}`}>
              {valueLabel}
            </span>
          )}
        </div>

        {/* Row 2: result badge · risk% */}
        <div className="flex items-center gap-2">
          {cfg && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${cfg.badge}`}>{cfg.label}</span>
          )}
          {sessionType === 'journal' && trade.risk_percent != null && (
            <span className="text-[10px] text-slate-500 dark:text-zinc-400">{trade.risk_percent}% riesgo</span>
          )}
          {sessionType === 'backtesting' && rrLabel && trade.result !== 'tp' && trade.rr_exit && (
            <span className="text-[10px] text-slate-500 dark:text-zinc-400">{trade.rr_exit}R</span>
          )}
        </div>
      </div>

      <div className="relative shrink-0 self-center" ref={menuRef}>
        <button onClick={() => setMenuOpen(o => !o)}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-300 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Opciones">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-11 z-20 w-36 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); onEdit() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
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

function BasicMetrics({ trades, sessionType, capitalInitial }: {
  trades: Trade[]; sessionType: SessionType; capitalInitial: number | null
}) {
  const empty  = trades.length === 0
  const W      = trades.filter(t => t.result === 'tp').length
  const L      = trades.filter(t => t.result === 'sl').length
  const BE     = trades.filter(t => t.result === 'be').length
  const N      = W + L
  const sorted = useMemo(() => [...trades].sort((a, b) => a.date_entry.localeCompare(b.date_entry)), [trades])

  const wr = !empty && N > 0 ? (W / N) * 100 : null
  const pfactor = calcProfitFactor(trades, sessionType)
  const { maxWin, maxLoss } = calcStreaks(sorted)

  const totalRR = trades.reduce((acc, t) => {
    if (t.result === 'tp' && t.rr_exit) return acc + t.rr_exit
    if (t.result === 'sl' && t.rr_exit) return acc - t.rr_exit
    return acc
  }, 0)
  const totalPnL = trades.reduce((acc, t) => acc + (t.pnl_usd ?? 0), 0)

  // % acumulado para journal (riesgo × RR por trade)
  const totalPct = trades.reduce((acc, t) => {
    if (t.result === 'tp' && t.rr_exit != null && t.risk_percent != null)
      return acc + t.risk_percent * t.rr_exit
    if (t.result === 'sl' && t.risk_percent != null)
      return acc - t.risk_percent
    return acc
  }, 0)
  const hasPctData = trades.some(t => t.risk_percent != null)

  const avgRRWin  = W > 0 ? trades.filter(t => t.result === 'tp' && t.rr_exit).reduce((s, t) => s + t.rr_exit!, 0) / W : 0
  const avgRRLoss = L > 0 ? trades.filter(t => t.result === 'sl' && t.rr_exit).reduce((s, t) => s + t.rr_exit!, 0) / L : 0
  const avgRR = avgRRWin > 0 && avgRRLoss > 0 ? `1:${avgRRWin.toFixed(1)}` : '—'

  let returnPct: number | null = null
  if (sessionType === 'journal' && capitalInitial) {
    const last = [...sorted].reverse().find(t => t.capital_end != null)
    if (last?.capital_end != null) returnPct = ((last.capital_end - capitalInitial) / capitalInitial) * 100
  }

  const rentLabel = sessionType === 'backtesting' ? 'Rentabilidad' : 'Rentabilidad (%)'
  const rentValue = empty ? '—'
    : sessionType === 'backtesting'
      ? `${totalRR >= 0 ? '+' : ''}${totalRR.toFixed(2)}R`
    : returnPct !== null
      ? `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`
    : hasPctData
      ? `${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(1)}%`
    : (fmtPnL(totalPnL) ?? '—')
  const rentPos = sessionType === 'backtesting' ? totalRR >= 0 : (returnPct ?? (hasPctData ? totalPct : totalPnL)) >= 0

  const circ = 2 * Math.PI * 14
  const wrFrac = wr !== null ? Math.min(wr / 100, 1) : 0
  // Break-even WR: el mínimo winrate necesario para ser rentable con este RR promedio
  const wrBreakeven = avgRRWin > 0 && avgRRLoss > 0
    ? avgRRLoss / (avgRRWin + avgRRLoss)
    : 0.5
  const wrPos = wr !== null && N > 0 && (wr / 100) >= wrBreakeven

  function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
      <div className={`flex flex-col gap-1.5 px-3.5 pt-3 pb-3 bg-white border border-slate-200 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none ${className}`}>
        {children}
      </div>
    )
  }
  function Icon({ children }: { color?: string; children: React.ReactNode }) {
    return (
      <div className="w-7 h-7 flex items-center justify-center shrink-0 text-slate-300 dark:text-zinc-700">
        {children}
      </div>
    )
  }

  return (
    <div className="mx-4 mb-4 grid grid-cols-3 gap-2.5">
      {/* Total Trades */}
      <Card>
        <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Total Trades</span>
        <div className="flex items-end justify-between mt-0.5">
          <span className="text-[26px] font-bold text-slate-900 dark:text-white leading-none tabular-nums">{empty ? '—' : W + L + BE}</span>
          <Icon>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </Icon>
        </div>
      </Card>

      {/* Winrate */}
      <Card>
        <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Winrate</span>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <span className={`text-[26px] font-bold leading-none tabular-nums ${!empty && wrPos ? 'text-emerald-500 dark:text-emerald-400' : !empty ? 'text-rose-500 dark:text-rose-400' : 'text-slate-300 dark:text-zinc-700'}`}>
              {wr !== null ? `${wr.toFixed(1)}%` : '—'}
            </span>
            {!empty && <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1 font-mono tabular-nums">{W}W · {L}L{BE > 0 ? ` · ${BE}BE` : ''}</p>}
          </div>
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="14" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-slate-100 dark:text-white/[0.06]" />
            {!empty && (
              <circle cx="17" cy="17" r="14" fill="none"
                stroke={wrPos ? '#10b981' : '#f43f5e'} strokeWidth="3.5"
                strokeDasharray={`${wrFrac * circ} ${circ}`} strokeLinecap="round"
                transform="rotate(-90 17 17)" />
            )}
          </svg>
        </div>
      </Card>

      {/* Rentabilidad */}
      <Card>
        <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">{rentLabel}</span>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <span className={`text-[26px] font-bold leading-none tabular-nums ${!empty && rentPos ? 'text-emerald-500 dark:text-emerald-400' : !empty ? 'text-rose-500 dark:text-rose-400' : 'text-slate-300 dark:text-zinc-700'}`}>
              {rentValue}
            </span>
            {!empty && <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">RR {avgRR}</p>}
          </div>
          <Icon>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </Icon>
        </div>
      </Card>

      {/* Profit Factor */}
      <Card>
        <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Profit Factor</span>
        <div className="flex items-end justify-between mt-0.5">
          <span className={`text-[26px] font-bold leading-none tabular-nums ${
            empty || pfactor === null ? 'text-slate-300 dark:text-zinc-700'
            : pfactor > 1 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
          }`}>
            {empty || pfactor === null ? '—' : pfactor === Infinity ? '∞' : pfactor.toFixed(2)}
          </span>
          <Icon>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>
          </Icon>
        </div>
      </Card>

      {/* Racha ganadora */}
      <Card>
        <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Racha Gan.</span>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <span className="text-[26px] font-bold text-slate-900 dark:text-white leading-none tabular-nums">{empty ? '—' : maxWin}</span>
            {!empty && maxWin > 0 && <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">seguidas</p>}
          </div>
          <Icon>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c0 0-4 4.5-4 8a4 4 0 0 0 8 0c0-3.5-4-8-4-8z"/><path d="M12 10c0 0-2 2.5-2 4a2 2 0 0 0 4 0c0-1.5-2-4-2-4z" fill="currentColor" opacity=".4"/></svg>
          </Icon>
        </div>
      </Card>

      {/* Racha perdedora */}
      <Card>
        <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Racha Per.</span>
        <div className="flex items-end justify-between mt-0.5">
          <div>
            <span className={`text-[26px] font-bold leading-none tabular-nums ${!empty && maxLoss > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-300 dark:text-zinc-700'}`}>
              {empty ? '—' : maxLoss}
            </span>
            {!empty && maxLoss > 0 && <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">seguidas</p>}
          </div>
          <Icon>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="2"/><path d="M13 15h4"/><path d="M13 19h4"/></svg>
          </Icon>
        </div>
      </Card>
    </div>
  )
}

// ─── Delete Confirm Sheet ──────────────────────────────────────────────────────

function DeleteConfirmSheet({ onConfirm, onClose, loading }: {
  onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white dark:bg-[#0e1729] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/[0.09] p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-rose-500">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-slate-900 dark:text-white mb-1.5">Eliminar trade</p>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">Esta acción no se puede deshacer.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 min-h-[48px] rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 font-semibold text-[14px] hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 min-h-[48px] rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-[14px] disabled:opacity-50 cursor-pointer transition-colors">
            {loading ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
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
                <span className="text-slate-500 dark:text-zinc-400"><IconSync size={13} /></span>
                <span className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{s.journalName}</span>
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
                    className="w-full min-h-[44px] rounded-xl accent-btn accent-btn-shadow font-semibold text-[13px] disabled:opacity-50 cursor-pointer transition-colors">
                    {saving[s.tradeId] ? 'Guardando…' : 'Guardar datos del journal'}
                  </button>
                </>
              )}
              <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">
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
            className="flex flex-col items-center gap-3 w-full py-10 border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-2xl text-slate-500 dark:text-zinc-400 hover:[border-color:rgb(var(--a5))] hover:[color:rgb(var(--a4))] transition-colors cursor-pointer">
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
                  className="flex-1 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-zinc-100 outline-none">
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
              className="flex-1 min-h-[44px] rounded-xl accent-btn accent-btn-shadow font-semibold text-[13px] disabled:opacity-40 cursor-pointer transition-colors">
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
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 mr-2">#{i + 1}</span>
                {Object.entries(row).filter(([, v]) => v).map(([k, v]) => (
                  <span key={k} className="text-[11px] mr-2">
                    <span className="text-slate-500 dark:text-zinc-400">{k}:</span>{' '}
                    <span className="text-slate-700 dark:text-zinc-200">{v}</span>
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
              className="flex-1 min-h-[44px] rounded-xl accent-btn accent-btn-shadow font-semibold text-[13px] disabled:opacity-50 cursor-pointer transition-colors">
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
            className="mt-2 w-full min-h-[50px] rounded-xl accent-btn accent-btn-shadow font-semibold text-[14px] cursor-pointer">
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
  const [rrMaxOpen, setRrMaxOpen] = useState(Boolean(initial?.rr_max))

  function upd(key: keyof TradeFormState, val: unknown) {
    setF(prev => {
      const next = { ...prev, [key]: val }
      if (key === 'result' && val === 'be') next.be_moved = true
      if (key === 'result' && val === 'sl' && !prev.rr_exit) next.rr_exit = '1'
      if (key === 'result' && val === 'be') next.rr_exit = ''
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

  const sec = 'text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-3'
  const div = 'h-px bg-slate-100 dark:bg-zinc-800 my-5'

  const instrumentVar = variables.find(v => v.key === 'instrument')
  const instrumentOpts = instrumentVar?.options ?? []
  const showInstrumentField = instrumentOpts.length > 0
  const nonInstrumentVars = variables.filter(v => v.key !== 'instrument')

  return (
    <BottomSheet title={isEdit ? 'Editar trade' : 'Nuevo trade'} onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Fecha */}
        <div>
          <label className={fieldLabel}>Fecha <span className="text-rose-500">*</span></label>
          <input type="date" value={f.date_entry} onChange={e => upd('date_entry', e.target.value)} className={inp} />
        </div>

        {/* Instrumento — solo si está configurado como variable */}
        {showInstrumentField && (
          <div>
            <label className={fieldLabel}>Instrumento</label>
            <div className="flex flex-wrap gap-2">
              {instrumentOpts.map(o => (
                <button key={o} type="button" onClick={() => upd('instrument', f.instrument === o ? '' : o)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer ${
                    f.instrument === o
                      ? 'accent-selected'
                      : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                  }`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

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

          {/* RR principal — contextual según resultado */}
          {f.result === 'be' ? (
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 mb-3 px-1">
              RR de salida: <span className="font-semibold text-slate-600 dark:text-zinc-200">0R</span> — cerraste sin pérdida ni ganancia
            </p>
          ) : f.result === 'sl' ? (
            <p className="text-[12px] text-slate-500 dark:text-zinc-400 mb-3 px-1">
              RR de salida: <span className="font-semibold text-slate-600 dark:text-zinc-200">-1R</span> — stop loss activado
            </p>
          ) : (
            <div className="mb-3">
              <label className={fieldLabel}>RR del TP</label>
              <input type="number" step="0.5" min="1" placeholder="2"
                className={inp}
                value={f.rr_exit}
                onChange={e => upd('rr_exit', e.target.value)} />
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 px-1">
                Si saliste en 1:3, escribe <strong>3</strong>
              </p>
            </div>
          )}

          {/* Sweet Spot */}
          {f.result === 'tp' && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-xl">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-400 dark:text-zinc-500 shrink-0">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                <span className="font-medium text-slate-600 dark:text-zinc-300">Sweet Spot</span>
                {f.rr_exit ? <> — incluido con <span className="font-mono font-semibold text-slate-600 dark:text-zinc-300">{f.rr_exit}R</span></> : ' — incluido automáticamente con el RR de salida'}
              </p>
            </div>
          )}
          {(f.result === 'sl' || f.result === 'be') && (
            <div className="bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-700/40 overflow-hidden">
              {/* Header — siempre visible */}
              <button type="button" onClick={() => setRrMaxOpen(v => !v)}
                className="w-full flex items-center justify-between px-3.5 py-3 cursor-pointer">
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-400 dark:text-zinc-500 shrink-0">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-zinc-300">Sweet Spot</span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">—</span>
                  {f.result === 'sl' ? (
                    f.rr_max
                      ? <span className="text-[11px] text-slate-600 dark:text-zinc-300">llegó hasta <span className="font-mono font-semibold">{f.rr_max}R</span> antes del SL</span>
                      : <span className="text-[11px] text-slate-500 dark:text-zinc-400">directo al SL → <span className="font-mono">-1R</span></span>
                  ) : (
                    f.rr_max
                      ? <span className="text-[11px] text-slate-600 dark:text-zinc-300">llegó hasta <span className="font-mono font-semibold">{f.rr_max}R</span> antes de reversar</span>
                      : <span className="text-[11px] text-slate-500 dark:text-zinc-400">sin dato → <span className="font-mono">0R</span></span>
                  )}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={`text-slate-400 dark:text-zinc-500 shrink-0 transition-transform duration-200 ${rrMaxOpen ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {/* Campo editable — colapsable */}
              {rrMaxOpen && (
                <div className="px-3.5 pb-3.5 border-t border-slate-200 dark:border-zinc-700/40 pt-3">
                  <input type="number" step="0.5" min="1"
                    placeholder={f.result === 'sl' ? 'ej: 1.5 — dejá vacío si fue directo' : 'ej: 1.5'}
                    className={inp}
                    value={f.rr_max} onChange={e => upd('rr_max', e.target.value)} />
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1.5">
                    {f.result === 'be'
                      ? 'Hasta dónde llegó el precio antes de reversar a entrada'
                      : 'Hasta dónde llegó a favor — vacío si fue directo al SL'}
                  </p>
                </div>
              )}
            </div>
          )}
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
                  { key: 'pnl_usd'       as keyof TradeFormState, label: 'PnL USD',        ph: '0'      },
                  { key: 'capital_end'   as keyof TradeFormState, label: 'Capital fin',    ph: '10 100' },
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
                  className="mt-2 w-full text-[12px] accent-txt py-2 px-3 rounded-lg border accent-border-lo accent-subtle hover:accent-tint transition-colors cursor-pointer text-left">
                  Calcular: PnL ≈ {fmtPnL(calcHint.pnl)} · Capital fin ≈ ${calcHint.ce.toFixed(0)}
                  <span className="ml-1 opacity-60">→ Aplicar</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Variable fields (excluye instrumento y select_multiple) */}
        {nonInstrumentVars.filter(v => v.type !== 'select_multiple').length > 0 && (
          <>
            <div className={div} />
            <div>
              <p className={sec}>Variables</p>
              <div className="flex flex-col gap-4">
                {nonInstrumentVars.filter(v => v.type !== 'select_multiple').map(v => (
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

        <div className={div} />

        {/* Link de análisis */}
        <div>
          <label className={fieldLabel}>Link de análisis</label>
          <input type="url" value={f.analysis_link} onChange={e => upd('analysis_link', e.target.value)}
            placeholder="https://es.tradingview.com/chart/…" className={inp} />
        </div>

        {/* Notas */}
        <div>
          <label className={fieldLabel}>Notas</label>
          <textarea value={f.notes} onChange={e => upd('notes', e.target.value)}
            placeholder="Observaciones sobre el trade…"
            className={`${inp} min-h-[90px] resize-none py-3`} />
        </div>

        {error && <p className="text-[13px] text-rose-500 text-center">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full min-h-[52px] rounded-2xl accent-btn accent-btn-shadow font-bold text-[15px] disabled:opacity-50 cursor-pointer transition-colors mt-2">
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar trade'}
        </button>
      </div>
    </BottomSheet>
  )
}

// ─── Equity Card (gráfica interactiva de progreso) ────────────────────────────

function EquityCard({ trades, sessionType, capitalInitial }: {
  trades: Trade[]; sessionType: SessionType; capitalInitial: number | null
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const sorted = useMemo(
    () => [...trades].sort((a, b) => a.date_entry.localeCompare(b.date_entry)),
    [trades],
  )

  interface DayPoint { date: string; cumValue: number; dayChange: number; tradeCount: number }

  const { points, isPercent } = useMemo((): { points: DayPoint[]; isPercent: boolean } => {
    if (sorted.length === 0) return { points: [], isPercent: false }
    const byDay: Record<string, Trade[]> = {}
    for (const t of sorted) {
      const d = t.date_entry.slice(0, 10)
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(t)
    }
    const days = Object.keys(byDay).sort()

    if (sessionType === 'journal') {
      const capStart = capitalInitial
        ?? sorted.find(t => t.capital_start != null)?.capital_start
        ?? sorted.find(t => t.capital_end  != null)?.capital_end
        ?? null
      if (!capStart) return { points: [], isPercent: true }
      const pts: DayPoint[] = []
      let prevCap = capStart
      for (const day of days) {
        const dayT = byDay[day].filter(t => t.capital_end != null)
        if (dayT.length === 0) continue
        const endCap = dayT[dayT.length - 1].capital_end!
        pts.push({
          date: day,
          cumValue: ((endCap - capStart) / capStart) * 100,
          dayChange: prevCap !== 0 ? ((endCap - prevCap) / Math.abs(prevCap)) * 100 : 0,
          tradeCount: byDay[day].length,
        })
        prevCap = endCap
      }
      return { points: pts, isPercent: true }
    }

    let cumR = 0
    const pts: DayPoint[] = []
    for (const day of days) {
      const dayStart = cumR
      for (const t of byDay[day]) {
        if (t.result === 'tp' && t.rr_exit) cumR += t.rr_exit
        else if (t.result === 'sl' && t.rr_exit) cumR -= t.rr_exit
      }
      pts.push({ date: day, cumValue: cumR, dayChange: cumR - dayStart, tradeCount: byDay[day].length })
    }
    return { points: pts, isPercent: false }
  }, [sorted, sessionType, capitalInitial])

  const W = 600, H = 180
  const PAD = { top: 18, right: 16, bottom: 36, left: 46 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const vals    = points.map(p => p.cumValue)
  const hasData = points.length >= 2
  const minV    = hasData ? Math.min(...vals) : -3
  const maxV    = hasData ? Math.max(...vals) : 12
  const vRange  = maxV - minV || 1
  const dMin    = minV - vRange * 0.08
  const dMax    = maxV + vRange * 0.08
  const dRange  = dMax - dMin

  const xs = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * iW
  const ys = (v: number) => PAD.top  + (1 - (v - dMin) / dRange) * iH

  const pathD = hasData
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.cumValue).toFixed(1)}`).join(' ')
    : ''
  const zero  = Math.max(PAD.top, Math.min(H - PAD.bottom, ys(0)))
  const areaD = hasData
    ? `${pathD} L ${xs(points.length - 1).toFixed(1)} ${zero.toFixed(1)} L ${xs(0).toFixed(1)} ${zero.toFixed(1)} Z`
    : ''

  const yTicks  = Array.from({ length: 5 }, (_, i) => dMin + (i / 4) * dRange)
  const xTCount = Math.min(7, points.length)
  const xTicks  = points.length <= 1 ? []
    : Array.from({ length: xTCount }, (_, i) =>
        Math.round(i * (points.length - 1) / Math.max(xTCount - 1, 1)))

  function fmtVal(v: number, signed = false) {
    const s = signed ? (v >= 0 ? '+' : '') : ''
    return isPercent ? `${s}${v.toFixed(1)}%` : `${s}${v.toFixed(2)}R`
  }
  function fmtAxisDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }
  function fmtTooltipDate(d: string) {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = (e.clientX - rect.left) * (W / rect.width) - PAD.left
    const idx  = Math.round((svgX / iW) * (points.length - 1))
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const lastVal   = points[points.length - 1]?.cumValue ?? 0
  const peakVal   = vals.length > 0 ? Math.max(...vals) : 0
  const firstDate = sorted[0]?.date_entry
  const lastDate  = sorted[sorted.length - 1]?.date_entry
  const hovered   = hoverIdx != null ? points[hoverIdx] : null
  const tipXFrac  = hoverIdx != null
    ? (PAD.left + (hoverIdx / Math.max(points.length - 1, 1)) * iW) / W
    : 0

  return (
    <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <div className="flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            className={lastVal >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
            {lastVal >= 0
              ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
              : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>
            }
          </svg>
          <span className="text-[13px] font-bold text-slate-800 dark:text-white">Progreso Total</span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
          {points.length} día{points.length !== 1 ? 's' : ''} con trades
        </span>
      </div>

      {/* Chart */}
      <div className="relative select-none">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
          onMouseMove={hasData ? handleMouseMove : undefined}
          onMouseLeave={() => setHoverIdx(null)}>

          <defs>
            <linearGradient id="eq-area-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="rgb(var(--a5))" stopOpacity="0.18" />
              <stop offset="100%" stopColor="rgb(var(--a5))" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid + Y labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={ys(v).toFixed(1)} x2={W - PAD.right} y2={ys(v).toFixed(1)}
                stroke="currentColor" strokeOpacity="0.07" strokeWidth="1"
                className="text-slate-900 dark:text-white" />
              <text x={PAD.left - 5} y={parseFloat(ys(v).toFixed(1)) + 3.5}
                textAnchor="end" fontSize="7" fontFamily="monospace"
                className="fill-slate-500 dark:fill-zinc-500">
                {fmtVal(v)}
              </text>
            </g>
          ))}

          {/* Zero line */}
          {minV < 0 && maxV > 0 && (
            <line x1={PAD.left} y1={ys(0).toFixed(1)} x2={W - PAD.right} y2={ys(0).toFixed(1)}
              stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 3"
              className="text-slate-500 dark:text-zinc-500" />
          )}

          {/* Area + line */}
          {areaD && <path d={areaD} fill="url(#eq-area-g)" />}
          {pathD && (
            <path d={pathD} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ stroke: 'rgb(var(--a5))' }} />
          )}

          {/* Empty state */}
          {!hasData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11"
              className="fill-slate-300 dark:fill-zinc-700">
              Sin datos aún
            </text>
          )}

          {/* X axis labels */}
          {xTicks.map(i => (
            <text key={i} x={xs(i).toFixed(1)} y={H - 7} textAnchor="middle" fontSize="7"
              className="fill-slate-500 dark:fill-zinc-500">
              {fmtAxisDate(points[i].date)}
            </text>
          ))}

          {/* Hover: vertical line + dot */}
          {hovered && hoverIdx != null && (
            <g>
              <line x1={xs(hoverIdx).toFixed(1)} y1={PAD.top - 4}
                    x2={xs(hoverIdx).toFixed(1)} y2={H - PAD.bottom + 2}
                stroke="currentColor" strokeOpacity="0.3" strokeWidth="1"
                className="text-slate-600 dark:text-zinc-400" />
              <circle cx={xs(hoverIdx).toFixed(1)} cy={ys(hovered.cumValue).toFixed(1)}
                r="4.5" fill="white" stroke="rgb(var(--a5))" strokeWidth="2.5"
                className="dark:fill-zinc-950" />
            </g>
          )}

          {/* Hit area */}
          <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="transparent" />
        </svg>

        {/* Tooltip */}
        {hovered && hoverIdx != null && (
          <div className="absolute top-2 pointer-events-none z-10"
            style={{
              left: `${tipXFrac * 100}%`,
              transform: tipXFrac > 0.58 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
            }}>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 shadow-lg">
              <p className="text-[11px] font-bold text-slate-800 dark:text-white mb-1.5">
                {fmtTooltipDate(hovered.date)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {'Acumulado: '}
                <span className={`font-bold ${hovered.cumValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                  {fmtVal(hovered.cumValue, true)}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {'Día: '}
                <span className={`font-bold ${hovered.dayChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                  {fmtVal(hovered.dayChange, true)}
                </span>
                <span className="text-slate-500 dark:text-zinc-400"> ({hovered.tradeCount} trade{hovered.tradeCount !== 1 ? 's' : ''})</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {points.length > 0 && (
        <div className="grid grid-cols-4 border-t border-slate-100 dark:border-white/[0.05] divide-x divide-slate-100 dark:divide-zinc-800/60">
          {([
            { label: 'Primer Trade', value: firstDate ? new Date(firstDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', color: 'text-slate-700 dark:text-zinc-200' },
            { label: 'Rent. Máxima', value: `${peakVal >= 0 ? '+' : ''}${fmtVal(peakVal)}`, color: peakVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
            { label: 'Rent. Total',  value: `${lastVal >= 0 ? '+' : ''}${fmtVal(lastVal)}`,  color: lastVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
            { label: 'Último Trade', value: lastDate ? new Date(lastDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', color: 'text-slate-700 dark:text-zinc-200' },
          ] as { label: string; value: string; color: string }[]).map(s => (
            <div key={s.label} className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">{s.label}</span>
              <span className={`text-[11px] font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}



// ─── Analytics helpers ────────────────────────────────────────────────────────

interface MonthRow {
  key: string; label: string
  total: number; tp: number; sl: number; be: number
  netRR: number; netUSD: number
}

function buildMonthly(trades: Trade[], sessionType: SessionType): MonthRow[] {
  const byMonth: Record<string, Trade[]> = {}
  for (const t of trades) {
    const m = t.date_entry.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(t)
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, mTrades]) => {
      const tp  = mTrades.filter(t => t.result === 'tp').length
      const sl  = mTrades.filter(t => t.result === 'sl').length
      const be  = mTrades.filter(t => t.result === 'be').length
      const netRR = mTrades.reduce((s, t) => {
        if (t.result === 'tp' && t.rr_exit) return s + t.rr_exit
        if (t.result === 'sl' && t.rr_exit) return s - t.rr_exit
        return s
      }, 0)
      const netUSD = mTrades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
      const label = new Date(`${key}-15`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
      return { key, label, total: mTrades.length, tp, sl, be, netRR, netUSD }
    })
}

// ─── Profitability Verdict ─────────────────────────────────────────────────────

function ProfitabilityVerdict({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const tl = trades.filter(t => t.result === 'tp' || t.result === 'sl')
  const N  = tl.length
  if (N < 3) return null

  const { confidence, nMin, breakevenWR, profitable } = calcStrategyConfidence(trades)

  const winners    = tl.filter(t => t.result === 'tp')
  const losers     = tl.filter(t => t.result === 'sl')
  const wr         = winners.length / N
  const avgWin     = winners.length > 0 ? winners.reduce((s, t) => s + (t.rr_exit ?? 0), 0) / winners.length : 0
  const avgLoss    = losers.length  > 0 ? losers.reduce((s, t)  => s + (t.rr_exit ?? 0), 0) / losers.length  : 1
  const expectancy = (wr * avgWin) - ((1 - wr) * avgLoss)

  // Estado: calculando (faltan trades)
  if (N < nMin) {
    const faltanTrades = nMin - N
    const progress = Math.min((N / nMin) * 100, 99)
    return (
      <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none overflow-hidden">
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-400 dark:text-zinc-500">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-700 dark:text-zinc-200">Calculando rentabilidad…</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                Faltan <span className="font-bold text-slate-700 dark:text-zinc-200">{faltanTrades} trades</span> para confirmar el veredicto con 95% de confianza
              </p>
            </div>
            <span className="text-[13px] font-bold font-mono text-slate-500 dark:text-zinc-400 shrink-0">{N}/{nMin}</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full accent-bar transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-2">
            Break-even de esta estrategia: {(breakevenWR * 100).toFixed(1)}% WR · Expectativa actual: {expectancy >= 0 ? '+' : ''}{expectancy.toFixed(2)}R
          </p>
        </div>
      </div>
    )
  }

  // Estado: veredicto confirmado
  const conf = confidence ?? 50
  let tierColor: string
  let tierBg: string
  if (conf >= 95) {
    tierColor = 'text-emerald-600 dark:text-emerald-400'; tierBg = 'bg-emerald-100 dark:bg-emerald-500/15'
  } else if (conf >= 85) {
    tierColor = 'text-amber-600 dark:text-amber-400';    tierBg = 'bg-amber-100 dark:bg-amber-500/15'
  } else {
    tierColor = 'text-slate-500 dark:text-zinc-400';     tierBg = 'bg-slate-100 dark:bg-zinc-800'
  }

  const verdictColor  = profitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
  const verdictBg     = profitable ? 'bg-emerald-500/10 dark:bg-emerald-500/[0.12]' : 'bg-rose-500/10 dark:bg-rose-500/[0.12]'
  const verdictBorder = profitable ? 'border-emerald-500/20' : 'border-rose-500/20'
  const verdict       = profitable ? 'Estrategia Rentable' : 'Estrategia No Rentable'
  const confStr       = `${conf.toFixed(0)}%`
  const p             = (100 - conf).toFixed(1)

  const narrative = profitable
    ? conf >= 95
      ? `Solo hay un ${p}% de probabilidad de que estos resultados sean suerte. Con ${N} trades, el veredicto es sólido.`
      : `Hay un ${p}% de probabilidad de que los resultados sean azar. Seguí sumando trades para consolidar la confianza.`
    : conf >= 95
      ? `Solo hay un ${p}% de probabilidad de que estas pérdidas sean suerte. La estrategia muestra un problema real con ${N} trades.`
      : `Hay un ${p}% de probabilidad de que los resultados sean azar. Con más trades se aclarará el panorama.`

  return (
    <div className={`mx-4 mb-3 rounded-2xl border overflow-hidden ${verdictBg} ${verdictBorder}`}>
      <div className="px-4 pt-4 pb-3 flex items-start gap-3.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${profitable ? 'bg-emerald-500/20 dark:bg-emerald-500/25' : 'bg-rose-500/20 dark:bg-rose-500/25'}`}>
          {profitable
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500 dark:text-rose-400"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[18px] font-bold leading-tight ${verdictColor}`}>{verdict}</p>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
            {expectancy >= 0 ? '+' : ''}{expectancy.toFixed(3)}R por trade · WR {(wr * 100).toFixed(0)}% · break-even {(breakevenWR * 100).toFixed(1)}%
          </p>
        </div>
        <div className={`shrink-0 text-right px-3 py-2 rounded-xl ${tierBg}`}>
          <p className={`text-[22px] font-bold font-mono leading-none ${tierColor}`}>{confStr}</p>
          <p className={`text-[9px] font-semibold uppercase tracking-[0.08em] mt-0.5 ${tierColor}`}>confianza</p>
        </div>
      </div>
      <div className="px-4 pb-3.5">
        <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">{narrative}</p>
      </div>
    </div>
  )
}

// ─── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ trades }: { trades: Trade[] }) {
  const total = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const { nMin } = calcStrategyConfidence(trades)
  const MAX  = nMin
  const pct  = Math.min((total / MAX) * 100, 100)
  const done = total >= MAX

  // Tres marcadores: 30, mitad, total
  const mid  = Math.round(MAX / 2)
  const MILESTONES = [...new Set([30, mid, MAX].filter(m => m > 0 && m <= MAX))]

  let color = 'rgb(var(--a5) / 0.35)'
  let msg   = 'Necesitás al menos 30 trades para métricas básicas'
  if (done)             { color = 'rgb(var(--a5))';        msg = `Muestra suficiente para confirmar el veredicto con 95% de confianza (${total} trades)` }
  else if (pct >= 66)   { color = 'rgb(var(--a5) / 0.80)'; msg = `Casi listo — faltan ${MAX - total} trades para el veredicto definitivo` }
  else if (pct >= 33)   { color = 'rgb(var(--a5) / 0.55)'; msg = `En camino — ${total} de ${MAX} trades para confirmar la estrategia` }
  else if (total >= 30) { color = 'rgb(var(--a5) / 0.40)'; msg = `Métricas básicas disponibles — se necesitan ${MAX} trades para el veredicto` }

  return (
    <div className="mx-4 mb-3 px-4 py-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Muestra para veredicto</span>
        <span className={`text-[10px] font-mono font-bold ${done ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>{total} / {MAX}</span>
      </div>
      <div className="relative h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        {MILESTONES.map(m => (
          <div key={m} className="absolute top-0 h-full w-px bg-white dark:bg-zinc-950 opacity-60"
            style={{ left: `${(m / MAX) * 100}%` }} />
        ))}
      </div>
      <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 mt-1.5">{msg}</p>
    </div>
  )
}

// ─── Expectativa detallada ─────────────────────────────────────────────────────

function ExpectancyDetail({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const winners = trades.filter(t => t.result === 'tp')
  const losers  = trades.filter(t => t.result === 'sl')
  const N = winners.length + losers.length
  if (N === 0) return null
  const wr       = winners.length / N
  const avgWin   = winners.length > 0 ? winners.reduce((s, t) => s + (t.rr_exit ?? 0), 0) / winners.length : 0
  const avgLoss  = losers.length  > 0 ? losers.reduce((s, t)  => s + (t.rr_exit ?? 0), 0) / losers.length  : 0
  const expectancy = (wr * avgWin) - ((1 - wr) * avgLoss)
  const pf = calcProfitFactor(trades, sessionType)
  const pos = expectancy >= 0
  return (
    <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none px-4 pt-4 pb-3">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Expectativa</span>
          <p className={`text-[28px] font-bold font-mono leading-none mt-0.5 ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {expectancy >= 0 ? '+' : ''}{expectancy.toFixed(3)}R
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Profit Factor</span>
          <p className={`text-[22px] font-bold font-mono leading-none mt-0.5 ${pf !== null && pf > 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {pf === null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2)}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed mt-1">
        {pos
          ? `Por cada trade, recuperás en promedio ${expectancy.toFixed(2)}R neto. Ganás +${avgWin.toFixed(2)}R en el ${(wr * 100).toFixed(0)}% de los casos y perdés −${avgLoss.toFixed(2)}R en el ${((1 - wr) * 100).toFixed(0)}% restante.`
          : `Por cada trade, perdés en promedio ${Math.abs(expectancy).toFixed(2)}R neto. Ganás +${avgWin.toFixed(2)}R en el ${(wr * 100).toFixed(0)}% de los casos pero perdés −${avgLoss.toFixed(2)}R en el ${((1 - wr) * 100).toFixed(0)}% restante.`
        }
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: 'Winrate',        value: `${(wr * 100).toFixed(1)}%`,   color: 'text-slate-700 dark:text-zinc-200' },
          { label: 'RR prom. gan.',  value: `+${avgWin.toFixed(2)}R`,       color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'RR prom. perd.', value: `-${avgLoss.toFixed(2)}R`,      color: 'text-rose-500 dark:text-rose-400' },
        ].map(s => (
          <div key={s.label} className="flex flex-col gap-0.5 p-2 bg-slate-50 dark:bg-white/[0.04] rounded-xl">
            <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.08em]">{s.label}</span>
            <span className={`text-[13px] font-bold font-mono ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Z-Score card (explanation style) ─────────────────────────────────────────

function ZScoreCard({ trades }: { trades: Trade[] }) {
  const sorted = useMemo(() => [...trades].sort((a, b) => a.date_entry.localeCompare(b.date_entry)), [trades])
  const result = calcZScore(sorted)
  const N  = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const wr = N > 0 ? (trades.filter(t => t.result === 'tp').length / N) * 100 : null
  const z  = result?.z ?? null

  const avgRRExit = (() => {
    const tpRR  = trades.filter(t => t.result === 'tp' && t.rr_exit).reduce((s, t) => s + t.rr_exit!, 0)
    const slRR  = trades.filter(t => t.result === 'sl' && t.rr_exit).reduce((s, t) => s + t.rr_exit!, 0)
    const tpCnt = trades.filter(t => t.result === 'tp' && t.rr_exit).length
    const slCnt = trades.filter(t => t.result === 'sl' && t.rr_exit).length
    const avgW  = tpCnt > 0 ? tpRR / tpCnt : 1
    const avgL  = slCnt > 0 ? slRR / slCnt : 1
    return { avgW: avgW.toFixed(1), avgL: avgL.toFixed(1) }
  })()
  const breakeven = N > 0 ? (100 / (100 + parseFloat(avgRRExit.avgW) / parseFloat(avgRRExit.avgL) * 100)).toFixed(1) : null

  const ok = z !== null && N >= 30
  const zone = !ok ? 'normal' : z! < -1.96 ? 'alternante' : z! > 1.96 ? 'rachas' : 'normal'
  const positive = ok && zone === 'normal'

  let narrative = ''
  if (N < 30) {
    narrative = `Necesitas al menos 30 trades para que el Z-Score sea confiable. Llevas ${N}.`
  } else if (z !== null) {
    if (zone === 'normal') {
      narrative = `Tu winrate (${wr?.toFixed(1)}%) supera con claridad el breakeven de ${breakeven}% para tu RR ${avgRRExit.avgW}:${avgRRExit.avgL}. Hay evidencia sólida de que tu estrategia tiene una ventaja real.`
    } else if (zone === 'rachas') {
      narrative = `Tus trades tienden a agruparse en rachas (Z=${z.toFixed(2)}). Los resultados no son completamente aleatorios — considera si el mercado afecta tus decisiones en series.`
    } else {
      narrative = `Tus trades alternan entre ganadores y perdedores más de lo esperado (Z=${z.toFixed(2)}). Podría indicar sobre-ajuste o gestión del riesgo muy conservadora tras pérdidas.`
    }
  }

  return (
    <div className="mx-4 mb-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none px-4 py-4">
      <div className="flex items-start gap-3">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ok && positive ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-zinc-800'}`}>
          {ok && positive
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500 dark:text-zinc-400"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[13px] font-bold text-slate-800 dark:text-white">Z-Score</span>
            <span className={`text-[14px] font-bold font-mono shrink-0 ${
              z === null ? 'text-slate-300 dark:text-zinc-700'
              : ok && positive ? 'text-emerald-500 dark:text-emerald-400'
              : ok ? 'text-amber-500 dark:text-amber-400'
              : 'text-slate-500 dark:text-zinc-400'
            }`}>{z !== null ? z.toFixed(2) : '—'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed mb-1.5">
            El Z-Score mide qué tan improbable es que tu winrate supere el breakeven correspondiente a tu RR promedio. Un valor mayor a 2 indica ventaja estadística real.
          </p>
          {narrative && (
            <p className={`text-[11px] leading-relaxed font-medium ${ok && positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>
              {narrative}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── P-Value card (explanation style) ─────────────────────────────────────────

function PValueCard({ trades }: { trades: Trade[] }) {
  const pValue  = calcPValue(trades)
  const N       = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const hasEdge = pValue !== null && pValue < 0.05
  const pStr    = pValue === null ? '—' : pValue < 0.001 ? '<0.001' : `${(pValue * 100).toFixed(2)}%`

  let narrative = ''
  if (N < 10) {
    narrative = `Necesitas al menos 10 trades para calcular el P-Value. Llevas ${N}.`
  } else if (pValue !== null) {
    const pPct = (pValue * 100).toFixed(2)
    if (hasEdge) {
      narrative = `Si tu estrategia no tuviera ninguna ventaja real, habría solo un ${pPct}% de chances de ver estos resultados. La suerte como explicación queda prácticamente descartada.`
    } else {
      narrative = `Con un ${pPct}% de probabilidad, tus resultados podrían explicarse por el azar. Necesitas más trades o mejorar la consistencia para descartar la suerte.`
    }
  }

  return (
    <div className="mx-4 mb-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none px-4 py-4">
      <div className="flex items-start gap-3">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${hasEdge ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-zinc-800'}`}>
          {hasEdge
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500 dark:text-zinc-400"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[13px] font-bold text-slate-800 dark:text-white">P-Value</span>
            <span className={`text-[14px] font-bold font-mono shrink-0 ${
              pValue === null ? 'text-slate-300 dark:text-zinc-700'
              : hasEdge ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'
            }`}>{pStr}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed mb-1.5">
            El P-Value indica la probabilidad de obtener estos resultados por pura suerte. Cuanto más bajo, más confiables son tus datos.
          </p>
          {narrative && (
            <p className={`text-[11px] leading-relaxed font-medium ${hasEdge ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>
              {narrative}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── StdDev + Sharpe ───────────────────────────────────────────────────────────

function StdDevCard({ trades }: { trades: Trade[] }) {
  const stdDev    = calcStdDevRR(trades)
  const expectancy = calcExpectancy(trades)
  const sharpe    = (stdDev && stdDev > 0 && expectancy !== null) ? expectancy / stdDev : null
  return (
    <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none px-4 pt-4 pb-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Desv. estándar RR</span>
          <p className="text-[24px] font-bold font-mono leading-none mt-0.5 text-slate-700 dark:text-zinc-200">
            {stdDev === null ? '—' : `${stdDev.toFixed(2)}R`}
          </p>
          <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 mt-1">Variabilidad de resultados</p>
        </div>
        <div>
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Ratio Sharpe</span>
          <p className={`text-[24px] font-bold font-mono leading-none mt-0.5 ${
            sharpe === null ? 'text-slate-300 dark:text-zinc-700'
            : sharpe >= 1 ? 'text-emerald-600 dark:text-emerald-400'
            : sharpe >= 0.5 ? 'text-amber-500 dark:text-amber-400'
            : 'text-rose-500 dark:text-rose-400'
          }`}>
            {sharpe === null ? '—' : sharpe.toFixed(2)}
          </p>
          <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 mt-1">Expectativa / Desv.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Consistencia mensual ──────────────────────────────────────────────────────

function ConsistencySection({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const [page, setPage] = useState(0)
  const consistency = calcMonthlyConsistency(trades, sessionType)
  const monthly     = useMemo(() => buildMonthly(trades, sessionType), [trades, sessionType])
  if (monthly.length === 0) return null

  const PAGE_SIZE  = 3
  const reversed   = [...monthly].reverse()
  const totalPages = Math.ceil(monthly.length / PAGE_SIZE)
  const visible    = reversed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const posMonths      = monthly.filter(m => (sessionType === 'backtesting' ? m.netRR : m.netUSD) > 0).length
  const negMonths      = monthly.length - posMonths
  const avgRRExit      = (() => {
    const tpRR  = trades.filter(t => t.result === 'tp' && t.rr_exit).reduce((s, t) => s + t.rr_exit!, 0)
    const slRR  = trades.filter(t => t.result === 'sl' && t.rr_exit).reduce((s, t) => s + t.rr_exit!, 0)
    const tpCnt = trades.filter(t => t.result === 'tp' && t.rr_exit).length
    const slCnt = trades.filter(t => t.result === 'sl' && t.rr_exit).length
    return tpCnt > 0 && slCnt > 0 ? tpRR / tpCnt / (slRR / slCnt) : 1
  })()
  const N = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const wr = N > 0 ? trades.filter(t => t.result === 'tp').length / N : 0
  const expectedNeg = monthly.length * (1 - wr)
  const beatExpected = negMonths < expectedNeg

  return (
    <div className="mx-4 mb-1.5 flex flex-col gap-1.5">
      {/* Meses Perdedores explanation row */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none px-4 py-4">
        <div className="flex items-start gap-3">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${beatExpected ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-rose-100 dark:bg-rose-900/40'}`}>
            {beatExpected
              ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-[13px] font-bold text-slate-800 dark:text-white">Meses Perdedores: Reales vs Esperados</span>
              <span className={`text-[14px] font-bold font-mono shrink-0 ${beatExpected ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {negMonths} / {expectedNeg.toFixed(1)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed mb-1.5">
              Compara cuántos meses perdedores (en {sessionType === 'backtesting' ? 'R' : '$'}) tuviste realmente contra los que predice la estadística, considerando tu RR promedio.
            </p>
            <p className={`text-[11px] leading-relaxed font-medium ${beatExpected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>
              {monthly.length > 0 && consistency
                ? `La estadística predice ${expectedNeg.toFixed(1)} meses en pérdida de un total de ${monthly.length} meses (considerando tu RR promedio de ${avgRRExit.toFixed(2)}:1.00), pero solo tuviste ${negMonths}. ${beatExpected ? 'Estás ejecutando tu estrategia mejor de lo que los números esperan.' : 'Estás teniendo más meses negativos de lo estadísticamente esperado.'}`
                : 'Necesitas más datos para este análisis.'}
            </p>
          </div>
        </div>
      </div>

      {/* Month-by-month table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Mes a mes</p>
          {consistency && (
            <span className={`text-[10px] font-bold font-mono ${consistency.pct >= 50 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {consistency.positive}/{consistency.total} positivos
            </span>
          )}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
          {visible.map(row => {
            const net = sessionType === 'backtesting' ? row.netRR : row.netUSD
            const pos = net > 0
            return (
              <div key={row.key} className="flex items-center px-4 py-2.5 gap-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${pos ? 'bg-emerald-400' : net < 0 ? 'bg-rose-400' : 'bg-slate-300 dark:bg-zinc-600'}`} />
                <span className="text-[12px] font-medium text-slate-600 dark:text-zinc-400 w-14 shrink-0 capitalize">{row.label}</span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex-1">
                  {row.tp}TP · {row.sl}SL{row.be > 0 ? ` · ${row.be}BE` : ''}
                </span>
                <span className={`text-[12px] font-bold font-mono ${pos ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                  {net >= 0 ? '+' : ''}{sessionType === 'backtesting' ? `${net.toFixed(1)}R` : `$${net.toFixed(0)}`}
                </span>
              </div>
            )
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-white/[0.05]">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages - 1}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Expectativa por mes ───────────────────────────────────────────────────────

function ExpPerMonthCard({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const N           = trades.length
  const expectancy  = calcExpectancy(trades)
  const consistency = calcMonthlyConsistency(trades, sessionType)
  const epm         = (expectancy !== null && consistency !== null && consistency.total > 0)
    ? (N / consistency.total) * expectancy : null
  if (epm === null) return null
  const tradesPerMonth = consistency ? (N / consistency.total).toFixed(1) : '—'
  return (
    <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none px-4 pt-4 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Expectativa por mes</span>
          <p className={`text-[28px] font-bold font-mono leading-none mt-0.5 ${epm >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {epm >= 0 ? '+' : ''}{epm.toFixed(1)}R
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em]">Trades/mes</span>
          <p className="text-[22px] font-bold font-mono leading-none mt-0.5 text-slate-700 dark:text-zinc-200">{tradesPerMonth}</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-2">
        Proyección basada en tu expectativa actual y frecuencia histórica.
      </p>
    </div>
  )
}

// ─── Sweet Spot (backtesting) ──────────────────────────────────────────────────

function SweetSpotChart({ trades }: { trades: Trade[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const result = useMemo(() => calcSweetSpot(trades), [trades])
  const { points, sweetSpotLevel, sweetSpotRR, realTotalRR } = result
  const W = 600, H = 200
  const PAD = { top: 20, right: 16, bottom: 36, left: 48 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom
  const vals    = points.map(p => p.totalRR)
  const hasData = points.length >= 2
  const allVals = hasData ? [...vals, realTotalRR] : [0, 1]
  const minV    = Math.min(...allVals)
  const maxV    = Math.max(...allVals)
  const vRange  = maxV - minV || 1
  const dMin    = minV - vRange * 0.12
  const dMax    = maxV + vRange * 0.12
  const dRange  = dMax - dMin
  const xs = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * iW
  const ys = (v: number) => PAD.top  + (1 - (v - dMin) / dRange) * iH
  const ssIdx = points.findIndex(p => p.level === sweetSpotLevel)
  const pathD = hasData
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.totalRR).toFixed(1)}`).join(' ')
    : ''
  const zero  = Math.max(PAD.top, Math.min(H - PAD.bottom, ys(0)))
  const areaD = hasData
    ? `${pathD} L ${xs(points.length - 1).toFixed(1)} ${zero.toFixed(1)} L ${xs(0).toFixed(1)} ${zero.toFixed(1)} Z`
    : ''
  const yTicks = Array.from({ length: 5 }, (_, i) => dMin + (i / 4) * dRange)
  const xTCount = Math.min(7, points.length)
  const xTicks  = points.length <= 1 ? []
    : Array.from({ length: xTCount }, (_, i) =>
        Math.round(i * (points.length - 1) / Math.max(xTCount - 1, 1)))
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = (e.clientX - rect.left) * (W / rect.width) - PAD.left
    setHoverIdx(Math.max(0, Math.min(points.length - 1, Math.round((svgX / iW) * (points.length - 1)))))
  }
  const hovered  = hoverIdx != null ? points[hoverIdx] : null
  const tipXFrac = hoverIdx != null
    ? (PAD.left + (hoverIdx / Math.max(points.length - 1, 1)) * iW) / W : 0
  const realY = hasData ? ys(realTotalRR) : H / 2
  return (
    <div className="mx-4 mb-2 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <span className="text-[12px] font-bold text-slate-800 dark:text-white">RR simulado por nivel de salida</span>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
            <span className="w-3 h-0.5 bg-amber-500 inline-block rounded-full" />Sweet Spot
          </span>
          <span className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
            <span className="w-3 h-px border-t border-dashed border-slate-400 dark:border-zinc-500 inline-block" />Real
          </span>
        </div>
      </div>
      <div className="relative select-none">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
          onMouseMove={hasData ? handleMouseMove : undefined}
          onMouseLeave={() => setHoverIdx(null)}>
          <defs>
            <linearGradient id="ss-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="rgb(var(--a5))" stopOpacity="0.18" />
              <stop offset="100%" stopColor="rgb(var(--a5))" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={ys(v).toFixed(1)} x2={W - PAD.right} y2={ys(v).toFixed(1)}
                stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" className="text-slate-900 dark:text-white" />
              <text x={PAD.left - 5} y={parseFloat(ys(v).toFixed(1)) + 3.5}
                textAnchor="end" fontSize="7" fontFamily="monospace"
                className="fill-slate-500 dark:fill-zinc-500">
                {v >= 0 ? '+' : ''}{v.toFixed(1)}R
              </text>
            </g>
          ))}
          {dMin < 0 && dMax > 0 && (
            <line x1={PAD.left} y1={ys(0).toFixed(1)} x2={W - PAD.right} y2={ys(0).toFixed(1)}
              stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 3"
              className="text-slate-500 dark:text-zinc-500" />
          )}
          {hasData && (
            <line x1={PAD.left} y1={realY.toFixed(1)} x2={W - PAD.right} y2={realY.toFixed(1)}
              stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="5 4"
              className="text-slate-500 dark:text-zinc-400" />
          )}
          {areaD && <path d={areaD} fill="url(#ss-g)" />}
          {pathD && (
            <path d={pathD} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ stroke: 'rgb(var(--a5))' }} />
          )}
          {hasData && ssIdx >= 0 && (
            <line x1={xs(ssIdx).toFixed(1)} y1={PAD.top} x2={xs(ssIdx).toFixed(1)} y2={H - PAD.bottom}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" strokeOpacity="0.8" />
          )}
          {hasData && ssIdx >= 0 && (
            <circle cx={xs(ssIdx).toFixed(1)} cy={ys(sweetSpotRR).toFixed(1)}
              r="6" fill="#f59e0b" stroke="white" strokeWidth="2.5" className="dark:stroke-zinc-950" />
          )}
          {!hasData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11"
              className="fill-slate-300 dark:fill-zinc-700">Sin datos de RR máximo</text>
          )}
          {xTicks.map(i => (
            <text key={i} x={xs(i).toFixed(1)} y={H - 7} textAnchor="middle" fontSize="7"
              className="fill-slate-500 dark:fill-zinc-500">
              {points[i].level.toFixed(2)}R
            </text>
          ))}
          {hovered && hoverIdx != null && hoverIdx !== ssIdx && (
            <g>
              <line x1={xs(hoverIdx).toFixed(1)} y1={PAD.top - 4} x2={xs(hoverIdx).toFixed(1)} y2={H - PAD.bottom + 2}
                stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" className="text-slate-600 dark:text-zinc-400" />
              <circle cx={xs(hoverIdx).toFixed(1)} cy={ys(hovered.totalRR).toFixed(1)}
                r="4" fill="white" stroke="rgb(var(--a5))" strokeWidth="2" className="dark:fill-zinc-950" />
            </g>
          )}
          <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="transparent" />
        </svg>
        {hovered && hoverIdx != null && (
          <div className="absolute top-2 pointer-events-none z-10"
            style={{ left: `${tipXFrac * 100}%`, transform: tipXFrac > 0.58 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 shadow-lg">
              <p className="text-[11px] font-bold text-slate-800 dark:text-white mb-1.5">
                Salida en {hovered.level.toFixed(2)}R
                {hoverIdx === ssIdx && <span className="ml-1.5 text-amber-500">★</span>}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Total RR: <span className={`font-bold ${hovered.totalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{hovered.totalRR >= 0 ? '+' : ''}{hovered.totalRR.toFixed(2)}R</span></p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Winrate: <span className="font-bold text-slate-700 dark:text-zinc-200">{hovered.winrate.toFixed(1)}%</span></p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">PF: <span className="font-bold text-slate-700 dark:text-zinc-200">{hovered.profitFactor === null ? '—' : hovered.profitFactor === Infinity ? '∞' : hovered.profitFactor.toFixed(2)}</span></p>
            </div>
          </div>
        )}
      </div>
      {hasData && (
        <div className="grid grid-cols-3 border-t border-slate-100 dark:border-white/[0.05] divide-x divide-slate-100 dark:divide-zinc-800/60">
          {([
            { label: 'Sweet Spot',  value: `${sweetSpotLevel.toFixed(2)}R`,                                                       color: 'text-amber-600 dark:text-amber-400' },
            { label: 'RR simulado', value: `${sweetSpotRR >= 0 ? '+' : ''}${sweetSpotRR.toFixed(1)}R`,                           color: sweetSpotRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
            { label: 'RR real',     value: `${realTotalRR >= 0 ? '+' : ''}${realTotalRR.toFixed(1)}R`,                           color: realTotalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
          ] as { label: string; value: string; color: string }[]).map(s => (
            <div key={s.label} className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">{s.label}</span>
              <span className={`text-[12px] font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SweetSpotTable({ trades }: { trades: Trade[] }) {
  const result = useMemo(() => calcSweetSpot(trades), [trades])
  const { points, sweetSpotLevel, realTotalRR } = result
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => b.totalRR - a.totalRR).slice(0, 12)
  return (
    <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.05]">
        <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Top niveles de salida</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-50 dark:border-zinc-800/40">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">Nivel</th>
              <th className="text-right px-3 py-2 text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">Total RR</th>
              <th className="text-right px-3 py-2 text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">Winrate</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">PF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/30">
            {sorted.map((row, idx) => {
              const isBest = row.level === sweetSpotLevel
              return (
                <tr key={row.level} className={isBest ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {isBest
                        ? <span className="text-[9px] font-bold text-amber-500 shrink-0">★</span>
                        : <span className="text-[9px] text-slate-300 dark:text-zinc-700 font-mono shrink-0">{idx + 1}</span>}
                      <span className={`font-bold font-mono ${isBest ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-zinc-200'}`}>
                        {row.level.toFixed(2)}R
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-bold font-mono ${row.totalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {row.totalRR >= 0 ? '+' : ''}{row.totalRR.toFixed(2)}R
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-zinc-400">{row.winrate.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600 dark:text-zinc-400">
                    {row.profitFactor === null ? '—' : row.profitFactor === Infinity ? '∞' : row.profitFactor.toFixed(2)}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-slate-50/60 dark:bg-zinc-900/40">
              <td className="px-4 py-2.5"><span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">Real (histórico)</span></td>
              <td className={`px-3 py-2.5 text-right font-bold font-mono ${realTotalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {realTotalRR >= 0 ? '+' : ''}{realTotalRR.toFixed(2)}R
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-500 dark:text-zinc-500">{result.realWinrate.toFixed(1)}%</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-500 dark:text-zinc-500">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Dashboard Date Filter ─────────────────────────────────────────────────────

function CalendarDatePicker({ from, to, onChange, onClose, allTrades }: {
  from: string; to: string
  onChange: (f: string, t: string) => void
  onClose: () => void
  allTrades: Trade[]
}) {
  const today   = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [step, setStep]   = useState<'start' | 'end'>(from ? 'end' : 'start')

  const firstDay    = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow    = (firstDay.getDay() + 6) % 7
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  function getKey(d: number) { return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }

  function handleDay(d: number) {
    const key = getKey(d)
    if (step === 'start') {
      onChange(key, ''); setStep('end')
    } else {
      if (from && key < from) { onChange(key, from); setStep('start') }
      else { onChange(from, key); setStep('start') }
    }
  }

  const tradeYears = useMemo(() => {
    const ys = [...new Set(allTrades.map(t => t.date_entry.slice(0, 4)))].sort().reverse()
    return ys
  }, [allTrades])

  const curMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const curMonthLabel = today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())

  const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

  const label = !from && !to ? 'Todas las fechas'
    : from && to ? `${fmtDateShort(from)} → ${fmtDateShort(to)}`
    : from ? `Desde ${fmtDateShort(from)}`
    : `Hasta ${fmtDateShort(to)}`

  return (
    <BottomSheet title="Filtrar por fecha" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Status */}
        <p className="text-[12px] text-center text-slate-500 dark:text-zinc-400">
          {step === 'start' ? 'Selecciona la fecha inicial' : 'Ahora selecciona la fecha final'}
        </p>

        {/* Calendar */}
        <div className="bg-slate-50 dark:bg-zinc-900/60 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-[13px] font-bold text-slate-800 dark:text-white">{monthLabel}</span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0 mb-1">
            {DAYS.map(d => (
              <span key={d} className="text-center text-[10px] font-bold text-slate-400 dark:text-zinc-500 py-1">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const key = getKey(d)
              const isStart  = key === from
              const isEnd    = key === to
              const inRange  = from && to && key > from && key < to
              const isToday  = key === today.toISOString().slice(0, 10)
              return (
                <button key={i} onClick={() => handleDay(d)}
                  className={`h-8 w-full rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                    isStart || isEnd
                      ? 'accent-btn text-white font-bold'
                      : inRange
                        ? 'accent-tint accent-txt'
                        : isToday
                          ? 'font-bold text-slate-900 dark:text-white bg-slate-200 dark:bg-zinc-700'
                          : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                  }`}>
                  {d}
                </button>
              )
            })}
          </div>
        </div>

        {/* Quick pills */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { onChange('', ''); setStep('start') }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${
              !from && !to ? 'accent-btn border-transparent text-white' : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}>Todo</button>
          <button onClick={() => {
            const f = `${curMonthKey}-01`
            const l = new Date(today.getFullYear(), today.getMonth() + 1, 0)
            onChange(f, l.toISOString().slice(0, 10)); setStep('start')
          }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${
              from?.startsWith(curMonthKey) ? 'accent-btn border-transparent text-white' : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}>{curMonthLabel}</button>
          {tradeYears.map(y => (
            <button key={y} onClick={() => { onChange(`${y}-01-01`, `${y}-12-31`); setStep('start') }}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${
                from === `${y}-01-01` && to === `${y}-12-31` ? 'accent-btn border-transparent text-white' : 'border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}>{y}</button>
          ))}
        </div>

        {/* Summary */}
        <p className="text-center text-[12px] font-medium text-slate-500 dark:text-zinc-400">{label}</p>

        <button onClick={onClose}
          className="w-full min-h-[48px] rounded-2xl accent-btn accent-btn-shadow font-bold text-[14px] cursor-pointer">
          Aplicar
        </button>
      </div>
    </BottomSheet>
  )
}

// ─── Filter Sheet ──────────────────────────────────────────────────────────────

function FilterSheet({ filter, onApply, onClose, instrumentOptions, variables }: {
  filter: FilterState; onApply: (f: FilterState) => void; onClose: () => void
  instrumentOptions: string[]; variables: Variable[]
}) {
  const [local, setLocal] = useState<FilterState>(filter)

  function upd<K extends keyof FilterState>(k: K, v: FilterState[K]) {
    setLocal(p => ({ ...p, [k]: v }))
  }
  function toggleArr<T>(k: 'results' | 'directions', v: T) {
    setLocal(p => {
      const arr = p[k] as T[]
      return { ...p, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] }
    })
  }
  function toggleInstrument(name: string) {
    setLocal(p => ({
      ...p,
      instruments: p.instruments.includes(name)
        ? p.instruments.filter(x => x !== name)
        : [...p.instruments, name],
    }))
  }
  function toggleVar(key: string, val: string) {
    setLocal(p => {
      const curr = p.vars[key] ?? []
      const next = curr.includes(val) ? curr.filter(x => x !== val) : [...curr, val]
      return { ...p, vars: { ...p.vars, [key]: next } }
    })
  }

  const filterableVars = variables.filter(v =>
    v.key !== 'instrument' &&
    (v.type === 'select_single' || v.type === 'select_multiple') &&
    v.options && v.options.length > 0
  )

  const tinp = 'w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/60 rounded-xl px-4 py-3 text-[14px] text-slate-900 dark:text-white outline-none min-h-[48px] accent-input'
  const lbl  = 'block text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2.5'
  const div  = 'h-px bg-slate-100 dark:bg-zinc-800 my-5'

  return (
    <BottomSheet title="Filtros" onClose={onClose}>
      <div>
        <p className={lbl}>Resultado</p>
        <div className="flex gap-2">
          {(['tp', 'sl', 'be'] as Result[]).map(r => {
            const cfg = RESULT_CFG[r]
            const on  = local.results.includes(r)
            return (
              <button key={r} onClick={() => toggleArr('results', r)}
                className={`flex-1 min-h-[44px] rounded-xl text-[13px] font-bold border transition-colors cursor-pointer ${
                  on ? `${cfg.badge}` : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                }`}>
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className={div} />
      <div>
        <p className={lbl}>Dirección</p>
        <div className="flex gap-2">
          {(['long', 'short'] as Direction[]).map(d => {
            const on = local.directions.includes(d)
            return (
              <button key={d} onClick={() => toggleArr('directions', d)}
                className={`flex-1 min-h-[44px] rounded-xl text-[13px] font-bold border transition-colors cursor-pointer ${
                  on
                    ? d === 'long'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                    : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                }`}>
                {d === 'long' ? '▲ Long' : '▼ Short'}
              </button>
            )
          })}
        </div>
      </div>
      {instrumentOptions.length > 0 && (
        <>
          <div className={div} />
          <div>
            <p className={lbl}>Instrumento</p>
            <div className="flex flex-wrap gap-1.5">
              {instrumentOptions.map(name => {
                const on = local.instruments.includes(name)
                return (
                  <button key={name} onClick={() => toggleInstrument(name)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-colors cursor-pointer ${
                      on
                        ? 'accent-badge'
                        : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900'
                    }`}>
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
      {filterableVars.map(v => (
        <div key={v.key}>
          <div className={div} />
          <div>
            <p className={lbl}>{v.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {v.options!.map(opt => {
                const on = (local.vars[v.key] ?? []).includes(opt)
                return (
                  <button key={opt} onClick={() => toggleVar(v.key, opt)}
                    className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-colors cursor-pointer ${
                      on
                        ? 'accent-badge'
                        : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900'
                    }`}>
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-2 mt-6">
        <button onClick={() => setLocal(EMPTY_FILTER)}
          className="flex-1 min-h-[48px] rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 font-medium text-[13px] cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors">
          Limpiar
        </button>
        <button onClick={() => { onApply(local); onClose() }}
          className="flex-1 min-h-[48px] rounded-2xl accent-btn accent-btn-shadow font-bold text-[14px] cursor-pointer transition-colors">
          Aplicar
        </button>
      </div>
    </BottomSheet>
  )
}

// ─── Day Detail Sheet ──────────────────────────────────────────────────────────

function DayDetailSheet({ dateKey, trades, sessionType, onClose }: {
  dateKey: string; trades: Trade[]; sessionType: SessionType; onClose: () => void
}) {
  const d     = new Date(dateKey + 'T12:00:00')
  const title = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const net   = trades.reduce((acc, t) => acc + tradeValue(t, sessionType), 0)
  const netFmt = sessionType === 'backtesting'
    ? `${net >= 0 ? '+' : ''}${net.toFixed(2)}R`
    : fmtPnL(net) ?? `${net >= 0 ? '+' : ''}$${Math.abs(net).toFixed(0)}`

  return (
    <BottomSheet title={title.charAt(0).toUpperCase() + title.slice(1)} onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[12px] text-slate-500 dark:text-zinc-400">
          {trades.length} trade{trades.length !== 1 ? 's' : ''}
        </span>
        <span className={`text-[14px] font-bold font-mono ml-auto ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
          {netFmt}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {trades.map(t => {
          const cfg      = t.result ? RESULT_CFG[t.result] : null
          const val      = fmtTradeValue(t, sessionType)
          const valColor = t.result === 'tp' ? 'text-emerald-600 dark:text-emerald-400'
                         : t.result === 'sl' ? 'text-rose-500 dark:text-rose-400'
                         : 'text-zinc-400 dark:text-zinc-500'
          return (
            <div key={t.id} className="flex items-center gap-3 px-3 py-3 bg-slate-50 dark:bg-zinc-900 rounded-2xl">
              <div className={`w-[3px] h-9 rounded-full shrink-0 ${cfg?.bar ?? 'bg-zinc-300 dark:bg-zinc-700'}`} />
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {t.instrument && <span className="text-[13px] font-bold text-slate-800 dark:text-zinc-100 truncate">{t.instrument}</span>}
                  {t.direction && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                      t.direction === 'long'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400'
                    }`}>{t.direction === 'long' ? '▲ L' : '▼ S'}</span>
                  )}
                  <span className={`ml-auto text-[14px] font-bold font-mono shrink-0 ${valColor}`}>{val}</span>
                </div>
                {cfg && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border inline-block self-start ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// ─── Sort Header Cell ──────────────────────────────────────────────────────────

function SortTh({ col, label, className = '', sortCol, sortDir, onSort }: {
  col: SortCol; label: string; className?: string
  sortCol: SortCol; sortDir: SortDir; onSort: (c: SortCol) => void
}) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] whitespace-nowrap cursor-pointer select-none transition-colors ${
        active
          ? 'accent-txt'
          : 'text-slate-500 dark:text-zinc-400 hover:text-slate-600 dark:hover:text-zinc-300'
      } ${className}`}>
      <span className="flex items-center gap-1">
        {label}
        <span className={`shrink-0 transition-transform ${active && sortDir === 'asc' ? 'rotate-180' : ''}`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </span>
    </th>
  )
}

// ─── Table View ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

function TableView({ trades, sessionType, variables, sortCol, sortDir, onSort, onEdit, onDelete }: {
  trades: Trade[]; sessionType: SessionType; variables: Variable[]
  sortCol: SortCol; sortDir: SortDir; onSort: (c: SortCol) => void
  onEdit: (t: Trade) => void; onDelete: (t: Trade) => void
}) {
  const [showInstrument, setShowInstrument] = useState(true)
  const [visibleVars, setVisibleVars]       = useState<Set<string>>(new Set())
  const [showColPicker, setShowColPicker]   = useState(false)
  const [page, setPage]                     = useState(0)
  const colPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setPage(0) }, [trades])

  useEffect(() => {
    if (!showColPicker) return
    const h = (e: MouseEvent) => { if (!colPickerRef.current?.contains(e.target as Node)) setShowColPicker(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showColPicker])

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <p className="text-[13px] text-slate-500 dark:text-zinc-400">Sin trades con los filtros aplicados</p>
      </div>
    )
  }

  const sortProps      = { sortCol, sortDir, onSort }
  const visibleVarKeys = Array.from(visibleVars).filter(k => variables.some(v => v.key === k))
  const totalPages     = Math.ceil(trades.length / PAGE_SIZE)
  const paginated      = trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const hasColumns     = variables.length > 0 || true

  return (
    <div>
      {/* Column toggle */}
      {hasColumns && (
        <div className="flex justify-end px-4 py-2 relative" ref={colPickerRef}>
          <button onClick={() => setShowColPicker(p => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border ${
              visibleVars.size > 0 || !showInstrument
                ? 'accent-badge'
                : 'border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}>
            <IconColumns />
            Columnas
          </button>
          {showColPicker && (
            <div className="absolute right-4 top-10 z-20 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-xl py-2 min-w-[200px]">
              <button
                onClick={() => setShowInstrument(v => !v)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${showInstrument ? 'accent-btn border-transparent' : 'border-slate-300 dark:border-zinc-600'}`}>
                  {showInstrument && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                Instrumento
              </button>
              {variables.map(v => {
                const on = visibleVars.has(v.key)
                return (
                  <button key={v.key}
                    onClick={() => setVisibleVars(s => { const nS = new Set(s); on ? nS.delete(v.key) : nS.add(v.key); return nS })}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                    <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${on ? 'accent-btn border-transparent' : 'border-slate-300 dark:border-zinc-600'}`}>
                      {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    {v.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto pb-4">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/[0.05] bg-slate-50/80 dark:bg-white/[0.03]">
              <SortTh col="date"      label="Fecha"     className="pl-4 pr-2" {...sortProps} />
              <SortTh col="direction" label="Dirección" {...sortProps} />
              <SortTh col="result"    label="Resultado" {...sortProps} />
              <SortTh col="rr"        label="RR"        {...sortProps} />
              {showInstrument && <SortTh col="instrument" label="Instrumento" {...sortProps} />}
              {visibleVarKeys.map(key => {
                const v = variables.find(x => x.key === key)!
                return <SortTh key={key} col={key} label={v.label} {...sortProps} />
              })}
              <th className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-zinc-400 whitespace-nowrap">Detalles</th>
              <th className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-zinc-400 whitespace-nowrap pr-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => {
              const cfg    = t.result ? RESULT_CFG[t.result] : null
              const rrStr  = t.rr_exit != null ? `1:${t.rr_exit}` : '—'
              const resultDisplay = (() => {
                if (!t.result) return null
                if (t.result === 'be') return 'BE'
                if (sessionType === 'backtesting') {
                  if (!t.rr_exit) return t.result === 'tp' ? 'TP' : 'SL'
                  return t.result === 'tp' ? `+${t.rr_exit.toFixed(2)}R` : `-${t.rr_exit.toFixed(2)}R`
                }
                // journal → %
                if (t.risk_percent != null && t.rr_exit != null) {
                  const pct = t.result === 'tp' ? t.risk_percent * t.rr_exit : -t.risk_percent
                  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
                }
                if (t.pnl_usd != null && t.capital_start != null && t.capital_start > 0) {
                  const pct = (t.pnl_usd / t.capital_start) * 100
                  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
                }
                return t.result === 'tp' ? 'TP' : 'SL'
              })()
              const dirPos    = t.direction === 'long'
              const tvUrl = (t.custom_fields?.tv_url ?? t.custom_fields?.tradingview ?? t.custom_fields?.link ?? t.custom_fields?.analysis_link) as string | undefined
              const notesUrl  = t.notes?.startsWith('http') ? t.notes : undefined
              const detailUrl = tvUrl ?? notesUrl

              return (
                <tr key={t.id} className="border-b border-slate-50 dark:border-zinc-800/40 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-2 py-3 pl-4 whitespace-nowrap">
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                      {fmtDateShort(t.date_entry)}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    {t.direction ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${dirPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                          <path d={dirPos ? 'M12 4l8 16H4z' : 'M12 20L4 4h16z'} />
                        </svg>
                        {dirPos ? 'Long' : 'Short'}
                      </span>
                    ) : <span className="text-zinc-300 dark:text-zinc-700 text-[12px]">—</span>}
                  </td>
                  <td className="px-2 py-3">
                    {cfg && resultDisplay ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-[11px] font-bold border font-mono tabular-nums ${cfg.badge}`}>
                        {resultDisplay}
                      </span>
                    ) : <span className="text-zinc-300 dark:text-zinc-700 text-[12px]">—</span>}
                  </td>
                  <td className="px-2 py-3">
                    <span className={`text-[12px] font-mono ${
                      t.result === 'tp' ? 'text-emerald-600 dark:text-emerald-400'
                      : t.result === 'sl' ? 'text-rose-500 dark:text-rose-400'
                      : 'text-slate-500 dark:text-zinc-400'
                    }`}>{rrStr}</span>
                  </td>
                  {showInstrument && (
                    <td className="px-2 py-3">
                      {t.instrument ? (
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                          {t.instrument}
                        </span>
                      ) : <span className="text-zinc-300 dark:text-zinc-700 text-[12px]">—</span>}
                    </td>
                  )}
                  {visibleVarKeys.map(key => (
                    <td key={key} className="px-2 py-3">
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {t.custom_fields[key] != null ? String(t.custom_fields[key]) : '—'}
                      </span>
                    </td>
                  ))}
                  <td className="px-2 py-3">
                    {detailUrl ? (
                      <a href={detailUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        Ver
                      </a>
                    ) : (
                      t.notes ? (
                        <span className="text-[11px] text-slate-500 dark:text-zinc-400 max-w-[100px] truncate block">{t.notes}</span>
                      ) : <span className="text-zinc-300 dark:text-zinc-700 text-[12px]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3 pr-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEdit(t)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => onDelete(t)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors cursor-pointer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/[0.05]">
        <span className="text-[11px] text-slate-500 dark:text-zinc-400">
          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, trades.length)} de {trades.length}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i).map(i => (
            <button key={i} onClick={() => setPage(i)}
              className={`w-8 h-8 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer ${i === page ? 'accent-tab' : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const today = new Date()
  const [year, setYear]       = useState(today.getFullYear())
  const [month, setMonth]     = useState(today.getMonth())
  const [dayKey, setDayKey]   = useState<string | null>(null)
  const [hoverDay, setHoverDay] = useState<number | null>(null)
  const chartRef = useRef<SVGSVGElement>(null)

  const byDay = useMemo(() => {
    const map: Record<string, Trade[]> = {}
    for (const t of trades) {
      const k = t.date_entry.slice(0, 10)
      if (!map[k]) map[k] = []
      map[k].push(t)
    }
    return map
  }, [trades])

  const firstDay    = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow    = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthKey    = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthTrades = trades.filter(t => t.date_entry.startsWith(monthKey))
  const N   = monthTrades.length
  const W   = monthTrades.filter(t => t.result === 'tp').length
  const L   = monthTrades.filter(t => t.result === 'sl').length
  const wr  = (W + L) > 0 ? (W / (W + L)) * 100 : null
  const netMonth = monthTrades.reduce((acc, t) => acc + tradeValue(t, sessionType), 0)

  function fmtNet(v: number, decimals = 2) {
    const s = v >= 0 ? '+' : ''
    return sessionType === 'backtesting'
      ? `${s}${v.toFixed(decimals)}R`
      : fmtPnL(v) ?? `${s}$${Math.abs(v).toFixed(0)}`
  }

  const monthLabel = firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }
  function getKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  function fmtDayVal(net: number) {
    if (sessionType === 'backtesting') return `${net >= 0 ? '+' : ''}${net.toFixed(1)}R`
    const abs = Math.abs(net)
    const s   = net >= 0 ? '+' : '-'
    return abs >= 1000 ? `${s}${(abs / 1000).toFixed(1)}k` : `${s}${Math.round(abs)}`
  }

  // ─ Cumulative chart data: one point per calendar day ─
  interface ChartPoint { day: number; cum: number }
  const chartPoints = useMemo((): ChartPoint[] => {
    const pts: ChartPoint[] = []
    let cum = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayT = byDay[k] ?? []
      for (const t of dayT) cum += tradeValue(t, sessionType)
      pts.push({ day: d, cum })
    }
    return pts
  }, [byDay, daysInMonth, year, month, sessionType])

  const hasChart   = chartPoints.some((p, i) => i > 0 && p.cum !== chartPoints[i - 1].cum)
  const cVals      = chartPoints.map(p => p.cum)
  const cMin       = Math.min(...cVals, 0)
  const cMax       = Math.max(...cVals, 0)
  const cRange     = cMax - cMin || 1
  const cDMin      = cMin - cRange * 0.12
  const cDMax      = cMax + cRange * 0.12
  const cDRange    = cDMax - cDMin
  const peakVal    = Math.max(...cVals)
  const finalVal   = cVals[cVals.length - 1] ?? 0
  const initVal    = 0

  const CW = 600, CH = 200
  const CP = { top: 20, right: 16, bottom: 32, left: 52 }
  const ciW = CW - CP.left - CP.right
  const ciH = CH - CP.top  - CP.bottom

  const cxs = (d: number) => CP.left + ((d - 1) / Math.max(daysInMonth - 1, 1)) * ciW
  const cys = (v: number) => CP.top  + (1 - (v - cDMin) / cDRange) * ciH
  const zero = Math.max(CP.top, Math.min(CH - CP.bottom, cys(0)))

  const pathD = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${cxs(p.day).toFixed(1)} ${cys(p.cum).toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${cxs(daysInMonth).toFixed(1)} ${zero.toFixed(1)} L ${cxs(1).toFixed(1)} ${zero.toFixed(1)} Z`

  const yTicks = Array.from({ length: 5 }, (_, i) => cDMin + (i / 4) * cDRange)
  const xStep  = daysInMonth <= 15 ? 2 : daysInMonth <= 20 ? 3 : 5
  const xTicks = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => d === 1 || d % xStep === 0 || d === daysInMonth)

  function handleChartMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!chartRef.current) return
    const rect = chartRef.current.getBoundingClientRect()
    const svgX  = (e.clientX - rect.left) * (CW / rect.width) - CP.left
    const day   = Math.round((svgX / ciW) * (daysInMonth - 1)) + 1
    setHoverDay(Math.max(1, Math.min(daysInMonth, day)))
  }

  const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div className="flex flex-col md:flex-row md:min-h-[460px]">

      {/* ── Left panel: Calendar ─────────────────────────────── */}
      <div className="md:w-[380px] md:shrink-0 px-4 pt-4 pb-4 md:border-r border-slate-100 dark:border-white/[0.05]">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-zinc-100">Calendario</p>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors cursor-pointer">
              <IconChevron dir="left" />
            </button>
            <span className="text-[13px] font-semibold text-slate-600 dark:text-zinc-200 min-w-[110px] text-center">{monthLabel}</span>
            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors cursor-pointer">
              <IconChevron dir="right" />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="bg-white dark:bg-[#0e1729] border border-slate-200 dark:border-white/[0.07] rounded-2xl px-4 py-3 mb-3 grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/[0.05]">
          {[
            { label: 'Trades',   value: String(N),  color: 'text-slate-900 dark:text-white' },
            { label: 'Winrate',  value: wr !== null ? `${wr.toFixed(1)}%` : '—', color: wr !== null && wr >= 50 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
            { label: sessionType === 'backtesting' ? 'Rentabilidad' : 'PnL', value: N > 0 ? fmtNet(netMonth) : '—', color: netMonth >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center px-2">
              <p className="text-[9px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-[0.07em] mb-0.5">{label}</p>
              <p className={`text-[14px] font-semibold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[9px] font-medium text-slate-300 dark:text-zinc-700 uppercase tracking-[0.06em] py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const k         = getKey(day)
            const dayTrades = byDay[k] ?? []
            const net       = dayTrades.reduce((acc, t) => acc + tradeValue(t, sessionType), 0)
            const isToday   = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
            const hasTrades = dayTrades.length > 0

            let cellStyle   = 'bg-slate-100/50 dark:bg-white/[0.03] border-transparent'
            let dayNumColor = 'text-slate-400 dark:text-zinc-500'
            let netColor    = ''
            let candleColor = ''

            if (hasTrades) {
              if (net > 0) {
                cellStyle   = 'bg-emerald-500/10 dark:bg-emerald-500/[0.14] border-emerald-500/20 dark:border-emerald-500/20'
                dayNumColor = 'text-emerald-700 dark:text-emerald-300'
                netColor    = 'text-emerald-600 dark:text-emerald-400'
                candleColor = 'text-emerald-500/60 dark:text-emerald-500/50'
              } else if (net < 0) {
                cellStyle   = 'bg-rose-500/10 dark:bg-rose-500/[0.14] border-rose-500/20 dark:border-rose-500/20'
                dayNumColor = 'text-rose-700 dark:text-rose-300'
                netColor    = 'text-rose-600 dark:text-rose-400'
                candleColor = 'text-rose-500/60 dark:text-rose-500/50'
              } else {
                cellStyle   = 'bg-zinc-200/60 dark:bg-zinc-700/30 border-zinc-300/40 dark:border-zinc-600/20'
                dayNumColor = 'text-zinc-500 dark:text-zinc-400'
                netColor    = 'text-zinc-500 dark:text-zinc-400'
                candleColor = 'text-zinc-400/60 dark:text-zinc-500/50'
              }
            }

            return (
              <button key={i}
                onClick={() => hasTrades && setDayKey(k)}
                disabled={!hasTrades}
                className={`flex flex-col min-h-[62px] rounded-xl border p-1.5 text-left w-full transition-all ${cellStyle} ${
                  hasTrades ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default'
                } ${isToday && !hasTrades ? 'ring-1 ring-offset-1 dark:ring-offset-[#080d1a] ring-offset-slate-50 ring-amber-400/60' : ''}`}>
                <span className={`text-[11px] font-bold leading-none ${isToday ? 'text-amber-500' : dayNumColor}`}>
                  {day}
                </span>
                {hasTrades && (
                  <div className="mt-auto w-full">
                    <p className={`text-[10px] font-bold font-mono leading-tight ${netColor}`}>{fmtDayVal(net)}</p>
                    <div className={`flex items-center gap-0.5 mt-1 ${candleColor}`}>
                      {/* candlestick icon */}
                      <svg width="7" height="10" viewBox="0 0 7 10" fill="none">
                        <line x1="3.5" y1="0" x2="3.5" y2="2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                        <rect x="0.5" y="2" width="6" height="5" rx="0.5" fill="currentColor"/>
                        <line x1="3.5" y1="7" x2="3.5" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                      <span className={`text-[8.5px] font-bold leading-none ${netColor}`}>{dayTrades.length}</span>
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.05]">
          {[
            { bg: 'bg-emerald-500/20 border border-emerald-500/30', dot: 'bg-emerald-500', label: 'Positivo' },
            { bg: 'bg-zinc-400/20 dark:bg-zinc-600/20 border border-zinc-400/30', dot: 'bg-zinc-400 dark:bg-zinc-500', label: 'Neutro' },
            { bg: 'bg-rose-500/20 border border-rose-500/30', dot: 'bg-rose-500', label: 'Negativo' },
          ].map(({ bg, dot, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-md ${bg} flex items-center justify-center`}>
                <div className={`w-1.5 h-1.5 rounded-sm ${dot}`} />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: Monthly chart ───────────────────────── */}
      <div className="flex-1 px-4 md:px-5 pt-4 pb-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-zinc-100">Progreso del mes</p>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">{monthLabel}</p>
        </div>

        {N === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] text-slate-300 dark:text-zinc-700">Sin trades este mes</p>
          </div>
        ) : (
          <>
            {/* SVG Chart */}
            <div className="flex-1 relative select-none min-h-[180px]">
              <svg ref={chartRef} viewBox={`0 0 ${CW} ${CH}`} className="w-full h-full"
                onMouseMove={hasChart ? handleChartMouseMove : undefined}
                onMouseLeave={() => setHoverDay(null)}>

                <defs>
                  <linearGradient id="cal-area-g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Grid lines + Y labels */}
                {yTicks.map((v, i) => (
                  <g key={i}>
                    <line x1={CP.left} y1={cys(v).toFixed(1)} x2={CW - CP.right} y2={cys(v).toFixed(1)}
                      stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" strokeDasharray="3 3"
                      className="text-slate-900 dark:text-white" />
                    <text x={CP.left - 5} y={parseFloat(cys(v).toFixed(1)) + 3.5}
                      textAnchor="end" fontSize="7" fontFamily="monospace"
                      className="fill-slate-500 dark:fill-zinc-500">
                      {fmtNet(v, 1)}
                    </text>
                  </g>
                ))}

                {/* Zero line */}
                {cMin < 0 && cMax >= 0 && (
                  <line x1={CP.left} y1={cys(0).toFixed(1)} x2={CW - CP.right} y2={cys(0).toFixed(1)}
                    stroke="#94a3b8" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="5 3" />
                )}

                {/* Area + line */}
                {hasChart && <path d={areaD} fill="url(#cal-area-g)" />}
                {hasChart && (
                  <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* X axis labels */}
                {xTicks.map(d => (
                  <text key={d} x={cxs(d).toFixed(1)} y={CH - 7} textAnchor="middle" fontSize="7"
                    fontFamily="monospace" className="fill-slate-500 dark:fill-zinc-500">
                    {d}
                  </text>
                ))}

                {/* Hover */}
                {hoverDay !== null && hasChart && (() => {
                  const pt = chartPoints[hoverDay - 1]
                  if (!pt) return null
                  const hx = cxs(pt.day)
                  const hy = cys(pt.cum)
                  return (
                    <g>
                      <line x1={hx.toFixed(1)} y1={CP.top - 4} x2={hx.toFixed(1)} y2={CH - CP.bottom + 2}
                        stroke="#3b82f6" strokeOpacity="0.4" strokeWidth="1" />
                      <circle cx={hx.toFixed(1)} cy={hy.toFixed(1)} r="4.5"
                        fill="white" stroke="#3b82f6" strokeWidth="2.5" className="dark:fill-[#080d1a]" />
                    </g>
                  )
                })()}

                <rect x={CP.left} y={CP.top} width={ciW} height={ciH} fill="transparent" />
              </svg>

              {/* Tooltip */}
              {hoverDay !== null && hasChart && (() => {
                const pt  = chartPoints[hoverDay - 1]
                if (!pt) return null
                const frac = (hoverDay - 1) / Math.max(daysInMonth - 1, 1)
                const dayT = byDay[getKey(hoverDay)] ?? []
                return (
                  <div className="absolute top-2 pointer-events-none z-10"
                    style={{ left: `${frac * 100}%`, transform: frac > 0.6 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}>
                    <div className="bg-white dark:bg-[#0e1729] border border-slate-200 dark:border-white/[0.1] rounded-xl px-3 py-2 shadow-lg min-w-[100px]">
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mb-1">Día {hoverDay}</p>
                      <p className={`text-[13px] font-bold font-mono ${pt.cum >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtNet(pt.cum)}</p>
                      {dayT.length > 0 && <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">{dayT.length} trade{dayT.length !== 1 ? 's' : ''}</p>}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Bottom stats: Inicio / Máxima / Final */}
            <div className="grid grid-cols-3 mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.05]">
              {[
                { label: 'Inicio',  value: fmtNet(initVal), color: 'text-slate-500 dark:text-zinc-400' },
                { label: 'Máxima',  value: fmtNet(peakVal), color: peakVal >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
                { label: 'Final',   value: fmtNet(finalVal), color: finalVal >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
              ].map(({ label, value, color }, idx) => (
                <div key={label} className={idx === 1 ? 'text-center' : idx === 2 ? 'text-right' : ''}>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 mb-0.5">{label}</p>
                  <p className={`text-[16px] font-bold tabular-nums ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {dayKey && (
        <DayDetailSheet
          dateKey={dayKey}
          trades={byDay[dayKey] ?? []}
          sessionType={sessionType}
          onClose={() => setDayKey(null)}
        />
      )}
    </div>
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
  const [showCsvMenu, setShowCsvMenu] = useState(false)
  const csvMenuRef = useRef<HTMLDivElement>(null)
  const [view, setView]             = useState<TradeView>('table')
  const [filter, setFilter]         = useState<FilterState>(EMPTY_FILTER)
  const [showFilters, setShowFilters]     = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [statsOpen, setStatsOpen]         = useState(false)
  const [sweetSpotOpen, setSweetSpotOpen] = useState(false)
  const [search, setSearch]               = useState('')
  const [sortCol, setSortCol]             = useState<SortCol>('date')
  const [sortDir, setSortDir]             = useState<SortDir>('desc')

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

  useEffect(() => {
    if (!showCsvMenu) return
    const h = (e: MouseEvent) => { if (!csvMenuRef.current?.contains(e.target as Node)) setShowCsvMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showCsvMenu])

  function exportCSV() {
    if (!data) return
    const ts = data.trades
    const headers = ['fecha','instrumento','direccion','resultado','rr_objetivo','rr_maximo','rr_salida','notas','link_analisis']
    const journalExtra = session.type === 'journal' ? ['riesgo_%','pnl_usd','capital_inicio','capital_fin'] : []
    const varKeys = data.variables.map(v => v.key)
    const allHeaders = [...headers, ...journalExtra, ...varKeys]
    const rows = ts.map(t => {
      const base = [
        t.date_entry.slice(0, 10),
        t.instrument ?? '',
        t.direction ?? '',
        t.result ?? '',
        t.rr_target ?? '',
        t.rr_max ?? '',
        t.rr_exit ?? '',
        `"${(t.notes ?? '').replace(/"/g, '""')}"`,
        (t.custom_fields?.analysis_link as string) ?? '',
      ]
      const journal = session.type === 'journal' ? [t.risk_percent ?? '', t.pnl_usd ?? '', t.capital_start ?? '', t.capital_end ?? ''] : []
      const vars = varKeys.map(k => {
        const v = t.custom_fields?.[k]
        return Array.isArray(v) ? `"${v.join(', ')}"` : (v ?? '')
      })
      return [...base, ...journal, ...vars].join(',')
    })
    const csv   = [allHeaders.join(','), ...rows].join('\n')
    const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url   = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href = url
    a.download = `${session.name.replace(/\s+/g, '_')}_trades.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowCsvMenu(false)
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let ts = [...data.trades]
    const q = search.trim().toLowerCase()
    const sessionType = data.session.type

    if (filter.dateFrom) ts = ts.filter(t => t.date_entry.slice(0, 10) >= filter.dateFrom)
    if (filter.dateTo)   ts = ts.filter(t => t.date_entry.slice(0, 10) <= filter.dateTo)
    if (filter.results.length)    ts = ts.filter(t => t.result    && filter.results.includes(t.result))
    if (filter.directions.length) ts = ts.filter(t => t.direction && filter.directions.includes(t.direction))
    if (filter.instruments.length) ts = ts.filter(t => {
      const v = t.instrument ?? (t.custom_fields?.instrument as string | undefined)
      return v ? filter.instruments.includes(v) : false
    })
    if (filter.vars) {
      for (const [key, vals] of Object.entries(filter.vars)) {
        if (vals.length === 0) continue
        ts = ts.filter(t => {
          const v = (t.custom_fields as Record<string, unknown>)[key]
          if (Array.isArray(v)) return (v as string[]).some(x => vals.includes(x))
          return v != null && vals.includes(String(v))
        })
      }
    }
    if (q) ts = ts.filter(t => t.notes?.toLowerCase().includes(q) || t.instrument?.toLowerCase().includes(q))

    ts.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'date':       cmp = a.date_entry.localeCompare(b.date_entry); break
        case 'result':     cmp = (a.result ?? '').localeCompare(b.result ?? ''); break
        case 'direction':  cmp = (a.direction ?? '').localeCompare(b.direction ?? ''); break
        case 'instrument': cmp = (a.instrument ?? '').localeCompare(b.instrument ?? ''); break
        case 'risk':       cmp = (a.risk_percent ?? 0) - (b.risk_percent ?? 0); break
        case 'rr':
          cmp = sessionType === 'journal'
            ? (a.pnl_usd ?? 0) - (b.pnl_usd ?? 0)
            : (a.rr_exit ?? 0) - (b.rr_exit ?? 0)
          break
        default:
          cmp = String(a.custom_fields[sortCol] ?? '').localeCompare(String(b.custom_fields[sortCol] ?? ''))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return ts
  }, [data, filter, search, sortCol, sortDir])

  const instrumentOptions = useMemo(() => {
    if (!data) return []
    const { variables, trades } = data
    const fromVariable = variables.find(v => v.key === 'instrument')?.options ?? []
    const fromTrades = trades
      .map(t => (t.instrument ?? (t.custom_fields as Record<string, unknown>)?.instrument) as string | undefined)
      .filter((v): v is string => !!v)
    return [...new Set([...fromVariable, ...fromTrades])]
  }, [data])

  const dashTrades = useMemo(() => {
    if (!data) return []
    let ts = data.trades
    if (filter.dateFrom) ts = ts.filter(t => t.date_entry.slice(0, 10) >= filter.dateFrom)
    if (filter.dateTo)   ts = ts.filter(t => t.date_entry.slice(0, 10) <= filter.dateTo)
    return ts
  }, [data, filter.dateFrom, filter.dateTo])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-zinc-700 accent-spin rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-slate-500 dark:text-zinc-400 text-[14px]">Error al cargar la sesión</p>
      </div>
    )
  }

  const { session, variables, trades, activeConnections: _ } = data
  const nFilters = activeFilterCount(filter)

  return (
    <div className="flex flex-col pt-5 pb-12 bg-slate-50 dark:bg-[#080d1a] min-h-screen">

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <BasicMetrics
        trades={dashTrades}
        sessionType={session.type}
        capitalInitial={session.capital_initial}
      />

      {/* ── Advanced Stats (accordion) ─────────────────────── */}
      {dashTrades.length >= 5 && (
        <div className="mx-4 mb-3 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-[#0e1729] dark:border-white/[0.07] dark:shadow-none overflow-hidden">
          <button
            onClick={() => setStatsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-white/[0.03]">
            <div className="flex items-center gap-2.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-500 dark:text-zinc-400 shrink-0">
                <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
              </svg>
              <span className="text-[12px] font-semibold text-slate-700 dark:text-zinc-100">Análisis estadístico</span>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className="text-slate-300 dark:text-zinc-500 transition-transform duration-200 shrink-0"
              style={{ transform: statsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {statsOpen && (
            <div className="border-t border-slate-100 dark:border-white/[0.05] bg-slate-50/60 dark:bg-[#060e1a] py-2">
              <ProfitabilityVerdict trades={dashTrades} sessionType={session.type} />
              <ExpectancyDetail trades={dashTrades} sessionType={session.type} />
              <ZScoreCard trades={dashTrades} />
              <PValueCard trades={dashTrades} />
              <StdDevCard trades={dashTrades} />
              <ConsistencySection trades={dashTrades} sessionType={session.type} />
              <ExpPerMonthCard trades={dashTrades} sessionType={session.type} />
              {session.type === 'backtesting' && dashTrades.length >= 3 && (
                <div className="mx-4 mt-1 pt-3 border-t border-slate-200/70 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-emerald-500 dark:text-emerald-400 shrink-0">
                      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>
                    </svg>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.13em]">Sweet Spot</span>
                  </div>
                  <SweetSpotChart trades={dashTrades} />
                  <SweetSpotTable trades={dashTrades} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Equity Chart ──────────────────────────────────────── */}
      <EquityCard
        trades={dashTrades}
        sessionType={session.type}
        capitalInitial={session.capital_initial}
      />

      {/* ── Toolbar: fecha · filtro · vista · nuevo · csv ─────── */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">

        {/* Date picker */}
        <button onClick={() => setShowDatePicker(true)}
          className={`shrink-0 flex items-center gap-1.5 h-10 px-3 rounded-xl border transition-all duration-150 cursor-pointer ${
            filter.dateFrom || filter.dateTo
              ? 'accent-tint accent-border-lo accent-txt'
              : 'bg-white dark:bg-white/[0.05] border-slate-200/70 dark:border-white/[0.08] text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
          }`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 opacity-60">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span className="text-[11px] font-medium whitespace-nowrap">
            {filter.dateFrom || filter.dateTo
              ? filter.dateFrom && filter.dateTo
                ? `${fmtDateShort(filter.dateFrom)} → ${fmtDateShort(filter.dateTo)}`
                : filter.dateFrom ? `Desde ${fmtDateShort(filter.dateFrom)}` : `Hasta ${fmtDateShort(filter.dateTo)}`
              : 'Fechas'}
          </span>
          {(filter.dateFrom || filter.dateTo)
            ? <button onClick={e => { e.stopPropagation(); setFilter(f => ({ ...f, dateFrom: '', dateTo: '' })) }}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 opacity-40">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
          }
        </button>

        {/* Filter */}
        <button onClick={() => setShowFilters(true)}
          className={`relative shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${
            nFilters > 0
              ? 'accent-tint accent-border-lo accent-txt'
              : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
          }`}>
          <IconFilter />
          {nFilters > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full accent-btn text-[9px] font-bold flex items-center justify-center">
              {nFilters}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div className="flex rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden shrink-0">
          <button onClick={() => setView('table')}
            className={`flex items-center justify-center w-10 h-10 transition-colors cursor-pointer ${
              view === 'table' ? 'accent-tab' : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}>
            <IconList />
          </button>
          <div className="w-px bg-slate-200 dark:bg-white/[0.08]" />
          <button onClick={() => setView('calendar')}
            className={`flex items-center justify-center w-10 h-10 transition-colors cursor-pointer ${
              view === 'calendar' ? 'accent-tab' : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
            }`}>
            <IconCalendarView />
          </button>
        </div>

        {/* New trade */}
        <button
          onClick={() => { setEditTrade(null); setShowForm(true) }}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl accent-btn font-semibold text-[13px] cursor-pointer transition-colors active:opacity-80">
          <IconPlus size={15} />
          Nuevo trade
        </button>

        {/* CSV */}
        <div className="relative shrink-0" ref={csvMenuRef}>
          <button onClick={() => setShowCsvMenu(o => !o)}
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
            </svg>
          </button>
          {showCsvMenu && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-44 bg-white dark:bg-[#0e1729] border border-slate-200 dark:border-white/[0.09] rounded-2xl shadow-xl overflow-hidden">
              <button onClick={() => { setShowImport(true); setShowCsvMenu(false) }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors cursor-pointer">
                <IconUpload size={14} />
                Importar CSV
              </button>
              <div className="h-px bg-slate-100 dark:bg-white/[0.05] mx-3" />
              <button onClick={exportCSV}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exportar CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Active filter summary */}
      {nFilters > 0 && (
        <div className="px-4 pb-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            {filtered.length} de {trades.length} trade{trades.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => setFilter(EMPTY_FILTER)}
            className="text-[11px] accent-txt font-semibold cursor-pointer hover:opacity-80 transition-opacity">
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── Trade list ────────────────────────────────────────── */}
      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">
            Registra tu primer trade para comenzar.
          </p>
        </div>
      ) : view === 'calendar' ? (
        <CalendarView
          trades={filtered}
          sessionType={session.type}
        />
      ) : (
        <TableView
          trades={filtered}
          sessionType={session.type}
          variables={variables}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          onEdit={t => { setEditTrade(t); setShowForm(true) }}
          onDelete={t => setDelTrade(t)}
        />
      )}

      {/* Sheets & Modals */}
      {showDatePicker && (
        <CalendarDatePicker
          from={filter.dateFrom}
          to={filter.dateTo}
          onChange={(f, t) => setFilter(prev => ({ ...prev, dateFrom: f, dateTo: t }))}
          onClose={() => setShowDatePicker(false)}
          allTrades={trades}
        />
      )}
      {showFilters && (
        <FilterSheet
          filter={filter}
          onApply={setFilter}
          onClose={() => setShowFilters(false)}
          instrumentOptions={instrumentOptions}
          variables={variables}
        />
      )}
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
