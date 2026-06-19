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
  status: 'SCHEDULED' | 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED' | 'CANCELLED'
  stage: string
  group: string | null
  homeTeam: { name: string | null; shortName: string | null; tla: string | null; crest: string | null } | null
  awayTeam: { name: string | null; shortName: string | null; tla: string | null; crest: string | null } | null
  score: { fullTime: { home: number | null; away: number | null } }
}

export async function getWorldCupMatches(): Promise<FootballMatch[]> {
  const data = await fetchFootball('/competitions/WC/matches?season=2026')
  return data.matches ?? []
}

export async function getMatch(id: number): Promise<FootballMatch> {
  return fetchFootball(`/matches/${id}`)
}

export function isLive(status: string) {
  return status === 'IN_PLAY' || status === 'PAUSED'
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
