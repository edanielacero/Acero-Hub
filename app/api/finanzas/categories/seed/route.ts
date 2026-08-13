import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { CATEGORY_SEED } from '@/lib/finanzas/categories'

// Idempotente: solo crea las categorías/subcategorías del seed que todavía no existan
// para este usuario (match por nombre+kind), así se puede llamar varias veces sin duplicar.
export async function POST() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing, error: fetchError } = await supabase
    .from('fin_categories')
    .select('id, name, kind, parent_category_id')
    .eq('user_id', userId)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const existingRoots = new Map(
    (existing ?? []).filter(c => !c.parent_category_id).map(c => [`${c.kind}:${c.name}`, c]),
  )

  let created = 0

  for (const root of CATEGORY_SEED) {
    let rootRow = existingRoots.get(`${root.kind}:${root.name}`)
    if (!rootRow) {
      const { data, error } = await supabase
        .from('fin_categories')
        .insert({ user_id: userId, name: root.name, kind: root.kind, parent_category_id: null })
        .select('id, name, kind, parent_category_id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      rootRow = data
      created++
    }

    const existingChildren = new Set(
      (existing ?? []).filter(c => c.parent_category_id === rootRow!.id).map(c => c.name),
    )
    for (const childName of root.children) {
      if (existingChildren.has(childName)) continue
      const { error } = await supabase
        .from('fin_categories')
        .insert({ user_id: userId, name: childName, kind: root.kind, parent_category_id: rootRow.id })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      created++
    }
  }

  return NextResponse.json({ created })
}
