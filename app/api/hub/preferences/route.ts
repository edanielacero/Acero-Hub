import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const VALID_ACCENTS = ['blue', 'violet', 'emerald', 'amber', 'rose', 'red']
const VALID_MODES   = ['dark', 'light']

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, string> = {}

  if (body.accent_color !== undefined) {
    if (!VALID_ACCENTS.includes(body.accent_color))
      return NextResponse.json({ error: 'Color inválido' }, { status: 400 })
    updates.accent_color = body.accent_color
  }

  if (body.color_mode !== undefined) {
    if (!VALID_MODES.includes(body.color_mode))
      return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })
    updates.color_mode = body.color_mode
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(updates).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
