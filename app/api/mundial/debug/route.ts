import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Temporary debug endpoint — shows raw API response + DB state for diagnosis
export async function GET() {
  const BASE = 'https://api.football-data.org/v4'
  const key = process.env.FOOTBALL_DATA_API_KEY

  if (!key) return NextResponse.json({ error: 'No API key configured' }, { status: 500 })

  try {
    // 1. What competitions are available?
    const compRes = await fetch(`${BASE}/competitions`, {
      headers: { 'X-Auth-Token': key },
      cache: 'no-store',
    })
    const compData = await compRes.json()
    const wcComps = (compData.competitions ?? []).filter((c: { code: string; name: string }) =>
      c.code === 'WC' || c.name?.toLowerCase().includes('world cup')
    )

    // 2. Try to fetch WC 2026 matches
    const matchRes = await fetch(`${BASE}/competitions/WC/matches?season=2026`, {
      headers: { 'X-Auth-Token': key },
      cache: 'no-store',
    })
    const matchData = await matchRes.json()

    // 3. Check DB
    const admin = createAdminClient()
    const { data: dbMatches, count } = await admin
      .from('mundial_matches')
      .select('*', { count: 'exact', head: true })

    const { data: liveInDb } = await admin
      .from('mundial_matches')
      .select('id, home_team, away_team, status, match_date')
      .in('status', ['IN_PLAY', 'PAUSED', 'SCHEDULED', 'TIMED'])
      .order('match_date')
      .limit(10)

    return NextResponse.json({
      apiStatus: matchRes.status,
      apiError: matchData.message ?? matchData.error ?? null,
      totalFromApi: matchData.matches?.length ?? 0,
      liveFromApi: (matchData.matches ?? []).filter((m: { status: string }) =>
        m.status === 'IN_PLAY' || m.status === 'PAUSED'
      ).map((m: { id: number; homeTeam: { name: string } | null; awayTeam: { name: string } | null; status: string; utcDate: string }) => ({
        id: m.id,
        home: m.homeTeam?.name,
        away: m.awayTeam?.name,
        status: m.status,
        date: m.utcDate,
      })),
      todayFromApi: (matchData.matches ?? []).filter((m: { utcDate: string }) => {
        const d = new Date(m.utcDate).toISOString().split('T')[0]
        const today = new Date().toISOString().split('T')[0]
        return d === today
      }).map((m: { id: number; homeTeam: { name: string } | null; awayTeam: { name: string } | null; status: string; utcDate: string }) => ({
        id: m.id,
        home: m.homeTeam?.name,
        away: m.awayTeam?.name,
        status: m.status,
        date: m.utcDate,
      })),
      wcCompetitions: wcComps,
      dbTotalMatches: count ?? 0,
      dbUpcomingAndLive: liveInDb ?? [],
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
