import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import type { CategoryKind } from '@/lib/finanzas/categories'

const VALID_KINDS: CategoryKind[] = ['ingreso', 'gasto']

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: categories, error } = await supabase
    .from('fin_categories')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, kind, parent_category_id } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Tipo de categoría inválido' }, { status: 400 })
  }

  if (parent_category_id) {
    const { data: parent } = await supabase
      .from('fin_categories')
      .select('id, kind')
      .eq('id', parent_category_id)
      .eq('user_id', userId)
      .single()
    if (!parent) return NextResponse.json({ error: 'Categoría padre no encontrada' }, { status: 404 })
    if (parent.kind !== kind) return NextResponse.json({ error: 'La subcategoría debe ser del mismo tipo que su padre' }, { status: 400 })
  }

  const { data: category, error } = await supabase
    .from('fin_categories')
    .insert({
      user_id: userId,
      name: name.trim(),
      kind,
      parent_category_id: parent_category_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category }, { status: 201 })
}
