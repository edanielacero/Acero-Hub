// FIFA World Ranking position (1 = best) as of the June 11, 2026 update — the last
// official ranking before the tournament. Sources: Wikipedia, ESPN, Sofascore,
// football-ranking.com (see chat history for the research behind these numbers).
// Used as the baseline "team strength" signal for score predictions below.
export const FIFA_RANK: Record<string, number> = {
  'Argentina': 1, 'Spain': 2, 'France': 3, 'England': 4, 'Portugal': 5,
  'Brazil': 6, 'Morocco': 7, 'Netherlands': 8, 'Belgium': 9, 'Germany': 10,
  'Croatia': 11, 'Colombia': 13, 'Mexico': 14, 'Senegal': 15, 'Uruguay': 16,
  'United States': 17, 'Japan': 18, 'Switzerland': 19, 'Iran': 20, 'Turkey': 22,
  'Ecuador': 23, 'Austria': 24, 'South Korea': 25, 'Australia': 27, 'Algeria': 28,
  'Egypt': 29, 'Canada': 30, 'Norway': 31, 'Ivory Coast': 33, 'Panama': 34,
  'Sweden': 38, 'Czechia': 40, 'Paraguay': 41, 'Scotland': 42, 'Tunisia': 45,
  'Congo DR': 46, 'Uzbekistan': 50, 'Qatar': 56, 'Iraq': 57, 'South Africa': 60,
  'Saudi Arabia': 61, 'Jordan': 63, 'Bosnia-Herzegovina': 64, 'Cape Verde Islands': 67,
  'Ghana': 73, 'Curaçao': 82, 'Haiti': 83, 'New Zealand': 85,
}

// Actual FIFA points are known precisely for ranks 1-20 (Wikipedia); beyond that we
// estimate with a flattening decay curve, since real point gaps shrink further down
// the table. Good enough as a relative "strength" signal, not meant to be exact.
function estimatePoints(rank: number): number {
  if (rank <= 20) return 1877.27 - 13.56 * (rank - 1)
  const at20 = 1877.27 - 13.56 * 19 // ≈1619.6
  if (rank <= 50) return at20 - 5 * (rank - 20)
  const at50 = at20 - 5 * 30 // ≈1469.6
  return Math.max(1200, at50 - 2.5 * (rank - 50))
}

interface FormMatch {
  home_team: string; away_team: string; status: string
  home_score: number | null; away_score: number | null
}

const WC_AVG_GOALS = 1.35 // rough average goals/team/match across recent World Cups

function teamForm(team: string, matches: FormMatch[]): { attack: number; defense: number; played: number } {
  const played = matches.filter(m =>
    m.status === 'FINISHED' && m.home_score !== null && m.away_score !== null &&
    (m.home_team === team || m.away_team === team)
  )
  if (played.length === 0) return { attack: WC_AVG_GOALS, defense: WC_AVG_GOALS, played: 0 }
  let gf = 0, ga = 0
  for (const m of played) {
    if (m.home_team === team) { gf += m.home_score!; ga += m.away_score! }
    else { gf += m.away_score!; ga += m.home_score! }
  }
  return { attack: gf / played.length, defense: ga / played.length, played: played.length }
}

// Rank-gap → goals scaling and form-blend weights, tuned via backtest against the
// 76 WC2026 matches finished so far (simulated match-by-match, no lookahead).
// K=150/maxFormWeight=0.3/formGamesCap=4 outperformed the original guesses
// (K=100/0.5/3): exact scoreline accuracy 13.2% → 17.1%, with only a small
// outcome-accuracy tradeoff (65.8% → 63.2%). See chat history for the grid search.
const RANK_GAP_SCALE = 150
const MAX_FORM_WEIGHT = 0.3
const FORM_GAMES_CAP = 4

function poissonPmf(k: number, lambda: number): number {
  let logP = -lambda + k * Math.log(lambda)
  for (let i = 2; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

// Goals in football are well-approximated by independent Poisson distributions
// per team. Rounding each team's expected goals separately (the original
// approach) almost never lands both teams on the same number, so it badly
// under-predicts draws. Picking the single most likely joint (home, away)
// pair under the Poisson model fixes that and is the standard approach used
// by real football analytics models (e.g. Dixon-Coles).
function modePoissonScore(expHome: number, expAway: number, maxGoals = 6): { home: number; away: number } {
  let best = { home: 0, away: 0, p: -1 }
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, expHome) * poissonPmf(a, expAway)
      if (p > best.p) best = { home: h, away: a, p }
    }
  }
  return { home: best.home, away: best.away }
}

/**
 * Best-effort score prediction (regular/extra time, no penalties) combining FIFA
 * ranking strength with each team's actual goals scored/conceded so far in this
 * World Cup. Not a precise statistical model — just a reasonable suggestion for
 * admin reference, since neither rankings nor early tournament form on their own
 * are reliable predictors.
 */
export function predictScore(homeTeam: string, awayTeam: string, allMatches: FormMatch[]): { home: number; away: number } {
  const homeRank = FIFA_RANK[homeTeam] ?? 60
  const awayRank = FIFA_RANK[awayTeam] ?? 60
  const rankDiff = (estimatePoints(homeRank) - estimatePoints(awayRank)) / RANK_GAP_SCALE // ≈ goals-equivalent

  const homeForm = teamForm(homeTeam, allMatches)
  const awayForm = teamForm(awayTeam, allMatches)
  const wHome = Math.min(homeForm.played, FORM_GAMES_CAP) / FORM_GAMES_CAP * MAX_FORM_WEIGHT
  const wAway = Math.min(awayForm.played, FORM_GAMES_CAP) / FORM_GAMES_CAP * MAX_FORM_WEIGHT

  let expHome = WC_AVG_GOALS + rankDiff / 2
  let expAway = WC_AVG_GOALS - rankDiff / 2

  expHome = expHome * (1 - wHome) + ((homeForm.attack + awayForm.defense) / 2) * wHome
  expAway = expAway * (1 - wAway) + ((awayForm.attack + homeForm.defense) / 2) * wAway

  expHome = Math.min(5, Math.max(0.1, expHome))
  expAway = Math.min(5, Math.max(0.1, expAway))

  return modePoissonScore(expHome, expAway)
}
