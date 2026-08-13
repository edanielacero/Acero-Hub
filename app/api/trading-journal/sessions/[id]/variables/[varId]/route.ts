import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

async function getOwnedVariable(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], userId: string, sessionId: string, varId: string) {
  const { data: session } = await supabase
    .from('tj_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  if (!session) return null

  const { data: variable } = await supabase
    .from('tj_variable_definitions')
    .select('*')
    .eq('id', varId)
    .eq('session_id', sessionId)
    .single()
  return variable ?? null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; varId: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, varId } = await params
  const variable = await getOwnedVariable(supabase, userId, id, varId)
  if (!variable) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await req.json()
  const allowed = ['label', 'options', 'is_required', 'is_active']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (updates.label && typeof updates.label === 'string') {
    updates.label = (updates.label as string).trim()
    if (!updates.label) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('tj_variable_definitions')
    .update(updates)
    .eq('id', varId)
    .eq('session_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ variable: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; varId: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, varId } = await params
  const variable = await getOwnedVariable(supabase, userId, id, varId)
  if (!variable) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Remove this key from custom_fields in all trades of this session
  const { data: trades } = await supabase
    .from('tj_trades')
    .select('id, custom_fields')
    .eq('session_id', id)
    .not('custom_fields', 'is', null)

  if (trades && trades.length > 0) {
    const toUpdate = trades.filter(t => t.custom_fields && variable.key in t.custom_fields)
    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map(t => {
          const { [variable.key]: _removed, ...rest } = t.custom_fields
          return supabase.from('tj_trades').update({ custom_fields: rest }).eq('id', t.id)
        })
      )
    }
  }

  const { error } = await supabase.from('tj_variable_definitions').delete().eq('id', varId).eq('session_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
