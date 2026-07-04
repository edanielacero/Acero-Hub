export type SessionType = 'backtesting' | 'journal'
export type TradeResult = 'tp' | 'sl' | 'be'

export interface MetricsTrade {
  date_entry:    string
  result:        TradeResult | null
  rr_exit:       number | null
  risk_percent:  number | null
  pnl_usd:       number | null
  capital_start: number | null
  capital_end:   number | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = z < 0 ? -1 : 1
  const az = Math.abs(z) / Math.SQRT2   // erf needs z/√2, not z
  const t = 1 / (1 + p * az)
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))))
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-az * az)))
}

// ─── Core metrics ──────────────────────────────────────────────────────────────

export function calcExpectancy(trades: MetricsTrade[]): number | null {
  const winners = trades.filter(t => t.result === 'tp')
  const losers  = trades.filter(t => t.result === 'sl')
  const N = winners.length + losers.length
  if (N === 0) return null
  const wr      = winners.length / N
  const avgWin  = winners.length > 0 ? winners.reduce((s, t) => s + (t.rr_exit ?? 0), 0) / winners.length : 0
  const avgLoss = losers.length  > 0 ? losers.reduce((s, t)  => s + (t.rr_exit ?? 0), 0) / losers.length  : 0
  return (wr * avgWin) - ((1 - wr) * avgLoss)
}

export function calcProfitFactor(trades: MetricsTrade[], sessionType: SessionType): number | null {
  const winners = trades.filter(t => t.result === 'tp')
  const losers  = trades.filter(t => t.result === 'sl')
  const winSum  = sessionType === 'backtesting'
    ? winners.reduce((s, t) => s + (t.rr_exit ?? 0), 0)
    : winners.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
  const lossSum = Math.abs(sessionType === 'backtesting'
    ? losers.reduce((s, t) => s + (t.rr_exit ?? 0), 0)
    : losers.reduce((s, t) => s + (t.pnl_usd ?? 0), 0))
  return lossSum > 0 ? winSum / lossSum : winSum > 0 ? Infinity : null
}

export function calcZScore(sorted: MetricsTrade[]): { z: number; label: string } | null {
  const tl = sorted.filter(t => t.result === 'tp' || t.result === 'sl')
  const N = tl.length
  const W = tl.filter(t => t.result === 'tp').length
  const L = tl.filter(t => t.result === 'sl').length
  if (N < 3 || W === 0 || L === 0) return null
  let R = 1
  for (let i = 1; i < tl.length; i++) {
    if (tl[i].result !== tl[i - 1].result) R++
  }
  const num = N * R - 2 * W * L
  const den = Math.sqrt((2 * W * L * (2 * W * L - N)) / (N - 1))
  if (den === 0) return null
  const z = num / den
  const label = z > 1.96 ? 'Alternante' : z < -1.96 ? 'Rachas' : 'Normal'
  return { z, label }
}

export interface PValueResult {
  pValue: number  // one-tailed p-value (H1: WR > break-even)
  zb:     number  // binomial Z statistic (the "edge Z-score")
  p0:     number  // break-even winrate used as null hypothesis
}

export function calcPValue(trades: MetricsTrade[]): PValueResult | null {
  const tl      = trades.filter(t => t.result === 'tp' || t.result === 'sl')
  const N       = tl.length
  if (N < 10) return null
  const winners = tl.filter(t => t.result === 'tp')
  const losers  = tl.filter(t => t.result === 'sl')
  if (winners.length === 0 || losers.length === 0) return null

  // Break-even WR based on actual average RR (not hardcoded 50%)
  const avgWin  = winners.reduce((s, t) => s + (t.rr_exit ?? 1), 0) / winners.length
  const avgLoss = losers.reduce((s, t)  => s + (t.rr_exit ?? 1), 0) / losers.length
  const p0 = avgLoss / (avgWin + avgLoss)

  const wr = winners.length / N
  const zb = (wr - p0) / Math.sqrt(p0 * (1 - p0) / N)
  // One-tailed: H0: WR ≤ p0  →  H1: WR > p0  (estrategia tiene edge)
  const pValue = 1 - normalCDF(zb)

  return { pValue, zb, p0 }
}

