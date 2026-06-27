import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { data: limits } = await admin
    .from('aia_usage_limits')
    .select('id, user_id, monthly_limit, is_unlimited, limit_start')
    .order('created_at', { ascending: false })

  const userIds = (limits || []).map(l => l.user_id)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, email')
    .in('id', userIds.length > 0 ? userIds : ['none'])

  const profileMap = new Map((profiles || []).map(p => [p.id, p]))

  const result = (limits || []).map(l => {
    const p = profileMap.get(l.user_id)
    return {
      ...l,
      monthly_limit: Number(l.monthly_limit),
      userName: p?.name || p?.email || 'Usuario',
    }
  })

  return NextResponse.json(result)
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  const { userId, monthlyLimit, isUnlimited } = body
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof monthlyLimit === 'number') updates.monthly_limit = monthlyLimit
  if (typeof isUnlimited === 'boolean') updates.is_unlimited = isUnlimited

  const { error } = await admin
    .from('aia_usage_limits')
    .update(updates)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
