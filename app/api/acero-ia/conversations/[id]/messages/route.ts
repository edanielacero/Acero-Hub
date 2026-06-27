import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: conversation } = await supabase
    .from('aia_conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const { data, error } = await supabase
    .from('aia_messages')
    .select('id, role, content, model_used, tokens_input, tokens_output, cost_usd, parent_id, is_regenerated, created_at')
    .eq('conversation_id', id)
    .eq('is_regenerated', false)
    .is('parent_id', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
