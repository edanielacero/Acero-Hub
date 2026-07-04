'use client'

import { useState, useEffect, useMemo } from 'react'
import { use } from 'react'
import {
  calcExpectancy, calcProfitFactor, calcZScore, calcPValue,
  calcStdDevRR, calcMonthlyConsistency, normalCDF,
} from '@/lib/trading/metrics'

type SessionType = 'backtesting' | 'journal'

interface Session {
  id: string; type: SessionType; name: string
  instrument: string | null; capital_initial: number | null
}
interface Trade {
  id: string; date_entry: string; result: 'tp' | 'sl' | 'be' | null
  rr_exit: number | null; pnl_usd: number | null
  capital_start: number | null; capital_end: number | null
  risk_percent: number | null; instrument: string | null
}
interface PageData { session: Session; trades: Trade[] }

function api(path: string) {
  return fetch(`/api/trading-journal${path}`, { headers: { 'Content-Type': 'application/json' } })
}

// Formats an R/RR number removing unnecessary trailing zeros (e.g. 1.00→"1", 1.50→"1.5")
function fmtR(n: number, dec = 2): string {
  return parseFloat(n.toFixed(dec)).toString()
}

// ─── Monthly breakdown ─────────────────────────────────────────────────────────

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
      const tp   = mTrades.filter(t => t.result === 'tp').length
      const sl   = mTrades.filter(t => t.result === 'sl').length
      const be   = mTrades.filter(t => t.result === 'be').length
      const netRR = mTrades.reduce((s, t) => {
        if (t.result === 'tp' && t.rr_exit) return s + t.rr_exit
        if (t.result === 'sl' && t.rr_exit) return s - t.rr_exit
        return s
      }, 0)
      const netUSD = mTrades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
      const [year, mon] = key.split('-')
      const label = new Date(`${key}-15`).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
        .replace(' ', ' \'')
      return { key, label: `${label}`, total: mTrades.length, tp, sl, be, netRR, netUSD }
    })
}

// ─── Section wrappers ──────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800/60 rounded-2xl shadow-sm dark:shadow-none ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-400 mb-3">{children}</h2>
}

// ─── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ total }: { total: number }) {
  const MAX = 300
  const pct = Math.min((total / MAX) * 100, 100)
  const MILESTONES = [30, 100, 200, 300]
  let color = 'rgb(var(--a5) / 0.35)'
  let msg   = 'Necesitas al menos 30 trades para métricas básicas'
  if (total >= 300)      { color = 'rgb(var(--a5))';      msg = 'Máxima confiabilidad estadística' }
  else if (total >= 200) { color = 'rgb(var(--a5))';      msg = 'Z-Score y consistencia mensual confiables' }
  else if (total >= 100) { color = 'rgb(var(--a5) / 0.75)'; msg = 'Expectativa y Profit Factor confiables' }
  else if (total >= 30)  { color = 'rgb(var(--a5) / 0.55)'; msg = 'Winrate básico estadísticamente confiable' }
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Confiabilidad estadística</span>
        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">{total} / {MAX}</span>
      </div>
      <div className="relative h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        {MILESTONES.map(m => (
          <div key={m} className="absolute top-0 h-full w-px bg-white dark:bg-zinc-950 opacity-60"
            style={{ left: `${(m / MAX) * 100}%` }} />
        ))}
      </div>
      <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 mt-1.5">{msg}</p>
    </Card>
  )
}

// ─── Expectativa detallada ─────────────────────────────────────────────────────

