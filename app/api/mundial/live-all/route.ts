import { createAdminClient } from '@/lib/supabase-server'
import { getWCLiveMatches, getMatch, isLive, liveScore } from '@/lib/mundial/football-api'
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

    if (!apiMatches.length) {
      // No matches are live according to the API. Check the DB for rows still marked
      // IN_PLAY/PAUSED — they may have just finished and dropped off the live feed.
      const { data: staleRows } = await admin
        .from('mundial_matches')
        .select('id')
        .in('status', ['IN_PLAY', 'PAUSED'])

      if (!staleRows?.length) return NextResponse.json({ matches: [] })

      const now = new Date().toISOString()
      const settled = await Promise.allSettled(staleRows.map(r => getMatch(r.id)))
      const finalUpdates: Array<{ id: number; status: string; homeScore: number | null; awayScore: number | null; kickoffAt: string | null }> = []

      for (const result of settled) {
        if (result.status !== 'fulfilled') continue
        const match = result.value
        const score = liveScore(match)
        await admin.from('mundial_matches').update({
          status: match.status,
          home_score: score.home,
          away_score: score.away,
          synced_at: now,
        }).eq('id', match.id)
        finalUpdates.push({ id: match.id, status: match.status, homeScore: score.home, awayScore: score.away, kickoffAt: null })
      }

      return NextResponse.json({ matches: finalUpdates })
    }

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
