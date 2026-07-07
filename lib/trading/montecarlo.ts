export type MontecarloMode = 'simple' | 'compuesto' | 'hwm' | 'dalembert_inverso'

export interface MontecarloParams {
  results: number[]          // rr_exit per trade (positive = win, negative = loss)
  capitalInitial: number
  riskPct: number            // % of capital to risk per trade (e.g. 1 = 1%)
  nSimulations: number       // 1000–10000
  nTrades: number            // trades to simulate (defaults to results.length)
  mode: MontecarloMode
  dalembertIncrement?: number  // % increment per win (default 0.5)
  dalembertLimit?: number      // max risk multiplier (default 3)
  ruinThreshold?: number       // % of capitalInitial considered ruin (default 0 = $0)
}

export interface MontecarloStats {
  finalCapital:  { avg: number; best: number; worst: number; changePct: { avg: number; best: number; worst: number } }
  maxCapital:    { avg: number; best: number; worst: number }
  streakTp:      { avg: number; best: number; worst: number }
  streakSl:      { avg: number; best: number; worst: number }
  ruinProbability: number
  distribution:  { p10: number; p25: number; p50: number; p75: number; p90: number }
}

export interface MontecarloResult {
  samplePaths:  number[][]   // 100 paths for chart (randomly sampled)
  bestPath:     number[]
  worstPath:    number[]
  avgPath:      number[]
  stats:        MontecarloStats
  totalSims:    number
  tradesPerSim: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function bootstrapSample<T>(arr: T[], n: number): T[] {
  const out: T[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = arr[Math.floor(Math.random() * arr.length)]
  return out
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lo  = Math.floor(idx)
  const hi  = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function runMontecarlo(params: MontecarloParams): MontecarloResult {
  const {
    results, capitalInitial, riskPct, nSimulations, nTrades,
    mode, dalembertIncrement = 0.5, dalembertLimit = 3,
    ruinThreshold = 0,
  } = params

  if (results.length === 0) {
    const empty: number[] = Array(nTrades + 1).fill(capitalInitial)
    return {
      samplePaths: [empty], bestPath: empty, worstPath: empty, avgPath: empty,
      stats: {
        finalCapital: { avg: capitalInitial, best: capitalInitial, worst: capitalInitial, changePct: { avg: 0, best: 0, worst: 0 } },
        maxCapital: { avg: capitalInitial, best: capitalInitial, worst: capitalInitial },
        streakTp: { avg: 0, best: 0, worst: 0 },
        streakSl: { avg: 0, best: 0, worst: 0 },
        ruinProbability: 0,
        distribution: { p10: capitalInitial, p25: capitalInitial, p50: capitalInitial, p75: capitalInitial, p90: capitalInitial },
      },
      totalSims: 0, tradesPerSim: nTrades,
    }
  }

  const allPaths:    number[][] = []
  const finals:      number[]   = []
  const maxCaps:     number[]   = []
  const tpStreaks:   number[]   = []
  const slStreaks:   number[]   = []
  let   ruinCount               = 0

  const ruinLevel = capitalInitial * (ruinThreshold / 100)

  for (let s = 0; s < nSimulations; s++) {
    const sample  = bootstrapSample(results, nTrades)
    const path    = [capitalInitial]
    let   capital = capitalInitial
    let   hwm     = capitalInitial
    let   dMult   = 1                 // dalembert multiplier (units)
    let   maxCap  = capitalInitial
    let   tpRun   = 0, slRun = 0
    let   maxTp   = 0, maxSl = 0
    let   ruined  = false

    for (const rr of sample) {
      if (ruined) { path.push(0); continue }

      const isWin = rr > 0

      let risk: number
      if (mode === 'simple') {
        risk = (capitalInitial * riskPct) / 100
      } else if (mode === 'compuesto') {
        risk = (capital * riskPct) / 100
      } else if (mode === 'hwm') {
        risk = (hwm * riskPct) / 100
      } else {
        // dalembert inverso: risk = base_risk × dMult
        risk = (capitalInitial * riskPct * dMult) / 100
      }

      const pnl = risk * rr
      capital   = Math.max(0, capital + pnl)

      if (mode === 'hwm' && capital > hwm) hwm = capital
      if (capital > maxCap) maxCap = capital

      // dalembert multiplier update
      if (mode === 'dalembert_inverso') {
        if (isWin) {
          dMult = Math.min(dMult + dalembertIncrement, dalembertLimit)
        } else {
          dMult = Math.max(1, dMult - dalembertIncrement)
        }
      }

      // streaks
      if (isWin) {
        tpRun++; slRun = 0
        if (tpRun > maxTp) maxTp = tpRun
      } else if (rr < 0) {
        slRun++; tpRun = 0
        if (slRun > maxSl) maxSl = slRun
      } else {
        tpRun = 0; slRun = 0  // BE resets streaks
      }

      if (capital <= ruinLevel) { ruined = true; capital = 0; ruinCount++ }
      path.push(capital)
    }

    allPaths.push(path)
    finals.push(capital)
    maxCaps.push(maxCap)
    tpStreaks.push(maxTp)
    slStreaks.push(maxSl)
  }

  // Sort finals to find indices of best/worst
  const sortedFinals = [...finals].sort((a, b) => a - b)
  const bestIdx  = finals.indexOf(Math.max(...finals))
  const worstIdx = finals.indexOf(Math.min(...finals))

  // Average path
  const avgPath = Array(nTrades + 1).fill(0).map((_, i) =>
    allPaths.reduce((s, p) => s + (p[i] ?? p[p.length - 1]), 0) / nSimulations
  )

  // Sample 100 paths for chart
  const shuffledIndices = shuffle(Array.from({ length: nSimulations }, (_, i) => i))
  const samplePaths = shuffledIndices.slice(0, Math.min(100, nSimulations)).map(i => allPaths[i])

  const avg      = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  const avgFinal = avg(finals)
  const avgMax   = avg(maxCaps)

  return {
    samplePaths,
    bestPath:  allPaths[bestIdx],
    worstPath: allPaths[worstIdx],
    avgPath,
    stats: {
      finalCapital: {
        avg:   avgFinal,
        best:  Math.max(...finals),
        worst: Math.min(...finals),
        changePct: {
          avg:   ((avgFinal - capitalInitial) / capitalInitial) * 100,
          best:  ((Math.max(...finals) - capitalInitial) / capitalInitial) * 100,
          worst: ((Math.min(...finals) - capitalInitial) / capitalInitial) * 100,
        },
      },
      maxCapital: {
        avg:   avgMax,
        best:  Math.max(...maxCaps),
        worst: Math.min(...maxCaps),
      },
      streakTp: {
        avg:   avg(tpStreaks),
        best:  Math.max(...tpStreaks),
        worst: Math.min(...tpStreaks),
      },
      streakSl: {
        avg:   avg(slStreaks),
        best:  Math.min(...slStreaks),   // fewest losses in a row = best case
        worst: Math.max(...slStreaks),   // most losses in a row = worst case
      },
      ruinProbability: (ruinCount / nSimulations) * 100,
      distribution: {
        p10: percentile(sortedFinals, 10),
        p25: percentile(sortedFinals, 25),
        p50: percentile(sortedFinals, 50),
        p75: percentile(sortedFinals, 75),
        p90: percentile(sortedFinals, 90),
      },
    },
    totalSims:    nSimulations,
    tradesPerSim: nTrades,
  }
}

export function buildResultsArray(
  trades: { result: string | null; rr_exit: number | null; risk_percent: number | null; pnl_usd: number | null; capital_start: number | null }[],
  sessionType: 'backtesting' | 'journal',
): number[] {
  if (sessionType === 'backtesting') {
    return trades
      .filter(t => t.result && t.rr_exit != null)
      .map(t => {
        if (t.result === 'tp') return t.rr_exit!
        if (t.result === 'sl') return -(t.rr_exit ?? 1)
        return 0 // be
      })
  }
  // journal: use pnl_usd/capital_start as % if available, else rr_exit * risk_percent
  return trades
    .filter(t => t.result)
    .map(t => {
      if (t.pnl_usd != null && t.capital_start != null && t.capital_start > 0) {
        return t.pnl_usd / t.capital_start  // normalized ratio (applied × risk later)
      }
      if (t.rr_exit != null) {
        if (t.result === 'tp') return t.rr_exit
        if (t.result === 'sl') return -(t.rr_exit ?? 1)
      }
      return t.result === 'tp' ? 1 : t.result === 'sl' ? -1 : 0
    })
}

export function buildManualResults(
  winratePct: number,
  rrWin: number,
  rrLoss: number,
  sampleSize = 500,
): number[] {
  const results: number[] = []
  const wins = Math.round((winratePct / 100) * sampleSize)
  for (let i = 0; i < wins; i++) results.push(rrWin)
  for (let i = wins; i < sampleSize; i++) results.push(-rrLoss)
  return results
}
