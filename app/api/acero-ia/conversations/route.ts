import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const showArchived = searchParams.get('archived') === 'true'

  const { data, error } = await supabase
    .from('aia_conversations')
    .select('id, title, last_model_used, is_archived, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('is_archived', showArchived)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  const { data, error } = await supabase
    .from('aia_conversations')
    .insert({
      user_id: user.id,
      title: null,
      preset_id: body.presetId || null,
    })
    .select('id, title, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
