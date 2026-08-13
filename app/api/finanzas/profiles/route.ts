import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_PROFILE_NAME } from '@/lib/finanzas/profiles'

// Auto-provisiona un perfil "Personal" la primera vez que el usuario entra a
// Finanzas — así nunca hay que bloquear el uso de la app pidiendo "creá un perfil
// primero". Ver documentos/finanzas/documento_maestro_finanzas.md.
export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profiles, error } = await supabase
    .from('fin_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (profiles.length === 0) {
    const { data: created, error: createError } = await supabase
      .from('fin_profiles')
      .insert({ user_id: userId, name: DEFAULT_PROFILE_NAME, is_default: true })
      .select()
      .single()
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })
    return NextResponse.json({ profiles: [created] })
  }

  return NextResponse.json({ profiles })
}

export async function POST(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name } = body
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  const { data: profile, error } = await supabase
    .from('fin_profiles')
    .insert({ user_id: userId, name: name.trim(), is_default: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile }, { status: 201 })
}