function ExpectancyDetail({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const winners = trades.filter(t => t.result === 'tp')
  const losers  = trades.filter(t => t.result === 'sl')
  const N = winners.length + losers.length
  if (N === 0) return null

  const wr      = winners.length / N
  const avgWin  = winners.length > 0 ? winners.reduce((s, t) => s + (t.rr_exit ?? 0), 0) / winners.length : 0
  const avgLoss = losers.length  > 0 ? losers.reduce((s, t)  => s + (t.rr_exit ?? 0), 0) / losers.length  : 0
  const expectancy = (wr * avgWin) - ((1 - wr) * avgLoss)
  const pf = calcProfitFactor(trades, sessionType)

  const pos = expectancy >= 0

  return (
    <Card>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Expectativa matemática</span>
            <p className={`text-[28px] font-bold font-mono leading-none mt-0.5 ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {expectancy >= 0 ? '+' : ''}{fmtR(expectancy, 3)}R
            </p>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Profit Factor</span>
            <p className={`text-[22px] font-bold font-mono leading-none mt-0.5 ${pf !== null && pf > 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {pf === null ? '—' : pf === Infinity ? '∞' : fmtR(pf)}
            </p>
          </div>
        </div>

        {/* Formula breakdown */}
        <div className="mt-3 p-3 bg-slate-50 dark:bg-zinc-900/80 rounded-xl">
          <p className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2">Desglose</p>
          <div className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap">
            <span className="text-slate-500 dark:text-zinc-400">(</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{(wr * 100).toFixed(1)}%</span>
            <span className="text-slate-400">×</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{fmtR(avgWin)}R</span>
            <span className="text-slate-500 dark:text-zinc-400">)</span>
            <span className="text-slate-400">−</span>
            <span className="text-slate-500 dark:text-zinc-400">(</span>
            <span className="text-rose-500 dark:text-rose-400 font-bold">{((1 - wr) * 100).toFixed(1)}%</span>
            <span className="text-slate-400">×</span>
            <span className="text-rose-500 dark:text-rose-400 font-bold">{fmtR(avgLoss)}R</span>
            <span className="text-slate-500 dark:text-zinc-400">)</span>
            <span className="text-slate-400">=</span>
            <span className={`font-bold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {expectancy >= 0 ? '+' : ''}{fmtR(expectancy, 3)}R
            </span>
          </div>
        </div>

        {/* Win/Loss stats row */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { label: 'Winrate',       value: `${(wr * 100).toFixed(1)}%`,   color: 'text-slate-700 dark:text-zinc-300' },
            { label: 'RR prom. gan.', value: `+${fmtR(avgWin)}R`,           color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'RR prom. perd.', value: `-${fmtR(avgLoss)}R`,         color: 'text-rose-500 dark:text-rose-400' },
          ].map(s => (
            <div key={s.label} className="flex flex-col gap-0.5 p-2 bg-slate-50 dark:bg-zinc-900/80 rounded-xl">
              <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.08em]">{s.label}</span>
              <span className={`text-[13px] font-bold font-mono ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── Z-Score visual ────────────────────────────────────────────────────────────

function ZScoreCard({ trades }: { trades: Trade[] }) {
  const sorted  = [...trades].sort((a, b) => a.date_entry.localeCompare(b.date_entry))
  const result  = calcZScore(sorted)
  const N       = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const reliable = N >= 30

  const z = result?.z ?? null

  const AXIS_MIN = -3, AXIS_MAX = 3
  const toFrac = (v: number) => Math.max(0, Math.min(1, (v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)))
  const thresh1 = toFrac(-1.96), thresh2 = toFrac(1.96)
  const markerFrac = z != null ? toFrac(z) : null

  let zone: 'alternante' | 'normal' | 'rachas' = 'normal'
  if (z !== null && z < -1.96) zone = 'alternante'
  if (z !== null && z >  1.96) zone = 'rachas'

  const zoneLabel = { alternante: 'Alternante', normal: 'Aleatorio (normal)', rachas: 'Rachas' }[zone]
  const zoneColor = { alternante: 'text-sky-600 dark:text-sky-400', normal: 'text-emerald-600 dark:text-emerald-400', rachas: 'text-amber-600 dark:text-amber-400' }[zone]
  const zoneBg    = { alternante: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/50', normal: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50', rachas: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50' }[zone]

  return (
    <Card className="px-4 pt-4 pb-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Z-Score</span>
          <p className={`text-[26px] font-bold font-mono leading-none mt-0.5 ${z !== null ? zoneColor : 'text-slate-300 dark:text-zinc-700'}`}>
            {z !== null ? z.toFixed(2) : '—'}
          </p>
        </div>
        {z !== null && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold ${zoneBg} ${zoneColor}`}>
            {zoneLabel}
          </div>
        )}
      </div>

      {/* Visual axis */}
      <div className="relative h-5 mt-2 mb-3">
        {/* Background zones */}
        <div className="absolute inset-y-1 left-0 rounded-l-full bg-sky-100 dark:bg-sky-950/50"
          style={{ width: `${thresh1 * 100}%` }} />
        <div className="absolute inset-y-1 bg-emerald-100 dark:bg-emerald-950/50"
          style={{ left: `${thresh1 * 100}%`, width: `${(thresh2 - thresh1) * 100}%` }} />
        <div className="absolute inset-y-1 rounded-r-full bg-amber-100 dark:bg-amber-950/50"
          style={{ left: `${thresh2 * 100}%`, right: 0 }} />
        {/* Threshold lines */}
        <div className="absolute top-0 bottom-0 w-px bg-slate-400 dark:bg-zinc-500 opacity-40"
          style={{ left: `${thresh1 * 100}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-slate-400 dark:bg-zinc-500 opacity-40"
          style={{ left: `${thresh2 * 100}%` }} />
        {/* Marker */}
        {markerFrac !== null && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-slate-800 dark:bg-white rounded-full"
            style={{ left: `${markerFrac * 100}%`, transform: 'translateX(-50%)' }} />
        )}
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[8.5px] font-mono text-slate-500 dark:text-zinc-400 mb-3">
        <span className="text-sky-500 dark:text-sky-400">Alternante</span>
        <span className="text-emerald-500 dark:text-emerald-400">Normal</span>
        <span className="text-amber-500 dark:text-amber-400">Rachas</span>
      </div>

      <p className="text-[9px] text-slate-400 dark:text-zinc-500 mb-2 uppercase tracking-[0.1em] font-bold">Independencia entre trades · no mide rentabilidad</p>
      <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {!reliable
          ? `Necesitas ≥30 trades para el test de rachas (tienes ${N}). Este test mide si tus trades son independientes entre sí, no si la estrategia es rentable.`
          : zone === 'normal'
          ? 'Tus trades son independientes entre sí — el resultado de uno no condiciona el siguiente. Esto es estadísticamente deseable.'
          : zone === 'rachas'
          ? 'Tus trades tienden a agruparse en rachas: varios ganadores seguidos, luego varios perdedores. Puede indicar que las condiciones de mercado afectan tu ejecución.'
          : 'Tus trades tienden a alternar entre ganadores y perdedores más de lo esperado por el azar.'
        }
      </p>
    </Card>
  )
}

// ─── P-Value card ──────────────────────────────────────────────────────────────

function PValueCard({ trades }: { trades: Trade[] }) {
  const result  = calcPValue(trades)
  const N       = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const hasEdge = result !== null && result.pValue < 0.05
  const pStr    = result === null ? '—'
    : result.pValue < 0.001 ? '<0.01%'
    : `${(result.pValue * 100).toFixed(2)}%`
  const zbStr   = result === null ? '—' : result.zb.toFixed(2)
  const p0Pct   = result ? `${(result.p0 * 100).toFixed(1)}%` : '—'

  // bar: 0 → p=1 (no evidence), full → p=0 (strong evidence). Scale: 0–0.5
  const barFrac = result ? Math.max(0, Math.min(1, 1 - result.pValue / 0.5)) : 0

  return (
    <Card className="px-4 pt-4 pb-4">
      {/* Header: Z estadístico (primary) + badge */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Z estadístico (edge)</span>
          <p className={`text-[32px] font-bold font-mono leading-none mt-0.5 ${
            result === null ? 'text-slate-300 dark:text-zinc-700'
            : hasEdge ? 'text-emerald-600 dark:text-emerald-400'
            : result.zb > 0 ? 'text-amber-500 dark:text-amber-400'
            : 'text-rose-500 dark:text-rose-400'
          }`}>
            {zbStr}
          </p>
          <p className="text-[9px] text-slate-400 dark:text-zinc-500 mt-1 font-mono">
            umbral ≥ 1.65 (90%) · ≥ 1.96 (95%)
          </p>
        </div>
        {result !== null && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold ${
            hasEdge
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400'
              : result.zb > 0
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-600 dark:text-amber-400'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/50 text-rose-500 dark:text-rose-400'
          }`}>
            {hasEdge ? 'Edge confirmado' : result.zb > 0 ? 'Edge débil' : 'Sin edge'}
          </div>
        )}
      </div>

      {/* Secondary metrics row */}
      {result !== null && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="p-2.5 bg-slate-50 dark:bg-zinc-900/80 rounded-xl">
            <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">P-Value</span>
            <p className={`text-[15px] font-bold font-mono mt-0.5 ${hasEdge ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-zinc-300'}`}>
              {pStr}
            </p>
          </div>
          <div className="p-2.5 bg-slate-50 dark:bg-zinc-900/80 rounded-xl">
            <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">Break-even WR</span>
            <p className="text-[15px] font-bold font-mono mt-0.5 text-slate-600 dark:text-zinc-300">{p0Pct}</p>
          </div>
        </div>
      )}

      {/* Visual bar: strength of evidence */}
      {result !== null && (
        <div className="mb-4">
          <div className="flex justify-between text-[8.5px] font-mono text-slate-400 dark:text-zinc-500 mb-1">
            <span>Sin evidencia</span>
            <span>90%</span>
            <span>95%+</span>
          </div>
          <div className="relative h-2.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${hasEdge ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-amber-300 dark:bg-amber-600'}`}
              style={{ width: `${barFrac * 100}%` }} />
            <div className="absolute top-0 bottom-0 w-px bg-slate-400 dark:bg-zinc-500 opacity-60" style={{ left: '80%' }} />
            <div className="absolute top-0 bottom-0 w-px bg-slate-400 dark:bg-zinc-500 opacity-60" style={{ left: '90%' }} />
          </div>
        </div>
      )}

      {/* Interpretation */}
      <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {N < 10
          ? `Necesitas ≥10 trades para este análisis (tienes ${N}).`
          : result === null
          ? 'No hay suficientes trades ganadores y perdedores para calcular.'
          : hasEdge
          ? `Z = ${zbStr} (p = ${pStr}). Tu winrate supera estadísticamente el break-even de ${p0Pct}. La probabilidad de que sea azar es menor al ${pStr}.`
          : result.zb > 0
          ? `Z = ${zbStr} (p = ${pStr}). Hay tendencia positiva pero aún no es estadísticamente significativa. Necesitas más trades para confirmar el edge.`
          : `Z = ${zbStr} (p = ${pStr}). Tu winrate actual no supera el break-even estadísticamente. Revisa la estrategia.`
        }
      </p>
    </Card>
  )
}

// ─── StdDev card ───────────────────────────────────────────────────────────────

function StdDevCard({ trades }: { trades: Trade[] }) {
  const stdDev = calcStdDevRR(trades)
  const expectancy = calcExpectancy(trades)
  const sharpe = (stdDev && stdDev > 0 && expectancy !== null) ? expectancy / stdDev : null

  return (
    <Card className="px-4 pt-4 pb-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Desv. estándar RR</span>
          <p className="text-[24px] font-bold font-mono leading-none mt-0.5 text-slate-700 dark:text-zinc-300">
            {stdDev === null ? '—' : `${fmtR(stdDev)}R`}
          </p>
          <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 mt-1">Variabilidad de resultados</p>
        </div>
        <div>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Ratio Sharpe</span>
          <p className={`text-[24px] font-bold font-mono leading-none mt-0.5 ${
            sharpe === null ? 'text-slate-300 dark:text-zinc-700'
            : sharpe >= 1 ? 'text-emerald-600 dark:text-emerald-400'
            : sharpe >= 0.5 ? 'text-amber-500 dark:text-amber-400'
            : 'text-rose-500 dark:text-rose-400'
          }`}>
            {sharpe === null ? '—' : fmtR(sharpe)}
          </p>
          <p className="text-[9.5px] text-slate-500 dark:text-zinc-400 mt-1">Expectativa / Desv.</p>
        </div>
      </div>
    </Card>
  )
}

// ─── Consistencia mensual ──────────────────────────────────────────────────────

function ConsistencySection({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const [showAll, setShowAll] = useState(false)
  const consistency = calcMonthlyConsistency(trades, sessionType)
  const monthly     = useMemo(() => buildMonthly(trades, sessionType), [trades, sessionType])

  if (monthly.length === 0) return null

  const posMonths = monthly.filter(m => (sessionType === 'backtesting' ? m.netRR : m.netUSD) > 0).length
  const negMonths = monthly.filter(m => (sessionType === 'backtesting' ? m.netRR : m.netUSD) < 0).length

  // CLT-based expected losing months
  const N = trades.filter(t => t.result === 'tp' || t.result === 'sl').length
  const wr = N > 0 ? trades.filter(t => t.result === 'tp').length / N : 0
  const winners = trades.filter(t => t.result === 'tp' && t.rr_exit != null)
  const losers  = trades.filter(t => t.result === 'sl' && t.rr_exit != null)
  const avgWinRR  = winners.length > 0 ? winners.reduce((s, t) => s + t.rr_exit!, 0) / winners.length : 1
  const avgLossRR = losers.length  > 0 ? losers.reduce((s, t)  => s + t.rr_exit!, 0) / losers.length  : 1
  const ePerTrade = wr * avgWinRR - (1 - wr) * avgLossRR
  const eX2 = wr * avgWinRR * avgWinRR + (1 - wr) * avgLossRR * avgLossRR
  const sigmaPerTrade = Math.sqrt(Math.max(0, eX2 - ePerTrade * ePerTrade))
  const nPerMonth  = monthly.length > 0 ? N / monthly.length : 0
  const muMonth    = nPerMonth * ePerTrade
  const sigmaMonth = Math.sqrt(nPerMonth) * sigmaPerTrade
  const pLosing    = sigmaMonth > 0 ? 1 - normalCDF(muMonth / sigmaMonth) : (ePerTrade < 0 ? 1 : 0)
  const expectedLosing = monthly.length * pLosing
  const beatExpected   = negMonths < expectedLosing

  const visible = showAll ? monthly : monthly.slice(-6)

  return (
    <div className="flex flex-col gap-3">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Consistencia', value: consistency ? `${Math.round(consistency.pct)}%` : '—', color: consistency && consistency.pct >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
          { label: 'Meses positivos', value: consistency ? `${consistency.positive}/${consistency.total}` : '—', color: 'text-slate-700 dark:text-zinc-300' },
          { label: 'Pérdidas vs esperadas', value: `${negMonths} / ${expectedLosing.toFixed(1)}`, color: beatExpected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
        ].map(s => (
          <div key={s.label} className="flex flex-col gap-1 p-3 bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800/60 rounded-2xl shadow-sm dark:shadow-none">
            <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">{s.label}</span>
            <span className={`text-[15px] font-bold font-mono ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Month-by-month table */}
      <Card>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800/60">
          <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Mes a mes</p>
        </div>
        <div className="divide-y divide-slate-50 dark:divide-zinc-800/40">
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
                  {net >= 0 ? '+' : ''}{sessionType === 'backtesting' ? `${fmtR(net)}R` : `$${net.toFixed(0)}`}
                </span>
              </div>
            )
          })}
        </div>
        {monthly.length > 6 && (
          <button onClick={() => setShowAll(v => !v)}
            className="w-full px-4 py-2.5 text-[11px] text-slate-500 dark:text-zinc-400 hover:text-slate-600 dark:hover:text-zinc-300 border-t border-slate-100 dark:border-zinc-800/60 transition-colors cursor-pointer">
            {showAll ? 'Ver menos' : `Ver todos (${monthly.length} meses)`}
          </button>
        )}
      </Card>
    </div>
  )
}

// ─── Expectativa por mes ───────────────────────────────────────────────────────

function ExpPerMonthCard({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
  const N           = trades.length
  const expectancy  = calcExpectancy(trades)
  const consistency = calcMonthlyConsistency(trades, sessionType)
  const epm         = (expectancy !== null && consistency !== null && consistency.total > 0)
    ? (N / consistency.total) * expectancy
    : null

  if (epm === null) return null

  const tradesPerMonth = consistency ? (N / consistency.total).toFixed(1) : '—'

  return (
    <Card className="px-4 pt-4 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Expectativa por mes</span>
          <p className={`text-[28px] font-bold font-mono leading-none mt-0.5 ${epm >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
            {epm >= 0 ? '+' : ''}{fmtR(epm)}R
          </p>
        </div>
        <div className="text-right">
          <span className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.12em]">Trades/mes prom.</span>
          <p className="text-[22px] font-bold font-mono leading-none mt-0.5 text-slate-700 dark:text-zinc-300">{tradesPerMonth}</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-2">
        Proyección basada en tu expectativa actual y frecuencia histórica.
      </p>
    </Card>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function StatsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)
  const [data, setData]       = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api(`/sessions/${sessionId}/trades`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setData(d)
      setLoading(false)
    })
  }, [sessionId])

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

  const { session, trades } = data
  const N = trades.length

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-10">

      {/* Confiabilidad */}
      <ConfidenceBar total={N} />

      {N === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" className="text-slate-300 dark:text-zinc-700">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">Sin trades aún — registra trades para ver estadísticas</p>
        </div>
      )}

      {N > 0 && (
        <>
          <SectionTitle>Expectativa y rentabilidad</SectionTitle>
          <ExpectancyDetail trades={trades} sessionType={session.type} />

          <SectionTitle>Calidad estadística</SectionTitle>
          <ZScoreCard trades={trades} />
          <PValueCard trades={trades} />
          <StdDevCard trades={trades} />

          <SectionTitle>Consistencia mensual</SectionTitle>
          <ConsistencySection trades={trades} sessionType={session.type} />

          <ExpPerMonthCard trades={trades} sessionType={session.type} />
        </>
      )}
    </div>
  )
}
