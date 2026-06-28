import { createAdminClient, createClient } from '@/lib/supabase-server'
import { computePots, prizeForMatch } from '@/lib/mundial/pot'
import { NextResponse } from 'next/server'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

export async function POST(request: Request) {
  const admin_user = await verifyAdmin()
  if (!admin_user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { profileId, amount } = await request.json()
  if (!profileId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()

  const [{ data: profile }, { data: matches }, { data: allBets }, { data: settings }] = await Promise.all([
    admin.from('mundial_profiles').select('id, saldo_adjustment').eq('id', profileId).single(),
    admin.from('mundial_matches').select('id, match_date, home_score, away_score, bet_amount, status'),
    admin.from('mundial_bets').select('id, profile_id, match_id, home_score_bet, away_score_bet, prize_paid, debt_offset'),
    admin.from('mundial_settings').select('bet_amount').eq('id', 1).single(),
  ])

  if (!profile || !matches || !allBets) {
    return NextResponse.json({ error: 'Datos no encontrados' }, { status: 404 })
  }

  const globalAmt = (settings as { bet_amount: number } | null)?.bet_amount ?? 5
  const { potMap, carryoverPerWinnerMap } = computePots(matches, allBets, globalAmt)

  const sortedFinished = matches
    .filter(m => m.status === 'FINISHED')
    .sort((a, b) => a.match_date.localeCompare(b.match_date))

  // Find this profile's unpaid winning bets, oldest first
  const winningBets: { betId: string; netPrize: number }[] = []
  for (const m of sortedFinished) {
    const bet = allBets.find(b =>
      b.profile_id === profileId &&
      b.match_id === m.id &&
      !b.prize_paid &&
      b.home_score_bet === m.home_score &&
      b.away_score_bet === m.away_score
    )
    if (!bet) continue
    const winners = allBets.filter(b =>
      b.match_id === m.id &&
      b.home_score_bet === m.home_score &&
      b.away_score_bet === m.away_score
    )
    const prize = prizeForMatch(m.id, winners.length, potMap, carryoverPerWinnerMap)
    const netPrize = prize - (bet.debt_offset ?? 0)
    if (netPrize > 0) winningBets.push({ betId: bet.id, netPrize })
  }

  // Mark bets as paid, oldest first, consuming the payment amount
  let remaining = amount
  const betsToPay: string[] = []

  for (const wb of winningBets) {
    if (remaining < wb.netPrize) break
    betsToPay.push(wb.betId)
    remaining -= wb.netPrize
  }

  // Mark bets as prize_paid
  if (betsToPay.length > 0) {
    await admin
      .from('mundial_bets')
      .update({ prize_paid: true })
      .in('id', betsToPay)
  }

  // If there's leftover amount not covered by full bet payouts, decrease saldo_adjustment
  if (remaining > 0) {
    const currentAdj = profile.saldo_adjustment ?? 0
    await admin
      .from('mundial_profiles')
      .update({ saldo_adjustment: currentAdj - remaining })
      .eq('id', profileId)
  }

  return NextResponse.json({ paid: amount, betsMarked: betsToPay.length, adjustment: remaining })
}
