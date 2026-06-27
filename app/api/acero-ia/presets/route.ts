import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('aia_presets')
    .select('id, name, system_prompt, is_default, is_global, user_id, created_at')
    .or(`user_id.eq.${user.id},is_global.eq.true`)
    .order('is_global', { ascending: false })
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { name, systemPrompt, isDefault } = await req.json()
  if (!name?.trim() || !systemPrompt?.trim()) {
    return NextResponse.json({ error: 'Nombre y system prompt son requeridos' }, { status: 400 })
  }

  if (isDefault) {
    await supabase
      .from('aia_presets')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
  }

  const { data, error } = await supabase
    .from('aia_presets')
    .insert({
      user_id: user.id,
      name: name.trim(),
      system_prompt: systemPrompt.trim(),
      is_default: isDefault || false,
      is_global: false,
    })
    .select('id, name, system_prompt, is_default, is_global, user_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
