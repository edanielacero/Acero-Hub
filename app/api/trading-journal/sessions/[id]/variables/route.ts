import { createClient, createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { PRESET_VARIABLES } from '@/lib/trading/presets'

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

async function getOwnedSession(userId: string, sessionId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tj_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedSession(user.id, id)
  if (!owned) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const admin = createAdminClient()
  const { data: variables, error } = await admin
    .from('tj_variable_definitions')
    .select('*')
    .eq('session_id', id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ variables: variables ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const owned = await getOwnedSession(user.id, id)
  if (!owned) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await req.json()
  const { label, type, options, is_required, preset_key } = body

  const admin = createAdminClient()

  // Determine sort_order (append at end)
  const { count } = await admin
    .from('tj_variable_definitions')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id)

  // ── Preset variable path ──────────────────────────────────────────────────
  if (preset_key) {
    const preset = PRESET_VARIABLES.find(p => p.key === preset_key)
    if (!preset) return NextResponse.json({ error: 'Preset no encontrado' }, { status: 400 })

    const { data: alreadyExists } = await admin
      .from('tj_variable_definitions')
      .select('id')
      .eq('session_id', id)
      .eq('key', preset_key)
      .maybeSingle()
    if (alreadyExists) return NextResponse.json({ error: 'Esta variable ya está configurada' }, { status: 409 })

    const needsOptions = preset.type === 'select_single' || preset.type === 'select_multiple'
    const finalOptions = Array.isArray(options) && options.length > 0
      ? options
      : (preset.options?.length ? preset.options : null)

    if (needsOptions && !finalOptions?.length) {
      return NextResponse.json({ error: 'Agrega al menos una opción' }, { status: 400 })
    }

    const { data: variable, error } = await admin
      .from('tj_variable_definitions')
      .insert({
        session_id: id,
        key: preset.key,
        label: preset.label,
        type: preset.type,
        options: finalOptions ?? null,
        is_preset: true,
        is_required: is_required ?? false,
        is_active: true,
        sort_order: (count ?? 0),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ variable }, { status: 201 })
  }

  // ── Custom variable path ──────────────────────────────────────────────────
  if (!label?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  const validTypes = ['text', 'number', 'select_single', 'select_multiple', 'boolean']
  if (!validTypes.includes(type)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  if ((type === 'select_single' || type === 'select_multiple') && (!Array.isArray(options) || options.length === 0)) {
    return NextResponse.json({ error: 'Las variables de tipo selección requieren al menos una opción' }, { status: 400 })
  }

  // Generate unique key for this session
  const base = slugify(label.trim())
  const { data: existing } = await admin
    .from('tj_variable_definitions')
    .select('key')
    .eq('session_id', id)
    .like('key', `${base}%`)

  let key = base
  if ((existing ?? []).some(v => v.key === base)) {
    const nums = (existing ?? [])
      .map(v => { const m = v.key.match(/^.+_(\d+)$/); return m ? parseInt(m[1]) : 0 })
    key = `${base}_${Math.max(...nums, 1) + 1}`
  }

  const { data: variable, error } = await admin
    .from('tj_variable_definitions')
    .insert({
      session_id: id,
      key,
      label: label.trim(),
      type,
      options: (type === 'select_single' || type === 'select_multiple') ? options : null,
      is_preset: false,
      is_required: is_required ?? false,
      is_active: true,
      sort_order: (count ?? 0),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ variable }, { status: 201 })
}
