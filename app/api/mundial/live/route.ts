import { createAdminClient } from '@/lib/supabase-server'
import { getMatch, isLive, liveScore } from '@/lib/mundial/football-api'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const matchId = searchParams.get('id')
  if (!matchId) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  try {
    const [match, admin] = [await getMatch(Number(matchId)), createAdminClient()]
    const score = liveScore(match)

    // Read current DB row to detect IN_PLAY transition and avoid overwriting kickoff_at
    const { data: current } = await admin
      .from('mundial_matches')
      .select('status, kickoff_at')
      .eq('id', match.id)
      .single()

    const updateData: Record<string, unknown> = {
      status: match.status,
      home_score: score.home,
      away_score: score.away,
      synced_at: new Date().toISOString(),
    }

    // When match first goes IN_PLAY, record the actual kick-off time.
    // Subtract 60s to compensate for football-data.org free-tier live delay.
    if (isLive(match.status) && current && !isLive(current.status as string) && !current.kickoff_at) {
      updateData.kickoff_at = new Date(Date.now() - 60_000).toISOString()
    }

    await admin.from('mundial_matches').update(updateData).eq('id', match.id)

    return NextResponse.json({
      id: match.id,
      status: match.status,
      homeScore: score.home,
      awayScore: score.away,
      kickoffAt: (updateData.kickoff_at ?? current?.kickoff_at ?? null) as string | null,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
