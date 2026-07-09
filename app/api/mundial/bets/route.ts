import { createAdminClient } from '@/lib/supabase-server'
import { isClosed } from '@/lib/mundial/football-api'
import { computePots, prizeForMatch } from '@/lib/mundial/pot'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(request: Request) {
  const { token, matchId, homeScore, awayScore, payWithSaldo, receiptUrl } = await request.json()

  if (!token || matchId == null || homeScore == null || awayScore == null)
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('mundial_profiles').select('id, name').eq('token', token).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

  const { data: match } = await admin
    .from('mundial_matches').select('match_date, status, bet_amount, home_team, away_team').eq('id', matchId).single()
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
  // Kept outside if-block so the debt_offset section below can reuse it
  let saldoPotMap: Record<number, number> = {}
  let saldoCarryoverPW: Record<number, number> = {}
  let saldoAllBets: { match_id: number; home_score_bet: number; away_score_bet: number }[] = []
  let saldoBetAmount = match.bet_amount ?? 5

  if (payWithSaldo) {
    // Server-side saldo validation: compute actual available saldo before accepting
    const { data: settings } = await admin.from('mundial_settings').select('bet_amount').eq('id', 1).single()
    const globalBetAmount = (settings as { bet_amount: number } | null)?.bet_amount ?? 5
    saldoBetAmount = match.bet_amount ?? globalBetAmount

    const [{ data: allMatches }, { data: allBets }, { data: profileBetsForSaldo }] = await Promise.all([
      admin.from('mundial_matches').select('id, match_date, status, home_score, away_score, bet_amount'),
      admin.from('mundial_bets').select('match_id, home_score_bet, away_score_bet'),
      admin.from('mundial_bets').select('match_id, home_score_bet, away_score_bet, debt_offset, prize_paid, payment_confirmed').eq('profile_id', profile.id),
    ])

    const { potMap, carryoverPerWinnerMap } = computePots(allMatches ?? [], allBets ?? [], globalBetAmount)
    saldoPotMap = potMap
    saldoCarryoverPW = carryoverPerWinnerMap
    saldoAllBets = allBets ?? []

    const finishedMatches = (allMatches ?? []).filter(m => m.status === 'FINISHED')

    let totalPrize = 0
    let totalDebtOffset = 0
    let unpaidFees = 0
    for (const b of profileBetsForSaldo ?? []) {
      const fm = finishedMatches.find(m => m.id === b.match_id)
      if (!fm) {
        if (!b.payment_confirmed) unpaidFees += (allMatches ?? []).find(m => m.id === b.match_id)?.bet_amount ?? globalBetAmount
        continue
      }
      if (b.prize_paid) continue
      if (b.home_score_bet !== fm.home_score || b.away_score_bet !== fm.away_score) continue
      const winners = (allBets ?? []).filter(ab => ab.match_id === fm.id && ab.home_score_bet === fm.home_score && ab.away_score_bet === fm.away_score).length
      totalPrize += prizeForMatch(fm.id, winners, potMap, carryoverPerWinnerMap)
      totalDebtOffset += b.debt_offset ?? 0
    }
    const availableSaldo = Math.max(0, totalPrize - totalDebtOffset - unpaidFees)

    if (availableSaldo < saldoBetAmount) {
      return NextResponse.json({ error: `Saldo insuficiente (disponible: Bs ${availableSaldo}, necesario: Bs ${saldoBetAmount})` }, { status: 400 })
    }

    upsertData.payment_confirmed = true
    upsertData.paid_with_saldo = true
  } else if (receiptUrl) {
    upsertData.receipt_url = receiptUrl
    upsertData.payment_confirmed = true
  }
  // No payWithSaldo and no receiptUrl → payment_confirmed stays false (debt)

  const { error } = await admin.from('mundial_bets').upsert(upsertData, { onConflict: 'profile_id,match_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Email admin when a QR receipt is uploaded
  if (receiptUrl) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const from = process.env.RESEND_FROM ?? 'noreply@acrosoftlabs.com'
      const matchDate = new Date(match.match_date).toLocaleString('es-BO', {
        timeZone: 'America/La_Paz', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      })
      const { data: settings } = await admin.from('mundial_settings').select('bet_amount').eq('id', 1).single()
      const betAmt = match.bet_amount ?? (settings as { bet_amount: number } | null)?.bet_amount ?? 5

      // Fetch receipt image to attach it
      let attachments: { filename: string; content: Buffer }[] = []
      try {
        const imgRes = await fetch(receiptUrl)
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer())
          const ext = receiptUrl.split('.').pop()?.split('?')[0] ?? 'jpg'
          attachments = [{ filename: `comprobante-${profile.name}.${ext}`, content: buf }]
        }
      } catch { /* skip attachment if fetch fails */ }

      await resend.emails.send({
        from,
        to: 'e.daniel.acero.r@gmail.com',
        subject: `Comprobante de pago — ${profile.name} · ${match.home_team} vs ${match.away_team}`,
        html: `
          <h2>Nuevo comprobante de pago</h2>
          <p><strong>Jugador:</strong> ${profile.name}</p>
          <p><strong>Partido:</strong> ${match.home_team} vs ${match.away_team}</p>
          <p><strong>Fecha:</strong> ${matchDate} (hora Bolivia)</p>
          <p><strong>Predicción:</strong> ${homeScore} – ${awayScore}</p>
          <p><strong>Monto:</strong> Bs ${betAmt}</p>
          <p><strong>Comprobante:</strong> <a href="${receiptUrl}">Ver imagen</a></p>
        `,
        attachments,
      })
    } catch { /* email is best-effort, don't fail the bet */ }
  }

  // When paying with saldo: increment debt_offset on the oldest unpaid winning bet
  if (payWithSaldo) {
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
          const newOffset = (winBet.debt_offset ?? 0) + saldoBetAmount
          const winners = saldoAllBets.filter(b =>
            b.match_id === fm.id && b.home_score_bet === fm.home_score && b.away_score_bet === fm.away_score
          ).length
          const prize = prizeForMatch(fm.id, winners, saldoPotMap, saldoCarryoverPW)
          const fullyPaid = newOffset >= prize
          await admin.from('mundial_bets')
            .update({ debt_offset: newOffset, ...(fullyPaid ? { prize_paid: true } : {}) })
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
