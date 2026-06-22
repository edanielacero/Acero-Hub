import { createAdminClient } from '@/lib/supabase-server'
import { getWCLiveMatches, getMatchesByIds, isLive, liveScore } from '@/lib/mundial/football-api'
import { NextResponse } from 'next/server'

// Polls live WC matches via the competition endpoint every 10s.
// Falls back to getMatchesByIds for any DB rows still marked IN_PLAY that the
// live feed dropped (i.e. the match just finished).
export async function GET() {
  try {
    const admin = createAdminClient()

    const [apiMatches, { data: dbRows }] = await Promise.all([
      getWCLiveMatches(),
      admin.from('mundial_matches').select('id, status, kickoff_at'),
    ])

    if (!dbRows?.length) return NextResponse.json({ matches: [] })

    const dbMap = new Map(dbRows.map(r => [r.id, r]))

    // Matches the API currently reports as live
    const liveApiMatches = apiMatches.filter(m => dbMap.has(m.id))

    // DB rows still marked IN_PLAY/PAUSED but absent from the live feed → just finished
    const staleIds = dbRows
      .filter(r => isLive(r.status) && !liveApiMatches.some(m => m.id === r.id))
      .map(r => r.id)

    const staleApiMatches = staleIds.length > 0 ? await getMatchesByIds(staleIds) : []

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
