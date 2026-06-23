export interface SweetSpotInput {
  rr_exit: number | null
  rr_max:  number | null
  result:  'tp' | 'sl' | 'be' | null
}

export interface SweetSpotPoint {
  level:        number
  totalRR:      number
  winrate:      number
  profitFactor: number | null
  wins:         number
}

export interface SweetSpotResult {
  points:         SweetSpotPoint[]
  sweetSpotLevel: number
  sweetSpotRR:    number
  realTotalRR:    number
  realWinrate:    number
}

export function calcSweetSpot(trades: SweetSpotInput[]): SweetSpotResult {
  const realTotalRR = trades.reduce((sum, t) => {
    if (t.result === 'tp' && t.rr_exit) return sum + t.rr_exit
    if (t.result === 'sl' && t.rr_exit) return sum - t.rr_exit
    return sum
  }, 0)
  const tp = trades.filter(t => t.result === 'tp').length
  const sl = trades.filter(t => t.result === 'sl').length
  const realWinrate = (tp + sl) > 0 ? (tp / (tp + sl)) * 100 : 0

  // Max level derivable from confirmed exits and max favorable excursions
  const reachable = trades.flatMap(t => {
    if (t.result === 'tp' && t.rr_exit) return [t.rr_exit]
    if ((t.result === 'sl' || t.result === 'be') && t.rr_max && t.rr_max > 0) return [t.rr_max]
    return []
  })
  if (reachable.length === 0) {
    return { points: [], sweetSpotLevel: 0, sweetSpotRR: realTotalRR, realTotalRR, realWinrate }
  }

  const maxRR = Math.max(...reachable)
  const levels: number[] = []
  for (let x = 1.0; x <= maxRR + 0.001; x = Math.round((x + 0.5) * 100) / 100) {
    levels.push(Math.round(x * 100) / 100)
    if (levels[levels.length - 1] >= maxRR) break
  }

  const points: SweetSpotPoint[] = levels.map(x => {
    let totalRR = 0, winRR = 0, lossRR = 0, wins = 0
    for (const t of trades) {
      if (t.result === 'tp') {
        // rr_exit es el nivel confirmado; por debajo → win, por encima → hubiera sido SL
        if ((t.rr_exit ?? 0) >= x) {
          totalRR += x; winRR += x; wins++
        } else {
          totalRR -= 1; lossRR += 1
        }
      } else if (t.result === 'sl') {
        // Si el precio hizo un movimiento favorable antes del SL, rr_max lo captura
        if (t.rr_max && t.rr_max >= x) {
          totalRR += x; winRR += x; wins++
        } else {
          totalRR -= 1; lossRR += 1
        }
      } else if (t.result === 'be') {
        // rr_max = hasta dónde llegó antes de reversar a entry
        if (t.rr_max && t.rr_max >= x) {
          totalRR += x; winRR += x; wins++
        }
        // Si no llega a X → sigue siendo 0R (no fue SL)
      }
    }
    const winrate = trades.length > 0 ? (wins / trades.length) * 100 : 0
    const profitFactor = lossRR > 0 ? winRR / lossRR : winRR > 0 ? Infinity : null
    return { level: x, totalRR, winrate, profitFactor, wins }
  })

  const best = points.reduce((b, p) => p.totalRR > b.totalRR ? p : b, points[0])
  return {
    points,
    sweetSpotLevel: best?.level ?? 0,
    sweetSpotRR:    best?.totalRR ?? 0,
    realTotalRR,
    realWinrate,
  }
}
