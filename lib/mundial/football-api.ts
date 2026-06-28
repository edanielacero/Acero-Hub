const BASE = 'https://api.football-data.org/v4'

async function fetchFootball(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY! },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Football API ${res.status}: ${path}`)
  return res.json()
}

export interface FootballMatch {
  id: number
  utcDate: string
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'LIVE' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED' | 'CANCELLED'
  stage: string
  group: string | null
  homeTeam: { name: string | null; shortName: string | null; tla: string | null; crest: string | null } | null
  awayTeam: { name: string | null; shortName: string | null; tla: string | null; crest: string | null } | null
  score: {
    duration: string | null
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
    penalties: { home: number | null; away: number | null } | null
  }
}

/**
 * Returns the best available live score for a match.
 * During IN_PLAY/PAUSED, football-data.org v4 uses fullTime for the running score.
 * Falls back to halfTime if fullTime is null (first few seconds of match).
 */
export function liveScore(match: FootballMatch): { home: number | null; away: number | null } {
  const ft = match.score.fullTime
  const ht = match.score.halfTime
  if (ft.home !== null || ft.away !== null) return ft
  if (ht.home !== null || ht.away !== null) return ht
  return { home: 0, away: 0 }
}

export async function getWorldCupMatches(): Promise<FootballMatch[]> {
  const data = await fetchFootball('/competitions/WC/matches?season=2026')
  return data.matches ?? []
}

export async function getWCLiveMatches(): Promise<FootballMatch[]> {
  const data = await fetchFootball('/competitions/WC/matches?season=2026&status=IN_PLAY,LIVE,PAUSED')
  return data.matches ?? []
}

export async function getWCMatchesByDateRange(dateFrom: string, dateTo: string): Promise<FootballMatch[]> {
  const data = await fetchFootball(`/competitions/WC/matches?season=2026&dateFrom=${dateFrom}&dateTo=${dateTo}`)
  return data.matches ?? []
}


export async function getMatch(id: number): Promise<FootballMatch> {
  return fetchFootball(`/matches/${id}`)
}

export async function getMatchesByIds(ids: number[]): Promise<FootballMatch[]> {
  const data = await fetchFootball(`/matches?ids=${ids.join(',')}`)
  return data.matches ?? []
}

export function isLive(status: string) {
  return status === 'IN_PLAY' || status === 'LIVE' || status === 'PAUSED'
}

export function isClosed(matchDate: string) {
  return new Date(matchDate).getTime() - Date.now() < 60_000
}

export function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    FIRST_ROUND: 'Fase de Grupos',
    GROUP_STAGE: 'Fase de Grupos',
    LAST_16: 'Octavos de Final',
    ROUND_OF_16: 'Octavos de Final',
    QUARTER_FINALS: 'Cuartos de Final',
    SEMI_FINALS: 'Semifinales',
    THIRD_PLACE: 'Tercer Lugar',
    FINAL: 'Final',
  }
  return map[stage] ?? stage
}
