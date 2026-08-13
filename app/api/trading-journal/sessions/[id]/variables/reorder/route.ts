import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  const { data: session } = await supabase
    .from('tj_sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (!session) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await req.json()
  const { orderedIds } = body
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds es obligatorio' }, { status: 400 })
  }

  await Promise.all(
    orderedIds.map((varId: string, index: number) =>
      supabase
        .from('tj_variable_definitions')
        .update({ sort_order: index })
        .eq('id', varId)
        .eq('session_id', id)
    )
  )

  return NextResponse.json({ ok: true })
}
