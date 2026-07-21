'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { use } from 'react'

type SessionType = 'backtesting' | 'journal'
type Mode = 'simple' | 'compuesto' | 'hwm' | 'dalembert_inverso'

interface Session { id: string; type: SessionType; name: string }
interface PageData { session: Session; tradeCount: number; winrate: number; rrAvg: number }

interface MCStats {
  finalCapital:  { avg: number; best: number; worst: number; changePct: { avg: number; best: number; worst: number } }
  maxCapital:    { avg: number; best: number; worst: number }
  streakTp:      { avg: number; best: number; worst: number }
  streakSl:      { avg: number; best: number; worst: number }
  ruinProbability: number
  distribution:  { p10: number; p25: number; p50: number; p75: number; p90: number }
}

interface MCResult {
  samplePaths:  number[][]
  bestPath:     number[]
  worstPath:    number[]
  avgPath:      number[]
  stats:        MCStats
  totalSims:    number
  tradesPerSim: number
  tradeCount:   number
  winrate:      number
  rrAvg:        number
}

const MODE_LABELS: Record<Mode, string> = {
  simple:            'Interés Simple',
  compuesto:         'Interés Compuesto',
  hwm:               'High Water Mark',
  dalembert_inverso: 'Dalembert Inverso',
}

const MODE_DESC: Record<Mode, string> = {
  simple:            'El % de riesgo se calcula siempre sobre el capital inicial fijo.',
  compuesto:         'El % de riesgo se calcula sobre el capital actual. Si crece, el riesgo crece.',
  hwm:               'El % de riesgo se calcula sobre el capital máximo alcanzado. Si el capital sube, el riesgo sube; si baja, el riesgo se mantiene.',
  dalembert_inverso: 'El % de riesgo se calcula sobre el capital inicial pero varía según si ganaste o perdiste el trade anterior.',
}

