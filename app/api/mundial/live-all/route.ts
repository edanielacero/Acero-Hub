import { createAdminClient } from '@/lib/supabase-server'
import { getWCLiveMatches, isLive, liveScore } from '@/lib/football-api'
import { NextResponse } from 'next/server'

// Scores only move forward — API can briefly return null/0 during backend data races.
// If the API reports a lower score than what we already have, keep the existing one.
function safeScore(apiVal: number | null, dbVal: number | null): number | null {
  if (apiVal === null) return dbVal
  if (dbVal === null) return apiVal
  return apiVal >= dbVal ? apiVal : dbVal
}

// Polls ALL live WC matches in a single football-data.org request.
// Prevents exceeding the free-tier rate limit (10 req/min) when multiple matches are live.
export async function GET() {
  try {
    const [apiMatches, admin] = await Promise.all([
      getWCLiveMatches(),
      Promise.resolve(createAdminClient()),
    ])

    if (!apiMatches.length) return NextResponse.json({ matches: [] })

    const ids = apiMatches.map(m => m.id)

    // Read current DB state for all live matches in one query
    const { data: currentRows } = await admin
      .from('mundial_matches')
      .select('id, status, kickoff_at, home_score, away_score')
      .in('id', ids)

    const currentMap = new Map((currentRows ?? []).map(r => [r.id, r]))

    const upsertRows: Record<string, unknown>[] = []
    const results: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null; kickoffAt: string | null }> = []

    const now = new Date().toISOString()

    for (const match of apiMatches) {
      const score = liveScore(match)
      const current = currentMap.get(match.id)

      // Never decrease score — protects against API data races (not VAR, which is rare)
      const homeScore = safeScore(score.home, current?.home_score ?? null)
      const awayScore = safeScore(score.away, current?.away_score ?? null)

      const row: Record<string, unknown> = {
        id: match.id,
        status: match.status,
        home_score: homeScore,
        away_score: awayScore,
        synced_at: now,
      }

      // Record actual kick-off when transition to IN_PLAY is detected (free-tier ~60s delay)
      if (isLive(match.status) && current && !isLive(current.status as string) && !current.kickoff_at) {
        row.kickoff_at = new Date(Date.now() - 60_000).toISOString()
      }

      upsertRows.push(row)
      results.push({
        id: match.id,
        status: match.status,
        homeScore,
        awayScore,
        kickoffAt: (row.kickoff_at ?? current?.kickoff_at ?? null) as string | null,
      })
    }

    // Batch upsert — one DB write for all live matches
    await admin.from('mundial_matches').upsert(upsertRows, { onConflict: 'id' })

    return NextResponse.json({ matches: results })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
