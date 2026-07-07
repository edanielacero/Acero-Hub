import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { runMontecarlo, buildResultsArray, buildManualResults, MontecarloMode } from '@/lib/trading/montecarlo'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const [sessionRes, tradesRes] = await Promise.all([
    admin.from('tj_sessions').select('id, type, name').eq('id', id).eq('user_id', user.id).single(),
    admin.from('tj_trades').select('result, rr_exit, risk_percent, pnl_usd, capital_start').eq('session_id', id),
  ])

  if (!sessionRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = sessionRes.data
  const trades  = tradesRes.data ?? []

  const body = await req.json()
  const {
    capitalInitial = 10000,
    riskPct        = 1,
    nSimulations   = 10000,
    nTrades,
    mode           = 'hwm' as MontecarloMode,
    useRealTrades  = true,
    manualWinrate,
    manualRrWin,
    manualRrLoss,
    dalembertIncrement = 0.5,
    dalembertLimit     = 3,
  } = body

  const results = useRealTrades
    ? buildResultsArray(trades, session.type)
    : buildManualResults(manualWinrate ?? 50, manualRrWin ?? 1.5, manualRrLoss ?? 1)

  if (results.length === 0 && useRealTrades) {
    return NextResponse.json({ error: 'No hay trades con datos suficientes para simular' }, { status: 400 })
  }

  const tradesPerSim = nTrades ?? results.length

  const result = runMontecarlo({
    results,
    capitalInitial: Number(capitalInitial),
    riskPct:        Number(riskPct),
    nSimulations:   Math.min(Math.max(Number(nSimulations), 100), 10000),
    nTrades:        Math.max(Number(tradesPerSim), 1),
    mode,
    dalembertIncrement: Number(dalembertIncrement),
    dalembertLimit:     Number(dalembertLimit),
  })

  return NextResponse.json({
    ...result,
    sessionName: session.name,
    sessionType: session.type,
    tradeCount:  trades.length,
    winrate:     results.length > 0
      ? (results.filter(r => r > 0).length / results.length) * 100
      : 0,
    rrAvg: results.length > 0
      ? results.reduce((s, r) => s + r, 0) / results.length
      : 0,
  })
}
