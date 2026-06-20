import { createAdminClient } from '@/lib/supabase-server'
import { getMatch, liveScore } from '@/lib/football-api'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const matchId = searchParams.get('id')
  if (!matchId) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  try {
    const match = await getMatch(Number(matchId))
    const score = liveScore(match)
    const admin = createAdminClient()

    await admin.from('mundial_matches').update({
      status: match.status,
      home_score: score.home,
      away_score: score.away,
      synced_at: new Date().toISOString(),
    }).eq('id', match.id)

    return NextResponse.json({
      id: match.id,
      status: match.status,
      homeScore: score.home,
      awayScore: score.away,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
