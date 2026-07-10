import { createAdminClient } from '@/lib/supabase-server'
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  await admin.from('mundial_settings').update({ updated_at: new Date().toISOString() }).eq('id', 1)

  return NextResponse.json({ ok: true })
}
