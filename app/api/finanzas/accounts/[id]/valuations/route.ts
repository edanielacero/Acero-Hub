import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

interface Params { params: Promise<{ id: string }> }

async function getOwnedAccount(accountId: string, userId: string, supabase: Awaited<ReturnType<typeof requireUser>>['supabase']) {
  const { data } = await supabase
    .from('fin_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await getOwnedAccount(id, userId, supabase)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: valuations, error } = await supabase
    .from('fin_asset_valuations')
    .select('*')
    .eq('account_id', id)
    .order('valued_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ valuations })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [account, body] = await Promise.all([getOwnedAccount(id, userId, supabase), req.json()])
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const valueUsd = Number(body.value_usd)
  if (!Number.isFinite(valueUsd) || valueUsd < 0) {
    return NextResponse.json({ error: 'El valor en USD debe ser un número mayor o igual a 0' }, { status: 400 })
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  const { data: valuation, error } = await supabase
    .from('fin_asset_valuations')
    .insert({ account_id: id, value_usd: valueUsd, source: 'manual', note })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ valuation }, { status: 201 })
}
