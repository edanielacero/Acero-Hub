import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function getOwnedSession(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], userId: string, sessionId: string) {
  const { data } = await supabase
    .from('tj_sessions')
    .select('id, type')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedSession(supabase, userId, id)
  if (!owned) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await request.json()
  const allowed = ['name', 'description', 'instrument', 'capital_initial', 'is_archived', 'is_favorite', 'sync_paused']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (updates.name && typeof updates.name === 'string') updates.name = (updates.name as string).trim()

  const { data: session, error } = await supabase
    .from('tj_sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedSession(supabase, userId, id)
  if (!owned) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { error } = await supabase.from('tj_sessions').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
