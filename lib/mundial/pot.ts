export interface MatchInput {
  id: number
  match_date: string
  status: string
  home_score: number | null
  away_score: number | null
  bet_amount: number | null
}

export interface BetInput {
  match_id: number
  home_score_bet: number
  away_score_bet: number
}

export interface PotResult {
  potMap: Record<number, number>
  carryoverPerWinnerMap: Record<number, number>
  carryover: number
}

export function computePots(
  matches: MatchInput[],
  bets: BetInput[],
  globalBetAmount: number
): PotResult {
  const potMap: Record<number, number> = {}
  const carryoverPerWinnerMap: Record<number, number> = {}

  const sorted = [...matches].sort((a, b) =>
    new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
  )

  // Group matches by kickoff time
  const kickoffGroups: MatchInput[][] = []
  for (const m of sorted) {
    const last = kickoffGroups[kickoffGroups.length - 1]
    if (last && last[0].match_date === m.match_date) last.push(m)
    else kickoffGroups.push([m])
  }

  let acc = 0
  for (const group of kickoffGroups) {
    if (!group.every(m => m.status === 'FINISHED')) break

    const carryoverIn = acc
    const isSimultaneous = group.length > 1
    let groupHasWinner = false
    let unwonPot = 0
    let groupOwnPot = 0
    let totalGroupWinners = 0

    for (const m of group) {
      const mBets = bets.filter(b => b.match_id === m.id)
      const ownPot = mBets.length * (m.bet_amount ?? globalBetAmount)
      groupOwnPot += ownPot
      potMap[m.id] = isSimultaneous ? ownPot : ownPot + carryoverIn
      const mWinners = mBets.filter(b =>
        b.home_score_bet === m.home_score && b.away_score_bet === m.away_score
      ).length
      totalGroupWinners += mWinners
      if (mWinners > 0) groupHasWinner = true
      else unwonPot += ownPot
    }

    if (isSimultaneous && carryoverIn > 0 && totalGroupWinners > 0) {
      const perWinner = Math.floor(carryoverIn / totalGroupWinners)
      for (const m of group) carryoverPerWinnerMap[m.id] = perWinner
    }

    acc = groupHasWinner ? unwonPot : groupOwnPot + carryoverIn
  }

  return { potMap, carryoverPerWinnerMap, carryover: acc }
}

export function prizeForMatch(
  matchId: number,
  winnersCount: number,
  potMap: Record<number, number>,
  carryoverPerWinnerMap: Record<number, number>
): number {
  if (winnersCount <= 0) return 0
  return Math.floor((potMap[matchId] ?? 0) / winnersCount) + (carryoverPerWinnerMap[matchId] ?? 0)
}
