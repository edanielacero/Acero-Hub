import { requireProfile } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { num } from '@/lib/finanzas/money'
import { loadCategories } from '@/lib/finanzas/load'
import type { CategoryKind } from '@/lib/finanzas/types'

const CATEGORY_COLS = 'id, name, kind, icon, sort_order, archived'
const KINDS: CategoryKind[] = ['gasto', 'ingreso']

export async function GET(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const scope = { userId, profileId }

  return NextResponse.json({ categories: await loadCategories(supabase, scope) })
}

export async function POST(request: Request) {
  const { supabase, userId, profileId } = await requireProfile(request)
  if (!userId || !profileId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const kind = body?.kind as CategoryKind

  if (!name) return NextResponse.json({ error: 'La categoría necesita un nombre' }, { status: 400 })
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })

  const { data, error } = await supabase
    .from('fin_categories')
    .insert({
      user_id: userId, profile_id: profileId,
      name,
      kind,
      icon: typeof body?.icon === 'string' ? body.icon : null,
      sort_order: num(body?.sort_order, 99),
    })
    .select(CATEGORY_COLS)
    .single()

  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json(
      { error: duplicate ? `Ya existe una categoría de ${kind} llamada "${name}"` : error.message },
      { status: duplicate ? 409 : 400 },
    )
  }
  return NextResponse.json({ category: data }, { status: 201 })
}
