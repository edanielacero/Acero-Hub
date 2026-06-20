import { createAdminClient } from '@/lib/supabase-server'
import { isClosed } from '@/lib/mundial/football-api'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, matchId, homeScore, awayScore } = await request.json()

  if (!token || matchId == null || homeScore == null || awayScore == null)
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('mundial_profiles').select('id').eq('token', token).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: match } = await admin
    .from('mundial_matches').select('match_date, status').eq('id', matchId).single()
  if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })

  if (isClosed(match.match_date))
    return NextResponse.json({ error: 'Las apuestas están cerradas' }, { status: 400 })

  const { error } = await admin.from('mundial_bets').upsert({
    profile_id: profile.id,
    match_id: matchId,
    home_score_bet: homeScore,
    away_score_bet: awayScore,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,match_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { token, matchId } = await request.json()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('mundial_profiles').select('id').eq('token', token).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: match } = await admin
    .from('mundial_matches').select('match_date').eq('id', matchId).single()
  if (!match || isClosed(match.match_date))
    return NextResponse.json({ error: 'No se puede eliminar' }, { status: 400 })

  await admin.from('mundial_bets')
    .delete().eq('profile_id', profile.id).eq('match_id', matchId)

  return NextResponse.json({ success: true })
}
