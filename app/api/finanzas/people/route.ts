import { requireUser } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { loadPeople } from '@/lib/finanzas/load'
import { PERSON_COLS, findPersonByName } from '@/lib/finanzas/people'

export async function GET() {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({ people: await loadPeople(supabase, userId) })
}

/**
 * Crear una persona. **Idempotente por nombre**: si ya existe una activa con
 * ese nombre devuelve la existente en vez de chocar contra el índice único.
 *
 * Es lo que sostiene el "crear al vuelo" del quick-add: si tipear "Ana" dos
 * veces diera un error, la mitad de las veces el gasto no se registraría como
 * compartido.
 */
export async function POST(request: Request) {
  const { supabase, userId } = await requireUser()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'La persona necesita un nombre' }, { status: 400 })

  const existing = await findPersonByName(supabase, userId, name)
  if (existing) return NextResponse.json({ person: existing, created: false })

  const { data, error } = await supabase
    .from('fin_people')
    .insert({ user_id: userId, name })
    .select(PERSON_COLS)
    .single()

  if (error) {
    // Carrera: alguien la creó entre el select y el insert.
    const retry = await findPersonByName(supabase, userId, name)
    if (retry) return NextResponse.json({ person: retry, created: false })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ person: data, created: true }, { status: 201 })
}
