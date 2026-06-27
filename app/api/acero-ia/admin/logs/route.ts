import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const model = searchParams.get('model')
  const userId = searchParams.get('userId')
  const format = searchParams.get('format')
  const limit = format === 'csv' ? 10000 : 30
  const offset = (page - 1) * limit

  let query = admin
    .from('aia_usage_logs')
    .select('id, user_id, model, tokens_input, tokens_output, cost_usd, conversation_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (model) query = query.eq('model', model)
  if (userId) query = query.eq('user_id', userId)

  query = query.range(offset, offset + limit - 1)

  const { data: logs, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((logs || []).map(l => l.user_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, email')
    .in('id', userIds.length > 0 ? userIds : ['none'])

  const profileMap = new Map((profiles || []).map(p => [p.id, p]))

  const enriched = (logs || []).map(l => {
    const p = profileMap.get(l.user_id)
    return {
      ...l,
      cost_usd: Number(l.cost_usd),
      userName: p?.name || p?.email || 'Usuario',
    }
  })

  if (format === 'csv') {
    const header = 'Fecha,Usuario,Modelo,Tokens Input,Tokens Output,Costo USD'
    const rows = enriched.map(l =>
      `${l.created_at},${l.userName},${l.model},${l.tokens_input},${l.tokens_output},${l.cost_usd}`
    )
    const csv = [header, ...rows].join('\n')
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="acero-ia-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({
    logs: enriched,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
