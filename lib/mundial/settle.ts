import { createAdminClient } from '@/lib/supabase-server'

export async function settleDebts(): Promise<number> {
  const admin = createAdminClient()

  const [{ data: profiles }, { data: matches }, { data: bets }, { data: settings }] = await Promise.all([
    admin.from('mundial_profiles').select('id, saldo_adjustment'),
    admin.from('mundial_matches').select('id, match_date, home_score, away_score, bet_amount').not('home_score', 'is', null),
    admin.from('mundial_bets').select('id, profile_id, match_id, home_score_bet, away_score_bet, payment_confirmed, prize_paid, debt_offset'),
    admin.from('mundial_settings').select('bet_amount').eq('id', 1).single(),
  ])

  if (!profiles || !matches || !bets) return 0

  const globalAmt = (settings as { bet_amount: number } | null)?.bet_amount ?? 5
  const sortedFinished = [...matches].sort((a, b) => a.match_date.localeCompare(b.match_date))

  const potMap: Record<number, number> = {}
  let carry = 0
  for (const m of sortedFinished) {
    const mBets = bets.filter(b => b.match_id === m.id)
    const pot = mBets.length * (m.bet_amount ?? globalAmt) + carry
    potMap[m.id] = pot
    const hasWinner = mBets.some(b => b.home_score_bet === m.home_score && b.away_score_bet === m.away_score)
    carry = hasWinner ? 0 : pot
  }

  let totalSettled = 0

  for (const prof of profiles) {
    const unpaidCuotas = bets
      .filter(b => b.profile_id === prof.id && !b.payment_confirmed)
      .sort((a, b) => {
        const ma = matches.find(m => m.id === a.match_id)
        const mb = matches.find(m => m.id === b.match_id)
        return (ma?.match_date ?? '').localeCompare(mb?.match_date ?? '')
      })

    if (unpaidCuotas.length === 0) continue

    const winningBets: { betId: string; prize: number; existingOffset: number; available: number }[] = []
    for (const m of sortedFinished) {
      const profBet = bets.find(b =>
        b.profile_id === prof.id &&
        b.match_id === m.id &&
        !b.prize_paid &&
        b.home_score_bet === m.home_score &&
        b.away_score_bet === m.away_score
      )
      if (!profBet) continue
      const winners = bets.filter(b =>
        b.match_id === m.id &&
        b.home_score_bet === m.home_score &&
        b.away_score_bet === m.away_score
      )
      const prize = winners.length > 0 ? Math.floor(potMap[m.id] / winners.length) : 0
      const existingOffset = profBet.debt_offset ?? 0
      const available = prize - existingOffset
      if (available > 0) winningBets.push({ betId: profBet.id, prize, existingOffset, available })
    }

    if (winningBets.length === 0) continue

    const totalAvailable = winningBets.reduce((s, w) => s + w.available, 0)
    if (totalAvailable <= 0) continue

    const cuotasToConfirm: string[] = []
    let debtToSettle = 0
    for (const cuota of unpaidCuotas) {
      const m = matches.find(mx => mx.id === cuota.match_id)
      const amt = m?.bet_amount ?? globalAmt
      if (debtToSettle + amt > totalAvailable) break
      cuotasToConfirm.push(cuota.id)
      debtToSettle += amt
    }

    if (cuotasToConfirm.length === 0) continue

    let remaining = debtToSettle
    const offsetUpdates: { betId: string; newOffset: number }[] = []
    for (const w of winningBets) {
      if (remaining <= 0) break
      const absorb = Math.min(remaining, w.available)
      offsetUpdates.push({ betId: w.betId, newOffset: w.existingOffset + absorb })
      remaining -= absorb
    }

    await admin
      .from('mundial_bets')
      .update({ payment_confirmed: true, paid_with_saldo: true })
      .in('id', cuotasToConfirm)

    for (const u of offsetUpdates) {
      await admin
        .from('mundial_bets')
        .update({ debt_offset: u.newOffset })
        .eq('id', u.betId)
    }

    totalSettled += cuotasToConfirm.length
  }

  return totalSettled
}