function fmt$(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs  = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

// ─── Montecarlo Chart ──────────────────────────────────────────────────────────

function MontecarloChart({ result, capitalInitial }: { result: MCResult; capitalInitial: number }) {
  const [hoverX, setHoverX]     = useState<number | null>(null)
  const [svgW, setSvgW]         = useState(600)
  const svgRef                  = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSvgW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const W = 600, H = 240
  const PAD = { top: 16, right: 24, bottom: 44, left: 62 }
  const fs  = (px: number) => ((px * W) / Math.max(svgW, 1)).toFixed(2)
  const iW  = W - PAD.left - PAD.right
  const iH  = H - PAD.top - PAD.bottom

  const n      = result.avgPath.length
  const allVals = [
    ...result.bestPath,
    ...result.worstPath,
    ...result.avgPath,
    capitalInitial,
  ]
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals)
  const pad  = (maxV - minV) * 0.1 || capitalInitial * 0.1
  const dMin = minV - pad
  const dMax = maxV + pad
  const dRange = dMax - dMin || 1

  const xs = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * iW
  const ys = (v: number) => PAD.top  + (1 - (v - dMin) / dRange) * iH

  function niceYTicks(count = 5): number[] {
    const range = dMax - dMin
    const rough = range / (count - 1)
    const mag   = Math.pow(10, Math.floor(Math.log10(Math.abs(rough) || 1)))
    const norm  = rough / mag
    const step  = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag
    const lo    = Math.floor(dMin / step) * step
    const hi    = Math.ceil(dMax / step) * step
    const ticks: number[] = []
    for (let t = lo; t <= hi + step * 0.001; t = parseFloat((t + step).toFixed(10))) ticks.push(t)
    return ticks
  }
  const yTicks = niceYTicks()

  const niceXTicks = (): number[] => {
    const count  = Math.min(7, n)
    return Array.from({ length: count }, (_, i) => Math.round(i * (n - 1) / Math.max(count - 1, 1)))
  }

  function pathD(pts: number[]): string {
    return pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ')
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const rawX = (e.clientX - rect.left) * (W / rect.width)
    const rawY = (e.clientY - rect.top)  * (H / rect.height)
    if (rawX < PAD.left || rawX > W - PAD.right || rawY < PAD.top || rawY > H - PAD.bottom) {
      setHoverX(null); return
    }
    const idx = Math.round(((rawX - PAD.left) / iW) * (n - 1))
    setHoverX(Math.max(0, Math.min(n - 1, idx)))
  }
  function handleTouch(e: React.TouchEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const touch = e.touches[0]; if (!touch) return
    const rect  = svgRef.current.getBoundingClientRect()
    const rawX  = (touch.clientX - rect.left) * (W / rect.width)
    const rawY  = (touch.clientY - rect.top)  * (H / rect.height)
    if (rawX < PAD.left || rawX > W - PAD.right || rawY < PAD.top || rawY > H - PAD.bottom) {
      setHoverX(null); return
    }
    setHoverX(Math.max(0, Math.min(n - 1, Math.round(((rawX - PAD.left) / iW) * (n - 1)))))
  }

  const tipXFrac = hoverX != null ? (PAD.left + (hoverX / Math.max(n - 1, 1)) * iW) / W : 0

  return (
    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/[0.10] rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-slate-800 dark:text-white">
            Evolución del Capital ({result.totalSims.toLocaleString()} simulaciones)
          </p>
          <p className="text-[10.5px] text-slate-500 dark:text-zinc-400 mt-0.5">
            Las {result.totalSims.toLocaleString()} simulaciones se usaron para los cálculos. Por rendimiento, solo se muestran {Math.min(100, result.samplePaths.length)} trayectorias.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 pb-2">
        {([
          { color: '#22c55e', label: 'Mejor',    dash: false },
          { color: '#3b82f6', label: 'Promedio', dash: false },
          { color: '#ef4444', label: 'Peor',     dash: false },
          { color: '#71717a', label: 'Otras',    dash: true  },
        ] as { color: string; label: string; dash: boolean }[]).map(l => (
          <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-400">
            {l.dash
              ? <span className="w-4 h-px border-t border-dashed" style={{ borderColor: l.color }} />
              : <span className="w-4 h-0.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
            }
            {l.label}
          </span>
        ))}
      </div>

      {/* SVG Chart */}
      <div className="relative select-none">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverX(null)}
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onTouchEnd={() => setHoverX(null)}>

          {/* Y grid + labels */}
          {yTicks.map((v, i) => {
            const y = ys(v)
            if (y < PAD.top - 2 || y > H - PAD.bottom + 2) return null
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y.toFixed(1)} x2={W - PAD.right} y2={y.toFixed(1)}
                  stroke="currentColor" strokeOpacity="0.07" strokeWidth="1"
                  className="text-slate-900 dark:text-white" />
                <text x={PAD.left - 6} y={y + 4} textAnchor="end"
                  fontSize={fs(10)} fontFamily="monospace"
                  className="fill-slate-500 dark:fill-zinc-400">
                  {fmt$(v)}
                </text>
              </g>
            )
          })}

          {/* Capital inicial reference */}
          {(() => {
            const y0 = ys(capitalInitial)
            if (y0 < PAD.top || y0 > H - PAD.bottom) return null
            return (
              <line x1={PAD.left} y1={y0.toFixed(1)} x2={W - PAD.right} y2={y0.toFixed(1)}
                stroke="currentColor" strokeOpacity="0.20" strokeWidth="1" strokeDasharray="4 3"
                className="text-slate-400 dark:text-zinc-500" />
            )
          })()}

          {/* Sample paths (grey, thin, low opacity) */}
          {result.samplePaths.map((pts, i) => (
            <path key={i} d={pathD(pts)} fill="none"
              stroke="#71717a" strokeWidth="0.6" strokeOpacity="0.22" />
          ))}

          {/* Avg path (blue) */}
          <path d={pathD(result.avgPath)} fill="none"
            stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Best path (green) */}
          <path d={pathD(result.bestPath)} fill="none"
            stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Worst path (red) */}
          <path d={pathD(result.worstPath)} fill="none"
            stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* X axis labels */}
          {niceXTicks().map(i => (
            <text key={i} x={xs(i).toFixed(1)} y={H - 8} textAnchor="middle"
              fontSize={fs(10)} fontFamily="monospace"
              className="fill-slate-500 dark:fill-zinc-400">
              {i}
            </text>
          ))}

          {/* X baseline */}
          <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
            stroke="currentColor" strokeOpacity="0.10" strokeWidth="1"
            className="text-slate-900 dark:text-white" />

          {/* Hover line */}
          {hoverX != null && (
            <g>
              <line x1={xs(hoverX).toFixed(1)} y1={PAD.top - 4}
                    x2={xs(hoverX).toFixed(1)} y2={H - PAD.bottom + 2}
                stroke="currentColor" strokeOpacity="0.20" strokeWidth="1"
                className="text-slate-600 dark:text-zinc-400" />
              {[
                { path: result.avgPath,   color: '#3b82f6' },
                { path: result.bestPath,  color: '#22c55e' },
                { path: result.worstPath, color: '#ef4444' },
              ].map(({ path, color }) => (
                <circle key={color}
                  cx={xs(hoverX).toFixed(1)} cy={ys(path[hoverX] ?? path[path.length - 1]).toFixed(1)}
                  r="3.5" fill={color} stroke="white" strokeWidth="1.5"
                  className="dark:stroke-zinc-950" />
              ))}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hoverX != null && (
          <div className="absolute top-2 pointer-events-none z-10"
            style={{
              left: `${tipXFrac * 100}%`,
              transform: tipXFrac > 0.60 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
            }}>
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 shadow-lg">
              <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 mb-1.5">
                Trade {hoverX}
              </p>
              {[
                { label: 'Mejor',    value: result.bestPath[hoverX],  color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Promedio', value: result.avgPath[hoverX],   color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Peor',     value: result.worstPath[hoverX], color: 'text-rose-500 dark:text-rose-400' },
              ].map(({ label, value, color }) => (
                <p key={label} className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {label}: <span className={`font-bold ${color}`}>{fmt$(value ?? 0)}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stat Cards ────────────────────────────────────────────────────────────────

function StatCard({ title, icon, avg, best, worst, format = fmt$, colorAvg, bestIsGood = true }: {
  title: string; icon: React.ReactNode
  avg: number; best: number; worst: number
  format?: (n: number) => string
  colorAvg?: string; bestIsGood?: boolean
}) {
  return (
    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/[0.10] rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <span className="text-slate-400 dark:text-zinc-500">{icon}</span>
        <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">{title}</p>
      </div>
      <div className="grid grid-cols-3 border-t border-slate-100 dark:border-white/[0.06] divide-x divide-slate-100 dark:divide-white/[0.06]">
        {[
          { label: 'Promedio', value: avg,  color: colorAvg ?? 'text-slate-800 dark:text-white' },
          { label: 'Mejor',    value: best, color: bestIsGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
          { label: 'Peor',     value: worst,color: bestIsGood ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5">
            <span className="text-[8.5px] text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">{label}</span>
            <span className={`text-[12px] font-bold ${color}`}>{format(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Number Input ──────────────────────────────────────────────────────────────

function NumInput({ label, value, onChange, min, max, step = 1, suffix }: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">{label}</label>
      <div className="relative">
        <input
          type="number"
          min={min} max={max} step={step}
          value={value}
          onChange={e => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(v)
          }}
          className="w-full h-10 px-3 pr-8 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-[13px] font-mono accent-input focus:outline-none transition-colors"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-zinc-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Config Card ──────────────────────────────────────────────────────────────

function ConfigCard({
  session, tradeCount, winrate, rrAvg,
  mode, setMode,
  capitalInitial, setCapitalInitial,
  riskPct, setRiskPct,
  nSimulations, setNSimulations,
  useRealTrades, setUseRealTrades,
  manualWinrate, setManualWinrate,
  manualRrWin, setManualRrWin,
  manualRrLoss, setManualRrLoss,
  dalembertIncrement, setDalembertIncrement,
  dalembertLimit, setDalembertLimit,
  nTrades, setNTrades,
  running, onRun,
}: {
  session: Session; tradeCount: number; winrate: number; rrAvg: number
  mode: Mode; setMode: (m: Mode) => void
  capitalInitial: number; setCapitalInitial: (v: number) => void
  riskPct: number; setRiskPct: (v: number) => void
  nSimulations: number; setNSimulations: (v: number) => void
  useRealTrades: boolean; setUseRealTrades: (v: boolean) => void
  manualWinrate: number; setManualWinrate: (v: number) => void
  manualRrWin: number; setManualRrWin: (v: number) => void
  manualRrLoss: number; setManualRrLoss: (v: number) => void
  dalembertIncrement: number; setDalembertIncrement: (v: number) => void
  dalembertLimit: number; setDalembertLimit: (v: number) => void
  nTrades: number; setNTrades: (v: number) => void
  running: boolean; onRun: () => void
}) {
  const [modeOpen, setModeOpen] = useState(false)

  return (
    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/[0.10] rounded-2xl shadow-sm dark:shadow-none">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" className="text-slate-500 dark:text-zinc-400 shrink-0">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <p className="text-[14px] font-bold text-slate-900 dark:text-white">Simulación Monte Carlo</p>
        </div>
        {/* Datos automáticos toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">Datos automáticos</span>
          <button
            onClick={() => setUseRealTrades(!useRealTrades)}
            className={`relative w-11 h-6 rounded-full border-2 transition-colors duration-200 cursor-pointer ${
              useRealTrades ? 'accent-toggle-on' : 'bg-slate-200 dark:bg-zinc-700 border-slate-300 dark:border-zinc-600'
            }`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              useRealTrades ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Session stats summary */}
      <div className="flex items-center gap-3 px-4 pb-3 text-[11px] text-slate-500 dark:text-zinc-400">
        <span className="font-bold text-slate-700 dark:text-zinc-300">{tradeCount} trades</span>
        <span className="accent-txt font-bold">{winrate.toFixed(1)}% winrate</span>
        {rrAvg !== 0 && (
          <span className="font-mono">1:{Math.abs(rrAvg).toFixed(1)} RR</span>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-white/[0.06] px-4 pt-4 pb-4 flex flex-col gap-4">

        {/* Mode selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">Tipo de Simulación</label>
          <div className="relative">
            <button
              onClick={() => setModeOpen(o => !o)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 text-[13px] text-left flex items-center justify-between cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-zinc-600">
              <span>{MODE_LABELS[mode]}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" className={`text-slate-400 dark:text-zinc-500 shrink-0 transition-transform ${modeOpen ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {modeOpen && (
              <div className="absolute z-20 top-[calc(100%+4px)] left-0 right-0 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden">
                {(Object.entries(MODE_LABELS) as [Mode, string][]).map(([k, label]) => (
                  <button key={k} onClick={() => { setMode(k); setModeOpen(false) }}
                    className={`w-full px-3 py-2.5 text-left text-[13px] flex items-center gap-2 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800 ${
                      mode === k ? 'accent-txt font-semibold' : 'text-slate-700 dark:text-zinc-300'
                    }`}>
                    {mode === k && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    {mode !== k && <span className="w-3" />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">{MODE_DESC[mode]}</p>
        </div>

        {/* Manual distribution inputs */}
        {!useRealTrades && (
          <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-700/60 rounded-xl p-3 flex flex-col gap-3">
            <p className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em]">Distribución manual</p>
            <div className="grid grid-cols-3 gap-2">
              <NumInput label="Winrate (%)" value={manualWinrate} onChange={setManualWinrate} min={1} max={99} step={0.5} suffix="%" />
              <NumInput label="RR ganador" value={manualRrWin}   onChange={setManualRrWin}   min={0.1} step={0.1} />
              <NumInput label="RR perdedor" value={manualRrLoss}  onChange={setManualRrLoss}  min={0.1} step={0.1} />
            </div>
          </div>
        )}

        {/* Main inputs grid */}
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="Capital Inicial ($)" value={capitalInitial} onChange={setCapitalInitial} min={100} step={1000} />
          <NumInput label="Riesgo por Trade (%)" value={riskPct} onChange={setRiskPct} min={0.1} max={50} step={0.5} suffix="%" />
          <NumInput label="Simulaciones" value={nSimulations} onChange={v => setNSimulations(Math.min(10000, Math.max(100, v)))} min={100} max={10000} step={1000} />
        </div>

        <NumInput label={`Trades a simular (tienes ${tradeCount})`} value={nTrades} onChange={v => setNTrades(Math.max(1, v))} min={1} step={10} />

        {/* Dalembert extra inputs */}
        {mode === 'dalembert_inverso' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Incremento/Disminución (%)" value={dalembertIncrement} onChange={setDalembertIncrement} min={0.1} max={5} step={0.1} suffix="%" />
              <NumInput label="Límite de Variación (%)" value={dalembertLimit} onChange={setDalembertLimit} min={1} max={20} step={0.5} suffix="x" />
            </div>
            <p className="text-[10.5px] text-slate-500 dark:text-zinc-400">
              Con riesgo base de {riskPct}%, límite de ±{dalembertLimit}x:{' '}
              el riesgo variará entre <strong className="text-slate-700 dark:text-zinc-300">{riskPct.toFixed(1)}%</strong> y{' '}
              <strong className="text-slate-700 dark:text-zinc-300">{(riskPct * dalembertLimit).toFixed(1)}%</strong> del capital inicial.
            </p>
          </div>
        )}

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl accent-btn accent-btn-shadow font-semibold text-[14px] cursor-pointer transition-colors active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed">
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Simulando...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Ejecutar Simulación ({MODE_LABELS[mode]})
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Results Section ───────────────────────────────────────────────────────────

function Results({ result, capitalInitial, mode }: { result: MCResult; capitalInitial: number; mode: Mode }) {
  const s = result.stats
  const ruinColor = s.ruinProbability === 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : s.ruinProbability < 5
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-rose-500 dark:text-rose-400'

  const ruinBg = s.ruinProbability === 0
    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50'
    : s.ruinProbability < 5
    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50'
    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50'

  const IconChart = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
  const IconTp = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  )
  const IconSl = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <div className="px-1">
        <p className="text-[12px] font-bold text-slate-700 dark:text-zinc-300">
          Resultados ({result.totalSims.toLocaleString()} simulaciones - {MODE_LABELS[mode]})
        </p>
      </div>

      {/* Chart */}
      <MontecarloChart result={result} capitalInitial={capitalInitial} />

      {/* 4-card grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="Capital Final Promedio"
          icon={IconChart}
          avg={s.finalCapital.avg}
          best={s.finalCapital.best}
          worst={s.finalCapital.worst}
          colorAvg={s.finalCapital.avg >= capitalInitial ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}
        />
        <StatCard
          title="Capital Máximo Promedio"
          icon={IconChart}
          avg={s.maxCapital.avg}
          best={s.maxCapital.best}
          worst={s.maxCapital.worst}
          colorAvg="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Racha Máxima de TP"
          icon={IconTp}
          avg={s.streakTp.avg}
          best={s.streakTp.best}
          worst={s.streakTp.worst}
          format={n => n.toFixed(n % 1 === 0 ? 0 : 1)}
          colorAvg="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Racha Máxima de SL"
          icon={IconSl}
          avg={s.streakSl.avg}
          best={s.streakSl.best}
          worst={s.streakSl.worst}
          format={n => n.toFixed(n % 1 === 0 ? 0 : 1)}
          colorAvg="text-rose-500 dark:text-rose-400"
          bestIsGood={false}
        />
      </div>

      {/* Change % row */}
      <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/[0.10] rounded-2xl shadow-sm dark:shadow-none p-3">
        <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2">Variación del Capital Final</p>
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { label: 'Promedio', value: s.finalCapital.changePct.avg  },
            { label: 'Mejor',    value: s.finalCapital.changePct.best  },
            { label: 'Peor',     value: s.finalCapital.changePct.worst },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[9px] text-slate-500 dark:text-zinc-400">{label}</span>
              <span className={`text-[13px] font-bold font-mono ${value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {fmtPct(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribution */}
      <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/[0.10] rounded-2xl shadow-sm dark:shadow-none p-3">
        <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.1em] mb-2.5">Distribución de Capital Final</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {([
            ['P10', s.distribution.p10],
            ['P25', s.distribution.p25],
            ['P50', s.distribution.p50],
            ['P75', s.distribution.p75],
            ['P90', s.distribution.p90],
          ] as [string, number][]).map(([label, value]) => (
            <span key={label} className="text-[11px] text-slate-600 dark:text-zinc-400">
              <span className="font-semibold">{label}:</span>{' '}
              <span className={`font-bold font-mono ${value >= capitalInitial ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {fmt$(value)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Ruin probability */}
      <div className={`border rounded-2xl px-4 py-3.5 flex items-start gap-3 ${ruinBg}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" className={`mt-0.5 shrink-0 ${ruinColor}`}>
          {s.ruinProbability === 0
            ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
            : <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
          }
        </svg>
        <div>
          <p className={`text-[12px] font-bold ${ruinColor}`}>
            Probabilidad de Ruina: {s.ruinProbability.toFixed(2)}%
          </p>
          <p className={`text-[11px] mt-0.5 ${ruinColor} opacity-80`}>
            {Math.round(s.ruinProbability / 100 * result.totalSims).toLocaleString()} de {result.totalSims.toLocaleString()} simulaciones terminaron en $0
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MontecarloPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)

  const [pageData, setPageData]     = useState<PageData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [running, setRunning]       = useState(false)
  const [result, setResult]         = useState<MCResult | null>(null)
  const [error, setError]           = useState<string | null>(null)

  // Config state
  const [mode, setMode]                           = useState<Mode>('hwm')
  const [capitalInitial, setCapitalInitial]       = useState(10000)
  const [riskPct, setRiskPct]                     = useState(1)
  const [nSimulations, setNSimulations]           = useState(10000)
  const [nTrades, setNTrades]                     = useState(0)  // 0 = use trades.length
  const [useRealTrades, setUseRealTrades]         = useState(true)
  const [manualWinrate, setManualWinrate]         = useState(50)
  const [manualRrWin, setManualRrWin]             = useState(1.5)
  const [manualRrLoss, setManualRrLoss]           = useState(1)
  const [dalembertIncrement, setDalembertIncrement] = useState(0.5)
  const [dalembertLimit, setDalembertLimit]       = useState(3)

  useEffect(() => {
    fetch(`/api/trading-journal/sessions/${sessionId}/trades`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          const tradeCount = (d.trades ?? []).length
          const trades     = d.trades ?? []
          const wins       = trades.filter((t: { result: string | null }) => t.result === 'tp').length
          const winrate    = tradeCount > 0 ? (wins / tradeCount) * 100 : 0
          const rrSum      = trades.reduce((s: number, t: { rr_exit: number | null; result: string | null }) =>
            t.rr_exit != null ? s + (t.result === 'tp' ? t.rr_exit : t.result === 'sl' ? -t.rr_exit : 0) : s, 0)
          const rrAvg      = tradeCount > 0 ? rrSum / tradeCount : 0
          setPageData({ session: d.session, tradeCount, winrate, rrAvg })
          setNTrades(tradeCount || 100)
          if (d.session.capital_initial) setCapitalInitial(d.session.capital_initial)
        }
        setLoading(false)
      })
  }, [sessionId])

  const handleRun = useCallback(async () => {
    if (!pageData) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/trading-journal/sessions/${sessionId}/montecarlo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capitalInitial,
          riskPct,
          nSimulations,
          nTrades: nTrades || undefined,
          mode,
          useRealTrades,
          manualWinrate,
          manualRrWin,
          manualRrLoss,
          dalembertIncrement,
          dalembertLimit,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al simular'); return }
      setResult(data)
    } catch {
      setError('Error de conexión')
    } finally {
      setRunning(false)
    }
  }, [pageData, sessionId, capitalInitial, riskPct, nSimulations, nTrades, mode,
      useRealTrades, manualWinrate, manualRrWin, manualRrLoss, dalembertIncrement, dalembertLimit])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-zinc-700 accent-spin rounded-full animate-spin" />
      </div>
    )
  }
  if (!pageData) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-slate-500 dark:text-zinc-400 text-[14px]">Error al cargar la sesión</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-10">
      <ConfigCard
        session={pageData.session}
        tradeCount={pageData.tradeCount}
        winrate={pageData.winrate}
        rrAvg={pageData.rrAvg}
        mode={mode} setMode={setMode}
        capitalInitial={capitalInitial} setCapitalInitial={setCapitalInitial}
        riskPct={riskPct} setRiskPct={setRiskPct}
        nSimulations={nSimulations} setNSimulations={setNSimulations}
        useRealTrades={useRealTrades} setUseRealTrades={setUseRealTrades}
        manualWinrate={manualWinrate} setManualWinrate={setManualWinrate}
        manualRrWin={manualRrWin} setManualRrWin={setManualRrWin}
        manualRrLoss={manualRrLoss} setManualRrLoss={setManualRrLoss}
        dalembertIncrement={dalembertIncrement} setDalembertIncrement={setDalembertIncrement}
        dalembertLimit={dalembertLimit} setDalembertLimit={setDalembertLimit}
        nTrades={nTrades} setNTrades={setNTrades}
        running={running} onRun={handleRun}
      />

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-3">
          <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {result && <Results result={result} capitalInitial={capitalInitial} mode={mode} />}
    </div>
  )
}
