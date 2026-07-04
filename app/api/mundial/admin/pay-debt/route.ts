import { createAdminClient, createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// Registers a partial or full debt payment for a profile.
// Allocates from oldest unpaid bet to newest. If the amount doesn't cover
// a full bet, records partial coverage (amount_paid) without marking confirmed.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { profileId, amount } = await request.json()
  if (!profileId || !amount || amount <= 0)
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

  const admin = createAdminClient()

  const { data: settings } = await admin.from('mundial_settings').select('bet_amount').eq('id', 1).single()
  const globalBetAmount = (settings as { bet_amount: number } | null)?.bet_amount ?? 5

  // Get unpaid bets with their match info, sorted oldest first
  const { data: unpaidBets } = await admin
    .from('mundial_bets')
    .select('id, match_id, amount_paid')
    .eq('profile_id', profileId)
    .eq('payment_confirmed', false)

  if (!unpaidBets?.length) return NextResponse.json({ covered: 0 }, { status: 200 })

  const matchIds = unpaidBets.map(b => b.match_id)
  const { data: matchRows } = await admin
    .from('mundial_matches')
    .select('id, match_date, bet_amount')
    .in('id', matchIds)
    .order('match_date', { ascending: true })

  // Sort bets by match date ascending (oldest first)
  const sorted = (matchRows ?? [])
    .map(m => {
      const bet = unpaidBets.find(b => b.match_id === m.id)!
      return { bet, betAmt: m.bet_amount ?? globalBetAmount }
    })

  let remaining = amount
  let covered = 0

  for (const { bet, betAmt } of sorted) {
    if (remaining <= 0) break
    const alreadyPaid = bet.amount_paid ?? 0
    const stillOwed = betAmt - alreadyPaid
    if (stillOwed <= 0) continue

    if (remaining >= stillOwed) {
      await admin.from('mundial_bets')
        .update({ payment_confirmed: true, amount_paid: betAmt })
        .eq('id', bet.id)
      remaining -= stillOwed
      covered++
    } else {
      await admin.from('mundial_bets')
        .update({ amount_paid: alreadyPaid + remaining })
        .eq('id', bet.id)
      remaining = 0
    }
  }

  return NextResponse.json({ covered, leftover: remaining })
}
