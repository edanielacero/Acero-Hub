import { createAdminClient } from '@/lib/supabase-server'
import { getMatch } from '@/lib/football-api'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const matchId = searchParams.get('id')
  if (!matchId) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  try {
    const match = await getMatch(Number(matchId))
    const admin = createAdminClient()

    await admin.from('mundial_matches').update({
      status: match.status,
      home_score: match.score.fullTime.home,
      away_score: match.score.fullTime.away,
      synced_at: new Date().toISOString(),
    }).eq('id', match.id)

    return NextResponse.json({
      id: match.id,
      status: match.status,
      homeScore: match.score.fullTime.home,
      awayScore: match.score.fullTime.away,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
