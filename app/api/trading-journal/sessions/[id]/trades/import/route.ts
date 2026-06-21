import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }

const MAX_IMPORT = 500

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: session } = await admin
    .from('tj_sessions')
    .select('id, instrument')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { trades } = body as { trades: Record<string, unknown>[] }

  if (!Array.isArray(trades) || trades.length === 0) {
    return NextResponse.json({ error: 'Array de trades vacío' }, { status: 400 })
  }
  if (trades.length > MAX_IMPORT) {
    return NextResponse.json({ error: `Máximo ${MAX_IMPORT} trades por importación` }, { status: 400 })
  }

  const errors: { index: number; message: string }[] = []
  const valid: Record<string, unknown>[] = []

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    if (!t.date_entry) {
      errors.push({ index: i, message: 'date_entry requerido' })
      continue
    }
    valid.push({
      session_id: id,
      date_entry: t.date_entry,
      date_exit: t.date_exit ?? null,
      instrument: t.instrument || session.instrument || null,
      direction: t.direction ?? null,
      result: t.result ?? null,
      rr_target: t.rr_target != null ? Number(t.rr_target) : null,
      rr_max: t.rr_max != null ? Number(t.rr_max) : null,
      rr_exit: t.rr_exit != null ? Number(t.rr_exit) : null,
      be_moved: Boolean(t.be_moved),
      notes: t.notes || null,
      risk_percent: t.risk_percent != null ? Number(t.risk_percent) : null,
      pnl_usd: t.pnl_usd != null ? Number(t.pnl_usd) : null,
      capital_start: t.capital_start != null ? Number(t.capital_start) : null,
      capital_end: t.capital_end != null ? Number(t.capital_end) : null,
      custom_fields: t.custom_fields ?? {},
    })
  }

  if (valid.length === 0) {
    return NextResponse.json({ inserted: 0, errors }, { status: 422 })
  }

  const { error } = await admin.from('tj_trades').insert(valid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: valid.length, errors }, { status: 201 })
}
