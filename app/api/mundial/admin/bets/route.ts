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

  const { betId, payment_confirmed, prize_paid } = await request.json()
  if (!betId) return NextResponse.json({ error: 'Falta betId' }, { status: 400 })

  const update: Record<string, boolean> = {}
  if (payment_confirmed !== undefined) update.payment_confirmed = payment_confirmed
  if (prize_paid !== undefined) update.prize_paid = prize_paid

  const admin = createAdminClient()
  const { error } = await admin.from('mundial_bets').update(update).eq('id', betId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
