import { requireUser } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rules, error } = await supabase
    .from('fin_category_rules')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules })
}

export async function POST(req: NextRequest) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { keyword, category_id } = body

  if (typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: 'La palabra clave es requerida' }, { status: 400 })
  }
  if (typeof category_id !== 'string' || !category_id) {
    return NextResponse.json({ error: 'La categoría es requerida' }, { status: 400 })
  }

  const { data: category } = await supabase.from('fin_categories').select('id').eq('id', category_id).eq('user_id', userId).single()
  if (!category) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0

  const { data: rule, error } = await supabase
    .from('fin_category_rules')
    .insert({ user_id: userId, keyword: keyword.trim(), category_id, priority })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule }, { status: 201 })
}
