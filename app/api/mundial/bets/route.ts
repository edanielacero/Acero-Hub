import { createAdminClient } from '@/lib/supabase-server'
import { isClosed } from '@/lib/mundial/football-api'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, matchId, homeScore, awayScore, paymentConfirmed, payWithSaldo } = await request.json()

  if (!token || matchId == null || homeScore == null || awayScore == null)
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('mundial_profiles').select('id').eq('token', token).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: match } = await admin
    .from('mundial_matches').select('match_date, status, bet_amount').eq('id', matchId).single()
  if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })

  if (isClosed(match.match_date))
    return NextResponse.json({ error: 'Las apuestas están cerradas' }, { status: 400 })

  const upsertData: Record<string, unknown> = {
    profile_id: profile.id,
    match_id: matchId,
    home_score_bet: homeScore,
    away_score_bet: awayScore,
    updated_at: new Date().toISOString(),
  }
  if (payWithSaldo) { upsertData.payment_confirmed = true; upsertData.paid_with_saldo = true }
  else if (paymentConfirmed !== undefined) upsertData.payment_confirmed = paymentConfirmed

  const { error } = await admin.from('mundial_bets').upsert(upsertData, { onConflict: 'profile_id,match_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When paying with saldo: increment debt_offset on the oldest unpaid winning bet
  if (payWithSaldo) {
    const { data: settings } = await admin.from('mundial_settings').select('bet_amount').eq('id', 1).single()
    const amount = match.bet_amount ?? (settings as { bet_amount: number } | null)?.bet_amount ?? 5

    const { data: profileBets } = await admin
      .from('mundial_bets')
      .select('id, match_id, home_score_bet, away_score_bet, debt_offset')
      .eq('profile_id', profile.id)
      .eq('prize_paid', false)

    if (profileBets?.length) {
      const betMatchIds = [...new Set(profileBets.map(b => b.match_id))]
      const { data: finishedMatches } = await admin
        .from('mundial_matches')
        .select('id, home_score, away_score')
        .in('id', betMatchIds)
        .eq('status', 'FINISHED')
        .order('match_date', { ascending: true })

      for (const fm of finishedMatches ?? []) {
        const winBet = profileBets.find(b =>
          b.match_id === fm.id && b.home_score_bet === fm.home_score && b.away_score_bet === fm.away_score
        )
        if (winBet) {
          await admin.from('mundial_bets')
            .update({ debt_offset: (winBet.debt_offset ?? 0) + amount })
            .eq('id', winBet.id)
          break
        }
      }
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { token, matchId } = await request.json()
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('mundial_profiles').select('id').eq('token', token).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: match } = await admin
    .from('mundial_matches').select('match_date, bet_amount').eq('id', matchId).single()
  if (!match || isClosed(match.match_date))
    return NextResponse.json({ error: 'No se puede eliminar' }, { status: 400 })

  // Check if bet was paid with saldo — need to refund debt_offset
  const { data: bet } = await admin
    .from('mundial_bets')
    .select('id, paid_with_saldo')
    .eq('profile_id', profile.id)
    .eq('match_id', matchId)
    .single()

  if (bet?.paid_with_saldo) {
    const { data: settings } = await admin.from('mundial_settings').select('bet_amount').eq('id', 1).single()
    const amount = match.bet_amount ?? (settings as { bet_amount: number } | null)?.bet_amount ?? 5

    // Find winning bets with debt_offset > 0 to reverse the charge
    const { data: profileBets } = await admin
      .from('mundial_bets')
      .select('id, match_id, home_score_bet, away_score_bet, debt_offset')
      .eq('profile_id', profile.id)
      .eq('prize_paid', false)
      .gt('debt_offset', 0)

    if (profileBets?.length) {
      const betMatchIds = [...new Set(profileBets.map(b => b.match_id))]
      const { data: finishedMatches } = await admin
        .from('mundial_matches')
        .select('id, home_score, away_score')
        .in('id', betMatchIds)
        .eq('status', 'FINISHED')
        .order('match_date', { ascending: false })

      let remaining = amount
      for (const fm of finishedMatches ?? []) {
        if (remaining <= 0) break
        const winBet = profileBets.find(b =>
          b.match_id === fm.id && b.home_score_bet === fm.home_score && b.away_score_bet === fm.away_score
        )
        if (!winBet || (winBet.debt_offset ?? 0) <= 0) continue
        const reduce = Math.min(remaining, winBet.debt_offset ?? 0)
        await admin.from('mundial_bets')
          .update({ debt_offset: (winBet.debt_offset ?? 0) - reduce })
          .eq('id', winBet.id)
        remaining -= reduce
      }
    }
  }

  await admin.from('mundial_bets')
    .delete().eq('profile_id', profile.id).eq('match_id', matchId)

  return NextResponse.json({ success: true })
}
