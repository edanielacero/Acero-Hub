import { createAdminClient, requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { supabase, userId, claims } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (claims?.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  await supabase.from('project_access').delete().eq('user_id', id)
  await supabase.from('profiles').delete().eq('id', id)
  // auth.admin.deleteUser() es una llamada a la Auth API, no a una tabla —
  // no hay policy de RLS que la reemplace, se queda con el cliente admin.
  await createAdminClient().auth.admin.deleteUser(id)

  return NextResponse.json({ success: true })
}
