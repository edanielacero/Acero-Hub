import { createAdminClient, createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// Admin: add a manual bet for any profile
export async function POST(request: Request) {
  const admin_user = await verifyAdmin()
  if (!admin_user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { profileId, matchId, homeScore, awayScore } = await request.json()
  if (!profileId || !matchId) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('mundial_bets').upsert({
    profile_id: profileId,
    match_id: matchId,
    home_score_bet: homeScore,
    away_score_bet: awayScore,
  }, { onConflict: 'profile_id,match_id' }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Admin: toggle payment_confirmed or prize_paid
export async function PATCH(request: Request) {
  const admin_user = await verifyAdmin()
  if (!admin_user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { betId, payment_confirmed, prize_paid, profileId, settleAmount } = await request.json()
  if (!betId) return NextResponse.json({ error: 'Falta betId' }, { status: 400 })

  const admin = createAdminClient()

  const update: Record<string, boolean> = {}
  if (payment_confirmed !== undefined) update.payment_confirmed = payment_confirmed
  if (prize_paid !== undefined) update.prize_paid = prize_paid

  const { error } = await admin.from('mundial_bets').update(update).eq('id', betId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When marking prize as paid, confirm only the cuotas needed to cover the settled debt.
  // settleAmount = min(prize, total_debt) — passed from frontend which already knows both values.
  if (prize_paid === true && profileId && settleAmount && settleAmount > 0) {
    // Fetch pending entry fees for this profile, oldest first
    const { data: pendingBets } = await admin
      .from('mundial_bets')
      .select('id, match_id')
      .eq('profile_id', profileId)
      .eq('payment_confirmed', false)
      .order('created_at', { ascending: true })

    if (pendingBets?.length) {
      const matchIds = [...new Set(pendingBets.map(b => b.match_id))]
      const [{ data: matchRows }, { data: settings }] = await Promise.all([
        admin.from('mundial_matches').select('id, bet_amount').in('id', matchIds),
        admin.from('mundial_settings').select('bet_amount').eq('id', 1).single(),
      ])
      const globalAmt: number = (settings as { bet_amount: number } | null)?.bet_amount ?? 5
      const amtByMatch: Record<number, number> = Object.fromEntries((matchRows ?? []).map(m => [m.id, m.bet_amount ?? globalAmt]))

      let remaining = settleAmount
      const toConfirm: string[] = []
      for (const pb of pendingBets) {
        if (remaining <= 0) break
        toConfirm.push(pb.id)
        remaining -= amtByMatch[pb.match_id] ?? globalAmt
      }

      if (toConfirm.length > 0) {
        const { error: cuotaError } = await admin
          .from('mundial_bets')
          .update({ payment_confirmed: true })
          .in('id', toConfirm)
        if (cuotaError) return NextResponse.json({ error: cuotaError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
