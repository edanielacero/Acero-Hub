import { createAdminClient } from '@/lib/supabase-server'
import { getTodayMatches, isLive, liveScore } from '@/lib/mundial/football-api'
import { NextResponse } from 'next/server'

// Uses GET /v4/matches — the real-time, uncached endpoint, same as football-data.org's homepage.
// One call returns all of today's matches across all competitions; we filter to WC live matches.
// Also catches matches that just finished (dropped off the live feed) in the same request.
export async function GET() {
  try {
    const admin = createAdminClient()

    const [apiMatches, { data: dbRows }] = await Promise.all([
      getTodayMatches(),
      admin.from('mundial_matches').select('id, status, kickoff_at'),
    ])

    if (!apiMatches.length || !dbRows?.length) return NextResponse.json({ matches: [] })

    const wcIds = new Set(dbRows.map(r => r.id))
    const dbMap = new Map(dbRows.map(r => [r.id, r]))

    // WC matches from the API that are currently live
    const liveApiMatches = apiMatches.filter(m => wcIds.has(m.id) && isLive(m.status))

    // DB rows still marked as live but absent from the API live list → just finished
    const staleIds = dbRows
      .filter(r => isLive(r.status) && !liveApiMatches.some(m => m.id === r.id))
      .map(r => r.id)

    // Resolve stale matches from today's API data (already fetched, no extra call)
    const staleApiMatches = apiMatches.filter(m => staleIds.includes(m.id))

    const toProcess = [...liveApiMatches, ...staleApiMatches]
    if (!toProcess.length) return NextResponse.json({ matches: [] })

    const now = new Date().toISOString()
    const upsertRows: Record<string, unknown>[] = []
    const results: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null; kickoffAt: string | null }> = []

    for (const match of toProcess) {
      const score = liveScore(match)
      const current = dbMap.get(match.id)

      const row: Record<string, unknown> = {
        id: match.id,
        status: match.status,
        home_score: score.home,
        away_score: score.away,
        synced_at: now,
      }

      if (isLive(match.status) && current && !isLive(current.status as string) && !current.kickoff_at) {
        row.kickoff_at = new Date(Date.now() - 60_000).toISOString()
      }

      upsertRows.push(row)
      results.push({
        id: match.id,
        status: match.status,
        homeScore: score.home,
        awayScore: score.away,
        kickoffAt: (row.kickoff_at ?? current?.kickoff_at ?? null) as string | null,
      })
    }

    await admin.from('mundial_matches').upsert(upsertRows, { onConflict: 'id' })

    return NextResponse.json({ matches: results })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