export function calcStrategyConfidence(trades: MetricsTrade[]): {
  confidence: number | null
  nMin: number
  breakevenWR: number
  profitable: boolean
} {
  const tl       = trades.filter(t => t.result === 'tp' || t.result === 'sl')
  const tpTrades = tl.filter(t => t.result === 'tp')
  const slTrades = tl.filter(t => t.result === 'sl')
  const N        = tl.length

  const avgWin  = tpTrades.length > 0 ? tpTrades.reduce((s, t) => s + (t.rr_exit ?? 1), 0) / tpTrades.length : 1
  const avgLoss = slTrades.length > 0 ? slTrades.reduce((s, t) => s + (t.rr_exit ?? 1), 0) / slTrades.length : 1

  // Break-even WR: punto donde expectativa = 0
  const breakevenWR = avgLoss / (avgWin + avgLoss)

  const wrActual = N > 0 ? tpTrades.length / N : breakevenWR
  const delta    = wrActual - breakevenWR
  const profitable = delta > 0

  // Trades mínimos para 95% de confianza (Z ≥ 1.645, test unilateral)
  // N_min = 1.645² × WR_be × (1 - WR_be) / delta²
  const absDelta = Math.abs(delta)
  const nMin = absDelta > 0.005
    ? Math.max(30, Math.min(500, Math.ceil(2.706 * breakevenWR * (1 - breakevenWR) / (absDelta * absDelta))))
    : 500

  if (N < 5) return { confidence: null, nMin, breakevenWR, profitable }

  // Test unilateral: H0: WR = WR_be  →  qué tan seguros estamos de que WR > WR_be
  const z          = delta / Math.sqrt(breakevenWR * (1 - breakevenWR) / N)
  const confidence = normalCDF(z) * 100

  return { confidence, nMin, breakevenWR, profitable }
}

export function calcStdDevRR(trades: MetricsTrade[]): number | null {
  if (trades.length < 2) return null
  const vals = trades.map(t => {
    if (t.result === 'tp') return t.rr_exit ?? 0
    if (t.result === 'sl') return -(t.rr_exit ?? 0)
    return 0
  })
  const mu       = vals.reduce((a, b) => a + b, 0) / vals.length
  const variance = vals.reduce((a, b) => a + (b - mu) ** 2, 0) / vals.length
  return Math.sqrt(variance)
}

export function calcMonthlyConsistency(
  trades: MetricsTrade[], sessionType: SessionType,
): { pct: number; positive: number; total: number } | null {
  if (trades.length === 0) return null
  const byMonth: Record<string, MetricsTrade[]> = {}
  for (const t of trades) {
    const m = t.date_entry.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(t)
  }
  const months = Object.values(byMonth)
  const positive = months.filter(mTrades => {
    const net = sessionType === 'backtesting'
      ? mTrades.reduce((s, t) => {
          if (t.result === 'tp' && t.rr_exit) return s + t.rr_exit
          if (t.result === 'sl' && t.rr_exit) return s - t.rr_exit
          return s
        }, 0)
      : mTrades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
    return net > 0
  }).length
  return { pct: (positive / months.length) * 100, positive, total: months.length }
}

export function calcStreaks(sorted: MetricsTrade[]) {
  let maxWin = 0, maxLoss = 0, curW = 0, curL = 0
  for (const t of sorted) {
    if (t.result === 'tp')      { curW++; maxWin  = Math.max(maxWin,  curW); curL = 0 }
    else if (t.result === 'sl') { curL++; maxLoss = Math.max(maxLoss, curL); curW = 0 }
    else                        { curW = 0; curL = 0 }
  }
  return { maxWin, maxLoss }
}

