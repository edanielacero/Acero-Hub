import { createAdminClient } from '@/lib/supabase-server'
import { getTodayMatches, isLive, liveScore } from '@/lib/mundial/football-api'
import { NextResponse } from 'next/server'

// Uses GET /v4/matches — the real-time, uncached endpoint football-data.org uses
// on their own homepage. Returns today's matches across all competitions.
// We filter to WC matches by cross-referencing IDs already in our DB.
export async function GET() {
  try {
    const admin = createAdminClient()

    const [apiMatches, { data: dbMatches }] = await Promise.all([
      getTodayMatches(),
      admin.from('mundial_matches').select('id, match_date, status'),
    ])

    if (!apiMatches.length || !dbMatches?.length) return NextResponse.json({ matches: [] })

    const wcIds = new Set(dbMatches.map(m => m.id))
    const now = Date.now()

    // Keep only WC matches that need monitoring:
    // live, recently finished (<3h after kick-off), or starting soon (<2h)
    const relevant = apiMatches.filter(m => {
      if (!wcIds.has(m.id)) return false
      const kickoff = new Date(m.utcDate).getTime()
      return (
        isLive(m.status) ||
        (m.status === 'FINISHED' && now - kickoff < 3 * 60 * 60 * 1000) ||
        ((m.status === 'SCHEDULED' || m.status === 'TIMED') && kickoff - now < 2 * 60 * 60 * 1000)
      )
    })

    if (!relevant.length) return NextResponse.json({ matches: [] })

    const synced_at = new Date().toISOString()
    const rows = relevant.map(m => {
      const score = liveScore(m)
      return { id: m.id, status: m.status, home_score: score.home, away_score: score.away, synced_at }
    })

    await admin.from('mundial_matches').upsert(rows, { onConflict: 'id' })

    return NextResponse.json({
      matches: relevant.map(m => {
        const score = liveScore(m)
        return { id: m.id, status: m.status, homeScore: score.home, awayScore: score.away }
      }),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
