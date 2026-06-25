import { createAdminClient, createClient } from '@/lib/supabase-server'
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

  const { fromProfileId, toProfileId, amount } = await request.json()
  if (!fromProfileId || !toProfileId || !amount || amount <= 0)
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  if (fromProfileId === toProfileId)
    return NextResponse.json({ error: 'No puedes traspasar a ti mismo' }, { status: 400 })

  const admin = createAdminClient()

  // Find the oldest unpaid winning bet for the source profile to deduct from
  const { data: sourceBets } = await admin
    .from('mundial_bets')
    .select('id, match_id, home_score_bet, away_score_bet, debt_offset, paid_note')
    .eq('profile_id', fromProfileId)
    .eq('prize_paid', false)

  if (!sourceBets?.length)
    return NextResponse.json({ error: 'El perfil origen no tiene saldo pendiente' }, { status: 400 })

  const sourceMatchIds = [...new Set(sourceBets.map(b => b.match_id))]
  const { data: finishedMatches } = await admin
    .from('mundial_matches')
    .select('id, home_score, away_score')
    .in('id', sourceMatchIds)
    .eq('status', 'FINISHED')
    .order('match_date', { ascending: true })

  // Find winning bets with remaining saldo, oldest first
  let remaining = amount
  const updates: { id: string; newOffset: number; newNote: string }[] = []

  const { data: toProfile } = await admin
    .from('mundial_profiles')
    .select('name')
    .eq('id', toProfileId)
    .single()
  const toName = toProfile?.name ?? 'Desconocido'

  for (const fm of finishedMatches ?? []) {
    if (remaining <= 0) break
    const winBet = sourceBets.find(b =>
      b.match_id === fm.id && b.home_score_bet === fm.home_score && b.away_score_bet === fm.away_score
    )
    if (!winBet) continue

    // Compute how much saldo remains in this bet
    const allWinners = sourceBets.filter(b =>
      b.match_id === fm.id && b.home_score_bet === fm.home_score && b.away_score_bet === fm.away_score
    )
    // We need the pot to compute prize — get all bets for this match
    const { data: matchBets } = await admin
      .from('mundial_bets')
      .select('id')
      .eq('match_id', fm.id)
    const { data: matchInfo } = await admin
      .from('mundial_matches')
      .select('bet_amount')
      .eq('id', fm.id)
      .single()
    const { data: settings } = await admin
      .from('mundial_settings')
      .select('bet_amount')
      .eq('id', 1)
      .single()

    const betAmt = matchInfo?.bet_amount ?? (settings as { bet_amount: number } | null)?.bet_amount ?? 5
    const pot = (matchBets?.length ?? 0) * betAmt
    const prize = allWinners.length > 0 ? Math.floor(pot / allWinners.length) : 0
    const currentOffset = winBet.debt_offset ?? 0
    const availableSaldo = prize - currentOffset
    if (availableSaldo <= 0) continue

    const deduct = Math.min(remaining, availableSaldo)
    const existingNote = winBet.paid_note ? winBet.paid_note + ' | ' : ''
    updates.push({
      id: winBet.id,
      newOffset: currentOffset + deduct,
      newNote: `${existingNote}Traspaso de Bs ${deduct} a ${toName}`,
    })
    remaining -= deduct
  }

  if (remaining > 0 && updates.length === 0)
    return NextResponse.json({ error: 'Saldo insuficiente' }, { status: 400 })

  // Apply debt_offset updates on source bets
  for (const u of updates) {
    await admin.from('mundial_bets')
      .update({ debt_offset: u.newOffset, paid_note: u.newNote })
      .eq('id', u.id)
  }

  // Increase saldo_adjustment on destination profile
  const { data: destProfile } = await admin
    .from('mundial_profiles')
    .select('saldo_adjustment')
    .eq('id', toProfileId)
    .single()
  const currentAdj = (destProfile as { saldo_adjustment: number } | null)?.saldo_adjustment ?? 0
  const transferred = amount - remaining

  await admin.from('mundial_profiles')
    .update({ saldo_adjustment: currentAdj + transferred })
    .eq('id', toProfileId)

  return NextResponse.json({ transferred, remaining })
}