export function calcMaxDrawdown(
  sorted: MetricsTrade[], sessionType: SessionType, capitalInitial: number | null,
): number {
  let maxDD = 0
  if (sessionType === 'backtesting') {
    let peak = 0, cum = 0
    for (const t of sorted) {
      if (t.result === 'tp' && t.rr_exit) cum += t.rr_exit
      else if (t.result === 'sl' && t.rr_exit) cum -= t.rr_exit
      peak  = Math.max(peak, cum)
      maxDD = Math.max(maxDD, peak - cum)
    }
  } else {
    const withCap = sorted.filter(t => t.capital_end != null)
    if (withCap.length) {
      let peak = capitalInitial ?? withCap[0].capital_end!
      for (const t of withCap) {
        peak  = Math.max(peak, t.capital_end!)
        if (peak > 0) maxDD = Math.max(maxDD, ((peak - t.capital_end!) / peak) * 100)
      }
    }
  }
  return maxDD
}

// ─── Equity curve ──────────────────────────────────────────────────────────────

export type CurveMode = 'rr' | 'simple' | 'compound'

export interface CurvePoint {
  date:  string
  value: number
}

/**
 * Builds an equity curve series.
 *
 * backtesting:
 *   rr       → cumulative R (raw RR sum)
 *   simple   → simulated account at constant risk % of initial capital
 *   compound → simulated account at risk % of current capital (compounding)
 *
 * journal:
 *   mode is ignored — always uses real capital_end per trade.
 */
export function calcEquityCurve(
  sorted: MetricsTrade[],
  sessionType: SessionType,
  capitalInitial: number | null,
  mode: CurveMode,
  defaultRiskPct = 1,
): CurvePoint[] {
  if (sessionType === 'journal') {
    const withCap = sorted.filter(t => t.capital_end != null)
    const start   = capitalInitial ?? withCap[0]?.capital_start ?? withCap[0]?.capital_end ?? 0
    const pts: CurvePoint[] = [{ date: '', value: start }]
    for (const t of withCap) pts.push({ date: t.date_entry, value: t.capital_end! })
    return pts
  }

  if (mode === 'rr') {
    let cum = 0
    const pts: CurvePoint[] = [{ date: '', value: 0 }]
    for (const t of sorted) {
      if (t.result === 'tp' && t.rr_exit) cum += t.rr_exit
      else if (t.result === 'sl' && t.rr_exit) cum -= t.rr_exit
      pts.push({ date: t.date_entry, value: cum })
    }
    return pts
  }

  // Simulated account — simple or compound
  const cap0 = capitalInitial ?? 10000
  let cap = cap0
  const pts: CurvePoint[] = [{ date: '', value: cap0 }]
  for (const t of sorted) {
    const rr   = t.result === 'tp' ? (t.rr_exit ?? 0)
               : t.result === 'sl' ? -(t.rr_exit ?? 0)
               : 0
    const risk = t.risk_percent ?? defaultRiskPct
    const base = mode === 'simple' ? cap0 : cap
    cap += rr * (base * risk / 100)
    pts.push({ date: t.date_entry, value: cap })
  }
  return pts
}

// ─── Max drawdown region ───────────────────────────────────────────────────────

/**
 * Returns the [peakIndex, troughIndex] pair that produces the maximum drawdown
 * in the given values array (from calcEquityCurve).
 */
export function findDrawdownRegion(values: number[]): { peakIdx: number; troughIdx: number; dd: number } {
  let peakIdx = 0, troughIdx = 0
  let maxDD = 0
  let tempPeakIdx = 0

  for (let i = 0; i < values.length; i++) {
    if (values[i] >= values[tempPeakIdx]) {
      tempPeakIdx = i
    }
    const dd = values[tempPeakIdx] - values[i]
    if (dd > maxDD) {
      maxDD     = dd
      peakIdx   = tempPeakIdx
      troughIdx = i
    }
  }
  return { peakIdx, troughIdx, dd: maxDD }
}
