'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { use } from 'react'
import { calcSweetSpot } from '@/lib/trading/sweetspot'

type SessionType = 'backtesting' | 'journal'

interface Session {
  id: string; type: SessionType; name: string
  instrument: string | null; capital_initial: number | null
}
interface Trade {
  id: string; date_entry: string; result: 'tp' | 'sl' | 'be' | null
  rr_exit: number | null; rr_max: number | null; rr_target: number | null
}
interface PageData { session: Session; trades: Trade[] }

function api(path: string) {
  return fetch(`/api/trading-journal${path}`, { headers: { 'Content-Type': 'application/json' } })
}

// ─── Sweet Spot Chart ──────────────────────────────────────────────────────────

function SweetSpotChart({ trades, sessionType }: { trades: Trade[]; sessionType: SessionType }) {
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
    const idx  = Math.round((svgX / iW) * (points.length - 1))
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hovered  = hoverIdx != null ? points[hoverIdx] : null
  const tipXFrac = hoverIdx != null
    ? (PAD.left + (hoverIdx / Math.max(points.length - 1, 1)) * iW) / W
    : 0

  const realY = hasData ? ys(realTotalRR) : H / 2

  return (
    <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800/60 rounded-2xl shadow-sm dark:shadow-none overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-800 dark:text-white">RR simulado por nivel de salida</span>
        </div>
        {hasData && (
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500 inline-block rounded-full" />
              <span className="text-slate-500 dark:text-zinc-400">Sweet Spot</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-px border-t border-dashed border-slate-400 dark:border-zinc-500 inline-block" />
              <span className="text-slate-500 dark:text-zinc-400">Real</span>
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="relative select-none">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full"
          onMouseMove={hasData ? handleMouseMove : undefined}
          onMouseLeave={() => setHoverIdx(null)}>

          <defs>
            <linearGradient id="ss-area-g" x1="0" y1="0" x2="0" y2="1">
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
                textAnchor="end" fontSize="8.5" fontFamily="monospace"
                className="fill-slate-400 dark:fill-zinc-600">
                {v >= 0 ? '+' : ''}{v.toFixed(1)}R
              </text>
            </g>
          ))}

          {/* Zero line */}
          {dMin < 0 && dMax > 0 && (
            <line x1={PAD.left} y1={ys(0).toFixed(1)} x2={W - PAD.right} y2={ys(0).toFixed(1)}
              stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 3"
              className="text-slate-500 dark:text-zinc-500" />
          )}

          {/* Real RR reference line */}
          {hasData && (
            <line x1={PAD.left} y1={realY.toFixed(1)} x2={W - PAD.right} y2={realY.toFixed(1)}
              stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="5 4"
              className="text-slate-500 dark:text-zinc-400" />
          )}

          {/* Area + line */}
          {areaD && <path d={areaD} fill="url(#ss-area-g)" />}
          {pathD && (
            <path d={pathD} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ stroke: 'rgb(var(--a5))' }} />
          )}

          {/* Sweet spot vertical line */}
          {hasData && ssIdx >= 0 && (
            <line x1={xs(ssIdx).toFixed(1)} y1={PAD.top}
                  x2={xs(ssIdx).toFixed(1)} y2={H - PAD.bottom}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" strokeOpacity="0.8" />
          )}

          {/* Sweet spot point */}
          {hasData && ssIdx >= 0 && (
            <circle cx={xs(ssIdx).toFixed(1)} cy={ys(sweetSpotRR).toFixed(1)}
              r="6" fill="#f59e0b" stroke="white" strokeWidth="2.5"
              className="dark:stroke-zinc-950" />
          )}

          {/* Empty state */}
          {!hasData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="11"
              className="fill-slate-300 dark:fill-zinc-700">
              Sin datos de RR máximo
            </text>
          )}

          {/* X axis labels */}
          {xTicks.map(i => (
            <text key={i} x={xs(i).toFixed(1)} y={H - 7} textAnchor="middle" fontSize="8.5"
              className="fill-slate-400 dark:fill-zinc-600">
              {points[i].level.toFixed(2)}R
            </text>
          ))}

          {/* Hover: vertical line + dot */}
          {hovered && hoverIdx != null && hoverIdx !== ssIdx && (
            <g>
              <line x1={xs(hoverIdx).toFixed(1)} y1={PAD.top - 4}
                    x2={xs(hoverIdx).toFixed(1)} y2={H - PAD.bottom + 2}
                stroke="currentColor" strokeOpacity="0.25" strokeWidth="1"
                className="text-slate-600 dark:text-zinc-400" />
              <circle cx={xs(hoverIdx).toFixed(1)} cy={ys(hovered.totalRR).toFixed(1)}
                r="4" fill="white" stroke="rgb(var(--a5))" strokeWidth="2"
                className="dark:fill-zinc-950" />
            </g>
          )}

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
                Salida en {hovered.level.toFixed(2)}R
                {hoverIdx === ssIdx && <span className="ml-1.5 text-amber-500">★ Sweet Spot</span>}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {'Total RR: '}
                <span className={`font-bold ${hovered.totalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                  {hovered.totalRR >= 0 ? '+' : ''}{hovered.totalRR.toFixed(2)}R
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {'Winrate: '}
                <span className="font-bold text-slate-700 dark:text-zinc-300">{hovered.winrate.toFixed(1)}%</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {'PF: '}
                <span className="font-bold text-slate-700 dark:text-zinc-300">
                  {hovered.profitFactor === null ? '—' : hovered.profitFactor === Infinity ? '∞' : hovered.profitFactor.toFixed(2)}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {hasData && (
        <div className="grid grid-cols-3 border-t border-slate-100 dark:border-zinc-800/60 divide-x divide-slate-100 dark:divide-zinc-800/60">
          {([
            { label: 'Sweet Spot',  value: `${sweetSpotLevel.toFixed(2)}R`, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'RR simulado', value: `${sweetSpotRR >= 0 ? '+' : ''}${sweetSpotRR.toFixed(1)}R`, color: sweetSpotRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
            { label: 'RR real',     value: `${realTotalRR >= 0 ? '+' : ''}${realTotalRR.toFixed(1)}R`, color: realTotalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
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

// ─── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable({ trades }: { trades: Trade[] }) {
  const result  = useMemo(() => calcSweetSpot(trades), [trades])
  const { points, sweetSpotLevel, realTotalRR } = result

  if (points.length === 0) return null

  // Show top 10 by totalRR + always include real result for comparison
  const sorted  = [...points].sort((a, b) => b.totalRR - a.totalRR).slice(0, 12)

  return (
    <div className="bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800/60 rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800/60">
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
                        : <span className="text-[9px] text-slate-300 dark:text-zinc-700 font-mono shrink-0">{idx + 1}</span>
                      }
                      <span className={`font-bold font-mono ${isBest ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-zinc-300'}`}>
                        {row.level.toFixed(2)}R
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-right font-bold font-mono ${row.totalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {row.totalRR >= 0 ? '+' : ''}{row.totalRR.toFixed(2)}R
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-zinc-400">
                    {row.winrate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600 dark:text-zinc-400">
                    {row.profitFactor === null ? '—' : row.profitFactor === Infinity ? '∞' : row.profitFactor.toFixed(2)}
                  </td>
                </tr>
              )
            })}
            {/* Real row */}
            <tr className="bg-slate-50/60 dark:bg-zinc-900/40">
              <td className="px-4 py-2.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">Real (histórico)</span>
              </td>
              <td className={`px-3 py-2.5 text-right font-bold font-mono ${realTotalRR >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {realTotalRR >= 0 ? '+' : ''}{realTotalRR.toFixed(2)}R
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-500 dark:text-zinc-500">
                {result.realWinrate.toFixed(1)}%
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-500 dark:text-zinc-500">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SweetSpotPage({ params }: { params: Promise<{ sessionId: string }> }) {
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

  if (session.type === 'journal') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-4 text-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" className="text-slate-300 dark:text-zinc-700">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <p className="text-[14px] font-semibold text-slate-600 dark:text-zinc-400">Solo disponible en Backtesting</p>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-1 max-w-xs">
            El Sweet Spot analiza los campos RR Máximo de cada trade, disponibles únicamente en sesiones de backtesting.
          </p>
        </div>
      </div>
    )
  }

  const tradesWithData = trades.filter(t =>
    (t.result === 'tp' && t.rr_exit != null) ||
    (t.result === 'be' && t.rr_max != null && t.rr_max > 0)
  )

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
        <p className="text-[13px] text-slate-500 dark:text-zinc-400">Sin trades aún — registra trades para ver el Sweet Spot</p>
      </div>
    )
  }

  if (tradesWithData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-4 text-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" className="text-slate-300 dark:text-zinc-700">
          <path d="M3 3l18 18M10.5 10.5A3 3 0 0 0 12 15a3 3 0 1 0-4.5-4.5"/>
          <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-5.8 2.1"/>
        </svg>
        <div>
          <p className="text-[14px] font-semibold text-slate-600 dark:text-zinc-400">Sin datos de Sweet Spot</p>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-1 max-w-xs">
            Activá el Sweet Spot al registrar trades (TP con RR salida, BE con RR máximo) para calcular el nivel óptimo de salida.
          </p>
        </div>
      </div>
    )
  }

  const result = calcSweetSpot(trades)
  const gain   = result.sweetSpotRR - result.realTotalRR
  const gainPct = result.realTotalRR !== 0 ? (gain / Math.abs(result.realTotalRR)) * 100 : null

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-10">

      {/* Summary banner */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-4 py-3.5 flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-amber-700 dark:text-amber-400">
            Sweet Spot: salida en {result.sweetSpotLevel.toFixed(2)}R
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
            Cerrar en {result.sweetSpotLevel.toFixed(2)}R hubiera generado{' '}
            <span className="font-bold">{result.sweetSpotRR >= 0 ? '+' : ''}{result.sweetSpotRR.toFixed(1)}R</span>
            {' '}vs{' '}
            <span className="font-bold">{result.realTotalRR >= 0 ? '+' : ''}{result.realTotalRR.toFixed(1)}R</span>
            {' '}real
            {gain !== 0 && gainPct !== null && (
              <span> ({gain >= 0 ? '+' : ''}{gainPct.toFixed(0)}%)</span>
            )}
          </p>
        </div>
      </div>

      {/* Context info */}
      <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-zinc-400">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          Calculado sobre {tradesWithData.length} trades con datos de {trades.length} totales · SL siempre cuentan como -1R
        </span>
      </div>

      {/* Chart */}
      <SweetSpotChart trades={trades} sessionType={session.type} />

      {/* Table */}
      <ComparisonTable trades={trades} />
    </div>
  )
}
