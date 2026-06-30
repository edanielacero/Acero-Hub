import { createAdminClient } from '@/lib/supabase-server'
import { getWCMatchesByDateRange, liveScore } from '@/lib/mundial/football-api'
import { autoBetDani } from '@/lib/mundial/auto-bet'
import { NextResponse } from 'next/server'

// Syncs all WC matches from the last 2 days to tomorrow.
// Runs every 60s from the frontend to keep the DB current:
// catches score corrections, status transitions, and matches that
// the live poller missed (e.g. finished while no one was watching).
export async function GET() {
  try {
    const now = Date.now()
    const fmt = (ms: number) => new Date(ms).toISOString().split('T')[0]
    const dateFrom = fmt(now - 2 * 24 * 60 * 60 * 1000)
    const dateTo   = fmt(now + 24 * 60 * 60 * 1000)

    const apiMatches = await getWCMatchesByDateRange(dateFrom, dateTo)
    if (!apiMatches.length) return NextResponse.json({ matches: [] })

    const admin = createAdminClient()
    const synced_at = new Date().toISOString()

    const rows = apiMatches.map(m => {
      const score = liveScore(m)
      return { id: m.id, status: m.status, home_score: score.home, away_score: score.away, synced_at }
    })

    await admin.from('mundial_matches').upsert(rows, { onConflict: 'id' })
    await autoBetDani().catch(() => {})

    return NextResponse.json({
      matches: apiMatches.map(m => {
        const score = liveScore(m)
        return { id: m.id, status: m.status, homeScore: score.home, awayScore: score.away }
      }),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
