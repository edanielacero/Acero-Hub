import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const admin = createAdminClient()
  await admin.from('project_access').delete().eq('user_id', id)
  await admin.from('profiles').delete().eq('id', id)
  await admin.auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
