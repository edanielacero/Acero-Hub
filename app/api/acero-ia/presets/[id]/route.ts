import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: preset } = await admin
    .from('aia_presets')
    .select('user_id, is_global')
    .eq('id', id)
    .single()

  if (!preset) return NextResponse.json({ error: 'Preset no encontrado' }, { status: 404 })

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  if (preset.is_global && !isAdmin) {
    return NextResponse.json({ error: 'No puedes editar presets globales' }, { status: 403 })
  }
  if (!preset.is_global && preset.user_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('name' in body) updates.name = body.name
  if ('systemPrompt' in body) updates.system_prompt = body.systemPrompt

  if ('isDefault' in body) {
    if (body.isDefault) {
      await supabase
        .from('aia_presets')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true)
    }
    updates.is_default = body.isDefault
  }

  const { data, error } = await admin
    .from('aia_presets')
    .update(updates)
    .eq('id', id)
    .select('id, name, system_prompt, is_default, is_global, user_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: preset } = await admin
    .from('aia_presets')
    .select('user_id, is_global')
    .eq('id', id)
    .single()

  if (!preset) return NextResponse.json({ error: 'Preset no encontrado' }, { status: 404 })

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (preset.is_global && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'No puedes eliminar presets globales' }, { status: 403 })
  }
  if (!preset.is_global && preset.user_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { error } = await admin.from('aia_presets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
