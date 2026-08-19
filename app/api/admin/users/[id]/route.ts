import { createAdminClient, requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { supabase, userId, claims } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (claims?.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const { name, email } = await req.json()
  const updates: { name?: string; email?: string } = {}

  if (typeof name === 'string') {
    const trimmed = name.trim()
    if (!trimmed) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
    updates.name = trimmed
  }

  if (typeof email === 'string') {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return NextResponse.json({ error: 'El correo no puede estar vacío' }, { status: 400 })
    // auth.users es la fuente real del login — hay que sincronizarlo ahí
    // también, no solo en profiles.email, o el usuario quedaría entrando
    // con un correo distinto al que ve el admin.
    const { error: authError } = await createAdminClient().auth.admin.updateUserById(id, { email: trimmed })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    updates.email = trimmed
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}

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
