import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function getOwnedSession(userId: string, sessionId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tj_sessions')
    .select('id, type')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedSession(user.id, id)
  if (!owned) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await request.json()
  const allowed = ['name', 'description', 'instrument', 'capital_initial', 'is_archived', 'is_favorite', 'sync_paused']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (updates.name && typeof updates.name === 'string') updates.name = (updates.name as string).trim()

  const admin = createAdminClient()
  const { data: session, error } = await admin
    .from('tj_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedSession(user.id, id)
  if (!owned) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin.from('tj_sessions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
