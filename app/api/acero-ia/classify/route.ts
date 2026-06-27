import { createClient } from '@/lib/supabase-server'
import { classifyMessage } from '@/lib/acero-ia/classifier'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  const { content, conversationId } = body
  if (!content?.trim()) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })

  let context: { role: string; content: string }[] = []
  let lastModelUsed: string | null = null

  if (conversationId) {
    const { data: conversation } = await supabase
      .from('aia_conversations')
      .select('last_model_used')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    lastModelUsed = conversation?.last_model_used ?? null

    const { data: messages } = await supabase
      .from('aia_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('is_regenerated', false)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(6)

    context = (messages || []).reverse()
  }

  const result = await classifyMessage(content.trim(), context, lastModelUsed)

  return NextResponse.json(result)
}
