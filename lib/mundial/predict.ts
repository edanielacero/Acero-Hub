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
  const rankDiff = (estimatePoints(homeRank) - estimatePoints(awayRank)) / 100 // ≈ goals-equivalent

  const homeForm = teamForm(homeTeam, allMatches)
  const awayForm = teamForm(awayTeam, allMatches)
  const wHome = Math.min(homeForm.played, 3) / 3 * 0.5
  const wAway = Math.min(awayForm.played, 3) / 3 * 0.5

  let expHome = WC_AVG_GOALS + rankDiff / 2
  let expAway = WC_AVG_GOALS - rankDiff / 2

  expHome = expHome * (1 - wHome) + ((homeForm.attack + awayForm.defense) / 2) * wHome
  expAway = expAway * (1 - wAway) + ((awayForm.attack + homeForm.defense) / 2) * wAway

  expHome = Math.min(5, Math.max(0.15, expHome))
  expAway = Math.min(5, Math.max(0.15, expAway))

  return { home: Math.round(expHome), away: Math.round(expAway) }
}
